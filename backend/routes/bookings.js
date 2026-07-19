const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Table = require('../models/Table');
const Bill = require('../models/Bill');
const { protect, admin, superadmin } = require('../middleware/auth');

// Get all bookings (admin/staff can view)
router.get('/', protect, async (req, res) => {
    try {
        const { date, status } = req.query;
        let query = {};

        if (date) {
            const start = new Date(date + 'T00:00:00');
            const end = new Date(date + 'T23:59:59.999');
            query.fromDate = { $lte: end };
            query.$or = [
                { toDate: { $gte: start } },
                { toDate: null, fromDate: { $gte: start, $lte: end } }
            ];
        }

        if (status) {
            query.status = status;
        }

        const bookings = await Booking.find(query)
            .populate('tables', 'tableNumber capacity section')
            .populate('createdBy', 'name')
            .sort({ fromDate: 1, fromTime: 1 });

        res.json(bookings);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get upcoming bookings count (for badge)
router.get('/upcoming-count', protect, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const count = await Booking.countDocuments({
            fromDate: { $gte: today },
            status: { $in: ['upcoming', 'confirmed'] }
        });

        res.json({ count });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Create a new booking (staff/host can create)
router.post('/', protect, async (req, res) => {
    try {
        const { guestName, guestPhone, guestCount, tableIds, sections, fromDate, toDate, fromTime, toTime, paymentStatus, paymentAmount, totalAmount, notes } = req.body;

        if (!guestName || !guestCount || !fromDate || !fromTime) {
            return res.status(400).json({ message: 'Guest name, count, from-date and from-time are required' });
        }

        // Validate tables
        let selectedTables = [];
        let tableNumbers = '';
        if (tableIds && tableIds.length > 0) {
            selectedTables = await Table.find({ _id: { $in: tableIds } });
            tableNumbers = selectedTables.map(t => t.tableNumber).join(', ');
        }

        const booking = new Booking({
            guestName,
            guestPhone: guestPhone || '',
            guestCount,
            tables: selectedTables.map(t => t._id),
            tableNumbers,
            sections: sections || [],
            fromDate: new Date(fromDate),
            toDate: toDate ? new Date(toDate) : null,
            fromTime,
            toTime: toTime || '',
            paymentStatus: paymentStatus || 'pending',
            paymentAmount: parseFloat(paymentAmount) || 0,
            totalAmount: parseFloat(totalAmount) || 0,
            notes: notes || '',
            createdBy: req.user._id
        });

        await booking.save();

        const populatedBooking = await Booking.findById(booking._id)
            .populate('tables', 'tableNumber capacity section')
            .populate('createdBy', 'name');

        // Notify admin/superadmin
        const io = req.app.get('io');
        if (io) {
            io.to('admin-room').emit('new-booking', populatedBooking);
        }

        res.status(201).json(populatedBooking);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update booking status (admin & staff can update status)
router.put('/:id/status', protect, async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['upcoming', 'confirmed', 'seated', 'completed', 'cancelled', 'no-show'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const booking = await Booking.findById(req.params.id);
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        booking.status = status;

        // Generate bill when completed
        if (status === 'completed' && !booking.billGenerated) {
            const amount = booking.totalAmount || booking.paymentAmount || 0;
            if (amount > 0) {
                const count = await Bill.countDocuments();
                const billNumber = `BK-${Date.now()}-${count + 1}`;

                await Bill.create({
                    billNumber,
                    order: null,
                    billerName: 'Pre-Booking',
                    subtotal: amount,
                    discount: 0,
                    tax: amount * 0.05,
                    total: amount * 1.05
                });

                booking.billGenerated = true;
            }
        }

        await booking.save();

        const populated = await Booking.findById(booking._id)
            .populate('tables', 'tableNumber capacity section')
            .populate('createdBy', 'name');

        const io = req.app.get('io');
        if (io) {
            io.emit('booking-updated', populated);
        }

        res.json(populated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Edit booking details (superadmin only)
router.put('/:id', protect, superadmin, async (req, res) => {
    try {
        const { guestName, guestPhone, guestCount, tableIds, sections, fromDate, toDate, fromTime, toTime, paymentStatus, paymentAmount, totalAmount, notes, status } = req.body;

        const updateData = {};
        if (guestName) updateData.guestName = guestName;
        if (guestPhone !== undefined) updateData.guestPhone = guestPhone;
        if (guestCount) updateData.guestCount = guestCount;
        if (sections) updateData.sections = sections;
        if (fromDate) updateData.fromDate = new Date(fromDate);
        if (toDate !== undefined) updateData.toDate = toDate ? new Date(toDate) : null;
        if (fromTime) updateData.fromTime = fromTime;
        if (toTime !== undefined) updateData.toTime = toTime;
        if (paymentStatus) updateData.paymentStatus = paymentStatus;
        if (paymentAmount !== undefined) updateData.paymentAmount = parseFloat(paymentAmount) || 0;
        if (totalAmount !== undefined) updateData.totalAmount = parseFloat(totalAmount) || 0;
        if (notes !== undefined) updateData.notes = notes;
        if (status) updateData.status = status;

        if (tableIds) {
            const selectedTables = await Table.find({ _id: { $in: tableIds } });
            updateData.tables = selectedTables.map(t => t._id);
            updateData.tableNumbers = selectedTables.map(t => t.tableNumber).join(', ');
        }

        const booking = await Booking.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        ).populate('tables', 'tableNumber capacity section').populate('createdBy', 'name');

        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        const io = req.app.get('io');
        if (io) {
            io.emit('booking-updated', booking);
        }

        res.json(booking);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete booking (superadmin only)
router.delete('/:id', protect, superadmin, async (req, res) => {
    try {
        const booking = await Booking.findByIdAndDelete(req.params.id);
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        const io = req.app.get('io');
        if (io) {
            io.emit('booking-deleted', req.params.id);
        }

        res.json({ message: 'Booking deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
