const express = require('express');
const router = express.Router();
const Bill = require('../models/Bill');
const Order = require('../models/Order');
const Table = require('../models/Table');
const Settings = require('../models/Settings');
const { protect, admin, superadmin } = require('../middleware/auth');

// Get all bills for a specific date
router.get('/', protect, admin, async (req, res) => {
    try {
        const { date } = req.query;
        let query = {};
        let targetDate = date;
        if (!targetDate) {
            const d = new Date();
            const offset = d.getTimezoneOffset();
            const localDate = new Date(d.getTime() - (offset * 60 * 1000));
            targetDate = localDate.toISOString().split('T')[0];
        }
        const start = new Date(targetDate + 'T00:00:00');
        const end = new Date(targetDate + 'T23:59:59.999');
        query.createdAt = { $gte: start, $lte: end };

        const bills = await Bill.find(query)
            .populate({
                path: 'order',
                populate: { path: 'user', select: 'name phone' }
            })
            .sort({ createdAt: -1 });

        res.json(bills);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Suggestions for biller names (last 15 unique)
router.get('/billers/suggestions', protect, admin, async (req, res) => {
    try {
        const uniqueBillers = await Bill.aggregate([
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

// Generate or update a bill
router.post('/generate', protect, admin, async (req, res) => {
    try {
        const { orderId, orderIds, billerName, discount, discountName } = req.body;
        
        if ((!orderId && (!orderIds || orderIds.length === 0)) || !billerName) {
            return res.status(400).json({ message: 'Order ID(s) and Biller Name are required' });
        }

        const ids = orderIds || [orderId];
        
        const matchingOrders = await Order.find({ _id: { $in: ids } });
        // Block bill regeneration on settled orders unless superadmin
        if (matchingOrders.some(o => o.status === 'paid') && req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'One or more orders have been settled. Only superadmin can modify settled bills.' });
        }

        const primaryOrderId = ids[0];

        const primaryOrder = await Order.findById(primaryOrderId).populate('user', 'name phone');
        if (!primaryOrder) {
            return res.status(404).json({ message: 'Primary order not found' });
        }

        // Merge other orders if multiple IDs are provided
        if (ids.length > 1) {
            for (let i = 1; i < ids.length; i++) {
                const otherOrder = await Order.findById(ids[i]);
                if (otherOrder) {
                    // Merge items
                    for (const otherItem of otherOrder.items) {
                        const existingItem = primaryOrder.items.find(item => 
                            item.menuItem.toString() === otherItem.menuItem.toString()
                        );
                        if (existingItem) {
                            existingItem.quantity += otherItem.quantity;
                            existingItem.total = existingItem.price * existingItem.quantity;
                        } else {
                            primaryOrder.items.push(otherItem);
                        }
                    }

                    // Append instructions if any
                    if (otherOrder.specialInstructions) {
                        primaryOrder.specialInstructions = primaryOrder.specialInstructions
                            ? `${primaryOrder.specialInstructions} | ${otherOrder.specialInstructions}`
                            : otherOrder.specialInstructions;
                    }

                    // Delete the merged order from DB so it doesn't duplicate
                    await Order.findByIdAndDelete(otherOrder._id);
                }
            }
        }

        // Recalculate primary order subtotal
        let subtotal = 0;
        for (const item of primaryOrder.items) {
            subtotal += (item.price * item.quantity);
            item.total = item.price * item.quantity;
        }
        primaryOrder.subtotal = subtotal;

        const discountAmount = parseFloat(discount) || 0;

        // Enforce max discount percentage for non-superadmin
        if (discountAmount > 0 && req.user.role !== 'superadmin') {
            const maxDiscountPercent = await Settings.getSetting('max_discount_percent', 20);
            const discountPercent = (discountAmount / subtotal) * 100;
            if (discountPercent > maxDiscountPercent) {
                return res.status(403).json({
                    message: `Discount exceeds the maximum allowed limit of ${maxDiscountPercent}%. You applied ${discountPercent.toFixed(1)}%. Only superadmin can override this.`
                });
            }
        }

        const gstRate = primaryOrder.gstRate || 5;
        const taxableAmount = subtotal - discountAmount;
        const tax = taxableAmount * (gstRate / 100);

        primaryOrder.discount = discountAmount;
        primaryOrder.discountName = discountName || '';
        primaryOrder.billerName = billerName;
        primaryOrder.tax = tax;
        primaryOrder.taxDetails = [{ name: 'GST', rate: gstRate, amount: tax }];
        const { paymentMethod, splitPaymentDetails } = req.body;
        const billTotal = taxableAmount + tax;

        if (paymentMethod) {
            if (paymentMethod === 'split' && splitPaymentDetails) {
                const sumSplit = (parseFloat(splitPaymentDetails.cash) || 0) +
                                 (parseFloat(splitPaymentDetails.upi) || 0) +
                                 (parseFloat(splitPaymentDetails.card) || 0);
                if (Math.abs(sumSplit - billTotal) > 1) {
                    return res.status(400).json({
                        message: `Split payment total (₹${sumSplit.toFixed(2)}) does not match bill total (₹${billTotal.toFixed(2)})`
                    });
                }
            }

            primaryOrder.paymentMethod = paymentMethod;
            primaryOrder.splitPaymentDetails = splitPaymentDetails || { cash: 0, upi: 0, card: 0 };
            primaryOrder.status = 'paid';
            primaryOrder.amountPaid = billTotal;

            // Automatically free table(s) on payment
            if (primaryOrder.tables && primaryOrder.tables.length > 0) {
                await Table.updateMany(
                    { _id: { $in: primaryOrder.tables } },
                    { status: 'available', isOccupied: false, currentOrder: null }
                );
            }
        } else {
            primaryOrder.status = 'bill_generated';
        }

        await primaryOrder.save();

        let bill = await Bill.findOne({ order: primaryOrderId });
        if (bill) {
            bill.billerName = billerName;
            bill.subtotal = subtotal;
            bill.discount = discountAmount;
            bill.discountName = discountName || '';
            bill.tax = tax;
            bill.total = billTotal;
            if (paymentMethod) {
                bill.paymentMethod = paymentMethod;
                bill.splitPaymentDetails = splitPaymentDetails || { cash: 0, upi: 0, card: 0 };
            }
            await bill.save();
        } else {
            const count = await Bill.countDocuments();
            const billNumber = `BILL-${Date.now()}-${count + 1}`;

            bill = new Bill({
                billNumber,
                order: primaryOrderId,
                billerName,
                subtotal,
                discount: discountAmount,
                discountName: discountName || '',
                tax,
                total: billTotal,
                paymentMethod: paymentMethod || 'pending',
                splitPaymentDetails: splitPaymentDetails || { cash: 0, upi: 0, card: 0 }
            });

            await bill.save();
        }

        const populatedBill = await Bill.findById(bill._id).populate({
            path: 'order',
            populate: { path: 'user', select: 'name phone' }
        });

        // Emit socket events for real-time updates
        const io = req.app.get('io');
        if (io) {
            io.emit('order-updated', primaryOrder);
            io.emit('bill-generated', populatedBill);
        }

        res.json(populatedBill);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Bulk delete bills and corresponding orders (superadmin only)
router.post('/bulk-delete', protect, superadmin, async (req, res) => {
    try {
        const { billIds } = req.body;
        if (!billIds || billIds.length === 0) {
            return res.status(400).json({ message: 'No bill IDs provided' });
        }

        let deletedCount = 0;
        for (const billId of billIds) {
            const bill = await Bill.findById(billId);
            if (!bill) continue;

            const order = await Order.findById(bill.order);
            if (order) {
                if (order.table) {
                    await Table.findByIdAndUpdate(order.table, {
                        status: 'available',
                        isOccupied: false,
                        currentOrder: null
                    });
                }
                await Order.findByIdAndDelete(order._id);
            }

            await Bill.findByIdAndDelete(billId);
            deletedCount++;
        }

        const io = req.app.get('io');
        if (io) {
            io.emit('bills-bulk-deleted', billIds);
        }

        res.json({ message: `Successfully deleted ${deletedCount} bills and their orders` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete a bill and corresponding order
router.delete('/:id', protect, superadmin, async (req, res) => {
    try {
        const bill = await Bill.findById(req.params.id);
        if (!bill) {
            return res.status(404).json({ message: 'Bill not found' });
        }

        // Delete order and clear table
        const order = await Order.findById(bill.order);
        if (order) {
            if (order.table) {
                await Table.findByIdAndUpdate(order.table, {
                    status: 'available',
                    isOccupied: false,
                    currentOrder: null
                });
                const io = req.app.get('io');
                if (io) {
                    const table = await Table.findById(order.table);
                    io.emit('table-freed', table);
                }
            }
            await Order.findByIdAndDelete(order._id);
        }

        await Bill.findByIdAndDelete(req.params.id);

        // Emit socket event for real-time delete
        const io = req.app.get('io');
        if (io) {
            io.emit('bill-deleted', req.params.id);
            if (order) {
                io.emit('order-deleted', order._id.toString());
            }
        }

        res.json({ message: 'Bill and corresponding order deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
