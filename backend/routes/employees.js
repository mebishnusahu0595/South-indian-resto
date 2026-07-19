const express = require('express');
const router = express.Router();
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const Holiday = require('../models/Holiday');
const { protect, admin } = require('../middleware/auth');

// Mark self attendance (Check-in/Check-out for staff)
router.post('/attendance/self', protect, async (req, res) => {
    try {
        if (!req.user.isEmployee) {
            return res.status(403).json({ message: 'Only staff can mark self attendance' });
        }
        
        const { action } = req.body; // 'check-in' or 'check-out'
        const today = new Date();
        today.setHours(12, 0, 0, 0); // safe date at noon

        // Format current local time nicely (e.g. 10:30 AM)
        const timeStr = new Date().toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' });

        let attendance = await Attendance.findOne({ employee: req.user._id, date: today });

        if (action === 'check-in') {
            if (attendance) {
                return res.status(400).json({ message: 'Already checked in for today' });
            }
            attendance = new Attendance({
                employee: req.user._id,
                date: today,
                status: 'present',
                checkIn: timeStr,
                checkOut: ''
            });
        } else if (action === 'check-out') {
            if (!attendance) {
                return res.status(400).json({ message: 'Must check in first before checking out' });
            }
            attendance.checkOut = timeStr;
        } else {
            return res.status(400).json({ message: 'Invalid action. Use check-in or check-out' });
        }

        await attendance.save();
        res.json(attendance);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get self today's attendance
router.get('/attendance/today', protect, async (req, res) => {
    try {
        if (!req.user.isEmployee) {
            return res.status(403).json({ message: 'Only staff can check self attendance' });
        }
        const today = new Date();
        today.setHours(12, 0, 0, 0);

        const attendance = await Attendance.findOne({ employee: req.user._id, date: today });
        res.json(attendance || null);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get employee performance metrics (accessible by employee self or admin)
router.get('/:id/performance', protect, async (req, res) => {
    try {
        const mongoose = require('mongoose');
        const Order = require('../models/Order');
        const employeeId = req.params.id;

        // Verify if admin, or the employee themselves is querying
        if (req.user._id.toString() !== employeeId && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized to view these performance metrics' });
        }

        const [totalCount, pendingCount, servedCount, cancelledCount, salesResult] = await Promise.all([
            Order.countDocuments({ placedBy: employeeId }),
            Order.countDocuments({ placedBy: employeeId, status: { $in: ['pending', 'confirmed', 'preparing', 'ready'] } }),
            Order.countDocuments({ placedBy: employeeId, status: { $in: ['served', 'bill_requested', 'bill_generated', 'paid'] } }),
            Order.countDocuments({ placedBy: employeeId, status: 'cancelled' }),
            Order.aggregate([
                { $match: { placedBy: new mongoose.Types.ObjectId(employeeId), status: { $ne: 'cancelled' } } },
                { $group: { _id: null, totalSales: { $sum: '$total' } } }
            ])
        ]);

        const totalSales = salesResult.length > 0 ? salesResult[0].totalSales : 0;

        res.json({
            totalOrders: totalCount,
            pendingOrders: pendingCount,
            servedOrders: servedCount,
            cancelledOrders: cancelledCount,
            totalSales: totalSales
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get all employees
router.get('/', protect, admin, async (req, res) => {
    try {
        const { role, isActive } = req.query;
        let query = {};
        if (role) query.role = role;
        if (isActive !== undefined) query.isActive = isActive === 'true';
        const employees = await Employee.find(query).populate('assignedTables').sort('name');
        
        const Order = require('../models/Order');
        const populatedEmployees = await Promise.all(employees.map(async (emp) => {
            const [totalCount, pendingCount, servedCount, cancelledCount, salesResult] = await Promise.all([
                Order.countDocuments({ placedBy: emp._id }),
                Order.countDocuments({ placedBy: emp._id, status: { $in: ['pending', 'confirmed', 'preparing', 'ready'] } }),
                Order.countDocuments({ placedBy: emp._id, status: { $in: ['served', 'bill_requested', 'bill_generated', 'paid'] } }),
                Order.countDocuments({ placedBy: emp._id, status: 'cancelled' }),
                Order.aggregate([
                    { $match: { placedBy: emp._id, status: { $ne: 'cancelled' } } },
                    { $group: { _id: null, totalSales: { $sum: '$total' } } }
                ])
            ]);

            const totalSales = salesResult.length > 0 ? salesResult[0].totalSales : 0;
            
            return {
                ...emp.toObject(),
                performance: {
                    totalOrders: totalCount,
                    pendingOrders: pendingCount,
                    servedOrders: servedCount,
                    cancelledOrders: cancelledCount,
                    totalSales: totalSales
                }
            };
        }));

        res.json(populatedEmployees);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get employee by ID
router.get('/:id', protect, admin, async (req, res) => {
    try {
        const employee = await Employee.findById(req.params.id).populate('assignedTables');
        if (!employee) return res.status(404).json({ message: 'Employee not found' });
        res.json(employee);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Create employee
router.post('/', protect, admin, async (req, res) => {
    try {
        const employee = new Employee(req.body);
        await employee.save();
        res.status(201).json(employee);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Update employee
router.put('/:id', protect, admin, async (req, res) => {
    try {
        const employee = await Employee.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!employee) return res.status(404).json({ message: 'Employee not found' });
        res.json(employee);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete employee
router.delete('/:id', protect, admin, async (req, res) => {
    try {
        await Employee.findByIdAndDelete(req.params.id);
        await Attendance.deleteMany({ employee: req.params.id });
        res.json({ message: 'Employee deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get employee attendance
router.get('/:id/attendance', protect, admin, async (req, res) => {
    try {
        const { month, year } = req.query;
        let query = { employee: req.params.id };
        if (month && year) {
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0);
            query.date = { $gte: startDate, $lte: endDate };
        }
        const attendance = await Attendance.find(query).sort('date');
        res.json(attendance);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Mark attendance
router.post('/:id/attendance', protect, admin, async (req, res) => {
    try {
        const { date, status, checkIn, checkOut, notes } = req.body;
        const attendanceDate = new Date(date);
        attendanceDate.setHours(0, 0, 0, 0);
        const holiday = await Holiday.findOne({ date: attendanceDate });

        let attendance = await Attendance.findOne({ employee: req.params.id, date: attendanceDate });
        if (attendance) {
            attendance.status = holiday ? 'holiday' : status;
            attendance.checkIn = checkIn || '';
            attendance.checkOut = checkOut || '';
            attendance.notes = notes || '';
        } else {
            attendance = new Attendance({
                employee: req.params.id,
                date: attendanceDate,
                status: holiday ? 'holiday' : status,
                checkIn: checkIn || '',
                checkOut: checkOut || '',
                notes: notes || ''
            });
        }
        await attendance.save();
        res.json(attendance);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get holidays
router.get('/holidays/list', protect, admin, async (req, res) => {
    try {
        const holidays = await Holiday.find().sort('date');
        res.json(holidays);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Add holiday
router.post('/holidays', protect, admin, async (req, res) => {
    try {
        const { date, name, description } = req.body;
        const holidayDate = new Date(date);
        holidayDate.setHours(0, 0, 0, 0);
        const holiday = new Holiday({ date: holidayDate, name, description: description || '' });
        await holiday.save();
        await Attendance.updateMany({ date: holidayDate }, { $set: { status: 'holiday' } });
        res.status(201).json(holiday);
    } catch (error) {
        if (error.code === 11000) return res.status(400).json({ message: 'Holiday exists' });
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete holiday
router.delete('/holidays/:id', protect, admin, async (req, res) => {
    try {
        await Holiday.findByIdAndDelete(req.params.id);
        res.json({ message: 'Holiday deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
