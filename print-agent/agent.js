/**
 * Kea By The Pool — Desktop USB Auto-Print Agent
 * Runs on the restaurant counter desktop connected to the USB Thermal Printer.
 * Listens for real-time `new-order` events from VPS backend and prints KOT slips automatically!
 */

const io = require('socket.io-client');
const { ThermalPrinter, PrinterTypes, CharacterSet, BreakLine } = require('node-thermal-printer');

// CONFIGURATION
const SERVER_URL = process.env.SERVER_URL || 'https://keabythepool.com';
const PRINTER_INTERFACE = process.env.PRINTER_INTERFACE || 'printer:auto'; // Uses system default USB printer

console.log('====================================================');
console.log('   Kea By The Pool — USB Desktop KOT Print Agent    ');
console.log('====================================================');
console.log(`Connecting to Server: ${SERVER_URL}`);

const socket = io(SERVER_URL, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 2000
});

socket.on('connect', () => {
  console.log('✅ Connected to Kea Backend Server! Waiting for orders...');
});

socket.on('disconnect', () => {
  console.log('⚠️ Disconnected from server. Retrying connection...');
});

const KITCHEN_PRINTER_IP = process.env.KITCHEN_PRINTER_IP || '';

socket.on('new-order', async (order) => {
  console.log(`\n🔔 NEW ORDER RECEIVED! Order #${order.orderNumber}`);
  const targetKitchenIp = order.kitchenPrinterIp || KITCHEN_PRINTER_IP;

  // 1. Print on Counter USB Printer
  printKOTToInterface(order, PRINTER_INTERFACE, 'Counter USB Printer')
    .then(() => console.log(`✓ USB Counter KOT #${order.kotTicket || order.orderNumber} printed!`))
    .catch(err => console.error(`❌ USB Counter Print Error:`, err.message));

  // 2. Print 2 Copies on Kitchen WiFi LAN Printer (Port 9100)
  if (targetKitchenIp) {
    (async () => {
      for (let c = 1; c <= 2; c++) {
        await printKOTToInterface(order, `tcp://${targetKitchenIp}:9100`, `Kitchen WiFi Printer (Copy ${c}/2)`);
        console.log(`✓ Kitchen WiFi KOT #${order.kotTicket || order.orderNumber} Copy ${c}/2 printed on ${targetKitchenIp}:9100!`);
      }
    })().catch(err => console.error(`❌ Kitchen WiFi Print Error (${targetKitchenIp}):`, err.message));
  }
});

async function printKOTToInterface(order, printerInterface, printerLabel) {
  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: printerInterface,
    characterSet: CharacterSet.SLOVENIA,
    breakLine: BreakLine.WORD,
    width: 42
  });

  const cleanOrdNo = String(order.orderNumber || '').replace(/^CD-/, '');
  const orderNum = order.kotTicket || `KOT-${cleanOrdNo}`;
  const tableStr = order.tableId?.tableNumber ? `Table ${order.tableId.tableNumber}` : (order.tableNumber || order.tableName || 'Takeaway');
  const staffStr = order.placedBy?.name || order.user?.name || 'Staff';
  const now = new Date(order.createdAt || Date.now());
  const dateStr = now.toLocaleDateString('en-IN');
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  printer.alignCenter();
  printer.bold(true);
  printer.setTextSize(1, 1);
  printer.println('KEA BY THE POOL');
  printer.bold(false);
  printer.setTextSize(0, 0);
  printer.println('KITCHEN ORDER TICKET');
  printer.bold(true);
  printer.println(orderNum);
  printer.bold(false);
  printer.drawLine();

  printer.alignLeft();
  printer.println(`TABLE : ${tableStr}`);
  printer.println(`ORDER#: #${order.orderNumber}`);
  printer.println(`STAFF : ${staffStr}`);
  printer.println(`TIME  : ${dateStr} ${timeStr}`);
  printer.drawLine();

  printer.bold(true);
  printer.tableCustom([
    { text: 'ITEM NAME', align: 'LEFT', width: 0.75 },
    { text: 'QTY', align: 'RIGHT', width: 0.25 }
  ]);
  printer.bold(false);
  printer.drawLine();

  if (order.items && order.items.length > 0) {
    order.items.forEach(item => {
      const itemName = item.menuItem?.name || item.name || 'Item';
      printer.tableCustom([
        { text: itemName, align: 'LEFT', width: 0.75 },
        { text: `x${item.quantity}`, align: 'RIGHT', width: 0.25 }
      ]);
    });
  }

  if (order.specialInstructions) {
    printer.drawLine();
    printer.bold(true);
    printer.println('NOTE:');
    printer.bold(false);
    printer.println(order.specialInstructions);
  }

  printer.drawLine();
  printer.alignCenter();
  printer.println(`*** KITCHEN COPY (${printerLabel}) ***`);
  printer.newLine();
  printer.newLine();
  printer.cut();

  await printer.execute();
}
