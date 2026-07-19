/**
 * Seed script — creates 3 test orders with different statuses
 * Run: node backend/scripts/seed-orders.js
 */
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const Order = require('../models/Order');
const MenuItem = require('../models/MenuItem');
const User = require('../models/User');
const Table = require('../models/Table');
const { generateOrderNumber } = require('../utils/helpers');

async function seed() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get some real menu items
    const items = await MenuItem.find({ isAvailable: true }).limit(6);
    if (items.length < 2) {
        console.error('❌ Need at least 2 available menu items in DB first!');
        process.exit(1);
    }

    // Find or create a walk-in user
    let user = await User.findOne({ phone: '9000000001' });
    if (!user) {
        user = new User({ phone: '9000000001', name: 'Test Customer', role: 'customer', isVerified: true });
        await user.save();
    }

    // Get or create tables
    let table = await Table.findOne({ tableNumber: { $exists: true } });

    const restaurantInfo = {
        name: 'Kea By The Pool',
        address: 'Risali, Bhilai',
        phone: '+91 98765 43210',
        gstNumber: ''
    };

    const scenarios = [
        {
            label: 'Pending order (just placed)',
            status: 'pending',
            itemIdxs: [0, 1],
            tableNumber: table?.tableNumber || '3',
        },
        {
            label: 'Preparing order',
            status: 'preparing',
            itemIdxs: [2, 3],
            tableNumber: '5',
        },
        {
            label: 'Bill requested (ready to pay)',
            status: 'bill_requested',
            itemIdxs: [0, 2, 4 < items.length ? 4 : 0],
            tableNumber: '7',
        },
    ];

    for (const s of scenarios) {
        const orderItems = s.itemIdxs.map(i => {
            const it = items[i % items.length];
            const qty = Math.floor(Math.random() * 2) + 1;
            return {
                menuItem: it._id,
                name: it.name,
                price: it.price,
                quantity: qty,
                total: it.price * qty,
            };
        });

        const subtotal = orderItems.reduce((sum, i) => sum + i.total, 0);
        const gstRate = 5;
        const tax = subtotal * gstRate / 100;
        const total = subtotal + tax;

        const order = new Order({
            orderNumber: generateOrderNumber(),
            user: user._id,
            items: orderItems,
            subtotal,
            discount: 0,
            tax,
            gstRate,
            taxDetails: [{ name: 'GST', rate: gstRate, amount: tax }],
            restaurantInfo,
            total,
            tableNumber: s.tableNumber,
            status: s.status,
            specialInstructions: s.label.includes('Bill') ? 'Please bring the bill fast!' : '',
        });

        await order.save();
        const pop = await Order.findById(order._id).populate('user', 'name phone').populate('items.menuItem', 'name');
        console.log(`\n✅ Created [${s.label}]`);
        console.log(`   Order #${pop.orderNumber} | Table ${s.tableNumber} | Status: ${s.status}`);
        console.log(`   Items: ${pop.items.map(i => `${i.name} x${i.quantity}`).join(', ')}`);
        console.log(`   Subtotal: ₹${subtotal} | GST: ₹${tax.toFixed(2)} | Total: ₹${total.toFixed(2)}`);
    }

    console.log('\n🎉 Done! Refresh your admin Orders page to see live orders.');
    await mongoose.disconnect();
}

seed().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
