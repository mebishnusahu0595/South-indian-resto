const express = require('express');
const router = express.Router();
const Settings = require('../models/Settings');
const { cleanHost, cleanPort, normalizePrinterRegistry, getPrinterConfig } = require('../utils/printerConfig');
const { protect, admin, superadmin } = require('../middleware/auth');

// Get all settings (public for GST etc.)
router.get('/', async (req, res) => {
    try {
        const settings = await Settings.find();
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

// Get centrally managed printer registry (admin)
router.get('/printers', protect, admin, async (req, res) => {
    try {
        const config = await getPrinterConfig();
        const byRole = (role) => config.printers.find(printer => printer.role === role)?.host || '';
        res.json({
            kitchenIp: byRole('kitchen'),
            barIp: byRole('bar'),
            receptionIp: byRole('reception'),
            printerPort: config.defaultPort,
            printerEnabled: config.enabled,
            printers: config.printers
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
            Settings.setSetting('printer_registry', printers, 'All LAN thermal printers that receive every KOT'),
            Settings.setSetting('printer_kitchen_ip', roleHost('kitchen'), 'Legacy kitchen thermal printer IP'),
            Settings.setSetting('printer_bar_ip', roleHost('bar'), 'Legacy bar thermal printer IP'),
            Settings.setSetting('printer_reception_ip', roleHost('reception'), 'Legacy reception thermal printer IP'),
            Settings.setSetting('printer_port', printerPort, 'Default thermal printer TCP port'),
            Settings.setSetting('printer_enabled', printerEnabled, 'Enable or disable centralized automatic KOT printing')
        ]);

        const config = { version: 1, enabled: printerEnabled, defaultPort: printerPort, printers };
        const io = req.app.get('io');
        if (io) io.emit('printer-settings-updated', config);

        res.json({
            message: 'Printer registry updated',
            kitchenIp: roleHost('kitchen'),
            barIp: roleHost('bar'),
            receptionIp: roleHost('reception'),
            printerPort,
            printerEnabled,
            printers
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Admin: Update any setting. Keep this wildcard route after named routes.
router.put('/:key', protect, admin, async (req, res) => {
    try {
        const { value, description } = req.body;
        const setting = await Settings.setSetting(req.params.key, value, description);
        res.json(setting);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
