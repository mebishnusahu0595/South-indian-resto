const crypto = require('crypto');
const { getPrinterConfig, cleanHost, cleanPort } = require('./printerConfig');

// ponytail: in-memory device registry for the single PM2 instance. Agents re-register on
// every reconnect, so a backend restart only empties the device list for a few seconds.
const agents = new Map();
const appDevices = new Map();
const MAX_APP_DEVICES = 50;
// A short socket reconnect must not flip printing over to the browser/phone fallback.
const ONLINE_GRACE_MS = 60 * 1000;

const text = (value, max) => String(value ?? '').trim().slice(0, max);

const sanitizePrinters = (printers) => (Array.isArray(printers) ? printers : [])
    .slice(0, 100)
    .map((printer) => {
        const type = printer?.type === 'system' ? 'system' : 'tcp';
        const host = cleanHost(printer?.host);
        return {
            type,
            name: text(printer?.name, 80),
            systemName: type === 'system' ? text(printer?.systemName, 200) : '',
            host: /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ? host : '',
            port: cleanPort(printer?.port),
            connection: text(printer?.connection, 20) || (type === 'tcp' ? 'network' : 'other'),
            status: text(printer?.status, 40)
        };
    })
    .filter(printer => (printer.type === 'system' ? printer.systemName : printer.host));

const isAgentKeyValid = (supplied) => {
    const expected = process.env.PRINT_AGENT_KEY;
    // Without a configured key the backend already broadcasts print jobs to every socket.
    if (!expected) return true;
    const expectedBuffer = Buffer.from(expected);
    const suppliedBuffer = Buffer.from(String(supplied || ''));
    return expectedBuffer.length === suppliedBuffer.length && crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
};

const isAgentOnline = agent => Boolean(agent)
    && (agent.sockets.size > 0 || Date.now() - agent.lastSeen < ONLINE_GRACE_MS);

// Restaurant PC print agent: "this is me and these are the printers I can reach".
// Returns the stored agent, or null when the payload/key is invalid.
const registerAgent = (socket, payload = {}) => {
    const id = text(payload.agentId, 100);
    if (!id || !isAgentKeyValid(payload.key)) return null;

    const agent = agents.get(id) || { id, sockets: new Set() };
    agent.name = text(payload.name, 100) || id;
    agent.platform = text(payload.platform, 60);
    agent.printers = sanitizePrinters(payload.printers);
    agent.lastSeen = Date.now();
    agent.sockets.add(socket.id);
    agents.set(id, agent);

    socket.data.printAgentId = id;
    socket.join('print-agents');
    return agent;
};

const unregisterSocket = (socket) => {
    const agent = agents.get(socket.data?.printAgentId);
    if (!agent) return false;
    agent.sockets.delete(socket.id);
    agent.lastSeen = Date.now();
    return true;
};

// Staff phone WiFi scan results, so Admin/Superadmin see them on the web too.
// Returns the stored device, or null without a deviceId.
const reportAppDevice = (deviceId, name, printers) => {
    const id = text(deviceId, 100);
    if (!id) return null;
    const device = {
        id,
        name: text(name, 100) || 'Staff App',
        printers: sanitizePrinters(printers).filter(printer => printer.type === 'tcp'),
        lastSeen: Date.now()
    };
    appDevices.delete(id);
    appDevices.set(id, device);
    if (appDevices.size > MAX_APP_DEVICES) appDevices.delete(appDevices.keys().next().value);
    return device;
};

const listDevices = () => [
    ...Array.from(agents.values()).map(agent => ({
        id: agent.id,
        kind: 'agent',
        name: agent.name,
        platform: agent.platform,
        online: isAgentOnline(agent),
        lastSeen: agent.lastSeen,
        printers: agent.printers
    })),
    ...Array.from(appDevices.values()).map(device => ({ ...device, kind: 'app' }))
];

// kotRouted/billRouted = an online PC agent can reach at least one printer selected for that job.
// Only then the agent owns printing; otherwise browser/staff-app printing is used as before.
const getPrintRouting = async () => {
    const config = await getPrinterConfig();
    const onlineAgentIds = new Set(Array.from(agents.values()).filter(isAgentOnline).map(agent => agent.id));
    // USB/installed printers need their own PC online; LAN printers can be reached by any agent.
    const isReachable = printer => (printer.type === 'system'
        ? onlineAgentIds.has(printer.agentId)
        : onlineAgentIds.size > 0);
    const isRouted = job => config.enabled !== false
        && config.printers.some(printer => printer.enabled !== false && printer[job] && isReachable(printer));

    return {
        config,
        agentsOnline: onlineAgentIds.size,
        kotRouted: isRouted('kot'),
        billRouted: isRouted('bill')
    };
};

module.exports = {
    registerAgent,
    unregisterSocket,
    reportAppDevice,
    listDevices,
    getPrintRouting
};
