const Settings = require('../models/Settings');
const http = require('http');
const https = require('https');

// Set of active SSE response streams from Hotel PMS clients
const sseClients = new Set();

/**
 * Check if a table corresponds to a hotel room.
 */
function isRoomTable(table) {
    if (!table) return false;
    if (table.areaType === 'room') return true;
    if (typeof table.section === 'string' && /floor|room/i.test(table.section)) return true;
    if (typeof table.name === 'string' && /room/i.test(table.name)) return true;
    return false;
}

/**
 * Extract clean room number from table object or string.
 */
function extractRoomNumber(table) {
    if (!table) return '';
    if (typeof table === 'string') {
        const match = table.match(/\d+/);
        return match ? match[0] : table.trim();
    }
    if (table.tableNumber) {
        const numOnly = String(table.tableNumber).trim();
        return numOnly;
    }
    if (table.name) {
        const match = String(table.name).match(/\d+/);
        if (match) return match[0];
        return String(table.name).trim();
    }
    return '';
}

/**
 * Format room order payload specifically designed for Hotel PMS folio billing.
 */
function formatRoomOrderPayload(order, tableInfo = null) {
    if (!order) return null;

    const items = (order.items || []).map(item => ({
        foodName: item.name || item.menuItem?.name || 'Food Item',
        quantity: item.quantity || 1,
        price: Number(item.price || 0),
        total: Number(item.total || (item.price * item.quantity) || 0),
        notes: item.notes || ''
    }));

    // Find table info
    let roomNo = order.roomNumber || '';
    let roomName = '';
    let section = '';

    if (tableInfo) {
        roomNo = roomNo || extractRoomNumber(tableInfo);
        roomName = tableInfo.name || `Room ${roomNo}`;
        section = tableInfo.section || '';
    } else if (order.tables && order.tables.length > 0) {
        const firstRoom = order.tables.find(t => isRoomTable(t)) || order.tables[0];
        roomNo = roomNo || extractRoomNumber(firstRoom);
        roomName = firstRoom.name || `Room ${roomNo}`;
        section = firstRoom.section || '';
    } else if (order.table) {
        roomNo = roomNo || extractRoomNumber(order.table);
        roomName = order.table.name || `Room ${roomNo}`;
        section = order.table.section || '';
    } else if (order.tableNumber) {
        roomNo = roomNo || extractRoomNumber(order.tableNumber);
        roomName = `Room ${roomNo}`;
    }

    const itemsSummary = items
        .map(i => `${i.foodName} x${i.quantity} (₹${i.total})`)
        .join(', ');

    return {
        orderId: String(order._id || ''),
        orderNumber: String(order.orderNumber || ''),
        kotNumber: order.kotHistory?.length > 0 ? order.kotHistory[order.kotHistory.length - 1].kotNumber : '',
        roomNumber: roomNo,
        roomName: roomName || `Room ${roomNo}`,
        section: section,
        items: items,
        itemsSummary: itemsSummary,
        subtotal: Number(order.subtotal || 0),
        discount: Number(order.discount || 0),
        tax: Number(order.tax || 0),
        total: Number(order.total || 0),
        currency: 'INR',
        status: order.status || 'confirmed',
        specialInstructions: order.specialInstructions || '',
        customerName: order.user?.name || order.customerName || '',
        customerPhone: order.user?.phone || order.customerPhone || '',
        pmsSynced: Boolean(order.pmsSynced),
        pmsSyncedAt: order.pmsSyncedAt || null,
        pmsChargeId: order.pmsChargeId || '',
        createdAt: order.createdAt || new Date(),
        updatedAt: order.updatedAt || new Date()
    };
}

/**
 * Register SSE client stream
 */
function addSseClient(res) {
    sseClients.add(res);
}

/**
 * Remove SSE client stream
 */
function removeSseClient(res) {
    sseClients.delete(res);
}

/**
 * Broadcast event to all connected Hotel PMS SSE clients
 */
function broadcastSse(eventType, data) {
    const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
        try {
            client.write(message);
        } catch (err) {
            sseClients.delete(client);
        }
    }
}

/**
 * Send HTTP POST webhook to configured Hotel PMS URL
 */
async function sendWebhookNotification(payload, eventType = 'room_order.created') {
    try {
        const webhookUrl = await Settings.getSetting(
            'hotel_pms_webhook_url',
            process.env.HOTEL_PMS_WEBHOOK_URL || ''
        );
        if (!webhookUrl || !webhookUrl.startsWith('http')) return;

        const apiKey = await Settings.getSetting(
            'hotel_pms_api_key',
            process.env.HOTEL_PMS_API_KEY || 'kea_pms_live_key_9021'
        );

        const urlObj = new URL(webhookUrl);
        const postData = JSON.stringify({
            event: eventType,
            timestamp: new Date().toISOString(),
            data: payload
        });

        const isHttps = urlObj.protocol === 'https:';
        const client = isHttps ? https : http;

        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'x-api-key': apiKey,
                'x-kea-event': eventType,
                'User-Agent': 'KeaByThePool-PMS-Integration/1.0'
            },
            timeout: 5000
        };

        const req = client.request(options, (res) => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                console.log(`[HotelPMS Webhook] Successfully notified PMS for Room ${payload.roomNumber} (status ${res.statusCode})`);
            } else {
                console.warn(`[HotelPMS Webhook] PMS returned status ${res.statusCode} for Room ${payload.roomNumber}`);
            }
        });

        req.on('error', (err) => {
            console.error(`[HotelPMS Webhook] Failed to connect to ${webhookUrl}:`, err.message);
        });

        req.on('timeout', () => {
            req.destroy();
            console.warn(`[HotelPMS Webhook] Timeout reaching ${webhookUrl}`);
        });

        req.write(postData);
        req.end();
    } catch (err) {
        console.error('[HotelPMS Webhook] Error sending webhook:', err.message);
    }
}

/**
 * Main dispatch function called when an order is created or updated in Kea.
 * Checks if the order is for a room table; if so, formats and dispatches SSE + Webhook.
 */
async function dispatchHotelRoomOrder(order, populatedOrder = null, eventType = 'room_order.created') {
    try {
        const targetOrder = populatedOrder || order;
        if (!targetOrder) return null;

        // Check tables to see if this is a room order
        const tables = targetOrder.tables || (targetOrder.table ? [targetOrder.table] : []);
        const roomTable = tables.find(t => isRoomTable(t));

        const isRoom = Boolean(roomTable) ||
            /floor|room/i.test(targetOrder.tableNumber || '') ||
            Boolean(targetOrder.isRoomOrder);

        if (!isRoom) {
            return null; // Not a room order, do nothing
        }

        const roomNo = extractRoomNumber(roomTable || targetOrder.tableNumber);

        // Update DB fields on the order if not already set
        if (!order.isRoomOrder || !order.roomNumber) {
            try {
                order.isRoomOrder = true;
                order.roomNumber = roomNo;
                if (typeof order.save === 'function') {
                    await order.save();
                }
            } catch (saveErr) {
                console.warn('[HotelPMS] Could not update order room flags:', saveErr.message);
            }
        }

        const payload = formatRoomOrderPayload(targetOrder, roomTable);

        // 1. Broadcast to real-time SSE streams (Hotel PMS dashboard/app)
        broadcastSse('room_order', payload);

        // 2. Dispatch HTTP Webhook if configured
        sendWebhookNotification(payload, eventType);

        console.log(`[HotelPMS] Room order dispatched for Room ${payload.roomNumber} (Total: ₹${payload.total})`);
        return payload;
    } catch (err) {
        console.error('[HotelPMS] Error in dispatchHotelRoomOrder:', err);
        return null;
    }
}

module.exports = {
    isRoomTable,
    extractRoomNumber,
    formatRoomOrderPayload,
    addSseClient,
    removeSseClient,
    broadcastSse,
    sendWebhookNotification,
    dispatchHotelRoomOrder
};
