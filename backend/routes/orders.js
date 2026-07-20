const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const MenuItem = require('../models/MenuItem');
const Coupon = require('../models/Coupon');
const Table = require('../models/Table');
const Settings = require('../models/Settings');
const User = require('../models/User');
const LoyaltySettings = require('../models/LoyaltySettings');
const LoyaltyOffer = require('../models/LoyaltyOffer');
const { protect, admin, superadmin } = require('../middleware/auth');
const { generateOrderNumber } = require('../utils/helpers');

// @route   GET /api/orders
// @desc    Get user's orders
// @access  Private
router.get('/', protect, async (req, res) => {
    try {
        const orders = await Order.find({ user: req.user._id })
            .populate('items.menuItem', 'name image')
            .sort('-createdAt');
        res.json(orders);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/orders/all
// @desc    Get all orders (admin)
// @access  Private/Admin
router.get('/all', protect, admin, async (req, res) => {
    try {
        const { status, date } = req.query;
        let query = {};

        if (status) query.status = status;
        if (date) {
            const startDate = new Date(date + 'T00:00:00');
            const endDate = new Date(date + 'T23:59:59.999');
            query.createdAt = { $gte: startDate, $lte: endDate };
        }

        const orders = await Order.find(query)
            .populate('user', 'phone name')
            .populate('placedBy', 'name')
            .populate('items.menuItem', 'name image')
            .sort('-createdAt');
        res.json(orders);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/orders/kots
// @desc    Get all KOT tickets (Admin today only, Superadmin can filter date)
// @access  Private/Admin
router.get('/kots', protect, admin, async (req, res) => {
    try {
        const { date } = req.query;
        let query = {};

        let targetDate = date;
        if (!targetDate || req.user.role !== 'superadmin') {
            const d = new Date();
            const offset = d.getTimezoneOffset();
            const localDate = new Date(d.getTime() - (offset * 60 * 1000));
            targetDate = localDate.toISOString().split('T')[0];
        }

        query.createdAt = {
            $gte: new Date(targetDate + 'T00:00:00'),
            $lte: new Date(targetDate + 'T23:59:59.999')
        };

        const orders = await Order.find(query)
            .populate('placedBy', 'name')
            .populate('user', 'name phone')
            .populate('items.menuItem', 'name price')
            .sort('-createdAt');

        const kotTickets = [];
        orders.forEach(order => {
            if (order.kotHistory && order.kotHistory.length > 0) {
                order.kotHistory.forEach(kot => {
                    kotTickets.push({
                        _id: `${order._id}_${kot.kotNumber}`,
                        orderId: order._id,
                        orderNumber: order.orderNumber,
                        kotNumber: kot.kotNumber || `KOT-${order.orderNumber.slice(-4)}`,
                        tableNumber: order.tableNumber || 'Takeaway',
                        staffName: order.placedBy?.name || order.billerName || 'Staff',
                        timestamp: kot.timestamp || order.createdAt,
                        items: kot.items && kot.items.length > 0 ? kot.items : order.items,
                        notes: kot.notes || order.specialInstructions || '',
                        status: order.status
                    });
                });
            } else {
                kotTickets.push({
                    _id: `${order._id}_main`,
                    orderId: order._id,
                    orderNumber: order.orderNumber,
                    kotNumber: `KOT-${order.orderNumber.slice(-4)}`,
                    tableNumber: order.tableNumber || 'Takeaway',
                    staffName: order.placedBy?.name || order.billerName || 'Staff',
                    timestamp: order.createdAt,
                    items: order.items,
                    notes: order.specialInstructions || '',
                    status: order.status
                });
            }
        });

        kotTickets.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        res.json({ date: targetDate, kots: kotTickets });
    } catch (error) {
        console.error('Error fetching KOTs:', error);
        res.status(500).json({ message: error.message });
    }
});

// @route   GET /api/orders/active
// @desc    Get active orders for admin
// @access  Private/Admin
router.get('/active', protect, admin, async (req, res) => {
    try {
        const orders = await Order.find({
            status: { $nin: ['paid', 'cancelled'] }
        })
            .populate('user', 'phone name')
            .populate('placedBy', 'name')
            .populate('items.menuItem', 'name image')
            .sort('-createdAt');
        res.json(orders);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/orders/current
// @desc    Get current active order for user
// @access  Private
router.get('/current', protect, async (req, res) => {
    try {
        const order = await Order.findOne({
            user: req.user._id,
            status: { $nin: ['paid', 'cancelled'] }
        })
            .populate('items.menuItem', 'name image price')
            .sort('-createdAt');
        res.json(order);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/orders/:id
// @desc    Get order by ID
// @access  Private
router.get('/:id', protect, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('user', 'phone name')
            .populate('items.menuItem', 'name image price');

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Check if user owns the order or is admin, or it's a guest order
        if (order.user && order.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }

        res.json(order);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   POST /api/orders
// @desc    Create new order
// @access  Private
router.post('/', protect, async (req, res) => {
    try {
        const { items, couponCode, tableId, tableIds, specialInstructions, customerPhone, customerName } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({ message: 'No items in order' });
        }

        // Determine user for the order (admin can specify a customer)
        let orderUser = req.user._id;
        if (req.user.role === 'admin' && (customerPhone || customerName)) {
            if (customerPhone) {
                const cleanPhone = customerPhone.replace(/\D/g, '');
                let user = await User.findOne({ phone: cleanPhone });
                if (!user) {
                    user = new User({
                        phone: cleanPhone,
                        name: customerName || 'Walk-in Customer',
                        role: 'customer',
                        isVerified: true
                    });
                    await user.save();
                } else if (customerName && user.name === 'Walk-in Customer') {
                    // Update name if it was just a placeholder
                    user.name = customerName;
                    await user.save();
                }
                orderUser = user._id;
            } else if (customerName) {
                // Name only, no phone — create a walk-in record with unique ID
                const walkinPhone = `WI${Date.now()}`;
                const user = new User({
                    phone: walkinPhone,
                    name: customerName,
                    role: 'customer',
                    isVerified: true
                });
                await user.save();
                orderUser = user._id;
            }
        }

        // Validate table(s) if provided - supports multiple tables for one customer
        const tableIdList = (tableIds && tableIds.length > 0) ? tableIds : (tableId ? [tableId] : []);
        let selectedTables = [];
        if (tableIdList.length > 0) {
            selectedTables = await Table.find({ _id: { $in: tableIdList } });
            if (selectedTables.length !== tableIdList.length) {
                return res.status(400).json({ message: 'One or more selected tables are invalid' });
            }
            // Only block web customers from selecting an occupied table
            const occupiedOne = selectedTables.find(t => t.status !== 'available');
            if (occupiedOne && !req.user.isEmployee && req.user.role !== 'admin') {
                return res.status(400).json({ message: `Table ${occupiedOne.tableNumber} is currently occupied` });
            }
        }
        const table = selectedTables[0] || null;

        // Calculate totals
        let subtotal = 0;
        const orderItems = [];

        for (const item of items) {
            const menuItem = await MenuItem.findById(item.menuItem);
            if (!menuItem) {
                return res.status(400).json({ message: `Menu item not found: ${item.menuItem}` });
            }
            if (!menuItem.isAvailable) {
                return res.status(400).json({ message: `${menuItem.name} is not available` });
            }

            const itemTotal = menuItem.price * item.quantity;
            subtotal += itemTotal;

            orderItems.push({
                menuItem: menuItem._id,
                name: menuItem.name,
                price: menuItem.price,
                quantity: item.quantity,
                total: itemTotal
            });
        }

        // Apply coupon if provided
        let discount = 0;
        if (couponCode) {
            const coupon = await Coupon.findOne({
                code: couponCode.toUpperCase(),
                isActive: true,
                validFrom: { $lte: new Date() },
                validUntil: { $gte: new Date() }
            });

            if (coupon) {
                if (coupon.usageLimit !== -1 && coupon.usedCount >= coupon.usageLimit) {
                    return res.status(400).json({ message: 'Coupon usage limit reached' });
                }

                if (subtotal >= coupon.minOrderAmount) {
                    if (coupon.discountType === 'percentage') {
                        discount = (subtotal * coupon.discountValue) / 100;
                        if (coupon.maxDiscount && discount > coupon.maxDiscount) {
                            discount = coupon.maxDiscount;
                        }
                    } else {
                        discount = coupon.discountValue;
                    }

                    // Update coupon usage
                    coupon.usedCount += 1;
                    await coupon.save();
                }
            }
        }

        // Apply loyalty redemption if provided (New)
        let pointsDiscount = 0;
        const { pointsUsed, loyaltyOfferId } = req.body;
        if (pointsUsed && loyaltyOfferId) {
            const offer = await LoyaltyOffer.findById(loyaltyOfferId);
            const user = await User.findById(orderUser);

            if (offer && offer.isActive && user.loyaltyPoints >= offer.pointsRequired) {
                if (subtotal >= offer.minOrderValue) {
                    pointsDiscount = offer.discountValue;

                    // Deduct points
                    user.loyaltyPoints -= offer.pointsRequired;
                    await user.save();

                    // Add to total discount
                    discount += pointsDiscount;
                }
            }
        }

        // Get tax settings
        const gstRate = await Settings.getSetting('gst_rate', 5);
        const taxConfig = await Settings.getSetting('tax_config', [{ name: 'GST', rate: gstRate }]);

        // Get restaurant info
        const restaurantInfo = {
            name: await Settings.getSetting('restaurant_name', "Kea By The Pool"),
            address: await Settings.getSetting('restaurant_address', '123 Poolside Road, Risali, Bhilai'),
            phone: await Settings.getSetting('restaurant_phone', '+91 98765 43210'),
            gstNumber: await Settings.getSetting('gst_number', '')
        };

        const taxableAmount = subtotal - discount;
        const taxDetails = taxConfig.map(t => ({
            name: t.name,
            rate: t.rate,
            amount: taxableAmount * (t.rate / 100)
        }));

        const totalTax = taxDetails.reduce((sum, t) => sum + t.amount, 0);
        const total = taxableAmount + totalTax;

        // Check if any selected table has an active running order to append items
        let activeOrder = null;
        if (selectedTables.length > 0) {
            activeOrder = await Order.findOne({
                tables: { $in: selectedTables.map(t => t._id) },
                status: { $nin: ['paid', 'cancelled'] }
            });
        }

        const kotNum = `KOT-${Date.now().toString().slice(-4)}`;

        if (activeOrder) {
            // Append items to running table order
            for (const newItem of orderItems) {
                const existingItemIndex = activeOrder.items.findIndex(i => i.menuItem.toString() === newItem.menuItem.toString());
                if (existingItemIndex > -1) {
                    activeOrder.items[existingItemIndex].quantity += newItem.quantity;
                    activeOrder.items[existingItemIndex].total += newItem.total;
                } else {
                    activeOrder.items.push(newItem);
                }
            }

            // Recalculate subtotal & tax
            activeOrder.subtotal = activeOrder.items.reduce((acc, item) => acc + item.total, 0);
            const taxableAmount = activeOrder.subtotal - activeOrder.discount;
            activeOrder.taxDetails = taxConfig.map(t => ({
                name: t.name,
                rate: t.rate,
                amount: taxableAmount * (t.rate / 100)
            }));
            activeOrder.tax = activeOrder.taxDetails.reduce((sum, t) => sum + t.amount, 0);
            activeOrder.total = taxableAmount + activeOrder.tax;

            // Add KOT history
            activeOrder.kotHistory.push({
                kotNumber: kotNum,
                timestamp: new Date(),
                items: orderItems,
                notes: specialInstructions || ''
            });

            activeOrder.status = 'confirmed';
            await activeOrder.save();

            const populatedOrder = await Order.findById(activeOrder._id)
                .populate('user', 'phone name')
                .populate('placedBy', 'name')
                .populate('items.menuItem', 'name image');

            const io = req.app.get('io');
            if (io) {
                io.emit('order-updated', populatedOrder);
                io.emit('new-order', populatedOrder);
            }

            return res.status(200).json(populatedOrder);
        }

        const order = new Order({
            orderNumber: generateOrderNumber(),
            user: orderUser,
            items: orderItems,
            subtotal,
            discount,
            couponCode: couponCode || '',
            tax: totalTax,
            gstRate,
            taxDetails,
            restaurantInfo,
            total,
            tableNumber: selectedTables.length > 0 ? selectedTables.map(t => t.tableNumber).join(', ') : '',
            table: table ? table._id : null,
            tables: selectedTables.map(t => t._id),
            specialInstructions: specialInstructions || '',
            loyaltyOffer: (pointsUsed && loyaltyOfferId) ? loyaltyOfferId : null,
            pointsRedeemed: (pointsUsed && loyaltyOfferId) ? pointsUsed : 0,
            status: 'confirmed',
            kotHistory: [{
                kotNumber: kotNum,
                timestamp: new Date(),
                items: orderItems,
                notes: specialInstructions || ''
            }],
            placedBy: (req.user && req.user.isEmployee) ? req.user._id : null
        });

        await order.save();

        // Occupy all selected tables
        if (selectedTables.length > 0) {
            const io = req.app.get('io');
            for (const t of selectedTables) {
                t.status = 'occupied';
                t.isOccupied = true;
                t.currentOrder = order._id;
                await t.save();
                if (io) io.emit('table-occupied', t);
            }
        }

        const populatedOrder = await Order.findById(order._id)
            .populate('user', 'phone name')
            .populate('placedBy', 'name')
            .populate('items.menuItem', 'name image');

        // Emit socket event for real-time update
        const io = req.app.get('io');
        if (io) {
            io.emit('new-order', populatedOrder);
        }

        res.status(201).json(populatedOrder);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

const freeTablesForOrder = async (order, io) => {
    try {
        const tableIdsToFree = [...(order.tables || []), order.table].filter(Boolean);
        let orConditions = [];
        if (tableIdsToFree.length > 0) {
            orConditions.push({ _id: { $in: tableIdsToFree } });
        }
        if (order._id) {
            orConditions.push({ currentOrder: order._id });
        }
        if (order.tableNumber) {
            const nums = String(order.tableNumber).split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
            if (nums.length > 0) {
                orConditions.push({ tableNumber: { $in: nums } });
            }
        }
        if (orConditions.length > 0) {
            const tablesToFree = await Table.find({ $or: orConditions });
            for (const t of tablesToFree) {
                t.status = 'available';
                t.isOccupied = false;
                t.currentOrder = null;
                await t.save();
                if (io) {
                    io.emit('table-freed', t);
                    io.emit('table-updated', t);
                }
            }
        }
    } catch (err) {
        console.error('Error freeing tables:', err);
    }
};

// @route   PUT /api/orders/:id/status
// @desc    Update order status
// @access  Private/Admin
router.put('/:id/status', protect, admin, async (req, res) => {
    try {
        const { status } = req.body;

        const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'served', 'bill_requested', 'bill_generated', 'paid', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Block edits on settled orders unless superadmin
        if (order.status === 'paid' && req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'This order has been settled. Only superadmin can modify settled orders.' });
        }

        order.status = status;
        await order.save();

        // Free all tables if order is completed or cancelled
        if (status === 'paid' || status === 'cancelled') {
            const io = req.app.get('io');
            await freeTablesForOrder(order, io);
        }

        const populatedOrder = await Order.findById(order._id)
            .populate('user', 'phone name')
            .populate('placedBy', 'name')
            .populate('items.menuItem', 'name image');

        // Emit socket event for real-time update
        const io = req.app.get('io');
        if (io) {
            io.emit('order-updated', populatedOrder);
            io.to(`user-${order.user}`).emit('my-order-updated', populatedOrder);
        }

        res.json(populatedOrder);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   PUT /api/orders/:id/request-bill
// @desc    Request bill for order
// @access  Private
// @route   PUT /api/orders/:id/request-bill
// @desc    Request bill for order (and all associated active orders for that table/user)
// @access  Private
router.put('/:id/request-bill', protect, async (req, res) => {
    try {
        const currentOrder = await Order.findById(req.params.id);
        if (!currentOrder) {
            return res.status(404).json({ message: 'Order not found' });
        }

        console.log('Bill Request:', {
            orderId: currentOrder._id,
            orderUser: currentOrder.user,
            currentUser: req.user._id
        });

        // Find query for all associated orders
        let query = {
            status: { $nin: ['paid', 'cancelled', 'bill_requested'] }
        };

        if (currentOrder.table) {
            query.table = currentOrder.table;
        } else {
            query.user = currentOrder.user;
        }

        // Find all orders to update
        const ordersToUpdate = await Order.find(query);

        // Also include the current order if it wasn't picked up (though it should be)
        if (!ordersToUpdate.find(o => o._id.toString() === currentOrder._id.toString())) {
            // If current order status was already bill_requested/generated, we might still want to trigger socket
            ordersToUpdate.push(currentOrder);
        }

        const io = req.app.get('io');
        const updatedOrders = [];

        // Update all identified orders
        for (const order of ordersToUpdate) {
            order.status = 'bill_requested';
            await order.save();

            const populatedOrder = await Order.findById(order._id)
                .populate('user', 'phone name')
                .populate('placedBy', 'name')
                .populate('items.menuItem', 'name image');

            updatedOrders.push(populatedOrder);

            if (io) {
                io.emit('order-updated', populatedOrder);
                io.emit('bill-requested', populatedOrder);
                io.to(`user-${order.user}`).emit('my-order-updated', populatedOrder);
            }
        }

        // Return the current order (updated)
        const finalCurrentOrder = updatedOrders.find(o => o._id.toString() === req.params.id) || await Order.findById(req.params.id).populate('user', 'phone name').populate('items.menuItem', 'name image');

        res.json(finalCurrentOrder);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   PUT /api/orders/:id/payment
// @desc    Update order payment (method and amount)
// @access  Private/Admin
router.put('/:id/payment', protect, admin, async (req, res) => {
    try {
        const { paymentMethod, amountPaid } = req.body;
        const order = await Order.findById(req.params.id).populate('items.menuItem');

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Block edits on settled orders unless superadmin
        if (order.status === 'paid' && req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'This order has been settled. Only superadmin can modify settled orders.' });
        }

        const wasPaid = order.status === 'paid';

        if (paymentMethod) order.paymentMethod = paymentMethod;
        if (amountPaid !== undefined) order.amountPaid = parseFloat(amountPaid);

        // If amount paid is equal or more than total, mark as paid
        if (order.amountPaid >= order.total) {
            order.status = 'paid';
        }

        await order.save();

        // Award loyalty points ONLY if it just transitioned to paid
        if (order.status === 'paid' && !wasPaid) {
            try {
                const loyaltySettings = await LoyaltySettings.getSettings();
                if (loyaltySettings.isActive && order.total >= loyaltySettings.minOrderForPoints) {
                    let pointsEarned = Math.floor(order.total * loyaltySettings.pointsPerRupee);

                    for (const item of order.items) {
                        if (item.menuItem && item.menuItem.bonusLoyaltyPoints) {
                            pointsEarned += item.menuItem.bonusLoyaltyPoints * item.quantity;
                        }
                    }

                    if (pointsEarned > 0) {
                        await User.findByIdAndUpdate(order.user, {
                            $inc: {
                                loyaltyPoints: pointsEarned,
                                totalPointsEarned: pointsEarned
                            }
                        });
                    }
                }
            } catch (loyaltyError) {
                console.error('Error awarding loyalty points:', loyaltyError);
            }

            // Free all tables the order occupied
            const ioFree = req.app.get('io');
            await freeTablesForOrder(order, ioFree);
        }

        const populatedOrder = await Order.findById(order._id)
            .populate('user', 'phone name')
            .populate('placedBy', 'name')
            .populate('items.menuItem', 'name image');

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
            io.emit('order-updated', populatedOrder);
            io.to(`user-${order.user}`).emit('my-order-updated', populatedOrder);
        }

        res.json(populatedOrder);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   PUT /api/orders/:id/items
// @desc    Update order items list and update associated bill if it exists
// @access  Private
router.put('/:id/items', protect, async (req, res) => {
    try {
        const { items } = req.body;
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Block edits on settled orders unless superadmin
        if (order.status === 'paid' && req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'This order has been settled. Only superadmin can modify settled orders.' });
        }

        let subtotal = 0;
        const orderItems = [];

        for (const item of items) {
            const menuItem = await MenuItem.findById(item.menuItem);
            if (!menuItem) {
                return res.status(400).json({ message: `Menu item not found: ${item.menuItem}` });
            }
            const itemTotal = menuItem.price * item.quantity;
            subtotal += itemTotal;

            orderItems.push({
                menuItem: menuItem._id,
                name: menuItem.name,
                price: menuItem.price,
                quantity: item.quantity,
                total: itemTotal
            });
        }

        order.items = orderItems;
        order.subtotal = subtotal;
        
        const gstRate = order.gstRate || 5;
        const taxableAmount = subtotal - order.discount;
        const tax = taxableAmount * (gstRate / 100);
        order.tax = tax;
        order.taxDetails = [{ name: 'GST', rate: gstRate, amount: tax }];
        order.total = taxableAmount + tax;

        await order.save();

        const Bill = require('../models/Bill');
        let bill = await Bill.findOne({ order: order._id });
        if (bill) {
            bill.subtotal = subtotal;
            bill.tax = tax;
            bill.total = (subtotal - bill.discount) + tax;
            await bill.save();

            const io = req.app.get('io');
            if (io) {
                const populatedBill = await Bill.findById(bill._id).populate({
                    path: 'order',
                    populate: { path: 'user', select: 'name phone' }
                });
                io.emit('bill-generated', populatedBill);
            }
        }

        const populatedOrder = await Order.findById(order._id)
            .populate('user', 'phone name')
            .populate('items.menuItem', 'name image');

        const io = req.app.get('io');
        if (io) {
            io.emit('order-updated', populatedOrder);
            io.to(`user-${order.user}`).emit('my-order-updated', populatedOrder);
        }

        res.json(populatedOrder);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   DELETE /api/orders/:id
// @desc    Delete order (admin)
// @access  Private/Admin
router.delete('/:id', protect, superadmin, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Free all tables the order occupied
        {
            const tableIdsToFree = [...(order.tables || []), order.table].filter(Boolean);
            const io = req.app.get('io');
            for (const tid of tableIdsToFree) {
                const t = await Table.findByIdAndUpdate(tid, { status: 'available', isOccupied: false, currentOrder: null }, { new: true });
                if (t && io) io.emit('table-freed', t);
            }
        }

        await Order.findByIdAndDelete(req.params.id);

        // Delete corresponding bill if any
        const Bill = require('../models/Bill');
        await Bill.deleteMany({ order: req.params.id });

        // Emit socket event for real-time delete
        const io = req.app.get('io');
        if (io) {
            io.emit('order-deleted', req.params.id);
            io.emit('bill-deleted-for-order', req.params.id);
        }

        res.json({ message: 'Order deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
