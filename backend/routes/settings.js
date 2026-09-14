const express = require('express');
const router = express.Router();
const Settings = require('../models/Settings');
const { cleanHost, cleanPort, normalizePrinterRegistry, getPrinterConfig, addDetectedPrinters } = require('../utils/printerConfig');
const { reportAppDevice, listDevices, getPrintRouting } = require('../utils/printAgents');
const { CODE_KEY, isValidOrderEditCode, setOrderEditCode, isOrderEditCodeSet } = require('../utils/orderEditCode');
const { protect, admin, superadmin } = require('../middleware/auth');

// Keys owned by dedicated superadmin routes must not be writable through the generic admin route.
const PROTECTED_SETTING_KEYS = new Set([
    CODE_KEY,
    'printer_registry',
    'printer_enabled',
    'printer_auto_select',
    'printer_port',
    'printer_kitchen_ip',
    'printer_bar_ip',
    'printer_reception_ip'
]);

// Get all settings (public for GST etc.)
router.get('/', async (req, res) => {
    try {
        const settings = await Settings.find({ key: { $ne: CODE_KEY } });
        const settingsObj = {};
        settings.forEach(s => {
            settingsObj[s.key] = s.value;
        });
        res.json(settingsObj);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get GST rate (public)
router.get('/gst', async (req, res) => {
    try {
        const gstRate = await Settings.getSetting('gst_rate', 5);
        res.json({ gstRate });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get max discount percent (public - so UI can show the cap)
router.get('/max-discount', async (req, res) => {
    try {
        const maxDiscountPercent = await Settings.getSetting('max_discount_percent', 20);
        res.json({ maxDiscountPercent });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get site info (social links, contact, hours) - public
router.get('/site-info', async (req, res) => {
    try {
        const siteInfo = await Settings.getSetting('site_info', {
            instagram: '',
            facebook: '',
            twitter: '',
            address: 'Dhanora, Risali, Bhilai',
            phone: '+91 98765 43210',
            email: 'hello@keabythepool.com',
            hoursLabel: 'Mon - Sun',
            hoursTime: '11:00 AM - 11:00 PM'
        });
        res.json(siteInfo);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Superadmin: Update site info
router.put('/site-info', protect, superadmin, async (req, res) => {
    try {
        const { instagram, facebook, twitter, address, phone, email, hoursLabel, hoursTime } = req.body;
        const updated = await Settings.setSetting('site_info', {
            instagram: instagram || '',
            facebook: facebook || '',
            twitter: twitter || '',
            address: address || '',
            phone: phone || '',
            email: email || '',
            hoursLabel: hoursLabel || 'Mon - Sun',
            hoursTime: hoursTime || '11:00 AM - 11:00 PM'
        }, 'Website contact info, social links and business hours');
        res.json(updated.value);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Superadmin: Update max discount percent
router.put('/max-discount', protect, superadmin, async (req, res) => {
    try {
        const { maxDiscountPercent } = req.body;

        if (maxDiscountPercent < 0 || maxDiscountPercent > 100) {
            return res.status(400).json({ message: 'Max discount must be between 0 and 100' });
        }

        const setting = await Settings.setSetting('max_discount_percent', maxDiscountPercent, 'Maximum discount percentage allowed for admin/staff');

        const io = req.app.get('io');
        if (io) {
            io.emit('settings-updated', { maxDiscountPercent: setting.value });
        }

        res.json({ maxDiscountPercent: setting.value });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Admin: Update GST rate
router.put('/gst', protect, admin, async (req, res) => {
    try {
        const { gstRate } = req.body;

        if (gstRate < 0 || gstRate > 100) {
            return res.status(400).json({ message: 'GST rate must be between 0 and 100' });
        }

        const setting = await Settings.setSetting('gst_rate', gstRate, 'GST Tax Rate Percentage');

        const io = req.app.get('io');
        if (io) {
            io.emit('settings-updated', { gstRate });
        }

        res.json({ gstRate: setting.value });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get app config for staff app (public after auth)
router.get('/app-config', protect, async (req, res) => {
    try {
        const announcement = await Settings.getSetting('app_announcement', '');
        const appVersion = await Settings.getSetting('app_version', '1.0.0');
        const maintenance = await Settings.getSetting('app_maintenance', false);
        const features = await Settings.getSetting('app_features', {
            host: true,
            rating: true
        });

        res.json({
            announcement: announcement || '',
            appVersion,
            maintenance,
            features
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get centrally managed printer registry (admin). kotRouted/billRouted tell the browser and
// staff app whether the restaurant PC print agent is printing that job type right now.
router.get('/printers', protect, admin, async (req, res) => {
    try {
        const { config, agentsOnline, kotRouted, billRouted } = await getPrintRouting();
        const byRole = (role) => config.printers.find(printer => printer.role === role)?.host || '';
        res.json({
            kitchenIp: byRole('kitchen'),
            barIp: byRole('bar'),
            receptionIp: byRole('reception'),
            printerPort: config.defaultPort,
            printerEnabled: config.enabled,
            autoSelectPrinters: config.autoSelect,
            printers: config.printers,
            agentsOnline,
            kotRouted,
            billRouted
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update centrally managed printer registry (superadmin)
router.put('/printers', protect, superadmin, async (req, res) => {
    try {
        const currentConfig = await getPrinterConfig();
        const printerPort = cleanPort(req.body.printerPort, currentConfig.defaultPort);
        const printerEnabled = req.body.printerEnabled !== false;
        // Older clients (current APK) do not send this flag, so keep whatever is saved.
        const autoSelect = typeof req.body.autoSelectPrinters === 'boolean' ? req.body.autoSelectPrinters : currentConfig.autoSelect;
        let printers;

        if (Array.isArray(req.body.printers)) {
            printers = normalizePrinterRegistry(req.body.printers, printerPort);
        } else {
            // Backward compatibility for already-deployed admin clients.
            const legacyInputs = [
                { id: 'kitchen', name: 'Kitchen Printer', role: 'kitchen', host: req.body.kitchenIp },
                { id: 'bar', name: 'Bar Printer', role: 'bar', host: req.body.barIp },
                { id: 'reception', name: 'Reception Printer', role: 'reception', host: req.body.receptionIp }
            ];
            const nonLegacyPrinters = currentConfig.printers.filter(printer => !['kitchen', 'bar', 'reception'].includes(printer.role));
            printers = normalizePrinterRegistry([...nonLegacyPrinters, ...legacyInputs], printerPort);
        }

        const roleHost = (role) => cleanHost(printers.find(printer => printer.role === role)?.host || '');
        await Promise.all([
            Settings.setSetting('printer_registry', printers, 'All thermal printers and whether each prints KOT and/or Bill'),
            Settings.setSetting('printer_kitchen_ip', roleHost('kitchen'), 'Legacy kitchen thermal printer IP'),
            Settings.setSetting('printer_bar_ip', roleHost('bar'), 'Legacy bar thermal printer IP'),
            Settings.setSetting('printer_reception_ip', roleHost('reception'), 'Legacy reception thermal printer IP'),
            Settings.setSetting('printer_port', printerPort, 'Default thermal printer TCP port'),
            Settings.setSetting('printer_enabled', printerEnabled, 'Enable or disable centralized automatic KOT printing'),
            Settings.setSetting('printer_auto_select', autoSelect, 'Automatically tick newly detected printers for KOT and Bill')
        ]);

        const config = { version: 1, enabled: printerEnabled, autoSelect, defaultPort: printerPort, printers };
        const io = req.app.get('io');
        if (io) io.emit('printer-settings-updated', config);

        res.json({
            message: 'Printer registry updated',
            kitchenIp: roleHost('kitchen'),
            barIp: roleHost('bar'),
            receptionIp: roleHost('reception'),
            printerPort,
            printerEnabled,
            autoSelectPrinters: autoSelect,
            printers
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Devices that reported printers: restaurant PC print agents (live over websocket) and staff phones.
router.get('/printer-devices', protect, admin, (req, res) => {
    const devices = listDevices();
    res.json({ devices, agentsOnline: devices.filter(device => device.kind === 'agent' && device.online).length });
});

// Ask every connected PC print agent to rescan its installed + LAN/WiFi printers.
router.post('/printer-devices/scan', protect, admin, (req, res) => {
    const agentsOnline = listDevices().filter(device => device.kind === 'agent' && device.online).length;
    req.app.get('io')?.to('print-agents').emit('printer-scan-request');
    res.json({ agentsOnline });
});

// Staff app reports the TCP/9100 printers its WiFi scan found.
router.post('/printer-devices/report', protect, admin, async (req, res) => {
    try {
        const device = reportAppDevice(req.body.deviceId, req.body.deviceName, req.body.printers);
        if (!device) return res.status(400).json({ message: 'deviceId is required' });

        const io = req.app.get('io');
        io?.emit('printer-devices-updated', { at: Date.now() });
        if (await addDetectedPrinters(device.printers, { deviceName: device.name })) {
            io?.emit('printer-settings-updated', await getPrinterConfig());
        }
        res.json({ reported: true });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.post('/printer-devices/test', protect, admin, (req, res) => {
    const [printer] = normalizePrinterRegistry([{ ...req.body.printer, kot: true, bill: true }]);
    if (!printer) return res.status(400).json({ message: 'Invalid printer' });
    req.app.get('io')?.to('print-agents').emit('printer-test', printer);
    res.json({ requested: true });
});

// Security code staff must enter before reducing/removing order items (stored hashed).
router.get('/order-edit-code', protect, superadmin, async (req, res) => {
    try {
        res.json({ isSet: await isOrderEditCodeSet() });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.put('/order-edit-code', protect, superadmin, async (req, res) => {
    try {
        if (!isValidOrderEditCode(req.body.code)) {
            return res.status(400).json({ message: 'Security code must be 4 to 8 digits' });
        }
        await setOrderEditCode(req.body.code);
        res.json({ isSet: true });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Admin: Update any setting. Keep this wildcard route after named routes.
router.put('/:key', protect, admin, async (req, res) => {
    if (PROTECTED_SETTING_KEYS.has(req.params.key)) {
        return res.status(403).json({ message: 'This setting can only be changed from its own Settings section' });
    }
    try {
        const { value, description } = req.body;
        const setting = await Settings.setSetting(req.params.key, value, description);
        res.json(setting);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
