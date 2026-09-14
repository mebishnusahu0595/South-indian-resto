/**
 * ThermalPrinter.js
 * ESC/POS over TCP/WiFi for 80mm thermal printers
 * Works on same WiFi network as the staff app
 */

import { Platform } from 'react-native';
import TcpSocket from 'react-native-tcp-socket';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PRINTER_PORT = 9100;
const STORAGE_KEY_KITCHEN = 'printer_kitchen_ip';
const STORAGE_KEY_RECEPTION = 'printer_reception_ip';
const STORAGE_KEY_KITCHEN_NAME = 'printer_kitchen_name';
const STORAGE_KEY_RECEPTION_NAME = 'printer_reception_name';
const CONNECT_TIMEOUT = 5000; // 5 seconds
// react-native-tcp-socket runs every Android connect() on a 2-thread native pool and waits forever
// unless connectTimeout is passed, so a scan must be bounded natively and use few parallel probes.
const SCAN_TIMEOUT_MS = Platform.OS === 'ios' ? 1000 : 600; // iOS rounds down to whole seconds
const SCAN_CONCURRENCY = Platform.OS === 'ios' ? 24 : 2;

// ─── ESC/POS Commands ───────────────────────────────────────────
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;
const CR = 0x0d;

const CMD = {
  INIT: [ESC, 0x40],                           // Initialize printer
  ALIGN_CENTER: [ESC, 0x61, 0x01],             // Center align
  ALIGN_LEFT: [ESC, 0x61, 0x00],              // Left align
  ALIGN_RIGHT: [ESC, 0x61, 0x02],             // Right align
  BOLD_ON: [ESC, 0x45, 0x01],                 // Bold on
  BOLD_OFF: [ESC, 0x45, 0x00],               // Bold off
  DOUBLE_HEIGHT: [ESC, 0x21, 0x10],           // Double height text
  NORMAL_SIZE: [ESC, 0x21, 0x00],             // Normal text
  FEED_LINE: [LF],                             // Feed 1 line
  FEED_2: [LF, LF],                            // Feed 2 lines
  FEED_4: [LF, LF, LF, LF],                   // Feed 4 lines (for cut)
  CUT: [GS, 0x56, 0x00],                      // Full cut
  PARTIAL_CUT: [GS, 0x56, 0x01],              // Partial cut
};

function bytesToBuffer(bytes) {
  return new Uint8Array(bytes).buffer;
}

function textToBytes(text) {
  // Basic ASCII/UTF-8 encode
  const bytes = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 128) {
      bytes.push(code);
    } else {
      bytes.push(63); // '?' for non-ASCII
    }
  }
  return bytes;
}

function line(text = '') {
  return [...textToBytes(text), LF];
}

function paddedLine(left, right, width = 42) {
  const spaces = width - left.length - right.length;
  const pad = spaces > 0 ? ' '.repeat(spaces) : ' ';
  return [...textToBytes(left + pad + right), LF];
}

function dashedLine(char = '-', width = 42) {
  return [...textToBytes(char.repeat(width)), LF];
}

// ─── Format KOT Slip (Kitchen Order Ticket) ─────────────────────
// title: 'KOT' for new items, 'ADD KOT' / 'CANCEL KOT' for order edits.
export function formatKOT({ title = 'KOT', kotNumber, orderNumber, tableNumber, tableName, items, instructions, staffName, timestamp }) {
  const now = timestamp ? new Date(timestamp) : new Date();
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const bytes = [
    ...CMD.INIT,
    ...CMD.ALIGN_CENTER,
    ...CMD.BOLD_ON,
    ...CMD.DOUBLE_HEIGHT,
    ...line(title),
    ...CMD.NORMAL_SIZE,
    ...CMD.BOLD_OFF,
    ...line('Kitchen Order Ticket'),
    ...(kotNumber ? line(kotNumber) : []),
    ...CMD.FEED_LINE,
    ...CMD.ALIGN_LEFT,
    ...dashedLine('='),
    ...CMD.BOLD_ON,
    ...paddedLine(`Order #${orderNumber}`, timeStr),
    ...CMD.BOLD_OFF,
    ...paddedLine(`Table: ${tableName || tableNumber || 'Takeaway'}`, dateStr),
    ...(staffName ? [...line(`Waiter: ${staffName}`)] : []),
    ...dashedLine('-'),
    ...CMD.BOLD_ON,
    ...paddedLine('ITEM', 'QTY'),
    ...CMD.BOLD_OFF,
    ...dashedLine('-'),
  ];

  // Add items
  items.forEach(item => {
    const name = item.name || item.menuItem?.name || 'Item';
    const qty = `x${item.quantity}`;
    bytes.push(...paddedLine(name.substring(0, 35), qty));
    if (item.notes && item.notes.trim()) {
      bytes.push(...line(`  ↳ Note: ${item.notes}`));
    }
  });

  // Special instructions
  if (instructions && instructions.trim()) {
    bytes.push(
      ...dashedLine('-'),
      ...CMD.BOLD_ON,
      ...line('NOTE:'),
      ...CMD.BOLD_OFF,
      ...line(instructions.substring(0, 100)),
    );
  }

  bytes.push(
    ...dashedLine('='),
    ...CMD.ALIGN_CENTER,
    ...line('** KITCHEN COPY **'),
    ...CMD.FEED_4,
    ...CMD.CUT,
  );

  return new Uint8Array(bytes);
}

// ─── Format Bill Slip (Customer Receipt) ────────────────────────
export function formatBillSlip({ restaurantName, orderNumber, tableNumber, tableName, items, subtotal, gst, total, paymentMethod, staffName, timestamp }) {
  const now = timestamp ? new Date(timestamp) : new Date();
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const bytes = [
    ...CMD.INIT,
    ...CMD.ALIGN_CENTER,
    ...CMD.BOLD_ON,
    ...CMD.DOUBLE_HEIGHT,
    ...line(restaurantName || 'Kea By The Pool'),
    ...CMD.NORMAL_SIZE,
    ...CMD.BOLD_OFF,
    ...line('Dhanora, Risali, Bhilai'),
    ...CMD.FEED_LINE,
    ...CMD.ALIGN_LEFT,
    ...dashedLine('='),
    ...paddedLine(`Bill #${orderNumber}`, timeStr),
    ...paddedLine(`Table: ${tableName || tableNumber || 'Takeaway'}`, dateStr),
    ...dashedLine('-'),
    ...CMD.BOLD_ON,
    ...paddedLine('ITEM', 'AMT'),
    ...CMD.BOLD_OFF,
    ...dashedLine('-'),
  ];

  items.forEach(item => {
    const name = (item.name || item.menuItem?.name || 'Item').substring(0, 28);
    const amt = `${item.quantity}x${item.price} Rs.${(item.quantity * item.price).toFixed(0)}`;
    bytes.push(...paddedLine(name, amt));
  });

  bytes.push(
    ...dashedLine('-'),
    ...paddedLine('Subtotal', `Rs.${subtotal.toFixed(2)}`),
    ...paddedLine('GST (5%)', `Rs.${gst.toFixed(2)}`),
    ...dashedLine('='),
    ...CMD.BOLD_ON,
    ...paddedLine('TOTAL', `Rs.${total.toFixed(2)}`),
    ...CMD.BOLD_OFF,
    ...dashedLine('-'),
    ...(paymentMethod ? [...paddedLine('Payment', paymentMethod.toUpperCase())] : []),
    ...dashedLine('-'),
    ...CMD.ALIGN_CENTER,
    ...CMD.BOLD_ON,
    ...line('THANK YOU!'),
    ...CMD.BOLD_OFF,
    ...line('Please visit again'),
    ...CMD.FEED_4,
    ...CMD.CUT,
  );

  return new Uint8Array(bytes);
}

// ─── TCP Print Function ──────────────────────────────────────────
export async function printToIp(ip, data, copies = 1, port = PRINTER_PORT) {
  let result;
  for (let c = 0; c < copies; c++) {
    result = await sendTcpPrint(ip, data, port);
  }
  return result;
}

function sendTcpPrint(ip, data, port = PRINTER_PORT) {
  return new Promise((resolve, reject) => {
    const host = String(ip || '').trim();
    if (!host) {
      reject(new Error('Printer IP not configured'));
      return;
    }

    let settled = false;
    let connected = false;
    let client = null;
    let timer = null;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Errored sockets are destroyed by the library itself. Destroying a connect that is still
      // queued natively can race its socket map, so only close sockets that actually connected.
      if (connected) {
        try { client.destroy(); } catch (_) {}
      }
      if (error) reject(error);
      else resolve({ success: true, ip: host });
    };
    timer = setTimeout(
      () => finish(new Error(`Timeout: Could not reach printer at ${host}:${port}`)),
      CONNECT_TIMEOUT + 3000
    );

    client = TcpSocket.createConnection({ host, port, connectTimeout: CONNECT_TIMEOUT }, () => {
      connected = true;
      try {
        // Signature is write(buffer, encoding, callback): passing the callback 2nd means it never fires.
        client.write(data, undefined, (err) => finish(err ? new Error(`Printer at ${host} rejected data: ${err.message}`) : null));
      } catch (err) {
        finish(err);
      }
    });

    client.on('error', (err) => finish(new Error(`Cannot connect to printer at ${host}: ${err.message}`)));
  });
}

// ─── Saved Printer IPs (old per-phone setup, still used as fallback) ─
export async function getSavedPrinters() {
  const kitchenIp = await AsyncStorage.getItem(STORAGE_KEY_KITCHEN) || '';
  const receptionIp = await AsyncStorage.getItem(STORAGE_KEY_RECEPTION) || '';
  const kitchenName = await AsyncStorage.getItem(STORAGE_KEY_KITCHEN_NAME) || '';
  const receptionName = await AsyncStorage.getItem(STORAGE_KEY_RECEPTION_NAME) || '';
  return { kitchenIp, receptionIp, kitchenName, receptionName };
}

// ─── Auto Discover Printers on Port 9100 ─────────────────────────
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

// Resolves true when host:port accepts a TCP connection within timeoutMs.
function probePort(host, port, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    let client = null;
    let guard = null;
    const done = (open) => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      if (open) {
        try { client.destroy(); } catch (_) {}
      }
      resolve(open);
    };
    // JS guard in case the native layer never answers (e.g. its threads are busy printing).
    guard = setTimeout(() => done(false), timeoutMs + 1500);
    client = TcpSocket.createConnection({ host, port, connectTimeout: timeoutMs }, () => done(true));
    client.on('error', () => done(false));
  });
}

// Scans subnetPrefix.1-254 (e.g. '192.168.1'). Common DHCP ranges go first so printers show up
// early. Callbacks: onFound(ip), onDone(allIps), onProgress(checked, total). Returns cancel().
export function discoverPrinters(subnetPrefix, onFound, onDone, onProgress) {
  const hosts = [...range(100, 199), ...range(2, 99), ...range(200, 254), 1].map(n => `${subnetPrefix}.${n}`);
  const found = [];
  let next = 0;
  let checked = 0;
  let cancelled = false;

  const worker = async () => {
    while (!cancelled && next < hosts.length) {
      const ip = hosts[next];
      next += 1;
      if (await probePort(ip, PRINTER_PORT, SCAN_TIMEOUT_MS)) {
        found.push(ip);
        if (!cancelled && onFound) onFound(ip);
      }
      checked += 1;
      if (!cancelled && onProgress) onProgress(checked, hosts.length);
    }
  };

  Promise.all(Array.from({ length: SCAN_CONCURRENCY }, worker)).then(() => {
    if (!cancelled && onDone) onDone(found);
  });

  return () => { cancelled = true; };
}

// ─── Quick Test Print ────────────────────────────────────────────
export async function testPrint(ip, port = PRINTER_PORT) {
  const data = new Uint8Array([
    ...CMD.INIT,
    ...CMD.ALIGN_CENTER,
    ...CMD.BOLD_ON,
    ...line('TEST PRINT'),
    ...CMD.BOLD_OFF,
    ...line('Kea By The Pool'),
    ...line('Printer Connected!'),
    ...CMD.FEED_4,
    ...CMD.CUT,
  ]);
  return printToIp(ip, data, 1, port);
}

// ─── KOT printing from the staff app ─────────────────────────────
// The restaurant PC print agent prints KOTs on the printers Superadmin selected. This phone only
// prints (directly over WiFi) when no agent is handling KOTs right now, using those same selected
// LAN printers, or the IPs saved on this phone earlier if nothing is selected yet. Never throws.
export async function printKOTFromApp(api, kot) {
  try {
    let central = null;
    try {
      central = (await api.get('/settings/printers')).data;
    } catch (_) {
      // Backend unreachable: still try the printers saved on this phone.
    }
    if (central?.kotRouted) return { handledByAgent: true, results: [] };

    const selected = (central?.printers || [])
      .filter(printer => printer.enabled !== false && printer.kot && printer.type !== 'system' && printer.host)
      .map(printer => ({ name: printer.name, ip: printer.host, port: printer.port || PRINTER_PORT, copies: printer.copies || 1 }));
    const targets = selected.length > 0 ? selected : await getLegacyKOTTargets();
    const data = formatKOT(kot);

    const results = await Promise.all(targets.map(async (target) => {
      try {
        await printToIp(target.ip, data, target.copies, target.port);
        return { ...target, ok: true };
      } catch (error) {
        return { ...target, ok: false, error: error.message };
      }
    }));
    return { handledByAgent: false, results };
  } catch (error) {
    return { handledByAgent: false, results: [], error: error.message };
  }
}

async function getLegacyKOTTargets() {
  const saved = await getSavedPrinters();
  return [
    { name: saved.kitchenName || 'Kitchen', ip: saved.kitchenIp },
    { name: saved.receptionName || 'Reception', ip: saved.receptionIp },
  ]
    .filter(target => target.ip)
    // One copy: before the write-callback fix the second copy was never actually sent.
    .map(target => ({ ...target, port: PRINTER_PORT, copies: 1 }));
}

export function describeKOTPrint(result) {
  if (result.handledByAgent) return 'Sent to the restaurant PC print agent (Superadmin-selected KOT printers).';
  if (result.error) return `Could not print from this phone: ${result.error}`;
  if (result.results.length === 0) return 'No KOT printer selected. Superadmin can tick KOT printers in Printer Setup.';
  return result.results
    .map(r => `${r.ok ? '✓' : '✗'} ${r.name} (${r.ip})${r.ok ? '' : `: ${r.error}`}`)
    .join('\n');
}
