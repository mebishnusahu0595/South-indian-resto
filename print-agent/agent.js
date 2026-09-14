/**
 * Kea By The Pool - Reliable Multi-Printer KOT Agent
 *
 * Run this process on the restaurant desktop connected to the same LAN as the
 * thermal printers. The cloud backend stores/streams KOT jobs; this local agent
 * is responsible for USB and private-LAN TCP/9100 delivery.
 *
 * Over the Socket.IO websocket it also reports this PC and every printer it can
 * reach (printers installed in Windows/CUPS - USB, serial, network queues - plus
 * TCP/9100 printers on the WiFi/LAN), so Superadmin Settings can choose which
 * printers receive KOTs and which receive Bills.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { execFile } = require('child_process');
const io = require('socket.io-client');
const { ThermalPrinter, PrinterTypes, CharacterSet, BreakLine } = require('node-thermal-printer');

const SERVER_URL = (process.env.SERVER_URL || 'https://keabythepool.com').replace(/\/+$/, '');
const API_URL = (process.env.API_URL || `${SERVER_URL.endsWith('/api') ? SERVER_URL : `${SERVER_URL}/api`}`).replace(/\/+$/, '');
const PRINT_AGENT_KEY = process.env.PRINT_AGENT_KEY || '';
const AGENT_ID = process.env.PRINT_AGENT_ID || os.hostname();

// Optional always-on counter printer given as a device path/URI, e.g. PRINTER_INTERFACE=/dev/usb/lp0.
// "printer:auto" needs a native driver module that is not installed (it always failed with
// "No driver set!"), so USB printers are now chosen from this PC's printer list in Superadmin Settings.
const COUNTER_INTERFACE = process.env.COUNTER_PRINTER_ENABLED !== 'false'
  && process.env.PRINTER_INTERFACE
  && !/^printer:/i.test(process.env.PRINTER_INTERFACE)
  ? process.env.PRINTER_INTERFACE
  : '';
const DEFAULT_PRINTER_PORT = validPort(process.env.PRINTER_PORT, 9100);
const LAN_PRINTER_COPIES = validCopies(process.env.LAN_PRINTER_COPIES, 1);
const PRINT_RETRIES = Math.max(1, Number.parseInt(process.env.PRINT_RETRIES || '3', 10));

const AUTO_DISCOVER_PRINTERS = process.env.AUTO_DISCOVER_PRINTERS !== 'false';
const DISCOVERY_SUBNETS = String(process.env.DISCOVERY_SUBNETS || '')
  .split(',')
  .map(value => value.trim().replace(/\.$/, ''))
  .filter(Boolean);
// WiFi printers in power-save can take several hundred ms to answer the first connection.
const DISCOVERY_TIMEOUT_MS = Math.max(100, Number.parseInt(process.env.DISCOVERY_TIMEOUT_MS || '800', 10));
const DISCOVERY_CONCURRENCY = Math.max(1, Math.min(64, Number.parseInt(process.env.DISCOVERY_CONCURRENCY || '32', 10)));
const DISCOVERY_INTERVAL_MS = Math.max(60000, Number.parseInt(process.env.DISCOVERY_INTERVAL_MS || '300000', 10));
const PRINT_JOB_POLL_MS = Math.max(3000, Number.parseInt(process.env.PRINT_JOB_POLL_MS || '5000', 10));

const PRINTED_HISTORY_FILE = process.env.PRINTED_HISTORY_FILE || path.join(__dirname, '.printed-kots.json');
const PRINT_HISTORY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PRINT_HISTORY = 10000;

// Registries saved before the KOT/Bill checkboxes existed keep the old role behaviour.
const LEGACY_KOT_ROLES = ['kitchen', 'bar', 'all'];
const LEGACY_BILL_ROLES = ['reception', 'counter', 'cashier'];

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function validPort(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}

function validCopies(value, fallback = 1) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 5 ? parsed : fallback;
}

function getEventId(order) {
  if (order.eventId) return String(order.eventId);
  const cleanOrderNumber = String(order.orderNumber || '').replace(/^CD-/, '');
  const orderIdentity = order._id?.toString() || order.id?.toString() || order.orderNumber || 'unknown';
  const ticketIdentity = order.kotTicket || `KOT-${cleanOrderNumber}`;
  return `${orderIdentity}:${ticketIdentity}`;
}

function loadSuccessfulCopies() {
  try {
    const parsed = JSON.parse(fs.readFileSync(PRINTED_HISTORY_FILE, 'utf8'));
    const cutoff = Date.now() - PRINT_HISTORY_TTL_MS;
    return new Map(
      Object.entries(parsed || {})
        .filter(([, printedAt]) => Number(printedAt) >= cutoff)
        .slice(-MAX_PRINT_HISTORY)
    );
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn(`Could not load print history: ${error.message}`);
    return new Map();
  }
}

function saveSuccessfulCopies() {
  const entries = Array.from(successfulCopies.entries()).slice(-MAX_PRINT_HISTORY);
  const temporaryFile = `${PRINTED_HISTORY_FILE}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(Object.fromEntries(entries), null, 2));
  fs.renameSync(temporaryFile, PRINTED_HISTORY_FILE);
}

async function runWithRetry(label, operation) {
  let lastError;
  for (let attempt = 1; attempt <= PRINT_RETRIES; attempt += 1) {
    try {
      await operation();
      return;
    } catch (error) {
      lastError = error;
      console.error(`${label} failed (${attempt}/${PRINT_RETRIES}): ${error.message}`);
      if (attempt < PRINT_RETRIES) await wait(attempt * 1000);
    }
  }
  throw lastError;
}

function requestJson(method, urlString, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const transport = url.protocol === 'https:' ? https : http;
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const request = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method,
      headers: {
        Accept: 'application/json',
        ...(PRINT_AGENT_KEY ? { 'x-print-agent-key': PRINT_AGENT_KEY } : {}),
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {})
      },
      timeout: 10000
    }, response => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { responseBody += chunk; });
      response.on('end', () => {
        let parsed = {};
        try { parsed = responseBody ? JSON.parse(responseBody) : {}; } catch (_) { parsed = { raw: responseBody }; }
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(parsed);
        } else {
          reject(new Error(`HTTP ${response.statusCode}: ${parsed.message || responseBody || 'Request failed'}`));
        }
      });
    });
    request.on('timeout', () => request.destroy(new Error('HTTP request timed out')));
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

// ─── Printers installed on this PC (USB cable, serial, Windows/CUPS queues) ───

function runCommand(command, args, env) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      windowsHide: true,
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
      env: env ? { ...process.env, ...env } : process.env
    }, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr || '').trim();
        reject(new Error(detail ? `${error.message.split('\n')[0]}: ${detail}` : error.message));
      } else {
        resolve(String(stdout || ''));
      }
    });
  });
}

// -EncodedCommand avoids all quoting problems; printer name and file path travel via env vars.
function runPowerShell(script, env) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return runCommand('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], env);
}

const WINDOWS_LIST_PRINTERS = 'Get-WmiObject -Class Win32_Printer | Select-Object Name, PortName, WorkOffline | ConvertTo-Json -Compress';

// Classic winspool RAW printing (Microsoft KB322091): ESC/POS bytes reach any installed
// USB/serial/network queue untouched, without native Node printer modules.
// ponytail: compiles the helper on every print (~1-2s); cache it as a DLL if that ever matters.
const WINDOWS_RAW_PRINT = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class KeaRawPrint {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DocInfo { public string DocName; public string OutputFile; public string DataType; }
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern int StartDocPrinter(IntPtr handle, int level, [In] DocInfo info);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool WritePrinter(IntPtr handle, byte[] data, int length, out int written);
  public static void Send(string printer, byte[] data) {
    IntPtr handle;
    if (!OpenPrinter(printer, out handle, IntPtr.Zero)) throw new Win32Exception(Marshal.GetLastWin32Error());
    try {
      DocInfo info = new DocInfo();
      info.DocName = "Kea Print";
      info.DataType = "RAW";
      if (StartDocPrinter(handle, 1, info) == 0) throw new Win32Exception(Marshal.GetLastWin32Error());
      try {
        if (!StartPagePrinter(handle)) throw new Win32Exception(Marshal.GetLastWin32Error());
        int written;
        bool ok = WritePrinter(handle, data, data.Length, out written);
        EndPagePrinter(handle);
        if (!ok || written != data.Length) throw new Win32Exception(Marshal.GetLastWin32Error());
      } finally {
        EndDocPrinter(handle);
      }
    } finally {
      ClosePrinter(handle);
    }
  }
}
'@
[KeaRawPrint]::Send($env:KEA_PRINTER_NAME, [System.IO.File]::ReadAllBytes($env:KEA_PRINT_FILE))
`;

function classifyPrinterPort(port) {
  const value = String(port || '').trim();
  // Virtual queues (Print to PDF/XPS, OneNote, Fax, CUPS-PDF) cannot print receipts.
  if (/^(PORTPROMPT:|FILE:|NUL:?|SHRFAX:)$/i.test(value) || /^(cups-pdf|file):/i.test(value)) return null;
  if (/^usb/i.test(value)) return { connection: 'usb' };
  if (/^(LPT|COM)\d+:?$/i.test(value) || /^(parallel|serial):/i.test(value)) return { connection: 'wired' };
  const ip = value.match(/(?:^|\D)(\d{1,3}(?:\.\d{1,3}){3})(?!\d)/);
  if (ip) return { connection: 'network', host: ip[1] };
  if (/^(WSD|ipps?|lpd|socket|dnssd|https?|smb)\b/i.test(value) || value.startsWith('\\\\')) return { connection: 'network' };
  return { connection: 'other' };
}

async function listSystemPrinters() {
  try {
    let rows;
    if (process.platform === 'win32') {
      const output = (await runPowerShell(WINDOWS_LIST_PRINTERS)).trim();
      rows = (output ? [].concat(JSON.parse(output)) : [])
        .map(row => ({ systemName: row.Name, port: row.PortName, offline: row.WorkOffline === true }));
    } else {
      const output = await runCommand('lpstat', ['-v'], { LC_ALL: 'C', LANG: 'C' });
      rows = output.split('\n')
        .map(line => line.match(/^device for (.+?):\s+(\S+)/))
        .filter(Boolean)
        .map(match => ({ systemName: match[1], port: match[2], offline: false }));
    }
    return rows.flatMap(row => {
      // PDF/XPS/OneNote/Fax and remote-support queues are never receipt printers.
      const isVirtual = /pdf|xps|onenote|fax|anydesk|teamviewer/i.test(row.systemName || '');
      const kind = row.systemName && !isVirtual ? classifyPrinterPort(row.port) : null;
      if (!kind) return [];
      return [{
        type: 'system',
        systemName: row.systemName,
        name: row.systemName,
        connection: kind.connection,
        host: kind.host || '',
        status: row.offline ? 'offline' : ''
      }];
    });
  } catch (error) {
    console.warn(`Could not list installed printers: ${error.message}`);
    return [];
  }
}

async function printRawToSystemPrinter(systemName, buffer) {
  const file = path.join(os.tmpdir(), `kea-print-${crypto.randomUUID()}.bin`);
  fs.writeFileSync(file, buffer);
  try {
    if (process.platform === 'win32') {
      await runPowerShell(WINDOWS_RAW_PRINT, { KEA_PRINTER_NAME: systemName, KEA_PRINT_FILE: file });
    } else {
      await runCommand('lp', ['-d', systemName, '-o', 'raw', file]);
    }
  } finally {
    fs.rm(file, { force: true }, () => {});
  }
}

// node-thermal-printer accepts a custom interface object with execute(buffer).
function printerInterfaceFor(target) {
  if (target.type === 'system') {
    return { execute: buffer => printRawToSystemPrinter(target.systemName, buffer), isPrinterConnected: async () => true };
  }
  if (target.type === 'device') return target.interface;
  return `tcp://${target.host}:${target.port}`;
}

// ─── LAN/WiFi discovery (TCP/9100) ───

// VPN/virtual adapters would otherwise crowd the real restaurant LAN out of the scan list.
const VIRTUAL_ADAPTER = /virtual|vmware|vbox|hyper-v|vethernet|docker|wsl|loopback|tailscale|zerotier|hamachi|^br-|^veth|^utun|^awdl|^llw/i;

function inferSubnetPrefixes() {
  const prefixes = new Set(DISCOVERY_SUBNETS);
  for (const [adapterName, entries] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAL_ADAPTER.test(adapterName)) continue;
    for (const entry of entries || []) {
      const family = typeof entry.family === 'string' ? entry.family : (entry.family === 4 ? 'IPv4' : 'IPv6');
      if (entry.internal || family !== 'IPv4' || String(entry.address).startsWith('169.254.')) continue;
      const octets = String(entry.address || '').split('.');
      // ponytail: scans each adapter's /24 only; list extra ranges in DISCOVERY_SUBNETS for a wider LAN.
      if (octets.length === 4) prefixes.add(octets.slice(0, 3).join('.'));
    }
  }
  return Array.from(prefixes).slice(0, 4);
}

function probePrinter(host, port) {
  return new Promise(resolve => {
    const client = new net.Socket();
    let settled = false;
    const finish = found => {
      if (settled) return;
      settled = true;
      client.destroy();
      resolve(found);
    };
    client.setTimeout(DISCOVERY_TIMEOUT_MS);
    client.once('connect', () => finish(true));
    client.once('timeout', () => finish(false));
    client.once('error', () => finish(false));
    client.connect(port, host);
  });
}

async function scanSubnet(prefix, port) {
  const found = [];
  let nextHost = 1;
  const worker = async () => {
    while (nextHost <= 254) {
      const hostNumber = nextHost;
      nextHost += 1;
      const host = `${prefix}.${hostNumber}`;
      if (await probePrinter(host, port)) found.push(host);
    }
  };
  await Promise.all(Array.from({ length: DISCOVERY_CONCURRENCY }, () => worker()));
  return found;
}

let discoveredPrinters = [];
let systemPrinters = [];
let discoveryRunning = null;
async function refreshDiscoveredPrinters() {
  if (discoveryRunning) return discoveryRunning;

  discoveryRunning = (async () => {
    const installedPrinters = await listSystemPrinters();

    if (AUTO_DISCOVER_PRINTERS) {
      const prefixes = inferSubnetPrefixes();
      if (prefixes.length === 0) {
        console.warn('LAN discovery skipped: no IPv4 subnet found.');
      } else {
        console.log(`Scanning ${prefixes.join(', ')} for TCP/${DEFAULT_PRINTER_PORT} printers...`);
        const scanResults = await Promise.all(prefixes.map(prefix => scanSubnet(prefix, DEFAULT_PRINTER_PORT)));
        const hosts = Array.from(new Set(scanResults.flat())).sort();
        discoveredPrinters = hosts.map(host => ({
          id: `discovered-${host.replace(/\./g, '-')}-${DEFAULT_PRINTER_PORT}`,
          name: `Auto-discovered ${host}`,
          role: 'all',
          host,
          port: DEFAULT_PRINTER_PORT,
          copies: LAN_PRINTER_COPIES,
          enabled: true,
          discovered: true
        }));
        console.log(`LAN discovery found ${discoveredPrinters.length} printer(s): ${hosts.join(', ') || 'none'}`);
      }
    }

    // A network printer installed in Windows/CUPS is the same device as its TCP/9100 entry.
    const lanHosts = new Set(discoveredPrinters.map(printer => printer.host));
    systemPrinters = installedPrinters.filter(printer => !(printer.host && lanHosts.has(printer.host)));
    console.log(`Installed printers on this PC: ${systemPrinters.map(printer => `${printer.systemName} [${printer.connection}]`).join(', ') || 'none'}`);

    registerWithBackend();
    return discoveredPrinters;
  })().finally(() => { discoveryRunning = null; });

  return discoveryRunning;
}

// Tells the backend (websocket) which printers this PC can reach, for Superadmin Settings.
function registerWithBackend() {
  if (!socket.connected) return;
  socket.emit('print-agent:register', {
    key: PRINT_AGENT_KEY,
    agentId: AGENT_ID,
    name: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    printers: [
      ...systemPrinters,
      ...discoveredPrinters.map(printer => ({
        type: 'tcp',
        name: `Network printer ${printer.host}`,
        host: printer.host,
        port: printer.port,
        connection: 'network'
      }))
    ]
  });
}

function parseEnvironmentPrinters() {
  const values = [
    { name: 'Kitchen Printer', role: 'kitchen', host: process.env.KITCHEN_PRINTER_IP },
    { name: 'Bar Printer', role: 'bar', host: process.env.BAR_PRINTER_IP },
    { name: 'Reception Printer', role: 'reception', host: process.env.RECEPTION_PRINTER_IP },
    ...String(process.env.WIFI_PRINTER_IPS || '').split(',').filter(Boolean).map((host, index) => ({
      name: `Environment WiFi Printer ${index + 1}`,
      role: 'all',
      host
    }))
  ];

  return values
    .map((printer, index) => {
      const raw = String(printer.host || '').trim().replace(/^tcp:\/\//i, '');
      if (!raw) return null;
      const match = raw.match(/^(.+?)(?::(\d+))?$/);
      const host = match?.[1];
      const port = validPort(match?.[2], DEFAULT_PRINTER_PORT);
      return {
        id: `env-${printer.role}-${index}-${host.replace(/[^a-z0-9]/gi, '-')}-${port}`,
        name: printer.name,
        role: printer.role,
        host,
        port,
        copies: LAN_PRINTER_COPIES,
        enabled: true
      };
    })
    .filter(Boolean);
}

let livePrinterConfig = null;

function toTarget(printer, defaultPort = DEFAULT_PRINTER_PORT) {
  if (!printer || printer.enabled === false) return null;
  const role = String(printer.role || 'all').toLowerCase();
  const base = {
    id: printer.id,
    name: printer.name || printer.systemName || `${role} printer`,
    copies: validCopies(printer.copies, LAN_PRINTER_COPIES),
    kot: typeof printer.kot === 'boolean' ? printer.kot : LEGACY_KOT_ROLES.includes(role),
    bill: typeof printer.bill === 'boolean' ? printer.bill : LEGACY_BILL_ROLES.includes(role)
  };

  if (printer.type === 'system') {
    // An installed/USB printer belongs to exactly one PC; other agents must not touch it.
    if (printer.agentId !== AGENT_ID || !printer.systemName) return null;
    return { ...base, type: 'system', systemName: printer.systemName, endpointKey: `system:${printer.systemName}` };
  }

  const host = String(printer.host || printer.ip || '').trim();
  if (!host) return null;
  const port = validPort(printer.port, defaultPort);
  // ponytail: with several PCs online every agent prints LAN printers; pin them to one agent if that ever happens.
  return { ...base, type: 'tcp', host, port, endpointKey: `tcp:${host}:${port}` };
}

function buildTargets(job) {
  const config = livePrinterConfig?.version ? livePrinterConfig : job.printerConfig;
  const jobFlag = job.jobType === 'bill' ? 'bill' : 'kot';
  const targets = [];
  const endpointKeys = new Set();
  const addTarget = target => {
    if (!target || !target[jobFlag] || endpointKeys.has(target.endpointKey)) return;
    endpointKeys.add(target.endpointKey);
    targets.push(target);
  };

  if (COUNTER_INTERFACE) {
    addTarget({
      id: 'counter-device',
      name: 'Counter Printer',
      type: 'device',
      interface: COUNTER_INTERFACE,
      copies: 1,
      kot: true,
      bill: true,
      endpointKey: `device:${COUNTER_INTERFACE}`
    });
  }

  const registry = config?.printers || [];
  for (const printer of registry) addTarget(toTarget(printer, config?.defaultPort || DEFAULT_PRINTER_PORT));

  // Detected printers reach the registry through the backend (auto-ticked for KOT + Bill by default).
  for (const printer of parseEnvironmentPrinters()) addTarget(toTarget(printer));

  return targets;
}

const successfulCopies = loadSuccessfulCopies();
const queuedEvents = new Set();

const endpointQueues = new Map();
// One physical job at a time per printer. A failure must reach the caller so it is reported
// and retried, but it must not break the queue for the next ticket on that printer.
function runOnEndpointQueue(endpointKey, fn) {
  const previous = endpointQueues.get(endpointKey) || Promise.resolve();
  const result = previous.then(fn);
  endpointQueues.set(endpointKey, result.catch(() => {}).then(() => wait(300)));
  return result;
}

async function printTarget(job, eventId, target) {
  const results = [];
  for (let copy = 1; copy <= target.copies; copy += 1) {
    const successKey = `${eventId}::${target.endpointKey}::copy-${copy}`;
    if (successfulCopies.has(successKey)) {
      results.push({ target: target.name, endpoint: target.endpointKey, copy, status: 'already-printed' });
      continue;
    }

    const printerInterface = printerInterfaceFor(target);
    const label = `${target.name} ${copy}/${target.copies}`;

    try {
      await runOnEndpointQueue(target.endpointKey, () =>
        runWithRetry(label, () =>
          job.jobType === 'bill'
            ? printBillToInterface(job, printerInterface, label)
            : printKOTToInterface(job, printerInterface, label)
        )
      );
      successfulCopies.set(successKey, Date.now());
      saveSuccessfulCopies();
      console.log(`Printed ${job.jobType === 'bill' ? 'Bill' : 'KOT'} ${job.billNumber || job.kotTicket || job.orderNumber} on ${label}`);
      results.push({ target: target.name, endpoint: target.endpointKey, copy, status: 'printed' });
    } catch (error) {
      results.push({ target: target.name, endpoint: target.endpointKey, copy, status: 'failed', error: error.message });
    }
  }
  return results;
}

async function reportJob(eventId, succeeded, results, errorMessage = '') {
  if (!PRINT_AGENT_KEY) return;
  const endpoint = succeeded ? 'ack' : 'failure';
  try {
    await requestJson('POST', `${API_URL}/orders/print-jobs/${encodeURIComponent(eventId)}/${endpoint}`, {
      agentId: AGENT_ID,
      results,
      error: errorMessage
    });
  } catch (error) {
    // 404 = socket-only job that the backend did not persist (browser/app fallback mode).
    if (!/^HTTP 404/.test(error.message)) console.error(`Could not report print job ${eventId} ${endpoint}: ${error.message}`);
  }
}

async function processJob(job) {
  const eventId = getEventId(job);
  const ticketLabel = job.billNumber || job.kotTicket || job.orderNumber || eventId;
  const jobName = job.jobType === 'bill' ? 'Bill' : 'KOT';
  const config = livePrinterConfig?.version ? livePrinterConfig : job.printerConfig;

  if (config?.enabled === false) {
    const results = [{ target: 'all', status: 'skipped', reason: 'Central auto-print is disabled' }];
    await reportJob(eventId, true, results);
    console.log(`Skipped disabled print job ${ticketLabel}`);
    return;
  }

  const targets = buildTargets(job);
  if (targets.length === 0) {
    // Another PC may own the selected printer, so never report a failure for it from here.
    console.warn(`No printer on this PC is selected for ${jobName} ${ticketLabel}. Select printers in Superadmin Settings.`);
    return;
  }

  const nestedResults = await Promise.all(targets.map(target => printTarget(job, eventId, target)));
  const results = nestedResults.flat();
  const failed = results.filter(result => result.status === 'failed');

  if (failed.length > 0) {
    const message = `${failed.length} printer copy/copies failed (${failed.map(result => `${result.target}: ${result.error}`).join('; ')}); successful targets were saved and will not duplicate`;
    await reportJob(eventId, false, results, message);
    throw new Error(message);
  }

  await reportJob(eventId, true, results);
  console.log(`Completed ${jobName} ${ticketLabel} on ${targets.length} physical printer(s)`);
}

function enqueueJob(job, source = 'socket') {
  const eventId = getEventId(job);
  if (queuedEvents.has(eventId)) return;
  queuedEvents.add(eventId);
  console.log(`Queued ${job.jobType === 'bill' ? 'Bill' : 'KOT'} ${job.billNumber || job.kotTicket || job.orderNumber || eventId} from ${source}`);

  // Jobs run independently; per-printer queues keep ticket order, so one offline printer
  // can no longer hold back tickets for every other printer.
  processJob(job)
    .catch(error => console.error(`Print Job ${eventId} remains pending: ${error.message}`))
    .finally(() => queuedEvents.delete(eventId));
}

async function handleTestPrint(printer) {
  const target = toTarget({ ...printer, kot: true, bill: true }, livePrinterConfig?.defaultPort || DEFAULT_PRINTER_PORT);
  if (!target) return;
  try {
    await runOnEndpointQueue(target.endpointKey, async () => {
      const slip = new ThermalPrinter({
        type: PrinterTypes.EPSON,
        interface: printerInterfaceFor(target),
        characterSet: CharacterSet.SLOVENIA,
        width: 42
      });
      slip.alignCenter();
      slip.bold(true);
      slip.println('KEA BY THE POOL');
      slip.bold(false);
      slip.println('PRINTER TEST OK');
      slip.println(target.name);
      slip.println(`PC: ${os.hostname()}`);
      slip.println(new Date().toLocaleString('en-IN'));
      slip.newLine();
      slip.newLine();
      slip.cut();
      await slip.execute();
    });
    console.log(`Test print sent to ${target.name}`);
    socket.emit('print-agent:test-result', { printerName: target.name, ok: true });
  } catch (error) {
    console.error(`Test print failed on ${target.name}: ${error.message}`);
    socket.emit('print-agent:test-result', { printerName: target.name, ok: false, error: error.message });
  }
}

let polling = false;
async function pollPendingJobs() {
  if (!PRINT_AGENT_KEY || polling) return;
  polling = true;
  try {
    const response = await requestJson('GET', `${API_URL}/orders/print-jobs/pending`);
    for (const job of response.jobs || []) {
      if (job?.payload) enqueueJob({ ...job.payload, eventId: job.eventId, jobType: job.jobType || job.payload.jobType || 'kot' }, 'backend-outbox');
    }
  } catch (error) {
    console.error(`Could not poll pending print jobs: ${error.message}`);
  } finally {
    polling = false;
  }
}

console.log('====================================================');
console.log('  Kea By The Pool - Reliable Multi-Printer Print Agent');
console.log('====================================================');
console.log(`Server: ${SERVER_URL}`);
console.log(`Agent ID: ${AGENT_ID}`);
console.log(`Counter printer: ${COUNTER_INTERFACE || 'not set (select printers in Superadmin Settings)'}`);
console.log(`LAN auto-discovery: ${AUTO_DISCOVER_PRINTERS ? 'enabled' : 'disabled'}`);
console.log(`Durable backend polling: ${PRINT_AGENT_KEY ? 'enabled' : 'disabled (set PRINT_AGENT_KEY)'}`);
console.log(`Remembered successful copies: ${successfulCopies.size}`);

const socket = io(SERVER_URL, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 10000
});

socket.on('connect', () => {
  console.log('Connected to backend. Waiting for KOT and Bill print events.');
  registerWithBackend();
  pollPendingJobs();
});
socket.on('disconnect', reason => console.warn(`Disconnected (${reason}). Reconnecting automatically.`));
socket.on('connect_error', error => console.error(`Backend connection failed: ${error.message}`));
socket.on('new-order', order => enqueueJob({ ...order, jobType: 'kot' }, 'socket'));
socket.on('new-print-job', job => enqueueJob({ ...job, jobType: job.jobType || 'kot' }, 'socket'));
socket.on('new-bill-print', billJob => enqueueJob({ ...billJob, jobType: 'bill' }, 'socket'));
socket.on('printer-settings-updated', config => {
  if (config?.version) {
    livePrinterConfig = config;
    console.log(`Printer registry refreshed: ${(config.printers || []).length} configured target(s)`);
  }
});
socket.on('printer-scan-request', () => {
  console.log('Printer scan requested from Settings.');
  refreshDiscoveredPrinters().catch(error => console.error(`Printer scan failed: ${error.message}`));
});
socket.on('printer-test', printer => { handleTestPrint(printer); });

refreshDiscoveredPrinters().catch(error => console.error(`Initial LAN discovery failed: ${error.message}`));
setInterval(() => refreshDiscoveredPrinters().catch(error => console.error(`LAN discovery failed: ${error.message}`)), DISCOVERY_INTERVAL_MS).unref();
setInterval(pollPendingJobs, PRINT_JOB_POLL_MS).unref();

async function printBillToInterface(bill, printerInterface, printerLabel) {
  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: printerInterface,
    characterSet: CharacterSet.SLOVENIA,
    breakLine: BreakLine.WORD,
    width: 42
  });

  const billNumber = bill.billNumber || `BILL-${bill.billId || '001'}`;
  const orderNumber = bill.orderNumber || (bill.orderNumbers && bill.orderNumbers.length > 0 ? bill.orderNumbers.join(', ') : '');
  const tableName = bill.tableName || bill.tableNumber || 'Takeaway';
  const customerName = bill.customer?.name || 'Walk-in';
  const billerName = bill.billerName || 'Cashier';
  const timestamp = new Date(bill.createdAt || Date.now());
  const date = timestamp.toLocaleDateString('en-IN');
  const time = timestamp.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  printer.alignCenter();
  printer.bold(true);
  printer.setTextSize(1, 1);
  printer.println('KEA BY THE POOL');
  printer.bold(false);
  printer.setTextSize(0, 0);
  printer.println('Dhanora, Risali, Bhilai');
  printer.println('OFFICIAL RECEIPT');
  printer.bold(true);
  printer.println(billNumber);
  printer.bold(false);
  printer.drawLine();

  printer.alignLeft();
  if (orderNumber) printer.println(`ORDER#: #${orderNumber}`);
  printer.println(`TABLE : ${tableName}`);
  printer.println(`GUEST : ${customerName}`);
  printer.println(`STAFF : ${billerName}`);
  printer.println(`TIME  : ${date} ${time}`);
  printer.drawLine();

  printer.bold(true);
  printer.tableCustom([
    { text: 'ITEM', align: 'LEFT', width: 0.50 },
    { text: 'QTY x PRICE', align: 'CENTER', width: 0.25 },
    { text: 'AMT', align: 'RIGHT', width: 0.25 }
  ]);
  printer.bold(false);
  printer.drawLine();

  for (const item of bill.items || []) {
    const itemName = (item.menuItem?.name || item.name || 'Item').substring(0, 20);
    const qtyPrice = `${item.quantity} x ${item.price}`;
    const amount = (item.quantity * item.price).toFixed(2);
    printer.tableCustom([
      { text: itemName, align: 'LEFT', width: 0.50 },
      { text: qtyPrice, align: 'CENTER', width: 0.25 },
      { text: amount, align: 'RIGHT', width: 0.25 }
    ]);
  }

  printer.drawLine();
  printer.println(`Subtotal:                    Rs.${Number(bill.subtotal || 0).toFixed(2)}`);
  if (bill.discount > 0) {
    const discountLabel = bill.discountName ? `Discount (${bill.discountName})` : 'Discount';
    printer.println(`${discountLabel.padEnd(28)} -Rs.${Number(bill.discount).toFixed(2)}`);
  }
  if (Array.isArray(bill.taxDetails) && bill.taxDetails.length > 0) {
    for (const taxItem of bill.taxDetails) {
      printer.println(`${taxItem.name.padEnd(28)}  Rs.${Number(taxItem.amount || 0).toFixed(2)}`);
    }
  } else if (bill.tax > 0) {
    printer.println(`Taxes:                       Rs.${Number(bill.tax).toFixed(2)}`);
  }

  printer.drawLine();
  printer.bold(true);
  printer.println(`TOTAL AMOUNT:                Rs.${Number(bill.total || 0).toFixed(2)}`);
  printer.bold(false);
  if (bill.paymentMethod) {
    printer.println(`Payment Mode: ${String(bill.paymentMethod).toUpperCase()}`);
  }

  printer.drawLine();
  printer.alignCenter();
  printer.bold(true);
  printer.println('THANK YOU FOR VISITING!');
  printer.bold(false);
  printer.println('Please Come Again');
  printer.println(`*** ${printerLabel} ***`);
  printer.newLine();
  printer.newLine();
  printer.cut();

  await printer.execute();
}

async function printKOTToInterface(order, printerInterface, printerLabel) {
  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: printerInterface,
    characterSet: CharacterSet.SLOVENIA,
    breakLine: BreakLine.WORD,
    width: 42
  });

  const cleanOrderNumber = String(order.orderNumber || '').replace(/^CD-/, '');
  const kotNumber = order.kotTicket || `KOT-${cleanOrderNumber}`;
  const tableName = order.tableName
    || (order.tables?.length > 0
      ? order.tables.map(table => table.name || `Table ${table.tableNumber}`).join(', ')
      : null)
    || order.table?.name
    || (order.table?.tableNumber ? `Table ${order.table.tableNumber}` : null)
    || (order.tableNumber ? `Table ${order.tableNumber}` : 'Takeaway');
  const staffName = order.placedBy?.name || order.user?.name || 'Staff';
  const timestamp = new Date(order.kotCreatedAt || order.createdAt || Date.now());
  const date = timestamp.toLocaleDateString('en-IN');
  const time = timestamp.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  printer.alignCenter();
  printer.bold(true);
  printer.setTextSize(1, 1);
  printer.println('KEA BY THE POOL');
  printer.bold(false);
  printer.setTextSize(0, 0);
  printer.println(`${order.kotEventType || 'KOT'} - KITCHEN ORDER TICKET`);
  printer.bold(true);
  printer.println(kotNumber);
  printer.bold(false);
  printer.drawLine();

  printer.alignLeft();
  printer.println(`TABLE : ${tableName}`);
  printer.println(`ORDER#: #${order.orderNumber}`);
  printer.println(`STAFF : ${staffName}`);
  printer.println(`TIME  : ${date} ${time}`);
  printer.drawLine();

  printer.bold(true);
  printer.tableCustom([
    { text: 'ITEM NAME', align: 'LEFT', width: 0.75 },
    { text: 'QTY', align: 'RIGHT', width: 0.25 }
  ]);
  printer.bold(false);
  printer.drawLine();

  for (const item of order.items || []) {
    const itemName = item.menuItem?.name || item.name || 'Item';
    printer.tableCustom([
      { text: itemName, align: 'LEFT', width: 0.75 },
      { text: `x${item.quantity}`, align: 'RIGHT', width: 0.25 }
    ]);
    const itemNote = item.notes || item.instruction || item.specialInstructions || item.note;
    if (itemNote) printer.println(`  > Note: ${itemNote}`);
  }

  const instructions = order.specialInstructions || order.instructions || order.notes;
  if (instructions) {
    printer.drawLine();
    printer.bold(true);
    printer.println('NOTE:');
    printer.bold(false);
    printer.println(instructions);
  }

  printer.drawLine();
  printer.alignCenter();
  printer.println(`*** ${printerLabel} ***`);
  printer.newLine();
  printer.newLine();
  printer.cut();

  await printer.execute();
}
