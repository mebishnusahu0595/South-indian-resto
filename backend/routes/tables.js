const express = require('express');
const router = express.Router();
const Table = require('../models/Table');
const Settings = require('../models/Settings');
const { protect, admin } = require('../middleware/auth');

// Get all tables (public - for dropdown and visual layout)
router.get('/', async (req, res) => {
    try {
        const tables = await Table.find({ isActive: true })
            .populate('currentOrder', 'orderNumber status');
        tables.sort((a, b) => {
            const secCompare = (a.section || '').localeCompare(b.section || '', undefined, { numeric: true, sensitivity: 'base' });
            if (secCompare !== 0) return secCompare;
            return (a.tableNumber || '').localeCompare(b.tableNumber || '', undefined, { numeric: true, sensitivity: 'base' });
        });
        res.json(tables);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get all sections (custom sections from settings merged with table-derived sections)
router.get('/sections', async (req, res) => {
    try {
        const derived = await Table.distinct('section', { isActive: true });
        const custom = await Settings.getSetting('custom_sections', []);
        const merged = [...new Set([...(custom || []), ...derived])].filter(Boolean);
        res.json(merged);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Admin: Add a custom section
router.post('/sections', protect, admin, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'Section name is required' });
        }
        const trimmed = name.trim();
        const custom = (await Settings.getSetting('custom_sections', [])) || [];
        if (!custom.includes(trimmed)) {
            custom.push(trimmed);
            await Settings.setSetting('custom_sections', custom, 'Custom table sections');
        }
        const derived = await Table.distinct('section', { isActive: true });
        const merged = [...new Set([...custom, ...derived])].filter(Boolean);
        res.status(201).json(merged);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Admin: Rename a section (updates all tables in that section and settings preset)
router.put('/sections/rename', protect, admin, async (req, res) => {
    try {
        const { oldName, newName } = req.body;
        if (!oldName || !newName || !newName.trim()) {
            return res.status(400).json({ message: 'Both oldName and newName are required' });
        }
        const trimmedOld = oldName.trim();
        const trimmedNew = newName.trim();

        // 1. Update all tables with old section name
        await Table.updateMany({ section: trimmedOld }, { section: trimmedNew });

        // 2. Update custom_sections list in Settings
        let custom = (await Settings.getSetting('custom_sections', [])) || [];
        if (custom.includes(trimmedOld)) {
            custom = custom.map(s => s === trimmedOld ? trimmedNew : s);
        } else if (!custom.includes(trimmedNew)) {
            custom.push(trimmedNew);
        }
        await Settings.setSetting('custom_sections', [...new Set(custom)], 'Custom table sections');

        // 3. Emit socket event
        const io = req.app.get('io');
        if (io) {
            io.emit('table-updated');
        }

        const derived = await Table.distinct('section', { isActive: true });
        const merged = [...new Set([...custom, ...derived])].filter(Boolean);
        res.json({ message: `Renamed section "${trimmedOld}" to "${trimmedNew}"`, sections: merged });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Admin: Remove a custom section (does not delete tables; they keep their section value)
router.delete('/sections/:name', protect, admin, async (req, res) => {
    try {
        const name = decodeURIComponent(req.params.name);
        let custom = (await Settings.getSetting('custom_sections', [])) || [];
        custom = custom.filter(s => s !== name);
        await Settings.setSetting('custom_sections', custom, 'Custom table sections');
        const derived = await Table.distinct('section', { isActive: true });
        const merged = [...new Set([...custom, ...derived])].filter(Boolean);
        res.json(merged);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get available tables only
router.get('/available', async (req, res) => {
    try {
        const tables = await Table.find({ isActive: true, status: 'available' });
        tables.sort((a, b) => {
            const secCompare = (a.section || '').localeCompare(b.section || '', undefined, { numeric: true, sensitivity: 'base' });
            if (secCompare !== 0) return secCompare;
            return (a.tableNumber || '').localeCompare(b.tableNumber || '', undefined, { numeric: true, sensitivity: 'base' });
        });
        res.json(tables);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Admin: Create table
router.post('/', protect, admin, async (req, res) => {
    try {
        const { tableNumber, name, capacity, section, areaType, shape } = req.body;

        const existing = await Table.findOne({ tableNumber });
        if (existing) {
            return res.status(400).json({ message: 'Table number already exists' });
        }

        const table = await Table.create({
            tableNumber,
            name: name || '',
            capacity: capacity || 4,
            section: section || 'Main Hall',
            areaType: areaType || 'table',
            shape: shape || 'square'
        });
        res.status(201).json(table);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Admin: Bulk create tables
router.post('/bulk', protect, admin, async (req, res) => {
    try {
        const { startNumber, endNumber, capacity, section, areaType, shape } = req.body;
        const tables = [];

        for (let i = startNumber; i <= endNumber; i++) {
            const tableNumber = i.toString();
            const existing = await Table.findOne({ tableNumber });
            if (!existing) {
                tables.push({
                    tableNumber,
                    capacity: capacity || 4,
                    section: section || 'Main Hall',
                    areaType: areaType || 'table',
                    shape: shape || 'square'
                });
            }
        }

        const created = await Table.insertMany(tables);
        res.status(201).json({ message: `Created ${created.length} tables`, tables: created });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Admin: Update table
router.put('/:id', protect, admin, async (req, res) => {
    try {
        const table = await Table.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        res.json(table);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Admin: Delete table
router.delete('/:id', protect, admin, async (req, res) => {
    try {
        await Table.findByIdAndDelete(req.params.id);
        res.json({ message: 'Table deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Occupy table (internal use)
router.put('/:id/occupy', protect, async (req, res) => {
    try {
        const { orderId } = req.body;
        const table = await Table.findByIdAndUpdate(
            req.params.id,
            { status: 'occupied', isOccupied: true, currentOrder: orderId },
            { new: true }
        );
        res.json(table);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Free table (after payment)
router.put('/:id/free', protect, async (req, res) => {
    try {
        const table = await Table.findByIdAndUpdate(
            req.params.id,
            { status: 'available', isOccupied: false, currentOrder: null },
            { new: true }
        );

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
            io.emit('table-freed', table);
        }

        res.json(table);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
