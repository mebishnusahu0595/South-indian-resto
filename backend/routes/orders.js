const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Bill = require('../models/Bill');
const MenuItem = require('../models/MenuItem');
const Coupon = require('../models/Coupon');
const Table = require('../models/Table');
const Settings = require('../models/Settings');
const User = require('../models/User');
const LoyaltySettings = require('../models/LoyaltySettings');
const LoyaltyOffer = require('../models/LoyaltyOffer');
const KOTPrintJob = require('../models/KOTPrintJob');
const { getPrinterConfig } = require('../utils/printerConfig');
const { protect, admin, superadmin } = require('../middleware/auth');
const { generateOrderNumber } = require('../utils/helpers');
const {
    normalizeItems,
    getMenuItemId,
    isStalePartialAdditionPayload,
    getConfiguredTax,
    calculateTotals,
    allocateBillTotals,
    getBusinessDate,
    roundMoney
} = require('../utils/orderCalculations');
const { runAtomic, sessionOptions } = require('../utils/transactions');

const getKOTEventId = (payload) => {
    const orderId = payload._id?.toString() || payload.id?.toString() || payload.orderNumber || 'unknown';
    const ticketId = payload.kotTicket || `KOT-${String(payload.orderNumber || '').replace(/^CD-/, '')}`;
    return `${orderId}:${ticketId}`;
};

const dispatchKOT = async (req, payload, eventType = 'CREATE') => {
    const eventId = getKOTEventId(payload);
    let printerConfig = { version: 1, enabled: true, defaultPort: 9100, printers: [] };

    try {
        printerConfig = await getPrinterConfig();
    } catch (error) {
        console.error('Could not load printer registry for KOT:', error.message);
    }

    const eventPayload = JSON.parse(JSON.stringify({
        ...payload,
        eventId,
        kotEventType: eventType,
        printerConfig
    }));
    const durablePayload = {
        _id: eventPayload._id,
        eventId,
        orderNumber: eventPayload.orderNumber,
        kotTicket: eventPayload.kotTicket,
        kotCreatedAt: eventPayload.kotCreatedAt,
        kotEventType: eventType,
        tableName: eventPayload.tableName,
        tableNumber: eventPayload.tableNumber,
        tables: (eventPayload.tables || []).map(table => ({
            _id: table?._id,
            name: table?.name,
            tableNumber: table?.tableNumber
        })),
        placedBy: eventPayload.placedBy ? { name: eventPayload.placedBy.name } : null,
        user: eventPayload.user ? { name: eventPayload.user.name } : null,
        items: eventPayload.items || [],
        specialInstructions: eventPayload.specialInstructions || '',
        createdAt: eventPayload.createdAt,
        printerConfig
    };

    try {
        await KOTPrintJob.findOneAndUpdate(
            { eventId },
            {
                $setOnInsert: {
                    eventId,
                    status: 'pending',
                    payload: durablePayload,
                    expiresAt: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000))
                }
            },
            { upsert: true, new: true }
        );
    } catch (error) {
        // Socket delivery must still happen if the durable outbox is temporarily unavailable.
        console.error(`Could not persist KOT print job ${eventId}:`, error.message);
    }

    const io = req.app.get('io');
    if (io) {
        // Only emit new-order event for completely new orders, never for incremental KOT deltas
        if (eventType === 'CREATE') {
            io.emit('new-order', eventPayload);
        }
        io.emit('new-print-job', eventPayload);
    }
    return eventPayload;
};

const requirePrintAgent = (req, res, next) => {
    const expected = process.env.PRINT_AGENT_KEY;
    const supplied = req.get('x-print-agent-key') || '';

    if (!expected) {
        return res.status(503).json({ message: 'PRINT_AGENT_KEY is not configured on backend' });
    }

    const expectedBuffer = Buffer.from(expected);
    const suppliedBuffer = Buffer.from(supplied);
    if (expectedBuffer.length !== suppliedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)) {
        return res.status(401).json({ message: 'Invalid print agent key' });
    }

    next();
};

// @route   GET /api/orders
// @desc    Get orders (All orders for staff/admin, user-specific for customers)
// @access  Private
router.get('/', protect, async (req, res) => {
    try {
        const isStaff = req.user && (req.user.isEmployee || req.user.role === 'admin' || req.user.role === 'superadmin');
        const query = isStaff ? {} : { user: req.user._id };
        const orders = await Order.find(query)
            .populate('user', 'phone name')
            .populate('placedBy', 'name')
            .populate('tables', 'tableNumber name section')
            .populate('table', 'tableNumber name section')
            .populate('items.menuItem', 'name image price')
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
            .populate('tables', 'tableNumber name section')
            .populate('table', 'tableNumber name section')
            .populate('items.menuItem', 'name price')
            .sort('-createdAt');

        const formatKOTNum = (ord, kotObj) => {
            if (kotObj && kotObj.kotNumber) return kotObj.kotNumber;
            if (ord.kotTicket) return ord.kotTicket;
            if (ord.orderNumber) {
                const cleanOrd = String(ord.orderNumber).replace(/^CD-/, '');
                return `KOT-${cleanOrd}`;
            }
            return `KOT-${ord._id.toString().slice(-4).toUpperCase()}`;
        };

        // Build the full table name from populated tables array or single table
        const getTableName = (order) => {
            if (order.tables && order.tables.length > 0) {
                return order.tables.map(t => t.name || `Table ${t.tableNumber}`).join(', ');
            }
            if (order.table && order.table.name) {
                return order.table.name || `Table ${order.table.tableNumber}`;
            }
            if (order.tableNumber) return `Table ${order.tableNumber}`;
            return 'Takeaway';
        };

        const kotTickets = [];
        orders.forEach(order => {
            const tableName = getTableName(order);
            if (order.kotHistory && order.kotHistory.length > 0) {
                order.kotHistory.forEach(kot => {
                    kotTickets.push({
                        _id: `${order._id}_${kot.kotNumber}`,
                        orderId: order._id,
                        orderNumber: order.orderNumber,
                        kotNumber: formatKOTNum(order, kot),
                        tableNumber: tableName,
                        tableName: tableName,
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
                    kotNumber: formatKOTNum(order),
                    tableNumber: tableName,
                    tableName: tableName,
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

// @route   GET /api/orders/kot-logs
// @desc    Get durable KOT dispatch audit logs
// @access  Private/Admin
router.get('/kot-logs', protect, admin, async (req, res) => {
    try {
        const logs = await KOTPrintJob.find()
            .select('eventId status attempts lastError agentId results printedAt createdAt updatedAt')
            .sort('-createdAt')
            .limit(100)
            .lean();
        res.json({ logs });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Desktop print agent durable catch-up endpoint. Socket delivery remains the
// fast path; this endpoint recovers KOTs created while the local agent was off.
router.get('/print-jobs/pending', requirePrintAgent, async (req, res) => {
    try {
        const jobs = await KOTPrintJob.find({ status: 'pending' })
            .sort('createdAt')
            .limit(100)
            .lean();
        res.json({ jobs });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.post('/print-jobs/:eventId/ack', requirePrintAgent, async (req, res) => {
    try {
        const job = await KOTPrintJob.findOneAndUpdate(
            { eventId: req.params.eventId },
            {
                $set: {
                    status: 'printed',
                    printedAt: new Date(),
                    agentId: String(req.body.agentId || '').slice(0, 100),
                    results: Array.isArray(req.body.results) ? req.body.results : [],
                    lastError: ''
                },
                $inc: { attempts: 1 }
            },
            { new: true }
        );
        if (!job) return res.status(404).json({ message: 'KOT print job not found' });
        res.json({ acknowledged: true, eventId: job.eventId });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.post('/print-jobs/:eventId/failure', requirePrintAgent, async (req, res) => {
    try {
        const job = await KOTPrintJob.findOneAndUpdate(
            { eventId: req.params.eventId },
            {
                $set: {
                    agentId: String(req.body.agentId || '').slice(0, 100),
                    results: Array.isArray(req.body.results) ? req.body.results : [],
                    lastError: String(req.body.error || 'One or more printer targets failed').slice(0, 1000)
                },
                $inc: { attempts: 1 }
            },
            { new: true }
        );
        if (!job) return res.status(404).json({ message: 'KOT print job not found' });
        res.json({ recorded: true, eventId: job.eventId });
    } catch (error) {
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

        // Check if user owns the order or is staff/admin
        const isStaff = req.user && (req.user.isEmployee || req.user.role === 'admin' || req.user.role === 'superadmin');
        if (order.user && order.user._id.toString() !== req.user._id.toString() && !isStaff) {
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
        const { items, couponCode, tableId, tableIds, specialInstructions, instructions, notes, specialNote, customerPhone, customerName } = req.body;
        const orderInstructions = specialInstructions || instructions || notes || specialNote || '';

        if (!items || items.length === 0) {
            return res.status(400).json({ message: 'No items in order' });
        }

        // Determine user for the order (admin / superadmin / employee can specify a customer)
        let orderUser = req.user._id;
        if ((req.user.role === 'admin' || req.user.role === 'superadmin' || req.user.isEmployee) && (customerPhone || customerName)) {
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

        // Consolidate duplicate menu rows before looking up prices. One menu item is one order row.
        const requestedItems = normalizeItems(items);
        if (requestedItems.length === 0) {
            return res.status(400).json({ message: 'No valid items in order' });
        }

        // Calculate totals
        let subtotal = 0;
        const orderItems = [];

        for (const item of requestedItems) {
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
                total: itemTotal,
                notes: item.notes || item.instruction || item.specialInstructions || item.note || ''
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
            if (activeOrder) {
                const settledBillExists = await Bill.exists({
                    $or: [{ order: activeOrder._id }, { orders: activeOrder._id }],
                    paymentMethod: { $in: ['cash', 'online', 'upi', 'card', 'split'] }
                });
                if (settledBillExists) activeOrder = null;
            }
        }

        const kotNum = `KOT-${Date.now().toString().slice(-4)}`;
        const kotTimestamp = new Date();

        if (activeOrder) {
            // Heal any historical duplicate rows before applying this KOT exactly once.
            activeOrder.items = normalizeItems(activeOrder.items);
            // Append items to running table order
            for (const newItem of orderItems) {
                const existingItemIndex = activeOrder.items.findIndex(i => i.menuItem.toString() === newItem.menuItem.toString());
                if (existingItemIndex > -1) {
                    activeOrder.items[existingItemIndex].quantity += newItem.quantity;
                    activeOrder.items[existingItemIndex].total += newItem.total;
                    if (newItem.notes) {
                        activeOrder.items[existingItemIndex].notes = newItem.notes;
                    }
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

            // Add KOT history. Mark append KOTs so stale partial mobile payloads can be recognized safely.
            const additionInstructions = `[ADDITION] ${orderInstructions || 'New items added'}`;
            activeOrder.kotHistory.push({
                kotNumber: kotNum,
                timestamp: kotTimestamp,
                items: orderItems,
                notes: additionInstructions
            });

            activeOrder.status = 'confirmed';
            await activeOrder.save();

            const populatedOrder = await Order.findById(activeOrder._id)
                .populate('user', 'phone name')
                .populate('placedBy', 'name')
                .populate('tables', 'tableNumber name section')
                .populate('table', 'tableNumber name section')
                .populate('items.menuItem', 'name image');

            const io = req.app.get('io');
            const tn = (populatedOrder.tables?.length > 0)
                ? populatedOrder.tables.map(t => t.name || `Table ${t.tableNumber}`).join(', ')
                : (populatedOrder.table?.name || (populatedOrder.tableNumber ? `Table ${populatedOrder.tableNumber}` : 'Takeaway'));
            if (io) io.emit('order-updated', populatedOrder);
            await dispatchKOT(req, {
                ...populatedOrder.toObject(),
                kotTicket: kotNum,
                kotCreatedAt: kotTimestamp,
                tableName: tn,
                items: orderItems,
                specialInstructions: additionInstructions
            }, 'ADD');
            // Old APKs treat every new-order event as an editable order. Re-send the complete
            // order after the incremental KOT event so the partial duplicate is replaced.
            if (io) io.emit('order-updated', populatedOrder);

            return res.status(200).json(populatedOrder);
        }

        const order = new Order({
            orderNumber: await generateOrderNumber(),
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
            specialInstructions: orderInstructions,
            loyaltyOffer: (pointsUsed && loyaltyOfferId) ? loyaltyOfferId : null,
            pointsRedeemed: (pointsUsed && loyaltyOfferId) ? pointsUsed : 0,
            status: 'confirmed',
            kotHistory: [{
                kotNumber: kotNum,
                timestamp: kotTimestamp,
                items: orderItems,
                notes: orderInstructions
            }],
            placedBy: (req.user && req.user.isEmployee) ? req.user._id : null
        });

        if (selectedTables.length > 0) {
            await runAtomic(async session => {
                await order.save(sessionOptions(session));
                await Table.updateMany(
                    { _id: { $in: selectedTables.map(selectedTable => selectedTable._id) } },
                    { status: 'occupied', isOccupied: true, currentOrder: order._id },
                    sessionOptions(session)
                );
            });
            const io = req.app.get('io');
            const occupiedTables = await Table.find({ _id: { $in: selectedTables.map(selectedTable => selectedTable._id) } });
            if (io) occupiedTables.forEach(occupiedTable => io.emit('table-occupied', occupiedTable));
        } else {
            await order.save();
        }

        const populatedOrder = await Order.findById(order._id)
            .populate('user', 'phone name')
            .populate('placedBy', 'name')
            .populate('tables', 'tableNumber name section')
            .populate('items.menuItem', 'name image');

        // Persist first, then emit for immediate and recoverable KOT delivery.
        const tn = (populatedOrder.tables?.length > 0)
            ? populatedOrder.tables.map(t => t.name || `Table ${t.tableNumber}`).join(', ')
            : (populatedOrder.table?.name || (populatedOrder.tableNumber ? `Table ${populatedOrder.tableNumber}` : 'Takeaway'));
        await dispatchKOT(req, {
            ...populatedOrder.toObject(),
            kotTicket: kotNum,
            kotCreatedAt: kotTimestamp,
            tableName: tn,
            items: orderItems,
            specialInstructions: orderInstructions
        }, 'CREATE');
        // Emit canonical populated order after dispatchKOT so admin panels that receive
        // the incremental new-order event immediately get the full populated state too.
        const io2 = req.app.get('io');
        if (io2) io2.emit('order-updated', populatedOrder);

        res.status(201).json(populatedOrder);
    } catch (error) {
        console.error(error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
    }
});
// @desc    Modify order items (add, edit qty, or partial cancel/remove items) & generate ADD / CANCEL KOT
// @access  Private (Admin / Employee)
router.put('/:id/modify-items', protect, async (req, res) => {
    try {
        const { updatedItems, modificationNote } = req.body;
        const order = await Order.findById(req.params.id).populate('items.menuItem');

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        const linkedBill = await Bill.findOne({ $or: [{ order: order._id }, { orders: order._id }] });
        if (linkedBill?.paymentMethod && linkedBill.paymentMethod !== 'pending' && req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'This bill is settled. Only superadmin can modify it.' });
        }

        if (order.status === 'paid' || order.status === 'cancelled') {
            return res.status(400).json({ message: `Cannot modify a ${order.status} order` });
        }

        if (!Array.isArray(updatedItems)) {
            return res.status(400).json({ message: 'updatedItems must be an array' });
        }

        const invalidSubmittedItem = updatedItems.find(item => {
            const menuItemId = getMenuItemId(item);
            const quantity = Number(item?.quantity);
            return !menuItemId
                || !mongoose.isValidObjectId(menuItemId)
                || !Number.isFinite(quantity)
                || quantity < 0;
        });
        if (invalidSubmittedItem) {
            return res.status(400).json({
                message: 'One or more submitted order items have an invalid menu item or quantity. No items were changed.'
            });
        }

        const currentItems = normalizeItems(order.items);
        const consolidatedUpdatedItems = normalizeItems(updatedItems);

        // Safety merge: if the submitted items omit existing items from the database order,
        // protect the existing items from being accidentally wiped out by stale mobile app state.
        const submittedIdSet = new Set(consolidatedUpdatedItems.map(getMenuItemId));
        const missingFromSubmission = currentItems.filter(item => !submittedIdSet.has(getMenuItemId(item)));
        
        let effectiveUpdatedItems = [...consolidatedUpdatedItems];
        if (missingFromSubmission.length > 0 && req.user.role !== 'superadmin') {
            // Staff modify is meant for adding new items. Retain any existing items that were not explicitly in payload.
            for (const missingItem of missingFromSubmission) {
                effectiveUpdatedItems.push(missingItem);
            }
        }

        const requestedMenuItemIds = [...new Set(effectiveUpdatedItems.map(getMenuItemId))];
        const requestedMenuItems = await MenuItem.find({ _id: { $in: requestedMenuItemIds } });
        const menuItemsById = new Map(requestedMenuItems.map(menuItem => [menuItem._id.toString(), menuItem]));
        const missingMenuItemIds = requestedMenuItemIds.filter(menuItemId => !menuItemsById.has(menuItemId));
        if (missingMenuItemIds.length > 0) {
            return res.status(400).json({
                message: `Menu item not found: ${missingMenuItemIds.join(', ')}. No items were changed.`
            });
        }

        order.items = currentItems;

        const addedItems = [];
        const cancelledItems = [];
        const newOrderItems = [];
        let newSubtotal = 0;

        const oldMap = new Map();
        order.items.forEach(i => {
            const mId = i.menuItem?._id?.toString() || i.menuItem?.toString();
            oldMap.set(mId, { name: i.name || i.menuItem?.name || 'Item', quantity: i.quantity, price: i.price });
        });

        const newMap = new Map();
        for (const item of effectiveUpdatedItems) {
            if (item.quantity <= 0) continue;

            const mIdToFind = getMenuItemId(item);
            const menuItem = menuItemsById.get(mIdToFind);

            const mId = menuItem._id.toString();
            const itemTotal = menuItem.price * item.quantity;
            newSubtotal += itemTotal;

            const itemNote = item.notes || item.instruction || item.specialInstructions || item.note || '';

            newOrderItems.push({
                menuItem: menuItem._id,
                name: menuItem.name,
                price: menuItem.price,
                quantity: item.quantity,
                total: itemTotal,
                notes: itemNote
            });

            newMap.set(mId, { name: menuItem.name, quantity: item.quantity, price: menuItem.price, notes: itemNote });
        }

        oldMap.forEach((oldItem, mId) => {
            const newItem = newMap.get(mId);
            if (!newItem) {
                cancelledItems.push({
                    menuItem: mId,
                    name: oldItem.name,
                    quantity: oldItem.quantity,
                    price: oldItem.price
                });
            } else if (newItem.quantity < oldItem.quantity) {
                cancelledItems.push({
                    menuItem: mId,
                    name: oldItem.name,
                    quantity: oldItem.quantity - newItem.quantity,
                    price: oldItem.price
                });
            }
        });

        newMap.forEach((newItem, mId) => {
            const oldItem = oldMap.get(mId);
            if (!oldItem) {
                addedItems.push({
                    menuItem: mId,
                    name: newItem.name,
                    quantity: newItem.quantity,
                    price: newItem.price,
                    notes: newItem.notes || ''
                });
            } else if (newItem.quantity > oldItem.quantity) {
                addedItems.push({
                    menuItem: mId,
                    name: newItem.name,
                    quantity: newItem.quantity - oldItem.quantity,
                    price: newItem.price,
                    notes: newItem.notes || ''
                });
            }
        });

        if (newOrderItems.length === 0) {
            return res.status(400).json({ message: 'Order cannot be left with 0 items. Use Cancel Order instead.' });
        }

        order.items = normalizeItems(newOrderItems);
        const taxConfig = await getConfiguredTax(Settings);
        const totals = calculateTotals(order.items, order.discount || 0, taxConfig);
        order.subtotal = totals.subtotal;
        order.discount = totals.discount;
        order.taxDetails = totals.taxDetails;
        order.tax = totals.tax;
        order.gstRate = taxConfig.reduce((sum, taxItem) => sum + taxItem.rate, 0);
        order.total = totals.total;

        const cleanOrdNo = String(order.orderNumber).replace(/^CD-/, '');

        let addedKotObj = null;
        if (addedItems.length > 0) {
            const kotAddNum = `KOT-${cleanOrdNo}-ADD${Date.now().toString().slice(-3)}`;
            addedKotObj = {
                kotNumber: kotAddNum,
                timestamp: new Date(),
                items: addedItems,
                notes: `[ADDITION] ${modificationNote || 'New items added'}`
            };
            order.kotHistory.push(addedKotObj);
        }

        let cancelledKotObj = null;
        if (cancelledItems.length > 0) {
            const kotCancelNum = `CANCEL-${cleanOrdNo}-${Date.now().toString().slice(-3)}`;
            cancelledKotObj = {
                kotNumber: kotCancelNum,
                timestamp: new Date(),
                items: cancelledItems,
                notes: `[CANCEL KOT] ${modificationNote || 'Items partial cancelled'}`
            };
            order.kotHistory.push(cancelledKotObj);
        }

        await order.save();

        const populatedOrder = await Order.findById(order._id)
            .populate('user', 'phone name')
            .populate('placedBy', 'name')
            .populate('tables', 'tableNumber name section')
            .populate('table', 'tableNumber name section')
            .populate('items.menuItem', 'name image');

        // Compute full table name from populated refs
        const getEmitTableName = (ord) => {
            if (ord.tables && ord.tables.length > 0) {
                return ord.tables.map(t => t.name || `Table ${t.tableNumber}`).join(', ');
            }
            if (ord.table && ord.table.name) return ord.table.name;
            if (ord.tableNumber) return `Table ${ord.tableNumber}`;
            return 'Takeaway';
        };
        const emitTableName = getEmitTableName(populatedOrder);

        const io = req.app.get('io');
        if (io) io.emit('order-updated', populatedOrder);
        if (addedKotObj) {
            await dispatchKOT(req, {
                ...populatedOrder.toObject(),
                kotTicket: addedKotObj.kotNumber,
                kotCreatedAt: addedKotObj.timestamp,
                tableName: emitTableName,
                items: addedItems,
                specialInstructions: addedKotObj.notes
            }, 'ADD');
        }
        if (cancelledKotObj) {
            await dispatchKOT(req, {
                ...populatedOrder.toObject(),
                kotTicket: cancelledKotObj.kotNumber,
                kotCreatedAt: cancelledKotObj.timestamp,
                tableName: emitTableName,
                items: cancelledItems,
                specialInstructions: cancelledKotObj.notes
            }, 'CANCEL');
        }
        // dispatchKOT intentionally keeps the printer-compatible incremental new-order event.
        // Follow it with canonical state so old APK history cannot retain a partial editable row.
        if ((addedKotObj || cancelledKotObj) && io) io.emit('order-updated', populatedOrder);

        res.json({
            message: 'Order items modified successfully',
            order: populatedOrder,
            addedItems,
            cancelledItems,
            addedKot: addedKotObj,
            cancelledKot: cancelledKotObj
        });
    } catch (error) {
        console.error('Error modifying order items:', error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
    }
});

const freeTablesForOrder = async (order, io, session = null) => {
    try {
        const tableIdsToFree = [...(order.tables || []), order.table].filter(Boolean);
        const orConditions = [];
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
            let tablesQuery = Table.find({ $or: orConditions });
            if (session) tablesQuery = tablesQuery.session(session);
            const tablesToFree = await tablesQuery;
            for (const t of tablesToFree) {
                t.status = 'available';
                t.isOccupied = false;
                t.currentOrder = null;
                await t.save(sessionOptions(session));
                if (io) {
                    io.emit('table-freed', t);
                    io.emit('table-updated', t);
                }
            }
        }
    } catch (err) {
        console.error('Error freeing tables:', err);
        if (session) throw err;
    }
};

// @route   PUT /api/orders/:id/status
// @desc    Update order status
// @access  Private (Staff can cancel/request bill, Admin/Superadmin can set any status)
router.put('/:id/status', protect, async (req, res) => {
    try {
        const { status } = req.body;

        const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'served', 'bill_requested', 'bill_generated', 'paid', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const isAdmin = req.user && (req.user.role === 'admin' || req.user.role === 'superadmin');
        if (!isAdmin && status !== 'cancelled' && status !== 'bill_requested') {
            return res.status(403).json({ message: 'Not authorized to update status' });
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Block edits on settled orders/Bills unless superadmin.
        const linkedBill = await Bill.findOne({ $or: [{ order: order._id }, { orders: order._id }] });
        if ((order.status === 'paid' || (linkedBill?.paymentMethod && linkedBill.paymentMethod !== 'pending')) && req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'This order has been settled. Only superadmin can modify settled orders.' });
        }

        if (status === 'cancelled') {
            order.cancelledBy = req.user._id;
            order.cancelledByName = req.user.name;

            // Generate full CANCEL KOT ticket
            const cleanOrdNo = String(order.orderNumber).replace(/^CD-/, '');
            const kotCancelNum = `CANCEL-${cleanOrdNo}-${Date.now().toString().slice(-3)}`;
            const cancelledKotObj = {
                kotNumber: kotCancelNum,
                timestamp: new Date(),
                items: order.items.map(item => ({
                    menuItem: item.menuItem,
                    name: item.name,
                    quantity: item.quantity,
                    price: item.price
                })),
                notes: `[CANCEL ORDER] Cancelled by ${req.user.name || 'Staff'}`
            };
            order.kotHistory.push(cancelledKotObj);

            // Persist and emit the cancellation KOT to every print target.
            await dispatchKOT(req, {
                ...order.toObject(),
                kotTicket: cancelledKotObj.kotNumber,
                kotCreatedAt: cancelledKotObj.timestamp,
                tableName: order.tableName || (order.tableNumber ? `Table ${order.tableNumber}` : 'Takeaway'),
                items: cancelledKotObj.items,
                specialInstructions: cancelledKotObj.notes
            }, 'CANCEL');
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
            .populate('tables', 'tableNumber name section')
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
// @route   PUT /api/orders/:id/move-table
// @desc    Change table/seat for active order
// @access  Private
router.put('/:id/move-table', protect, async (req, res) => {
    try {
        const { newTableIds } = req.body;
        if (!newTableIds || !Array.isArray(newTableIds) || newTableIds.length === 0) {
            return res.status(400).json({ message: 'Please select a new table' });
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        const linkedBill = await Bill.findOne({ $or: [{ order: order._id }, { orders: order._id }] });
        if (linkedBill?.paymentMethod && linkedBill.paymentMethod !== 'pending' && req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'This bill is settled. Only superadmin can move its table.' });
        }

        if (order.status === 'paid' || order.status === 'cancelled') {
            return res.status(400).json({ message: `Cannot change table for a ${order.status} order` });
        }

        const newTables = await Table.find({ _id: { $in: newTableIds } });
        if (newTables.length !== newTableIds.length) {
            return res.status(400).json({ message: 'One or more selected new tables are invalid' });
        }

        // Check if any new table is occupied
        const occupied = newTables.find(t => t.isOccupied || t.status === 'occupied');
        if (occupied) {
            return res.status(400).json({ message: `Table ${occupied.tableNumber} is already occupied. Please select an unoccupied table.` });
        }

        const io = req.app.get('io');
        const oldTableIds = [...new Set([...(order.tables || []), order.table].filter(Boolean).map(id => id.toString()))];
        await runAtomic(async session => {
            await Table.updateMany(
                { $or: [{ _id: { $in: oldTableIds } }, { currentOrder: order._id }] },
                { status: 'available', isOccupied: false, currentOrder: null },
                sessionOptions(session)
            );
            const occupyResult = await Table.updateMany(
                { _id: { $in: newTableIds }, status: 'available', isOccupied: { $ne: true } },
                { status: 'occupied', isOccupied: true, currentOrder: order._id },
                sessionOptions(session)
            );
            if (occupyResult.modifiedCount !== newTableIds.length) {
                const conflict = new Error('One or more selected tables became occupied. Please select again.');
                conflict.statusCode = 409;
                throw conflict;
            }

            order.table = newTables[0]._id;
            order.tables = newTables.map(t => t._id);
            order.tableNumber = newTables.map(t => t.tableNumber).join(', ');
            await order.save(sessionOptions(session));
        });

        if (io) {
            const changedTables = await Table.find({ _id: { $in: [...oldTableIds, ...newTableIds] } });
            changedTables.forEach(tableDoc => {
                io.emit(tableDoc.isOccupied ? 'table-occupied' : 'table-freed', tableDoc);
                io.emit('table-updated', tableDoc);
            });
        }

        const populatedOrder = await Order.findById(order._id)
            .populate('user', 'phone name')
            .populate('placedBy', 'name')
            .populate('tables', 'tableNumber name section')
            .populate('items.menuItem', 'name image');

        if (io) {
            io.emit('order-updated', populatedOrder);
        }

        res.json(populatedOrder);
    } catch (error) {
        console.error('Error moving table:', error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
    }
});

// Recompute a pending Bill from its currently linked source orders and re-allocate totals back to each order.
// Settled bills are never touched here (callers block that separately).
const resyncPendingBill = async (bill, taxConfig, session) => {
    if (!bill) return;
    if (bill.paymentMethod && bill.paymentMethod !== 'pending') return;
    const linkedIds = [...new Set([...(bill.orders || []), bill.order].filter(Boolean).map(id => id.toString()))];
    let query = Order.find({ _id: { $in: linkedIds } });
    if (session) query = query.session(session);
    const linkedOrders = (await query).filter(order => (order.items || []).length > 0);
    if (linkedOrders.length === 0) return;

    const combinedItems = normalizeItems(linkedOrders.flatMap(order => order.items || []));
    const totals = calculateTotals(combinedItems, bill.discount || 0, taxConfig);
    const allocations = allocateBillTotals(linkedOrders, totals);
    const now = new Date();

    await Order.bulkWrite(allocations.map(allocation => ({
        updateOne: {
            filter: { _id: allocation.order._id },
            update: { $set: {
                items: allocation.items,
                subtotal: allocation.subtotal,
                discount: allocation.discount,
                tax: allocation.tax,
                taxDetails: allocation.taxDetails,
                gstRate: taxConfig.reduce((sum, tax) => sum + tax.rate, 0),
                total: allocation.total,
                updatedAt: now
            } }
        }
    })), sessionOptions(session));

    bill.items = totals.items;
    bill.taxDetails = totals.taxDetails;
    bill.subtotal = totals.subtotal;
    bill.discount = totals.discount;
    bill.tax = totals.tax;
    bill.total = totals.total;
    bill.orderNumbers = linkedOrders.map(order => order.orderNumber).filter(Boolean);
    bill.tableNumbers = [...new Set(linkedOrders.flatMap(order =>
        String(order.tableNumber || '').split(',').map(value => value.trim()).filter(Boolean)
    ))];
    await bill.save(sessionOptions(session));
};

// @route   PUT /api/orders/:id/move-item
// @desc    Move an item (or partial qty) from this order to another table's order.
//          The item leaves the source order/bill and is auto-added to the destination order/bill.
//          If the destination table has no active order, one is created automatically.
// @access  Private (Admin / Employee)
router.put('/:id/move-item', protect, async (req, res) => {
    try {
        const { menuItemId, quantity, destinationTableId, destinationOrderId } = req.body;
        const moveQty = Math.floor(Number(quantity));

        if (!menuItemId || !mongoose.isValidObjectId(menuItemId)) {
            return res.status(400).json({ message: 'A valid item to move is required.' });
        }
        if (!Number.isFinite(moveQty) || moveQty <= 0) {
            return res.status(400).json({ message: 'Move quantity must be a positive whole number.' });
        }
        if (!destinationOrderId && !destinationTableId) {
            return res.status(400).json({ message: 'Select a destination table to move the item to.' });
        }

        const isSuperadmin = req.user.role === 'superadmin';

        const sourceOrder = await Order.findById(req.params.id).populate('items.menuItem');
        if (!sourceOrder) return res.status(404).json({ message: 'Source order not found' });
        if (sourceOrder.status === 'paid' || sourceOrder.status === 'cancelled') {
            return res.status(400).json({ message: `Cannot move items from a ${sourceOrder.status} order` });
        }

        const sourceBill = await Bill.findOne({ $or: [{ order: sourceOrder._id }, { orders: sourceOrder._id }] });
        if (sourceBill?.paymentMethod && sourceBill.paymentMethod !== 'pending' && !isSuperadmin) {
            return res.status(403).json({ message: 'Source bill is settled. Only superadmin can move its items.' });
        }

        // Locate the item on the source order.
        sourceOrder.items = normalizeItems(sourceOrder.items);
        const sourceLine = sourceOrder.items.find(item => getMenuItemId(item) === menuItemId.toString());
        if (!sourceLine) {
            return res.status(400).json({ message: 'That item is not on the source order.' });
        }
        if (sourceLine.quantity < moveQty) {
            return res.status(400).json({ message: `Only ${sourceLine.quantity} of "${sourceLine.name}" is available to move.` });
        }
        if (sourceOrder.items.length === 1 && sourceLine.quantity === moveQty) {
            return res.status(400).json({ message: 'This is the only item on the order. Use "Change Table" to move the whole order instead of emptying it.' });
        }

        // Resolve the destination order (an existing active order on the table, or a brand-new one).
        let destinationOrder = null;
        let destinationTable = null;
        let createdNewDestination = false;

        if (destinationOrderId) {
            if (!mongoose.isValidObjectId(destinationOrderId)) {
                return res.status(400).json({ message: 'Invalid destination order.' });
            }
            destinationOrder = await Order.findById(destinationOrderId).populate('items.menuItem');
            if (!destinationOrder) return res.status(404).json({ message: 'Destination order not found' });
        } else {
            if (!mongoose.isValidObjectId(destinationTableId)) {
                return res.status(400).json({ message: 'Invalid destination table.' });
            }
            destinationTable = await Table.findById(destinationTableId);
            if (!destinationTable) return res.status(404).json({ message: 'Destination table not found' });
            destinationOrder = await Order.findOne({
                tables: destinationTable._id,
                status: { $nin: ['paid', 'cancelled'] }
            }).populate('items.menuItem');
        }

        if (destinationOrder && destinationOrder._id.toString() === sourceOrder._id.toString()) {
            return res.status(400).json({ message: 'Source and destination are the same order.' });
        }
        if (destinationOrder && (destinationOrder.status === 'paid' || destinationOrder.status === 'cancelled')) {
            return res.status(400).json({ message: `Cannot move items into a ${destinationOrder.status} order` });
        }

        let destinationBill = null;
        if (destinationOrder) {
            destinationBill = await Bill.findOne({ $or: [{ order: destinationOrder._id }, { orders: destinationOrder._id }] });
            if (destinationBill?.paymentMethod && destinationBill.paymentMethod !== 'pending' && !isSuperadmin) {
                return res.status(403).json({ message: 'Destination bill is settled. Only superadmin can add items to it.' });
            }
        }

        const menuItem = await MenuItem.findById(menuItemId);
        if (!menuItem) return res.status(400).json({ message: 'That menu item no longer exists.' });

        const taxConfig = await getConfiguredTax(Settings);
        const movedNotes = sourceLine.notes || '';
        const now = new Date();
        const cleanSourceNo = String(sourceOrder.orderNumber).replace(/^CD-/, '');
        const sourceLabel = sourceOrder.tableNumber ? `Table ${sourceOrder.tableNumber}` : 'Takeaway';

        // Apply the source decrement in memory and recompute its standalone totals.
        sourceOrder.items = sourceOrder.items
            .map(item => getMenuItemId(item) === menuItemId.toString()
                ? { ...item, quantity: item.quantity - moveQty }
                : item)
            .filter(item => item.quantity > 0);
        const sourceTotals = calculateTotals(sourceOrder.items, sourceOrder.discount || 0, taxConfig);

        // Build/prepare the destination order in memory.
        if (!destinationOrder) {
            destinationOrder = new Order({
                orderNumber: await generateOrderNumber(),
                user: sourceOrder.user,
                items: [],
                subtotal: 0,
                tax: 0,
                total: 0,
                restaurantInfo: sourceOrder.restaurantInfo,
                status: 'confirmed',
                table: destinationTable._id,
                tables: [destinationTable._id],
                tableNumber: String(destinationTable.tableNumber || ''),
                kotHistory: [],
                placedBy: (req.user && req.user.isEmployee) ? req.user._id : null
            });
            createdNewDestination = true;
        }
        const destinationLabel = createdNewDestination
            ? (destinationTable.name || `Table ${destinationTable.tableNumber}`)
            : (destinationOrder.tableNumber ? `Table ${destinationOrder.tableNumber}` : 'Takeaway');

        destinationOrder.items = normalizeItems([
            ...normalizeItems(destinationOrder.items),
            { menuItem: menuItem._id, name: menuItem.name, price: menuItem.price, quantity: moveQty, notes: movedNotes }
        ]);
        const destinationTotals = calculateTotals(destinationOrder.items, destinationOrder.discount || 0, taxConfig);
        const gstRateSum = taxConfig.reduce((sum, tax) => sum + tax.rate, 0);

        await runAtomic(async session => {
            // ---- Source order ----
            sourceOrder.items = sourceTotals.items;
            sourceOrder.subtotal = sourceTotals.subtotal;
            sourceOrder.discount = sourceTotals.discount;
            sourceOrder.tax = sourceTotals.tax;
            sourceOrder.taxDetails = sourceTotals.taxDetails;
            sourceOrder.gstRate = gstRateSum;
            sourceOrder.total = sourceTotals.total;
            sourceOrder.kotHistory.push({
                kotNumber: `MOVE-OUT-${cleanSourceNo}-${Date.now().toString().slice(-3)}`,
                timestamp: now,
                items: [{ menuItem: menuItem._id, name: menuItem.name, quantity: moveQty, price: menuItem.price }],
                notes: `[MOVED OUT] ${menuItem.name} x${moveQty} moved to ${destinationLabel}`
            });
            await sourceOrder.save(sessionOptions(session));

            // ---- Destination order ----
            destinationOrder.items = destinationTotals.items;
            destinationOrder.subtotal = destinationTotals.subtotal;
            destinationOrder.discount = destinationTotals.discount;
            destinationOrder.tax = destinationTotals.tax;
            destinationOrder.taxDetails = destinationTotals.taxDetails;
            destinationOrder.gstRate = gstRateSum;
            destinationOrder.total = destinationTotals.total;
            const cleanDestNo = String(destinationOrder.orderNumber).replace(/^CD-/, '');
            destinationOrder.kotHistory.push({
                kotNumber: `MOVE-IN-${cleanDestNo}-${Date.now().toString().slice(-3)}`,
                timestamp: now,
                items: [{ menuItem: menuItem._id, name: menuItem.name, quantity: moveQty, price: menuItem.price }],
                notes: `[MOVED IN] ${menuItem.name} x${moveQty} moved from ${sourceLabel}`
            });
            await destinationOrder.save(sessionOptions(session));

            // Occupy the destination table when a brand-new order was created for it.
            if (createdNewDestination) {
                await Table.updateOne(
                    { _id: destinationTable._id },
                    { status: 'occupied', isOccupied: true, currentOrder: destinationOrder._id },
                    sessionOptions(session)
                );
            }

            // Re-sync any pending bills so both bills reflect the moved item.
            await resyncPendingBill(sourceBill, taxConfig, session);
            if (destinationBill && (!sourceBill || destinationBill._id.toString() !== sourceBill._id.toString())) {
                await resyncPendingBill(destinationBill, taxConfig, session);
            }
        });

        const populate = orderId => Order.findById(orderId)
            .populate('user', 'phone name')
            .populate('placedBy', 'name')
            .populate('tables', 'tableNumber name section')
            .populate('table', 'tableNumber name section')
            .populate('items.menuItem', 'name image');

        const populatedSource = await populate(sourceOrder._id);
        const populatedDestination = await populate(destinationOrder._id);

        const io = req.app.get('io');
        if (io) {
            io.emit('order-updated', populatedSource);
            io.emit('order-updated', populatedDestination);
            if (createdNewDestination) {
                const occupiedTable = await Table.findById(destinationTable._id);
                if (occupiedTable) {
                    io.emit('table-occupied', occupiedTable);
                    io.emit('table-updated', occupiedTable);
                }
            }
            for (const affectedBill of [sourceBill, destinationBill]) {
                if (!affectedBill) continue;
                const populatedBill = await Bill.findById(affectedBill._id)
                    .populate({ path: 'order', populate: { path: 'user', select: 'name phone' } })
                    .populate({ path: 'orders', populate: { path: 'user', select: 'name phone' } });
                if (populatedBill) io.emit('bill-generated', populatedBill);
            }
        }

        res.json({
            message: `Moved ${moveQty} × ${menuItem.name} from ${sourceLabel} to ${destinationLabel}.`,
            sourceOrder: populatedSource,
            destinationOrder: populatedDestination
        });
    } catch (error) {
        console.error('Error moving item:', error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
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
        if (currentOrder.status === 'paid' && req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'This order is already settled and cannot be requested again.' });
        }
        const currentBill = await Bill.findOne({ $or: [{ order: currentOrder._id }, { orders: currentOrder._id }] });
        if (currentBill?.paymentMethod && currentBill.paymentMethod !== 'pending' && req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'This bill is settled and cannot be requested again.' });
        }

        console.log('Bill Request:', {
            orderId: currentOrder._id,
            orderUser: currentOrder.user,
            currentUser: req.user._id
        });

        // A table session is defined only by shared table IDs. Takeaway orders never auto-group.
        const currentTableIds = [...new Set([...(currentOrder.tables || []), currentOrder.table]
            .filter(Boolean)
            .map(id => id.toString()))];
        const query = {
            status: { $nin: ['paid', 'cancelled', 'bill_requested'] },
            ...(currentTableIds.length > 0
                ? { $or: [{ tables: { $in: currentTableIds } }, { table: { $in: currentTableIds } }] }
                : { _id: currentOrder._id })
        };

        let ordersToUpdate = await Order.find(query);

        // Also include the current order if it wasn't picked up (though it should be)
        if (!ordersToUpdate.find(o => o._id.toString() === currentOrder._id.toString())) {
            ordersToUpdate.push(currentOrder);
        }

        if (req.user.role !== 'superadmin' && ordersToUpdate.length > 0) {
            const settledBills = await Bill.find({
                paymentMethod: { $in: ['cash', 'online', 'upi', 'card', 'split'] },
                $or: [
                    { order: { $in: ordersToUpdate.map(order => order._id) } },
                    { orders: { $in: ordersToUpdate.map(order => order._id) } }
                ]
            }).select('order orders');
            const settledOrderIds = new Set(settledBills.flatMap(bill => [bill.order, ...(bill.orders || [])])
                .filter(Boolean).map(id => id.toString()));
            ordersToUpdate = ordersToUpdate.filter(order => !settledOrderIds.has(order._id.toString()));
        }

        if (ordersToUpdate.length === 0) {
            return res.status(403).json({ message: 'All matching orders are already settled.' });
        }

        const io = req.app.get('io');
        const updatedOrders = [];
        await runAtomic(async session => {
            await Order.updateMany(
                { _id: { $in: ordersToUpdate.map(order => order._id) } },
                { $set: { status: 'bill_requested', updatedAt: new Date() } },
                sessionOptions(session)
            );
        });

        const populatedOrders = await Order.find({ _id: { $in: ordersToUpdate.map(order => order._id) } })
            .populate('user', 'phone name')
            .populate('placedBy', 'name')
            .populate('items.menuItem', 'name image');
        for (const populatedOrder of populatedOrders) {
            updatedOrders.push(populatedOrder);
            if (io) {
                io.emit('order-updated', populatedOrder);
                io.emit('bill-requested', populatedOrder);
                io.to(`user-${populatedOrder.user?._id || populatedOrder.user}`).emit('my-order-updated', populatedOrder);
            }
        }

        // Return the current order (updated)
        const finalCurrentOrder = updatedOrders.find(o => o._id.toString() === req.params.id) || await Order.findById(req.params.id).populate('user', 'phone name').populate('items.menuItem', 'name image');

        res.json(finalCurrentOrder);
    } catch (error) {
        console.error(error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
    }
});

// @route   PUT /api/orders/:id/payment
// @desc    Update order payment (method and amount)
// @access  Private/Admin
router.put('/:id/payment', protect, async (req, res) => {
    try {
        const { paymentMethod, amountPaid, splitPaymentDetails } = req.body;
        const order = await Order.findById(req.params.id).populate('items.menuItem');
        if (!order) return res.status(404).json({ message: 'Order not found' });

        const validMethods = ['cash', 'online', 'upi', 'card', 'split'];
        if (!validMethods.includes(paymentMethod)) {
            return res.status(400).json({ message: 'A valid settlement payment method is required.' });
        }

        const linkedBill = await Bill.findOne({
            $or: [{ order: order._id }, { orders: order._id }]
        });

        if (linkedBill) {
            const wasPaid = linkedBill.paymentMethod && linkedBill.paymentMethod !== 'pending';
            if (wasPaid && req.user.role !== 'superadmin') {
                return res.status(403).json({ message: 'This bill is already settled. Only superadmin can modify settlement.' });
            }
            if (req.body.finalTotal !== undefined) {
                const requestedFinalTotal = Number(req.body.finalTotal);
                if (!Number.isFinite(requestedFinalTotal) || Math.round(requestedFinalTotal * 100) !== Math.round(linkedBill.total * 100)) {
                    return res.status(400).json({ message: 'Payment total does not match the authoritative bill total.' });
                }
            }

            const paidAmount = roundMoney(Number(amountPaid));
            if (!Number.isFinite(paidAmount) || Math.round(paidAmount * 100) !== Math.round(linkedBill.total * 100)) {
                return res.status(400).json({
                    message: `Settlement amount must exactly match bill total ₹${linkedBill.total.toFixed(2)}. Apply any discount before settlement.`
                });
            }

            const rawSplitValues = paymentMethod === 'split'
                ? ['cash', 'upi', 'card'].map(key => Number(splitPaymentDetails?.[key] ?? 0))
                : [0, 0, 0];
            if (paymentMethod === 'split' && rawSplitValues.some(value => !Number.isFinite(value) || value < 0)) {
                return res.status(400).json({ message: 'Split payment amounts must be valid non-negative numbers.' });
            }
            const split = paymentMethod === 'split' ? {
                cash: roundMoney(rawSplitValues[0]),
                upi: roundMoney(rawSplitValues[1]),
                card: roundMoney(rawSplitValues[2])
            } : { cash: 0, upi: 0, card: 0 };
            if (paymentMethod === 'split') {
                const splitTotal = roundMoney(split.cash + split.upi + split.card);
                if (Math.round(splitTotal * 100) !== Math.round(linkedBill.total * 100)) {
                    return res.status(400).json({ message: 'Split payment does not match the bill total.' });
                }
            }

            const linkedIds = [...new Set([...(linkedBill.orders || []), linkedBill.order]
                .filter(Boolean).map(id => id.toString()))];
            const linkedOrders = await Order.find({ _id: { $in: linkedIds } }).populate('items.menuItem');
            if (linkedOrders.length !== linkedIds.length) {
                return res.status(409).json({ message: 'A linked source order is missing. Settlement was not changed.' });
            }
            const totals = {
                discount: linkedBill.discount,
                tax: linkedBill.tax,
                total: linkedBill.total,
                taxDetails: linkedBill.taxDetails || []
            };
            const allocations = allocateBillTotals(linkedOrders, totals);
            const now = new Date();
            const businessDate = !wasPaid
                ? getBusinessDate(now)
                : (linkedBill.businessDate || getBusinessDate(now));

            await runAtomic(async session => {
                await Order.bulkWrite(allocations.map(allocation => ({
                    updateOne: {
                        filter: { _id: allocation.order._id },
                        update: { $set: {
                            items: allocation.items,
                            subtotal: allocation.subtotal,
                            discount: allocation.discount,
                            tax: allocation.tax,
                            taxDetails: allocation.taxDetails,
                            total: allocation.total,
                            paymentMethod,
                            splitPaymentDetails: split,
                            amountPaid: allocation.total,
                            status: 'paid',
                            settledAt: now,
                            businessDate,
                            updatedAt: now
                        } }
                    }
                })), sessionOptions(session));

                linkedBill.paymentMethod = paymentMethod;
                linkedBill.splitPaymentDetails = split;
                linkedBill.paidAt = now;
                linkedBill.businessDate = businessDate;
                await linkedBill.save(sessionOptions(session));
                await Table.updateMany(
                    { currentOrder: { $in: linkedOrders.map(linkedOrder => linkedOrder._id) } },
                    { status: 'available', isOccupied: false, currentOrder: null },
                    sessionOptions(session)
                );
            });

            // Award loyalty once per Bill, on its primary order only.
            if (!wasPaid) {
                try {
                    const primary = linkedOrders.find(linkedOrder => linkedOrder._id.toString() === linkedBill.order?.toString()) || linkedOrders[0];
                    const loyaltySettings = await LoyaltySettings.getSettings();
                    if (primary && loyaltySettings.isActive && linkedBill.total >= loyaltySettings.minOrderForPoints) {
                        let pointsEarned = Math.floor(linkedBill.total * loyaltySettings.pointsPerRupee);
                        for (const item of primary.items) {
                            if (item.menuItem?.bonusLoyaltyPoints) pointsEarned += item.menuItem.bonusLoyaltyPoints * item.quantity;
                        }
                        if (pointsEarned > 0) {
                            await User.findByIdAndUpdate(primary.user, {
                                $inc: { loyaltyPoints: pointsEarned, totalPointsEarned: pointsEarned }
                            });
                        }
                    }
                } catch (loyaltyError) {
                    console.error('Error awarding loyalty points:', loyaltyError);
                }
            }

            const populatedOrders = await Order.find({ _id: { $in: linkedIds } })
                .populate('user', 'phone name')
                .populate('placedBy', 'name')
                .populate('items.menuItem', 'name image');
            const io = req.app.get('io');
            if (io) {
                populatedOrders.forEach(linkedOrder => io.emit('order-updated', linkedOrder));
                const populatedBill = await Bill.findById(linkedBill._id)
                    .populate({ path: 'order', populate: { path: 'user', select: 'name phone' } })
                    .populate({ path: 'orders', populate: { path: 'user', select: 'name phone' } });
                io.emit('bill-generated', populatedBill);
            }
            return res.json(populatedOrders.find(item => item._id.toString() === order._id.toString()) || populatedOrders[0]);
        }

        // Legacy/no-Bill payment: totals are still recomputed server-side; finalTotal cannot overwrite them.
        if (order.status === 'paid' && req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'This order is already settled. Only superadmin can modify settlement.' });
        }
        const taxConfig = await getConfiguredTax(Settings);
        const totals = calculateTotals(order.items, order.discount || 0, taxConfig);
        if (req.body.finalTotal !== undefined) {
            const requestedFinalTotal = Number(req.body.finalTotal);
            if (!Number.isFinite(requestedFinalTotal) || Math.round(requestedFinalTotal * 100) !== Math.round(totals.total * 100)) {
                return res.status(400).json({ message: 'Payment total does not match the server-calculated order total.' });
            }
        }
        const paidAmount = roundMoney(Number(amountPaid));
        if (!Number.isFinite(paidAmount) || paidAmount < 0) {
            return res.status(400).json({ message: 'Invalid paid amount.' });
        }
        const legacySplitValues = paymentMethod === 'split'
            ? ['cash', 'upi', 'card'].map(key => Number(splitPaymentDetails?.[key] ?? 0))
            : [0, 0, 0];
        if (paymentMethod === 'split' && legacySplitValues.some(value => !Number.isFinite(value) || value < 0)) {
            return res.status(400).json({ message: 'Split payment amounts must be valid non-negative numbers.' });
        }
        const roundedLegacySplitValues = legacySplitValues.map(roundMoney);
        if (paymentMethod === 'split' && Math.round(roundedLegacySplitValues.reduce((sum, value) => sum + value, 0) * 100) !== Math.round(totals.total * 100)) {
            return res.status(400).json({ message: 'Split payment does not match the server-calculated order total.' });
        }

        order.items = totals.items;
        order.subtotal = totals.subtotal;
        order.discount = totals.discount;
        order.tax = totals.tax;
        order.taxDetails = totals.taxDetails;
        order.total = totals.total;
        order.paymentMethod = paymentMethod;
        order.splitPaymentDetails = paymentMethod === 'split'
            ? { cash: roundedLegacySplitValues[0], upi: roundedLegacySplitValues[1], card: roundedLegacySplitValues[2] }
            : { cash: 0, upi: 0, card: 0 };
        order.amountPaid = paidAmount;
        if (Math.round(paidAmount * 100) >= Math.round(totals.total * 100)) {
            order.status = 'paid';
            order.amountPaid = totals.total;
            order.settledAt = new Date();
            order.businessDate = getBusinessDate(order.settledAt);
        } else if (order.status === 'paid') {
            order.status = 'confirmed';
            order.settledAt = null;
            order.businessDate = '';
        }
        const settledNow = order.status === 'paid';
        if (settledNow) {
            await runAtomic(async session => {
                await order.save(sessionOptions(session));
                await freeTablesForOrder(order, null, session);
            });
        } else {
            await order.save();
        }

        const io = req.app.get('io');
        if (settledNow && io) {
            const tableIds = [...new Set([...(order.tables || []), order.table].filter(Boolean).map(id => id.toString()))];
            const freedTables = await Table.find({ _id: { $in: tableIds } });
            freedTables.forEach(tableDoc => {
                io.emit('table-freed', tableDoc);
                io.emit('table-updated', tableDoc);
            });
        }

        const populatedOrder = await Order.findById(order._id)
            .populate('user', 'phone name')
            .populate('placedBy', 'name')
            .populate('items.menuItem', 'name image');
        if (io) {
            io.emit('order-updated', populatedOrder);
            io.to(`user-${order.user}`).emit('my-order-updated', populatedOrder);
        }
        res.json(populatedOrder);
    } catch (error) {
        console.error(error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
    }
});

// @route   PUT /api/orders/:id/items
// @desc    Update order items list and update associated bill if it exists
// @access  Private
router.put('/:id/items', protect, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        if (order.status === 'paid' && req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'This order has been settled. Only superadmin can modify settled orders.' });
        }

        const requestedItems = normalizeItems(req.body.items || []);
        if (requestedItems.length === 0) {
            return res.status(400).json({ message: 'Order cannot be left with 0 items. Delete the order instead.' });
        }
        const menuItems = await MenuItem.find({ _id: { $in: requestedItems.map(item => item.menuItem) } });
        if (menuItems.length !== requestedItems.length) {
            return res.status(400).json({ message: 'One or more menu items no longer exist.' });
        }
        const menuById = new Map(menuItems.map(item => [item._id.toString(), item]));
        const canonicalItems = requestedItems.map(item => {
            const menuItem = menuById.get(item.menuItem.toString());
            return {
                menuItem: menuItem._id,
                name: menuItem.name,
                price: menuItem.price,
                quantity: item.quantity,
                total: roundMoney(menuItem.price * item.quantity),
                notes: item.notes || ''
            };
        });

        const taxConfig = await getConfiguredTax(Settings);
        const bill = await Bill.findOne({ $or: [{ order: order._id }, { orders: order._id }] });
        if (bill && bill.paymentMethod && bill.paymentMethod !== 'pending' && req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'This bill is settled. Only superadmin can modify it.' });
        }
        if (!bill) {
            const totals = calculateTotals(canonicalItems, order.discount || 0, taxConfig);
            if (totals.discount > totals.subtotal) {
                return res.status(400).json({ message: 'Existing discount exceeds the new subtotal.' });
            }
            order.items = totals.items;
            order.subtotal = totals.subtotal;
            order.discount = totals.discount;
            order.tax = totals.tax;
            order.taxDetails = totals.taxDetails;
            order.gstRate = taxConfig.reduce((sum, taxItem) => sum + taxItem.rate, 0);
            order.total = totals.total;
            await order.save();
        } else {
            const linkedIds = [...new Set([...(bill.orders || []), bill.order]
                .filter(Boolean).map(id => id.toString()))];
            const linkedOrders = await Order.find({ _id: { $in: linkedIds } });
            if (linkedOrders.length !== linkedIds.length) {
                return res.status(409).json({ message: 'A linked source order is missing. Bill was not changed.' });
            }
            const changedOrder = linkedOrders.find(item => item._id.toString() === order._id.toString());
            changedOrder.items = canonicalItems;
            const combinedItems = normalizeItems(linkedOrders.flatMap(item => item.items || []));
            const totals = calculateTotals(combinedItems, bill.discount || 0, taxConfig);
            if (totals.discount > totals.subtotal) {
                return res.status(400).json({ message: 'Existing bill discount exceeds the new subtotal.' });
            }
            const allocations = allocateBillTotals(linkedOrders, totals);
            const settled = bill.paymentMethod && bill.paymentMethod !== 'pending';
            const now = new Date();

            await runAtomic(async session => {
                await Order.bulkWrite(allocations.map(allocation => ({
                    updateOne: {
                        filter: { _id: allocation.order._id },
                        update: { $set: {
                            items: allocation.items,
                            subtotal: allocation.subtotal,
                            discount: allocation.discount,
                            tax: allocation.tax,
                            taxDetails: allocation.taxDetails,
                            gstRate: taxConfig.reduce((sum, taxItem) => sum + taxItem.rate, 0),
                            total: allocation.total,
                            amountPaid: settled ? allocation.total : 0,
                            updatedAt: now
                        } }
                    }
                })), sessionOptions(session));

                bill.items = totals.items;
                bill.taxDetails = totals.taxDetails;
                bill.subtotal = totals.subtotal;
                bill.discount = totals.discount;
                bill.tax = totals.tax;
                bill.total = totals.total;
                await bill.save(sessionOptions(session));
            });
        }

        const populatedOrder = await Order.findById(order._id)
            .populate('user', 'phone name')
            .populate('items.menuItem', 'name image');
        const io = req.app.get('io');
        if (io) {
            io.emit('order-updated', populatedOrder);
            io.to(`user-${order.user}`).emit('my-order-updated', populatedOrder);
            if (bill) {
                const populatedBill = await Bill.findById(bill._id)
                    .populate({ path: 'order', populate: { path: 'user', select: 'name phone' } })
                    .populate({ path: 'orders', populate: { path: 'user', select: 'name phone' } });
                io.emit('bill-generated', populatedBill);
            }
        }
        res.json(populatedOrder);
    } catch (error) {
        console.error(error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
    }
});

// @route   DELETE /api/orders/:id
// @desc    Delete order (admin)
// @access  Private/Admin
router.delete('/:id', protect, superadmin, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: 'Invalid Order ID' });
        }
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        const linkedBill = await Bill.findOne({
            $or: [{ order: order._id }, { orders: order._id }]
        });
        const orderIds = linkedBill
            ? [...new Set([...(linkedBill.orders || []), linkedBill.order].filter(Boolean).map(id => id.toString()))]
            : [order._id.toString()];

        await runAtomic(async session => {
            await Table.updateMany(
                { currentOrder: { $in: orderIds } },
                { status: 'available', isOccupied: false, currentOrder: null },
                sessionOptions(session)
            );
            await Order.deleteMany({ _id: { $in: orderIds } }, sessionOptions(session));
            if (linkedBill) await Bill.findByIdAndDelete(linkedBill._id, sessionOptions(session));
        });

        const io = req.app.get('io');
        if (io) {
            orderIds.forEach(id => io.emit('order-deleted', id));
            if (linkedBill) io.emit('bill-deleted', linkedBill._id.toString());
        }
        res.json({
            message: linkedBill
                ? 'Linked bill and all source orders deleted successfully'
                : 'Order deleted successfully'
        });
    } catch (error) {
        console.error(error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server error' });
    }
});

module.exports = router;
