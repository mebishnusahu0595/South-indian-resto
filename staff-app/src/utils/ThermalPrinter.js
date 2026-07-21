/**
 * ThermalPrinter.js
 * ESC/POS over TCP/WiFi for 80mm thermal printers
 * Works on same WiFi network as the staff app
 */

import TcpSocket from 'react-native-tcp-socket';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PRINTER_PORT = 9100;
const STORAGE_KEY_KITCHEN = 'printer_kitchen_ip';
const STORAGE_KEY_RECEPTION = 'printer_reception_ip';
const STORAGE_KEY_KITCHEN_NAME = 'printer_kitchen_name';
const STORAGE_KEY_RECEPTION_NAME = 'printer_reception_name';
const CONNECT_TIMEOUT = 5000; // 5 seconds

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
export function formatKOT({ orderNumber, tableNumber, tableName, items, instructions, staffName, timestamp }) {
  const now = timestamp ? new Date(timestamp) : new Date();
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const bytes = [
    ...CMD.INIT,
    ...CMD.ALIGN_CENTER,
    ...CMD.BOLD_ON,
    ...CMD.DOUBLE_HEIGHT,
    ...line('KOT'),
    ...CMD.NORMAL_SIZE,
    ...CMD.BOLD_OFF,
    ...line('Kitchen Order Ticket'),
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
export async function printToIp(ip, data, copies = 2) {
  let result;
  for (let c = 0; c < copies; c++) {
    result = await sendTcpPrint(ip, data);
  }
  return result;
}

function sendTcpPrint(ip, data) {
  return new Promise((resolve, reject) => {
    if (!ip || !ip.trim()) {
      reject(new Error('Printer IP not configured'));
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { client.destroy(); } catch (_) {}
        reject(new Error(`Timeout: Could not reach printer at ${ip}:${PRINTER_PORT}`));
      }
    }, CONNECT_TIMEOUT);

    const client = TcpSocket.createConnection({ host: ip, port: PRINTER_PORT }, () => {
      // Connected — send ESC/POS data
      client.write(data, () => {
        clearTimeout(timer);
        settled = true;
        client.destroy();
        resolve({ success: true, ip });
      });
    });

    client.on('error', (err) => {
      if (!settled) {
        clearTimeout(timer);
        settled = true;
        try { client.destroy(); } catch (_) {}
        reject(new Error(`Cannot connect to printer at ${ip}: ${err.message}`));
      }
    });
  });
}

// ─── Saved Printer IPs ───────────────────────────────────────────
export async function getSavedPrinters() {
  const kitchenIp = await AsyncStorage.getItem(STORAGE_KEY_KITCHEN) || '';
  const receptionIp = await AsyncStorage.getItem(STORAGE_KEY_RECEPTION) || '';
  const kitchenName = await AsyncStorage.getItem(STORAGE_KEY_KITCHEN_NAME) || '';
  const receptionName = await AsyncStorage.getItem(STORAGE_KEY_RECEPTION_NAME) || '';
  return { kitchenIp, receptionIp, kitchenName, receptionName };
}

export async function savePrinterIps({ kitchenIp, receptionIp, kitchenName, receptionName }) {
  if (kitchenIp !== undefined) await AsyncStorage.setItem(STORAGE_KEY_KITCHEN, kitchenIp);
  if (receptionIp !== undefined) await AsyncStorage.setItem(STORAGE_KEY_RECEPTION, receptionIp);
  if (kitchenName !== undefined) await AsyncStorage.setItem(STORAGE_KEY_KITCHEN_NAME, kitchenName);
  if (receptionName !== undefined) await AsyncStorage.setItem(STORAGE_KEY_RECEPTION_NAME, receptionName);
}

// ─── Auto Discover Printers on Port 9100 ─────────────────────────
// Scans the local subnet for devices with port 9100 open
export function discoverPrinters(subnetPrefix, onFound, onDone) {
  // e.g. subnetPrefix = '192.168.1' → scans 192.168.1.1 to 192.168.1.254
  let completed = 0;
  const total = 254;
  const found = [];

  for (let i = 1; i <= 254; i++) {
    const ip = `${subnetPrefix}.${i}`;
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        completed++;
        if (completed >= total && onDone) onDone(found);
      }
    }, 2000); // 2 second timeout per IP

    const client = TcpSocket.createConnection({ host: ip, port: PRINTER_PORT }, () => {
      if (!settled) {
        clearTimeout(timer);
        settled = true;
        client.destroy();
        found.push(ip);
        if (onFound) onFound(ip);
        completed++;
        if (completed >= total && onDone) onDone(found);
      }
    });

    client.on('error', () => {
      if (!settled) {
        clearTimeout(timer);
        settled = true;
        completed++;
        if (completed >= total && onDone) onDone(found);
      }
    });
  }
}

// ─── Quick Test Print ────────────────────────────────────────────
export async function testPrint(ip) {
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
  return printToIp(ip, data);
}
