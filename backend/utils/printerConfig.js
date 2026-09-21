const Settings = require('../models/Settings');

const DEFAULT_PRINTER_PORT = 9100;

const cleanHost = (value) => String(value || '')
    .trim()
    .replace(/^tcp:\/\//i, '')
    .replace(/:\d+$/, '');

const cleanPort = (value, fallback = DEFAULT_PRINTER_PORT) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
};

const cleanCopies = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 && parsed <= 5 ? parsed : 1;
};

const makePrinterId = (printer, index) => {
    const source = printer.id || `${printer.role || 'printer'}-${printer.name || printer.host || index + 1}`;
    const cleaned = String(source).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
    return cleaned || `printer-${index + 1}`;
};

const LEGACY_KOT_ROLES = ['kitchen', 'bar', 'all'];
const LEGACY_BILL_ROLES = ['reception', 'counter', 'cashier'];

// Printers saved before the KOT/Bill checkboxes existed keep their old role behaviour.
const jobFlag = (value, role, legacyRoles) => (typeof value === 'boolean' ? value : legacyRoles.includes(role));

// One physical printer: LAN printers by IP:port, installed printers by PC + queue name.
const printerEndpoint = printer => (printer.type === 'system'
    ? `system:${printer.agentId}:${printer.systemName}`
    : `${printer.host}:${printer.port}`);

const normalizePrinterRegistry = (printers, defaultPort = DEFAULT_PRINTER_PORT) => {
    if (!Array.isArray(printers)) return [];

    const seenEndpoints = new Set();
    return printers.reduce((normalized, printer, index) => {
        // "tcp" = LAN/WiFi printer on port 9100. "system" = printer installed on one PC
        // (USB cable, serial or a Windows/CUPS queue), printed only by that PC's agent.
        const type = printer?.type === 'system' ? 'system' : 'tcp';
        const host = cleanHost(printer?.host || printer?.ip);
        const systemName = String(printer?.systemName || '').trim().slice(0, 200);
        const agentId = String(printer?.agentId || '').trim().slice(0, 100);
        if (type === 'tcp' ? !host : !(systemName && agentId)) return normalized;

        const port = cleanPort(printer?.port, defaultPort);
        const endpoint = printerEndpoint({ type, host, port, agentId, systemName });
        if (seenEndpoints.has(endpoint)) return normalized;
        seenEndpoints.add(endpoint);

        const role = String(printer?.role || 'all').trim().toLowerCase().slice(0, 30);
        normalized.push({
            id: makePrinterId(printer || {}, index),
            name: String(printer?.name || systemName || `WiFi Printer ${index + 1}`).trim().slice(0, 80),
            type,
            role,
            host: type === 'tcp' ? host : '',
            port,
            systemName: type === 'system' ? systemName : '',
            agentId: type === 'system' ? agentId : '',
            connection: String(printer?.connection || (type === 'tcp' ? 'network' : 'usb')).trim().slice(0, 20),
            kot: jobFlag(printer?.kot, role, LEGACY_KOT_ROLES),
            bill: jobFlag(printer?.bill, role, LEGACY_BILL_ROLES),
            copies: cleanCopies(printer?.copies),
            enabled: printer?.enabled !== false
        });
        return normalized;
    }, []);
};

const addLegacyPrinter = (printers, endpointSet, { id, name, role, host, port }) => {
    const clean = cleanHost(host);
    if (!clean) return;
    const endpoint = `${clean}:${port}`;
    if (endpointSet.has(endpoint)) return;
    endpointSet.add(endpoint);
    printers.push({
        id,
        name,
        type: 'tcp',
        role,
        host: clean,
        port,
        systemName: '',
        agentId: '',
        connection: 'network',
        kot: LEGACY_KOT_ROLES.includes(role),
        bill: LEGACY_BILL_ROLES.includes(role),
        copies: 1,
        enabled: true
    });
};

const getPrinterConfig = async () => {
    const [registryValue, kitchenIp, barIp, receptionIp, printerPort, printerEnabled, autoSelect] = await Promise.all([
        Settings.getSetting('printer_registry', []),
        Settings.getSetting('printer_kitchen_ip', ''),
        Settings.getSetting('printer_bar_ip', ''),
        Settings.getSetting('printer_reception_ip', ''),
        Settings.getSetting('printer_port', DEFAULT_PRINTER_PORT),
        Settings.getSetting('printer_enabled', true),
        Settings.getSetting('printer_auto_select', true)
    ]);

    const port = cleanPort(printerPort);
    const printers = normalizePrinterRegistry(registryValue, port);

    // Safeguard: On a single PC, only ONE installed/USB printer should print KOT by default.
    // Multiple installed queues for the same physical device cause duplicate slips (e.g. 3 copies).
    const seenSystemKOTAgents = new Set();
    for (const printer of printers) {
        if (printer.type === 'system' && printer.kot) {
            if (seenSystemKOTAgents.has(printer.agentId)) {
                printer.kot = false; // Only allow one system printer queue per PC for KOT
            } else {
                seenSystemKOTAgents.add(printer.agentId);
            }
        }
    }

    const endpointSet = new Set(printers.map(printer => `${printer.host}:${printer.port}`));

    addLegacyPrinter(printers, endpointSet, { id: 'kitchen', name: 'Kitchen Printer', role: 'kitchen', host: kitchenIp, port });
    addLegacyPrinter(printers, endpointSet, { id: 'bar', name: 'Bar Printer', role: 'bar', host: barIp, port });
    addLegacyPrinter(printers, endpointSet, { id: 'reception', name: 'Reception Printer', role: 'reception', host: receptionIp, port });

    return {
        version: 1,
        enabled: printerEnabled !== false,
        autoSelect: autoSelect !== false,
        defaultPort: port,
        printers
    };
};

// Default (fresh install / production rollout): real printers a PC agent or staff phone
// detects are ticked for KOT and Bill, until Superadmin turns auto-select off.
// If an agent already has a system printer for KOT, new system printers get kot: false.
const addDetectedPrinters = async (detectedPrinters, { agentId = '', deviceName = '' } = {}) => {
    const [autoSelect, registryValue, printerPort] = await Promise.all([
        Settings.getSetting('printer_auto_select', true),
        Settings.getSetting('printer_registry', []),
        Settings.getSetting('printer_port', DEFAULT_PRINTER_PORT)
    ]);
    if (autoSelect === false) return false;

    const port = cleanPort(printerPort);
    const registry = normalizePrinterRegistry(registryValue, port);
    const known = new Set(registry.map(printerEndpoint));
    const hasSystemKOT = registry.some(p => p.type === 'system' && p.agentId === agentId && p.kot);
    let systemKOTTicked = hasSystemKOT;

    const detected = (Array.isArray(detectedPrinters) ? detectedPrinters : [])
        // Unknown queues are often virtual (remote desktop, screen tools); those are ticked by hand.
        .filter(printer => printer.type !== 'system' || ['usb', 'wired', 'network'].includes(printer.connection))
        .map((printer, index) => {
            const isSystem = printer.type === 'system';
            const tickKOT = isSystem ? !systemKOTTicked : true;
            if (isSystem && tickKOT) systemKOTTicked = true;

            return {
                id: `auto-${Date.now()}-${index}`,
                name: isSystem
                    ? `${printer.name || printer.systemName}${deviceName ? ` (${deviceName})` : ''}`
                    : (printer.name || `Network printer ${printer.host}`),
                type: printer.type,
                host: printer.host,
                port: printer.port,
                systemName: printer.systemName,
                agentId: isSystem ? agentId : '',
                connection: printer.connection,
                role: isSystem ? 'counter' : 'kitchen',
                kot: tickKOT,
                bill: true,
                copies: 1,
                enabled: true
            };
        });
    const additions = normalizePrinterRegistry(detected, port).filter(printer => !known.has(printerEndpoint(printer)));

    if (additions.length === 0) return false;
    await Settings.setSetting('printer_registry', [...registry, ...additions], 'All thermal printers and whether each prints KOT and/or Bill');
    return true;
};

module.exports = {
    DEFAULT_PRINTER_PORT,
    cleanHost,
    cleanPort,
    normalizePrinterRegistry,
    printerEndpoint,
    getPrinterConfig,
    addDetectedPrinters
};
