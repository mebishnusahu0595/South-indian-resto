const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');
const { protect, admin } = require('../middleware/auth');
const { getBusinessDate, getBusinessDayRange } = require('../utils/orderCalculations');
const { getDateRange } = require('../utils/helpers');

// @route   GET /api/expenses
// @desc    Get expenses with flexible filters (date, date range, period, category)
// @access  Private/Admin & Superadmin
router.get('/', protect, admin, async (req, res) => {
    try {
        const { date, startDate, endDate, period, category } = req.query;
        let query = {};

        if (date) {
            query.businessDate = date;
        } else if (startDate && endDate) {
            query.businessDate = { $gte: startDate, $lte: endDate };
        } else if (startDate) {
            query.businessDate = { $gte: startDate };
        } else if (period) {
            const today = getBusinessDate();
            if (period === 'today') {
                query.businessDate = today;
            } else if (period === 'yesterday') {
                const yesterday = getBusinessDate(new Date(Date.now() - 86400000));
                query.businessDate = yesterday;
            } else if (period === 'week') {
                const weekAgo = getBusinessDate(new Date(Date.now() - 7 * 86400000));
                query.businessDate = { $gte: weekAgo, $lte: today };
            } else if (period === 'month') {
                const monthStart = `${today.slice(0, 7)}-01`;
                query.businessDate = { $gte: monthStart, $lte: today };
            } else if (period === 'year') {
                const yearStart = `${today.slice(0, 4)}-01-01`;
                query.businessDate = { $gte: yearStart, $lte: today };
            }
        }

        if (category && category !== 'All') {
            query.category = category;
        }

        const expenses = await Expense.find(query).sort({ businessDate: -1, createdAt: -1 });

        const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

        const categoryBreakdown = {};
        const paymentMethodBreakdown = { cash: 0, upi: 0, online: 0, card: 0, bank_transfer: 0, other: 0 };

        expenses.forEach(e => {
            const cat = e.category || 'General';
            categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + (e.amount || 0);

            if (e.paymentMethod === 'split' && e.splitPayments) {
                paymentMethodBreakdown.cash += e.splitPayments.cash || 0;
                paymentMethodBreakdown.upi += e.splitPayments.upi || 0;
                paymentMethodBreakdown.card += e.splitPayments.card || 0;
                paymentMethodBreakdown.bank_transfer += e.splitPayments.bank_transfer || 0;
                paymentMethodBreakdown.other += e.splitPayments.other || 0;
            } else {
                const method = e.paymentMethod || 'cash';
                if (paymentMethodBreakdown[method] !== undefined) {
                    paymentMethodBreakdown[method] += e.amount || 0;
                } else {
                    paymentMethodBreakdown.other += e.amount || 0;
                }
            }
        });

        res.json({
            success: true,
            count: expenses.length,
            totalExpenses,
            categoryBreakdown,
            paymentMethodBreakdown,
            expenses
        });
    } catch (error) {
        console.error('Error fetching expenses:', error);
        res.status(500).json({ message: error.message || 'Failed to fetch expenses' });
    }
});

// @route   POST /api/expenses
// @desc    Add a single or multiple (bulk) expenses
// @access  Private/Admin & Superadmin
router.post('/', protect, admin, async (req, res) => {
    try {
        // Support multiple expenses in one go
        if (Array.isArray(req.body.expenses)) {
            const created = [];
            for (const item of req.body.expenses) {
                if (!item.title || !item.title.trim()) continue;
                const num = parseFloat(item.amount);
                if (isNaN(num) || num <= 0) continue;
                const bDate = item.businessDate || req.body.businessDate || getBusinessDate(item.date ? new Date(item.date) : new Date());
                created.push({
                    title: item.title.trim(),
                    amount: num,
                    category: (item.category && item.category.trim()) || 'General',
                    businessDate: bDate,
                    date: item.date ? new Date(item.date) : new Date(),
                    paymentMethod: item.paymentMethod || 'cash',
                    splitPayments: item.splitPayments || {},
                    notes: (item.notes && item.notes.trim()) || '',
                    addedBy: req.user._id,
                    addedByName: req.user.name || 'Admin'
                });
            }
            if (created.length === 0) {
                return res.status(400).json({ message: 'No valid expenses to add' });
            }
            const saved = await Expense.insertMany(created);
            return res.status(201).json({
                success: true,
                message: `${saved.length} expenses added successfully`,
                expenses: saved
            });
        }

        const { title, amount, category, businessDate, paymentMethod, splitPayments, notes, date } = req.body;

        if (!title || !title.trim()) {
            return res.status(400).json({ message: 'Expense title/description is required' });
        }

        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            return res.status(400).json({ message: 'Please provide a valid amount in Rupees (> 0)' });
        }

        const assignedBusinessDate = businessDate || getBusinessDate(date ? new Date(date) : new Date());

        const expense = new Expense({
            title: title.trim(),
            amount: numAmount,
            category: (category && category.trim()) || 'General',
            businessDate: assignedBusinessDate,
            date: date ? new Date(date) : new Date(),
            paymentMethod: paymentMethod || 'cash',
            splitPayments: splitPayments || {},
            notes: (notes && notes.trim()) || '',
            addedBy: req.user._id,
            addedByName: req.user.name || 'Admin'
        });

        await expense.save();

        res.status(201).json({
            success: true,
            message: 'Expense added successfully',
            expense
        });
    } catch (error) {
        console.error('Error creating expense:', error);
        res.status(500).json({ message: error.message || 'Failed to create expense' });
    }
});

// @route   PUT /api/expenses/:id
// @desc    Update an expense
// @access  Private/Admin & Superadmin
router.put('/:id', protect, admin, async (req, res) => {
    try {
        const { title, amount, category, businessDate, paymentMethod, splitPayments, notes } = req.body;
        const expense = await Expense.findById(req.params.id);

        if (!expense) {
            return res.status(404).json({ message: 'Expense not found' });
        }

        if (title !== undefined) expense.title = title.trim();
        if (amount !== undefined) {
            const num = parseFloat(amount);
            if (isNaN(num) || num <= 0) {
                return res.status(400).json({ message: 'Valid amount is required' });
            }
            expense.amount = num;
        }
        if (category !== undefined) expense.category = category.trim() || 'General';
        if (businessDate !== undefined) expense.businessDate = businessDate;
        if (paymentMethod !== undefined) expense.paymentMethod = paymentMethod;
        if (splitPayments !== undefined) expense.splitPayments = splitPayments;
        if (notes !== undefined) expense.notes = notes.trim();

        await expense.save();

        res.json({
            success: true,
            message: 'Expense updated successfully',
            expense
        });
    } catch (error) {
        console.error('Error updating expense:', error);
        res.status(500).json({ message: error.message || 'Failed to update expense' });
    }
});

// @route   DELETE /api/expenses/:id
// @desc    Delete an expense
// @access  Private/Admin & Superadmin
router.delete('/:id', protect, admin, async (req, res) => {
    try {
        const expense = await Expense.findById(req.params.id);
        if (!expense) {
            return res.status(404).json({ message: 'Expense not found' });
        }

        await Expense.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: 'Expense deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting expense:', error);
        res.status(500).json({ message: error.message || 'Failed to delete expense' });
    }
});

module.exports = router;
