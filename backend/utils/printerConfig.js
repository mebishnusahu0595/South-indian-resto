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

const normalizePrinterRegistry = (printers, defaultPort = DEFAULT_PRINTER_PORT) => {
    if (!Array.isArray(printers)) return [];

    const seenEndpoints = new Set();
    return printers.reduce((normalized, printer, index) => {
        const host = cleanHost(printer?.host || printer?.ip);
        if (!host) return normalized;

        const port = cleanPort(printer?.port, defaultPort);
        const endpoint = `${host}:${port}`;
        if (seenEndpoints.has(endpoint)) return normalized;
        seenEndpoints.add(endpoint);

        normalized.push({
            id: makePrinterId(printer || {}, index),
            name: String(printer?.name || `WiFi Printer ${index + 1}`).trim().slice(0, 80),
            role: String(printer?.role || 'all').trim().toLowerCase().slice(0, 30),
            host,
            port,
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
    printers.push({ id, name, role, host: clean, port, copies: 1, enabled: true });
};

const getPrinterConfig = async () => {
    const [registryValue, kitchenIp, barIp, receptionIp, printerPort, printerEnabled] = await Promise.all([
        Settings.getSetting('printer_registry', []),
        Settings.getSetting('printer_kitchen_ip', ''),
        Settings.getSetting('printer_bar_ip', ''),
        Settings.getSetting('printer_reception_ip', ''),
        Settings.getSetting('printer_port', DEFAULT_PRINTER_PORT),
        Settings.getSetting('printer_enabled', true)
    ]);

    const port = cleanPort(printerPort);
    const printers = normalizePrinterRegistry(registryValue, port);
    const endpointSet = new Set(printers.map(printer => `${printer.host}:${printer.port}`));

    addLegacyPrinter(printers, endpointSet, { id: 'kitchen', name: 'Kitchen Printer', role: 'kitchen', host: kitchenIp, port });
    addLegacyPrinter(printers, endpointSet, { id: 'bar', name: 'Bar Printer', role: 'bar', host: barIp, port });
    addLegacyPrinter(printers, endpointSet, { id: 'reception', name: 'Reception Printer', role: 'reception', host: receptionIp, port });

    return {
        version: 1,
        enabled: printerEnabled !== false,
        defaultPort: port,
        printers
    };
};

module.exports = {
    DEFAULT_PRINTER_PORT,
    cleanHost,
    cleanPort,
    normalizePrinterRegistry,
    getPrinterConfig
};
