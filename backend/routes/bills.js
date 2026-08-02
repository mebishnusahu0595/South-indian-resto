const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Bill = require('../models/Bill');
const Order = require('../models/Order');
const Table = require('../models/Table');
const Settings = require('../models/Settings');
const { protect, admin, superadmin } = require('../middleware/auth');
const {
    normalizeItems,
    getConfiguredTax,
    calculateTotals,
    allocateBillTotals,
    getBusinessDate,
    getBusinessDayRange,
    roundMoney
} = require('../utils/orderCalculations');
const { runAtomic, sessionOptions } = require('../utils/transactions');

const getId = value => (value?._id || value)?.toString();
const uniqueIds = values => [...new Set((values || []).map(getId).filter(Boolean))];
const isSettledPayment = method => method && method !== 'pending';
const emptySplit = () => ({ cash: 0, upi: 0, card: 0 });

const getOrderTableIds = order => uniqueIds([...(order.tables || []), order.table]);

const validateConnectedTableSession = orders => {
    if (orders.length <= 1) return true;
    const tableSets = orders.map(order => new Set(getOrderTableIds(order)));
    if (tableSets.some(set => set.size === 0)) return false;

    const connectedTables = new Set(tableSets[0]);
    const remaining = tableSets.slice(1);
    let changed = true;
    while (remaining.length > 0 && changed) {
        changed = false;
        for (let index = remaining.length - 1; index >= 0; index--) {
            if ([...remaining[index]].some(id => connectedTables.has(id))) {
                remaining[index].forEach(id => connectedTables.add(id));
                remaining.splice(index, 1);
                changed = true;
            }
        }
    }
    return remaining.length === 0;
};

const populateBill = billId => Bill.findById(billId)
    .populate({
        path: 'order',
        populate: [
            { path: 'user', select: 'name phone' },
            { path: 'tables', select: 'tableNumber name section' },
            { path: 'table', select: 'tableNumber name section' }
        ]
    })
    .populate({
        path: 'orders',
        populate: [
            { path: 'user', select: 'name phone' },
            { path: 'tables', select: 'tableNumber name section' },
            { path: 'table', select: 'tableNumber name section' }
        ]
    });

const deleteBillAndOrders = async (bill, io) => {
    const orderIds = uniqueIds([...(bill.orders || []), bill.order]);
    await runAtomic(async session => {
        if (orderIds.length > 0) {
            await Table.updateMany(
                { currentOrder: { $in: orderIds } },
                { status: 'available', isOccupied: false, currentOrder: null },
                sessionOptions(session)
            );
            await Order.deleteMany({ _id: { $in: orderIds } }, sessionOptions(session));
        }
        await Bill.findByIdAndDelete(bill._id, sessionOptions(session));
    });

    if (io) {
        io.emit('bill-deleted', bill._id.toString());
        orderIds.forEach(orderId => io.emit('order-deleted', orderId));
    }
    return orderIds;
};

// Get bills by restaurant business date (Asia/Kolkata), with legacy createdAt fallback.
router.get('/', protect, admin, async (req, res) => {
    try {
        const targetDate = req.query.date || getBusinessDate();
        const { start, end } = getBusinessDayRange(targetDate);
        const bills = await Bill.find({
            $or: [
                { businessDate: targetDate },
                { businessDate: { $in: ['', null] }, createdAt: { $gte: start, $lte: end } },
                { businessDate: { $exists: false }, createdAt: { $gte: start, $lte: end } }
            ]
        }).sort({ createdAt: -1 });

        const populatedBills = await Promise.all(bills.map(bill => populateBill(bill._id)));
        res.json(populatedBills);
    } catch (error) {
        console.error(error);
        res.status(error.message.startsWith('Invalid date') ? 400 : 500).json({ message: error.message || 'Server error' });
    }
});

router.get('/billers/suggestions', protect, admin, async (req, res) => {
    try {
        const uniqueBillers = await Bill.aggregate([
            { $match: { billerName: { $nin: ['', null] } } },
            { $group: { _id: '$billerName', lastUsed: { $max: '$createdAt' } } },
            { $sort: { lastUsed: -1 } },
            { $limit: 15 },
            { $project: { billerName: '$_id', _id: 0 } }
        ]);
        res.json(uniqueBillers.map(b => b.billerName));
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Generate/reissue one immutable Bill snapshot from linked source orders.
// Source orders are retained; their allocated totals sum exactly to the Bill total.
router.post('/generate', protect, admin, async (req, res) => {
    try {
        const { orderId, orderIds, billerName, discount, discountName } = req.body;
        const requestedIds = uniqueIds(Array.isArray(orderIds) && orderIds.length > 0 ? orderIds : [orderId]);
        if (requestedIds.length === 0 || !String(billerName || '').trim()) {
            return res.status(400).json({ message: 'Order ID(s) and Biller Name are required' });
        }
        if (requestedIds.some(id => !mongoose.Types.ObjectId.isValid(id))) {
            return res.status(400).json({ message: 'One or more Order IDs are invalid' });
        }

        const linkedBills = await Bill.find({
            $or: [{ order: { $in: requestedIds } }, { orders: { $in: requestedIds } }]
        });
        if (linkedBills.length > 1) {
            return res.status(409).json({ message: 'Selected orders already belong to different bills and cannot be combined.' });
        }

        const existingBill = linkedBills[0] || null;
        if (existingBill && isSettledPayment(existingBill.paymentMethod) && req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'This bill is settled. Only superadmin can modify it.' });
        }
        const ids = uniqueIds([
            ...(existingBill?.orders || []),
            existingBill?.order,
            ...requestedIds
        ]);
        const foundOrders = await Order.find({ _id: { $in: ids } }).populate('user', 'name phone');
        if (foundOrders.length !== ids.length) {
            return res.status(404).json({ message: 'One or more selected orders no longer exist. No bill was changed.' });
        }
        const orderById = new Map(foundOrders.map(order => [order._id.toString(), order]));
        const orders = ids.map(id => orderById.get(id));

        if (orders.some(order => order.status === 'cancelled')) {
            return res.status(400).json({ message: 'Cancelled orders cannot be included in a bill.' });
        }
        if (orders.some(order => order.status === 'paid') && req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'This bill is settled. Only superadmin can modify it.' });
        }
        if (!validateConnectedTableSession(orders)) {
            return res.status(400).json({
                message: 'Only active orders from the same table session can be combined. Takeaway orders must be billed separately.'
            });
        }

        const combinedItems = normalizeItems(orders.flatMap(order => order.items || []));
        if (combinedItems.length === 0) {
            return res.status(400).json({ message: 'Cannot generate a bill without items.' });
        }

        const parsedDiscount = discount === undefined || discount === '' ? 0 : Number(discount);
        if (!Number.isFinite(parsedDiscount)) {
            return res.status(400).json({ message: 'Discount must be a valid number. No order was changed.' });
        }
        const discountAmount = roundMoney(parsedDiscount);
        const rawSubtotal = roundMoney(combinedItems.reduce((sum, item) => sum + item.price * item.quantity, 0));
        if (discountAmount < 0 || discountAmount > rawSubtotal) {
            return res.status(400).json({ message: 'Discount must be between ₹0 and the bill subtotal.' });
        }
        if (discountAmount > 0 && req.user.role !== 'superadmin') {
            const maxDiscountPercent = Number(await Settings.getSetting('max_discount_percent', 20)) || 0;
            const discountPercent = rawSubtotal > 0 ? discountAmount / rawSubtotal * 100 : 0;
            if (discountPercent > maxDiscountPercent + 0.001) {
                return res.status(403).json({
                    message: `Discount exceeds the maximum allowed limit of ${maxDiscountPercent}%. You applied ${discountPercent.toFixed(1)}%. Only superadmin can override this.`
                });
            }
        }

        const taxConfig = await getConfiguredTax(Settings);
        const totals = calculateTotals(combinedItems, discountAmount, taxConfig);
        const paymentMethod = req.body.paymentMethod || 'pending';
        const validMethods = ['cash', 'online', 'upi', 'card', 'split', 'pending'];
        if (!validMethods.includes(paymentMethod)) {
            return res.status(400).json({ message: 'Invalid payment method.' });
        }
        const rawSplitValues = paymentMethod === 'split'
            ? ['cash', 'upi', 'card'].map(key => Number(req.body.splitPaymentDetails?.[key] ?? 0))
            : [0, 0, 0];
        if (paymentMethod === 'split' && rawSplitValues.some(value => !Number.isFinite(value) || value < 0)) {
            return res.status(400).json({ message: 'Split payment amounts must be valid non-negative numbers. No order was changed.' });
        }
        const splitPaymentDetails = paymentMethod === 'split'
            ? {
                cash: roundMoney(rawSplitValues[0]),
                upi: roundMoney(rawSplitValues[1]),
                card: roundMoney(rawSplitValues[2])
            }
            : emptySplit();
        if (paymentMethod === 'split') {
            const splitTotal = roundMoney(splitPaymentDetails.cash + splitPaymentDetails.upi + splitPaymentDetails.card);
            if (Math.round(splitTotal * 100) !== Math.round(totals.total * 100)) {
                return res.status(400).json({
                    message: `Split payment total (₹${splitTotal.toFixed(2)}) does not match bill total (₹${totals.total.toFixed(2)}). No order was changed.`
                });
            }
        }

        const now = new Date();
        const settled = isSettledPayment(paymentMethod);
        const wasSettled = isSettledPayment(existingBill?.paymentMethod);
        const businessDate = settled && !wasSettled
            ? getBusinessDate(now)
            : (existingBill?.businessDate || getBusinessDate(now));
        const allocations = allocateBillTotals(orders, totals);
        const primaryOrder = orders[0];
        const tableNumbers = [...new Set(orders.flatMap(order =>
            String(order.tableNumber || '').split(',').map(value => value.trim()).filter(Boolean)
        ))];
        const orderNumbers = orders.map(order => order.orderNumber).filter(Boolean);

        const bill = existingBill || new Bill({
            billNumber: `BILL-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`
        });
        bill.order = primaryOrder._id;
        bill.orders = orders.map(order => order._id);
        bill.items = totals.items;
        bill.taxDetails = totals.taxDetails;
        bill.orderNumbers = orderNumbers;
        bill.tableNumbers = tableNumbers;
        bill.restaurantInfo = primaryOrder.restaurantInfo || {};
        bill.customer = {
            name: primaryOrder.user?.name || 'Walk-in',
            phone: primaryOrder.user?.phone || ''
        };
        bill.billerName = String(billerName).trim();
        bill.subtotal = totals.subtotal;
        bill.discount = totals.discount;
        bill.discountName = discountName || '';
        bill.tax = totals.tax;
        bill.total = totals.total;
        bill.paymentMethod = paymentMethod;
        bill.splitPaymentDetails = splitPaymentDetails;
        bill.businessDate = businessDate;
        bill.paidAt = settled ? (bill.paidAt || now) : null;

        // All validation is complete before the first write. Keep Bill, orders, and tables in one transaction when supported.
        await runAtomic(async session => {
            await bill.save(sessionOptions(session));
            await Order.bulkWrite(allocations.map(allocation => ({
                updateOne: {
                    filter: { _id: allocation.order._id },
                    update: {
                        $set: {
                            items: allocation.items,
                            subtotal: allocation.subtotal,
                            discount: allocation.discount,
                            discountName: discountName || '',
                            billerName: String(billerName).trim(),
                            tax: allocation.tax,
                            taxDetails: allocation.taxDetails,
                            gstRate: taxConfig.reduce((sum, tax) => sum + tax.rate, 0),
                            total: allocation.total,
                            paymentMethod,
                            splitPaymentDetails,
                            amountPaid: settled ? allocation.total : 0,
                            status: settled ? 'paid' : 'bill_generated',
                            settledAt: settled ? (allocation.order.settledAt || now) : null,
                            businessDate: settled ? businessDate : '',
                            updatedAt: now
                        }
                    }
                }
            })), sessionOptions(session));

            if (settled) {
                await Table.updateMany(
                    { currentOrder: { $in: orders.map(order => order._id) } },
                    { status: 'available', isOccupied: false, currentOrder: null },
                    sessionOptions(session)
                );
            }
        });

        const populatedBill = await populateBill(bill._id);
        const io = req.app.get('io');
        if (io) {
            for (const linkedOrder of populatedBill.orders || []) io.emit('order-updated', linkedOrder);
            io.emit('bill-generated', populatedBill);
        }
        res.json(populatedBill);
    } catch (error) {
        console.error('Bill generation error:', error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
    }
});

router.post('/bulk-delete', protect, superadmin, async (req, res) => {
    try {
        const billIds = uniqueIds(req.body.billIds);
        if (billIds.length === 0) return res.status(400).json({ message: 'No bill IDs provided' });

        const bills = await Bill.find({ _id: { $in: billIds } });
        const allOrderIds = uniqueIds(bills.flatMap(bill => [...(bill.orders || []), bill.order]));
        await runAtomic(async session => {
            if (allOrderIds.length > 0) {
                await Table.updateMany(
                    { currentOrder: { $in: allOrderIds } },
                    { status: 'available', isOccupied: false, currentOrder: null },
                    sessionOptions(session)
                );
                await Order.deleteMany({ _id: { $in: allOrderIds } }, sessionOptions(session));
            }
            await Bill.deleteMany({ _id: { $in: bills.map(bill => bill._id) } }, sessionOptions(session));
        });

        const io = req.app.get('io');
        if (io) {
            bills.forEach(bill => io.emit('bill-deleted', bill._id.toString()));
            allOrderIds.forEach(orderId => io.emit('order-deleted', orderId));
            io.emit('bills-bulk-deleted', bills.map(bill => bill._id.toString()));
        }
        res.json({ message: `Successfully deleted ${bills.length} bills and all linked source orders` });
    } catch (error) {
        console.error(error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
    }
});

router.delete('/:id', protect, superadmin, async (req, res) => {
    try {
        const bill = await Bill.findById(req.params.id);
        if (!bill) return res.status(404).json({ message: 'Bill not found' });
        await deleteBillAndOrders(bill, req.app.get('io'));
        res.json({ message: 'Bill and all linked source orders deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
    }
});

module.exports = router;
