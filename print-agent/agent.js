/**
 * Kea By The Pool - Reliable Multi-Printer KOT Agent
 *
 * Run this process on the restaurant desktop connected to the same LAN as the
 * thermal printers. The cloud backend stores/streams KOT jobs; this local agent
 * is responsible for USB and private-LAN TCP/9100 delivery.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const http = require('http');
const https = require('https');
const io = require('socket.io-client');
const { ThermalPrinter, PrinterTypes, CharacterSet, BreakLine } = require('node-thermal-printer');

const SERVER_URL = (process.env.SERVER_URL || 'https://keabythepool.com').replace(/\/+$/, '');
const API_URL = (process.env.API_URL || `${SERVER_URL.endsWith('/api') ? SERVER_URL : `${SERVER_URL}/api`}`).replace(/\/+$/, '');
const PRINT_AGENT_KEY = process.env.PRINT_AGENT_KEY || '';
const AGENT_ID = process.env.PRINT_AGENT_ID || os.hostname();

const COUNTER_PRINTER_ENABLED = process.env.COUNTER_PRINTER_ENABLED !== 'false';
const PRINTER_INTERFACE = process.env.PRINTER_INTERFACE || 'printer:auto';
const DEFAULT_PRINTER_PORT = validPort(process.env.PRINTER_PORT, 9100);
const LAN_PRINTER_COPIES = validCopies(process.env.LAN_PRINTER_COPIES, 1);
const PRINT_RETRIES = Math.max(1, Number.parseInt(process.env.PRINT_RETRIES || '3', 10));

const AUTO_DISCOVER_PRINTERS = process.env.AUTO_DISCOVER_PRINTERS !== 'false';
const DISCOVERY_SUBNETS = String(process.env.DISCOVERY_SUBNETS || '')
  .split(',')
  .map(value => value.trim().replace(/\.$/, ''))
  .filter(Boolean);
const DISCOVERY_TIMEOUT_MS = Math.max(100, Number.parseInt(process.env.DISCOVERY_TIMEOUT_MS || '350', 10));
const DISCOVERY_CONCURRENCY = Math.max(1, Math.min(64, Number.parseInt(process.env.DISCOVERY_CONCURRENCY || '32', 10)));
const DISCOVERY_INTERVAL_MS = Math.max(60000, Number.parseInt(process.env.DISCOVERY_INTERVAL_MS || '300000', 10));
const PRINT_JOB_POLL_MS = Math.max(3000, Number.parseInt(process.env.PRINT_JOB_POLL_MS || '5000', 10));

const PRINTED_HISTORY_FILE = process.env.PRINTED_HISTORY_FILE || path.join(__dirname, '.printed-kots.json');
const PRINT_HISTORY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PRINT_HISTORY = 10000;

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

function inferSubnetPrefixes() {
  const prefixes = new Set(DISCOVERY_SUBNETS);
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      const family = typeof entry.family === 'string' ? entry.family : (entry.family === 4 ? 'IPv4' : 'IPv6');
      if (entry.internal || family !== 'IPv4') continue;
      const octets = String(entry.address || '').split('.');
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
let discoveryRunning = null;
async function refreshDiscoveredPrinters() {
  if (!AUTO_DISCOVER_PRINTERS) return discoveredPrinters;
  if (discoveryRunning) return discoveryRunning;

  discoveryRunning = (async () => {
    const prefixes = inferSubnetPrefixes();
    if (prefixes.length === 0) {
      console.warn('LAN discovery skipped: no IPv4 subnet found.');
      return discoveredPrinters;
    }

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
    return discoveredPrinters;
  })().finally(() => { discoveryRunning = null; });

  return discoveryRunning;
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
function buildTargets(order) {
  const config = livePrinterConfig?.version ? livePrinterConfig : order.printerConfig;
  if (config?.enabled === false) return [];

  const targets = [];
  const endpointKeys = new Set();
  const addTarget = target => {
    if (!target || target.enabled === false) return;
    const endpointKey = target.type === 'usb'
      ? `usb:${target.interface}`
      : `tcp:${target.host}:${target.port}`;
    if (!target.interface && !target.host) return;
    if (endpointKeys.has(endpointKey)) return;
    endpointKeys.add(endpointKey);
    targets.push({ ...target, endpointKey });
  };

  if (COUNTER_PRINTER_ENABLED) {
    addTarget({
      id: 'counter-usb',
      name: 'Counter Desktop Printer',
      type: 'usb',
      interface: PRINTER_INTERFACE,
      copies: 1,
      enabled: true
    });
  }

  for (const printer of config?.printers || []) {
    addTarget({
      id: printer.id || `registry-${printer.host}-${printer.port}`,
      name: printer.name || `${printer.role || 'LAN'} Printer`,
      role: printer.role || 'all',
      type: 'tcp',
      host: String(printer.host || printer.ip || '').trim(),
      port: validPort(printer.port, config?.defaultPort || DEFAULT_PRINTER_PORT),
      copies: validCopies(printer.copies, LAN_PRINTER_COPIES),
      enabled: printer.enabled !== false
    });
  }

  for (const printer of parseEnvironmentPrinters()) {
    addTarget({ ...printer, type: 'tcp' });
  }
  for (const printer of discoveredPrinters) {
    addTarget({ ...printer, type: 'tcp' });
  }

  return targets;
}

const successfulCopies = loadSuccessfulCopies();
const queuedEvents = new Set();
let eventQueue = Promise.resolve();

async function printTarget(order, eventId, target) {
  const results = [];
  for (let copy = 1; copy <= target.copies; copy += 1) {
    const successKey = `${eventId}::${target.endpointKey}::copy-${copy}`;
    if (successfulCopies.has(successKey)) {
      results.push({ target: target.name, endpoint: target.endpointKey, copy, status: 'already-printed' });
      continue;
    }

    const printerInterface = target.type === 'usb'
      ? target.interface
      : `tcp://${target.host}:${target.port}`;
    const label = `${target.name} ${copy}/${target.copies}`;

    try {
      await runWithRetry(label, () => printKOTToInterface(order, printerInterface, label));
      successfulCopies.set(successKey, Date.now());
      saveSuccessfulCopies();
      console.log(`Printed ${order.kotTicket || order.orderNumber} on ${label}`);
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
    console.error(`Could not report KOT ${eventId} ${endpoint}: ${error.message}`);
  }
}

async function processKOT(order) {
  const eventId = getEventId(order);
  const ticketLabel = order.kotTicket || order.orderNumber || eventId;
  if (order.printerConfig?.version) livePrinterConfig = order.printerConfig;

  if (AUTO_DISCOVER_PRINTERS && discoveredPrinters.length === 0) {
    await refreshDiscoveredPrinters();
  }

  const targets = buildTargets(order);
  if ((livePrinterConfig || order.printerConfig)?.enabled === false) {
    const results = [{ target: 'all', status: 'skipped', reason: 'Central auto-print is disabled' }];
    await reportJob(eventId, true, results);
    console.log(`Skipped disabled KOT ${ticketLabel}`);
    return;
  }
  if (targets.length === 0) {
    const message = 'No USB, configured, environment, or discovered printer target is available';
    await reportJob(eventId, false, [], message);
    throw new Error(message);
  }

  // Printer targets run independently. A failed USB printer never blocks LAN,
  // and a failed Kitchen printer never blocks Bar/Reception.
  const nestedResults = await Promise.all(targets.map(target => printTarget(order, eventId, target)));
  const results = nestedResults.flat();
  const failed = results.filter(result => result.status === 'failed');

  if (failed.length > 0) {
    const message = `${failed.length} printer copy/copies failed; successful targets were saved and will not duplicate`;
    await reportJob(eventId, false, results, message);
    throw new Error(message);
  }

  await reportJob(eventId, true, results);
  console.log(`Completed KOT ${ticketLabel} on ${targets.length} physical printer(s)`);
}

function enqueueKOT(order, source = 'socket') {
  const eventId = getEventId(order);
  if (queuedEvents.has(eventId)) return;
  queuedEvents.add(eventId);
  console.log(`Queued KOT ${order.kotTicket || order.orderNumber || eventId} from ${source}`);

  eventQueue = eventQueue
    .then(() => processKOT(order))
    .catch(error => console.error(`KOT ${eventId} remains pending: ${error.message}`))
    .finally(() => queuedEvents.delete(eventId));
}

let polling = false;
async function pollPendingJobs() {
  if (!PRINT_AGENT_KEY || polling) return;
  polling = true;
  try {
    const response = await requestJson('GET', `${API_URL}/orders/print-jobs/pending`);
    for (const job of response.jobs || []) {
      if (job?.payload) enqueueKOT({ ...job.payload, eventId: job.eventId }, 'backend-outbox');
    }
  } catch (error) {
    console.error(`Could not poll pending KOT jobs: ${error.message}`);
  } finally {
    polling = false;
  }
}

console.log('====================================================');
console.log('  Kea By The Pool - Reliable Multi-Printer KOT Agent');
console.log('====================================================');
console.log(`Server: ${SERVER_URL}`);
console.log(`Agent ID: ${AGENT_ID}`);
console.log(`Counter printer: ${COUNTER_PRINTER_ENABLED ? PRINTER_INTERFACE : 'disabled'}`);
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
  console.log('Connected to backend. Waiting for KOT events.');
  pollPendingJobs();
});
socket.on('disconnect', reason => console.warn(`Disconnected (${reason}). Reconnecting automatically.`));
socket.on('connect_error', error => console.error(`Backend connection failed: ${error.message}`));
socket.on('new-order', order => enqueueKOT(order, 'socket'));
socket.on('printer-settings-updated', config => {
  if (config?.version) {
    livePrinterConfig = config;
    console.log(`Printer registry refreshed: ${(config.printers || []).length} configured target(s)`);
  }
});

refreshDiscoveredPrinters().catch(error => console.error(`Initial LAN discovery failed: ${error.message}`));
setInterval(() => refreshDiscoveredPrinters().catch(error => console.error(`LAN discovery failed: ${error.message}`)), DISCOVERY_INTERVAL_MS).unref();
setInterval(pollPendingJobs, PRINT_JOB_POLL_MS).unref();

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
