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

module.exports = router;
