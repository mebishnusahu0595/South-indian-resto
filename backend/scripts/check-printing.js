// Offline self-check (no MongoDB needed) for printer routing, auto-select and the staff edit code.
// Run: node backend/scripts/check-printing.js
const assert = require('assert');
const Settings = require('../models/Settings');

const store = new Map();
Settings.getSetting = async (key, fallback = null) => (store.has(key) ? store.get(key) : fallback);
Settings.setSetting = async (key, value) => {
    store.set(key, value);
    return { key, value };
};

const { normalizePrinterRegistry, addDetectedPrinters, getPrinterConfig } = require('../utils/printerConfig');
const { registerAgent, unregisterSocket, getPrintRouting } = require('../utils/printAgents');
const { setOrderEditCode, checkOrderEditCode } = require('../utils/orderEditCode');

const routed = async () => {
    const { kotRouted, billRouted } = await getPrintRouting();
    return [kotRouted, billRouted];
};

(async () => {
    // Role-only printers saved before the checkboxes keep their old jobs; installed printers need an owning PC.
    const legacy = normalizePrinterRegistry([
        { host: '192.168.1.50', role: 'kitchen' },
        { host: '192.168.1.51', role: 'reception' },
        { type: 'system', systemName: 'POS-80' }
    ]);
    assert.deepStrictEqual(legacy.map(p => [p.host, p.kot, p.bill]), [['192.168.1.50', true, false], ['192.168.1.51', false, true]]);

    // No agent online: browser / staff app keep printing.
    assert.deepStrictEqual(await routed(), [false, false]);

    // Agent reports printers: real ones are auto-ticked for KOT + Bill, unknown queues are not.
    const socket = { id: 's1', data: {}, join() {} };
    const agent = registerAgent(socket, {
        agentId: 'COUNTER-PC',
        name: 'COUNTER-PC',
        printers: [
            { type: 'tcp', host: '192.168.1.60', port: 9100, connection: 'network' },
            { type: 'system', systemName: 'EPSON TM-T82', connection: 'usb' },
            { type: 'system', systemName: 'Remote Queue', connection: 'other' }
        ]
    });
    assert.ok(agent);
    assert.strictEqual(await addDetectedPrinters(agent.printers, { agentId: agent.id, deviceName: agent.name }), true);
    let config = await getPrinterConfig();
    assert.deepStrictEqual(config.printers.map(p => [p.type, p.kot, p.bill]), [['tcp', true, true], ['system', true, true]]);
    assert.deepStrictEqual(await routed(), [true, true]);

    // Superadmin unticks the LAN printer: the next scan must not tick it again.
    store.set('printer_registry', config.printers.map(p => (p.type === 'tcp' ? { ...p, kot: false, bill: false } : p)));
    assert.strictEqual(await addDetectedPrinters(agent.printers, { agentId: agent.id }), false);
    config = await getPrinterConfig();
    assert.strictEqual(config.printers.find(p => p.type === 'tcp').kot, false);

    // A USB printer on another (offline) PC is unreachable; per-job ticks and the master switch are respected.
    store.set('printer_registry', [{ type: 'system', systemName: 'EPSON TM-T82', agentId: 'OTHER-PC', kot: true, bill: true }]);
    assert.deepStrictEqual(await routed(), [false, false]);
    store.set('printer_registry', [{ host: '192.168.1.60', kot: true, bill: false }]);
    assert.deepStrictEqual(await routed(), [true, false]);
    store.set('printer_enabled', false);
    assert.deepStrictEqual(await routed(), [false, false]);
    store.set('printer_enabled', true);

    // A short disconnect keeps the agent as owner (grace period).
    unregisterSocket(socket);
    assert.deepStrictEqual(await routed(), [true, false]);

    // Auto-select off: detected printers are listed but not added.
    store.set('printer_auto_select', false);
    assert.strictEqual(await addDetectedPrinters([{ type: 'tcp', host: '192.168.1.99', port: 9100 }]), false);

    // Edit code: no code set = works as before; once set it is required; 5 wrong tries lock the user.
    const staff = { _id: 'staff-1' };
    assert.strictEqual(await checkOrderEditCode(staff, undefined), null);
    await setOrderEditCode('4821');
    assert.strictEqual((await checkOrderEditCode(staff, undefined)).status, 403);
    assert.strictEqual(await checkOrderEditCode(staff, '4821'), null);
    for (let attempt = 0; attempt < 5; attempt += 1) {
        assert.strictEqual((await checkOrderEditCode(staff, '0000')).status, 403);
    }
    assert.strictEqual((await checkOrderEditCode(staff, '4821')).status, 429);

    console.log('check-printing: all checks passed');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
