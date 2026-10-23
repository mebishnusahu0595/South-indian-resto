const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Bill = require('../models/Bill');
const Table = require('../models/Table');
const Settings = require('../models/Settings');
const { getBusinessDate } = require('../utils/orderCalculations');
const hotelAuth = require('../middleware/hotelAuth');
const {
    isRoomTable,
    formatRoomOrderPayload,
    addSseClient,
    removeSseClient,
    sendWebhookNotification
} = require('../utils/hotelOrderHelper');

// All routes in this router require hotel API key authorization
router.use(hotelAuth);

/**
 * @route   GET /api/hotel-sync/orders
 * @desc    Fetch room service orders (filtered by roomNumber, sync status, date)
 * @access  Protected (Hotel API Key)
 */
router.get('/orders', async (req, res) => {
    try {
        const { roomNumber, synced, since, limit = 50 } = req.query;

        // Build query
        const query = {};

        // Find room tables if roomNumber specified
        if (roomNumber) {
            const cleanRoom = String(roomNumber).trim();
            const matchingTables = await Table.find({
                $or: [
                    { tableNumber: cleanRoom },
                    { name: new RegExp(`Room\\s*${cleanRoom}`, 'i') }
                ]
            }).select('_id');

            const tableIds = matchingTables.map(t => t._id);

            query.$or = [
                { roomNumber: cleanRoom },
                { tableNumber: cleanRoom },
                { table: { $in: tableIds } },
                { tables: { $in: tableIds } }
            ];
        } else {
            // Find all tables that are rooms
            const roomTables = await Table.find({
                $or: [
                    { areaType: 'room' },
                    { section: /floor|room/i },
                    { name: /room/i }
                ]
            }).select('_id');

            const roomTableIds = roomTables.map(t => t._id);

            query.$or = [
                { isRoomOrder: true },
                { table: { $in: roomTableIds } },
                { tables: { $in: roomTableIds } },
                { tableNumber: /^\d{3}$/ } // 3-digit room numbers like 101, 201
            ];
        }

        // Filter by PMS sync status
        if (synced === 'false' || synced === false) {
            query.pmsSynced = { $ne: true };
        } else if (synced === 'true' || synced === true) {
            query.pmsSynced = true;
        }

        // Filter by timestamp
        if (since) {
            const sinceDate = new Date(since);
            if (!isNaN(sinceDate.getTime())) {
                query.createdAt = { $gte: sinceDate };
            }
        }

        const orders = await Order.find(query)
            .sort({ createdAt: -1 })
            .limit(Math.min(Number(limit) || 50, 200))
            .populate('tables', 'tableNumber name section areaType')
            .populate('table', 'tableNumber name section areaType')
            .populate('items.menuItem', 'name price');

        const formatted = orders.map(order => formatRoomOrderPayload(order));

        res.json({
            success: true,
            count: formatted.length,
            data: formatted
        });
    } catch (err) {
        console.error('[HotelSync] Error fetching room orders:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch room orders' });
    }
});

/**
 * @route   GET /api/hotel-sync/orders/:id
 * @desc    Get single room order details
 * @access  Protected (Hotel API Key)
 */
router.get('/orders/:id', async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('tables', 'tableNumber name section areaType')
            .populate('table', 'tableNumber name section areaType')
            .populate('items.menuItem', 'name price');

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const payload = formatRoomOrderPayload(order);
        res.json({
            success: true,
            data: payload
        });
    } catch (err) {
        console.error('[HotelSync] Error fetching order details:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch order details' });
    }
});

/**
 * @route   POST /api/hotel-sync/orders/:id/synced (or /ack)
 * @desc    Mark a room order as synced to the Hotel PMS folio to avoid duplicate billing
 * @access  Protected (Hotel API Key)
 */
const markSyncedHandler = async (req, res) => {
    try {
        const {
            pmsChargeId,
            notes,
            paymentStatus,
            paymentMethod,
            invoiceNumber,
            hotelInvoiceNumber,
            paidAt
        } = req.body;

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const now = paidAt ? new Date(paidAt) : new Date();
        order.pmsSynced = true;
        order.pmsSyncedAt = now;
        if (pmsChargeId) order.pmsChargeId = String(pmsChargeId);

        const isPaidInHotel = (
            paymentStatus === 'paid' ||
            paymentMethod === 'hotel_bill' ||
            req.body.isPaid === true
        );

        const invNum = String(invoiceNumber || hotelInvoiceNumber || order.pmsInvoiceNumber || '').trim();

        if (isPaidInHotel) {
            order.status = 'paid';
            order.paymentMethod = 'hotel_bill';
            order.paidInHotelBill = true;
            order.amountPaid = order.total;
            order.settledAt = now;
            order.businessDate = getBusinessDate(now);
            if (invNum) {
                order.pmsInvoiceNumber = invNum;
                order.billerName = `Hotel Bill (${invNum})`;
            } else {
                order.billerName = 'Hotel Bill';
            }
        }

        await order.save();

        let bill = null;
        if (isPaidInHotel) {
            // Find or create linked Bill in Kea
            bill = await Bill.findOne({
                $or: [{ order: order._id }, { orders: order._id }]
            });

            if (!bill) {
                bill = new Bill({
                    billNumber: `BILL-HTL-${Date.now().toString().slice(-6)}`,
                    order: order._id,
                    orders: [order._id],
                    items: order.items,
                    subtotal: order.subtotal,
                    discount: order.discount || 0,
                    discountName: order.discountName || '',
                    tax: order.tax,
                    taxDetails: order.taxDetails || [],
                    total: order.total,
                    tableNumbers: order.tableNumber ? [order.tableNumber] : [],
                    orderNumbers: [order.orderNumber],
                    customer: {
                        name: order.user?.name || 'Hotel Guest',
                        phone: order.user?.phone || ''
                    }
                });
            }

            bill.paymentMethod = 'hotel_bill';
            bill.billerName = order.billerName || `Hotel Bill (${invNum || 'PMS'})`;
            bill.pmsInvoiceNumber = invNum;
            bill.paidAt = now;
            bill.businessDate = order.businessDate || getBusinessDate(now);
            await bill.save();

            // Free the room table in Kea layout
            const tableIds = [...(order.tables || []), order.table].filter(Boolean);
            if (tableIds.length > 0) {
                await Table.updateMany(
                    { _id: { $in: tableIds } },
                    { status: 'available', isOccupied: false, currentOrder: null }
                );
            }

            // Real-time notification to all active Kea screens
            const io = req.app.get('io');
            if (io) {
                const populatedOrder = await Order.findById(order._id)
                    .populate('tables', 'tableNumber name section areaType')
                    .populate('items.menuItem', 'name price');
                io.emit('order-updated', populatedOrder);
                io.emit('bill-generated', bill);
                tableIds.forEach(tid => {
                    io.emit('table-freed', { _id: tid });
                    io.emit('table-updated', { _id: tid, status: 'available', isOccupied: false, currentOrder: null });
                });
            }

            console.log(`[HotelSync] Order #${order.orderNumber} (Room ${order.roomNumber}) marked PAID via Hotel Bill (${invNum || 'PMS'}) and table freed.`);
        }

        res.json({
            success: true,
            message: isPaidInHotel
                ? `Order #${order.orderNumber} successfully settled & marked as Paid in Hotel Bill (${invNum || 'PMS'})`
                : `Order #${order.orderNumber} successfully marked as synced to Hotel PMS`,
            orderId: order._id,
            orderNumber: order.orderNumber,
            roomNumber: order.roomNumber,
            status: order.status,
            paymentMethod: order.paymentMethod,
            paidInHotelBill: Boolean(order.paidInHotelBill),
            pmsInvoiceNumber: order.pmsInvoiceNumber,
            pmsChargeId: order.pmsChargeId,
            pmsSyncedAt: order.pmsSyncedAt,
            tableFreed: isPaidInHotel
        });
    } catch (err) {
        console.error('[HotelSync] Error marking order as synced/paid:', err);
        res.status(500).json({ success: false, message: 'Failed to update order status' });
    }
};

router.post('/orders/:id/synced', markSyncedHandler);
router.post('/orders/:id/ack', markSyncedHandler);
router.post('/orders/:id/pay', markSyncedHandler);
router.post('/orders/:id/settle', markSyncedHandler);

/**
 * @route   GET /api/hotel-sync/stream
 * @desc    Real-time Server-Sent Events (SSE) stream for live room order notifications
 * @access  Protected (Hotel API Key in header or ?apiKey query param)
 */
router.get('/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders?.();

    // Initial handshake
    res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', time: new Date() })}\n\n`);

    addSseClient(res);

    // Keepalive ping every 25 seconds
    const keepAliveTimer = setInterval(() => {
        try {
            res.write(`: keepalive ${Date.now()}\n\n`);
        } catch (e) {
            clearInterval(keepAliveTimer);
        }
    }, 25000);

    req.on('close', () => {
        clearInterval(keepAliveTimer);
        removeSseClient(res);
    });
});

/**
 * @route   GET /api/hotel-sync/rooms
 * @desc    List all hotel room tables with active running orders and unpaid bills
 * @access  Protected (Hotel API Key)
 */
router.get('/rooms', async (req, res) => {
    try {
        const roomTables = await Table.find({
            $or: [
                { areaType: 'room' },
                { section: /floor|room/i },
                { name: /room/i }
            ]
        }).sort({ tableNumber: 1 });

        const activeOrders = await Order.find({
            table: { $in: roomTables.map(t => t._id) },
            status: { $nin: ['paid', 'cancelled'] }
        }).select('_id orderNumber table total subtotal tax status createdAt items');

        const activeOrderMap = new Map();
        for (const o of activeOrders) {
            activeOrderMap.set(String(o.table), o);
        }

        const result = roomTables.map(table => {
            const order = activeOrderMap.get(String(table._id));
            return {
                tableId: table._id,
                roomNumber: table.tableNumber,
                name: table.name || `Room ${table.tableNumber}`,
                section: table.section,
                areaType: table.areaType,
                isOccupied: table.isOccupied,
                activeOrder: order ? {
                    orderId: order._id,
                    orderNumber: order.orderNumber,
                    itemCount: (order.items || []).length,
                    total: order.total,
                    createdAt: order.createdAt
                } : null
            };
        });

        res.json({
            success: true,
            count: result.length,
            data: result
        });
    } catch (err) {
        console.error('[HotelSync] Error fetching room list:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch rooms' });
    }
});

/**
 * @route   POST /api/hotel-sync/test-webhook
 * @desc    Test trigger webhook to verify connection to Hotel PMS
 * @access  Protected (Hotel API Key)
 */
router.post('/test-webhook', async (req, res) => {
    try {
        const mockPayload = {
            orderId: 'test_order_' + Date.now(),
            orderNumber: 'TEST-101',
            roomNumber: req.body.roomNumber || '101',
            roomName: 'Room ' + (req.body.roomNumber || '101'),
            section: 'Ground Floor',
            items: [
                { foodName: 'Test Paneer Butter Masala', quantity: 1, price: 280, total: 280, notes: 'Test integration' },
                { foodName: 'Test Virgin Mojito', quantity: 1, price: 150, total: 150, notes: '' }
            ],
            itemsSummary: 'Test Paneer Butter Masala x1, Test Virgin Mojito x1',
            subtotal: 430,
            tax: 14,
            total: 444,
            currency: 'INR',
            status: 'confirmed',
            createdAt: new Date(),
            pmsSynced: false
        };

        await sendWebhookNotification(mockPayload, 'test.notification');

        res.json({
            success: true,
            message: 'Test webhook dispatched to configured URL',
            payload: mockPayload
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
