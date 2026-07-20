const express = require('express');
const router = express.Router();
const Settings = require('../models/Settings');
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

// Admin: Update any setting
router.put('/:key', protect, admin, async (req, res) => {
    try {
        const { value, description } = req.body;
        const setting = await Settings.setSetting(req.params.key, value, description);
        res.json(setting);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get printer settings (admin)
router.get('/printers', protect, admin, async (req, res) => {
    try {
        const kitchenIp = await Settings.getSetting('printer_kitchen_ip', '');
        const receptionIp = await Settings.getSetting('printer_reception_ip', '');
        const printerPort = await Settings.getSetting('printer_port', 9100);
        const printerEnabled = await Settings.getSetting('printer_enabled', true);
        res.json({ kitchenIp, receptionIp, printerPort, printerEnabled });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update printer settings (superadmin)
router.put('/printers', protect, superadmin, async (req, res) => {
    try {
        const { kitchenIp, receptionIp, printerPort, printerEnabled } = req.body;
        await Settings.setSetting('printer_kitchen_ip', kitchenIp || '', 'Kitchen thermal printer IP address');
        await Settings.setSetting('printer_reception_ip', receptionIp || '', 'Reception thermal printer IP address');
        await Settings.setSetting('printer_port', printerPort || 9100, 'Thermal printer TCP port');
        await Settings.setSetting('printer_enabled', printerEnabled !== false, 'Enable/disable auto-print KOT');

        const io = req.app.get('io');
        if (io) io.emit('printer-settings-updated', { kitchenIp, receptionIp, printerPort, printerEnabled });

        res.json({ message: 'Printer settings updated', kitchenIp, receptionIp, printerPort, printerEnabled });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
