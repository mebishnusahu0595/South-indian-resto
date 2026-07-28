const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Bill = require('../models/Bill');
const Table = require('../models/Table');
const MenuItem = require('../models/MenuItem');
const Employee = require('../models/Employee');
const { protect, admin, superadmin } = require('../middleware/auth');

// @route   GET /api/reports/day-end
// @desc    Get Day-End EOD Sales Report (Category, Item, Staff, Payment breakdown)
// @access  Private/Admin
router.get('/day-end', protect, admin, async (req, res) => {
    try {
        const { date } = req.query;
        let targetDate = date;
        const todayStr = new Date(Date.now() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        const yesterdayDate = new Date(Date.now() - (new Date().getTimezoneOffset() * 60000) - 86400000);
        const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

        if (req.user.role !== 'superadmin') {
            if (targetDate !== todayStr && targetDate !== yesterdayStr) {
                targetDate = todayStr;
            }
        }

        const start = new Date(targetDate + 'T00:00:00');
        const end = new Date(targetDate + 'T23:59:59.999');

        // Sync order totals with bill totals for any bills generated on this date
        const existingBills = await Bill.find({ createdAt: { $gte: start, $lte: end } });
        for (const b of existingBills) {
            if (b.order) {
                const updateFields = {
                    total: b.total,
                    subtotal: b.subtotal,
                    discount: b.discount,
                    tax: b.tax
                };
                if (b.paymentMethod && b.paymentMethod !== 'pending') {
                    updateFields.status = 'paid';
                    updateFields.paymentMethod = b.paymentMethod;
                    updateFields.amountPaid = b.total;
                }
                await Order.findByIdAndUpdate(b.order, updateFields);
            }
        }

        // Fetch ONLY PAID/SETTLED orders for the date (final bills only in report)
        const orders = await Order.find({
            createdAt: { $gte: start, $lte: end },
            status: 'paid'
        })
        .populate('items.menuItem', 'name category price')
        .populate({ path: 'items.menuItem', populate: { path: 'category', select: 'name' } })
        .populate('placedBy', 'name');

        const bills = await Bill.find({
            createdAt: { $gte: start, $lte: end }
        }).populate('order', 'orderNumber tableNumber status tables');

        // Summary totals
        let grossSales = 0;
        let totalDiscount = 0;
        let totalTax = 0;
        let netRevenue = 0;

        // Payment method breakdown
        let paymentBreakdown = {
            cash: 0,
            online: 0,
            card: 0,
            split: 0,
            splitDetails: { cash: 0, upi: 0, card: 0 }
        };

        // Build bill lookup map: orderId -> bill for payment method cross-reference
        const billByOrderId = {};
        bills.forEach(b => {
            if (b.order && b.order._id) {
                billByOrderId[b.order._id.toString()] = b;
            }
        });

        orders.forEach(order => {
            const linkedBill = billByOrderId[order._id.toString()];

            const subtotalVal = linkedBill ? (linkedBill.subtotal || 0) : (order.subtotal || 0);
            const discountVal = linkedBill ? (linkedBill.discount || 0) : (order.discount || 0);
            const taxVal = linkedBill ? (linkedBill.tax || 0) : (order.tax || 0);
            const totalVal = linkedBill ? (linkedBill.total || 0) : (order.total || 0);

            grossSales += subtotalVal;
            totalDiscount += discountVal;
            totalTax += taxVal;
            netRevenue += totalVal;

            // Use bill's paymentMethod if order's is missing/pending
            const method = (order.paymentMethod && order.paymentMethod !== 'pending')
                ? order.paymentMethod
                : (linkedBill?.paymentMethod || 'pending');

            const amount = totalVal;
            if (method === 'cash') paymentBreakdown.cash += amount;
            else if (method === 'online' || method === 'upi') paymentBreakdown.online += amount;
            else if (method === 'card') paymentBreakdown.card += amount;
            else if (method === 'split') {
                paymentBreakdown.split += amount;
                const splitSrc = order.splitPaymentDetails || linkedBill?.splitPaymentDetails;
                if (splitSrc) {
                    paymentBreakdown.splitDetails.cash += (splitSrc.cash || 0);
                    paymentBreakdown.splitDetails.upi += (splitSrc.upi || 0);
                    paymentBreakdown.splitDetails.card += (splitSrc.card || 0);
                }
            }
        });

        // Category-wise & Product-wise breakdown
        const categoryMap = {};
        const productMap = {};

        orders.forEach(order => {
            (order.items || []).forEach(item => {
                const itemName = item.name || item.menuItem?.name || 'Unknown Item';
                let categoryName = 'General';
                if (item.menuItem && item.menuItem.category) {
                    categoryName = typeof item.menuItem.category === 'object' ? item.menuItem.category.name : item.menuItem.category;
                }
                const qty = item.quantity || 1;
                const rev = item.total || ((item.price || 0) * qty);

                // Category map
                if (!categoryMap[categoryName]) {
                    categoryMap[categoryName] = { name: categoryName, itemsCount: 0, totalQty: 0, totalRevenue: 0 };
                }
                categoryMap[categoryName].totalQty += qty;
                categoryMap[categoryName].totalRevenue += rev;

                // Product map
                if (!productMap[itemName]) {
                    productMap[itemName] = { name: itemName, category: categoryName, qtySold: 0, totalRevenue: 0 };
                }
                productMap[itemName].qtySold += qty;
                productMap[itemName].totalRevenue += rev;
            });
        });

        // Staff-wise sales performance
        const staffMap = {};
        orders.forEach(order => {
            const staffName = order.placedBy?.name || order.billerName || 'Direct / Self';
            if (!staffMap[staffName]) {
                staffMap[staffName] = { name: staffName, ordersCount: 0, totalSales: 0 };
            }
            staffMap[staffName].ordersCount += 1;
            staffMap[staffName].totalSales += (order.total || 0);
        });

        // Also incorporate standalone / pre-booking bills not linked to orders
        bills.forEach(bill => {
            if (!bill.order) {
                grossSales += (bill.subtotal || 0);
                totalDiscount += (bill.discount || 0);
                totalTax += (bill.tax || 0);
                netRevenue += (bill.total || 0);

                const method = bill.paymentMethod || 'cash';
                if (method === 'cash') paymentBreakdown.cash += bill.total;
                else if (method === 'online') paymentBreakdown.online += bill.total;
                else if (method === 'card') paymentBreakdown.card += bill.total;
                else if (method === 'split') {
                    paymentBreakdown.split += bill.total;
                    if (bill.splitPaymentDetails) {
                        paymentBreakdown.splitDetails.cash += (bill.splitPaymentDetails.cash || 0);
                        paymentBreakdown.splitDetails.upi += (bill.splitPaymentDetails.upi || 0);
                        paymentBreakdown.splitDetails.card += (bill.splitPaymentDetails.card || 0);
                    }
                }

                const staffName = bill.billerName || 'Pre-Booking';
                if (!staffMap[staffName]) {
                    staffMap[staffName] = { name: staffName, ordersCount: 0, totalSales: 0 };
                }
                staffMap[staffName].ordersCount += 1;
                staffMap[staffName].totalSales += (bill.total || 0);

                if (!categoryMap['Pre-Bookings']) {
                    categoryMap['Pre-Bookings'] = { name: 'Pre-Bookings', itemsCount: 0, totalQty: 0, totalRevenue: 0 };
                }
                categoryMap['Pre-Bookings'].totalQty += 1;
                categoryMap['Pre-Bookings'].totalRevenue += (bill.total || 0);
            }
        });

        const categorySales = Object.values(categoryMap).sort((a, b) => b.totalRevenue - a.totalRevenue);
        const productSales = Object.values(productMap).sort((a, b) => b.qtySold - a.qtySold);
        const staffSales = Object.values(staffMap).sort((a, b) => b.totalSales - a.totalSales);

        // Build detailed bills list for export (only finalized/generated bills)
        const detailedBills = bills.map(b => ({
            billNumber: b.billNumber,
            createdAt: b.createdAt,
            billerName: b.billerName || '',
            subtotal: b.subtotal || 0,
            discount: b.discount || 0,
            tax: b.tax || 0,
            total: b.total || 0,
            paymentMethod: b.paymentMethod || 'cash',
            order: b.order ? {
                orderNumber: b.order.orderNumber,
                tableNumber: b.order.tableNumber || (b.order.tables && b.order.tables.length > 0 ? b.order.tables.map(t => t.name || `Table ${t.tableNumber}`).join(', ') : null),
                status: b.order.status
            } : null
        }));

        res.json({
            date: targetDate,
            summary: {
                totalOrders: orders.length,
                totalBills: bills.length,
                grossSales,
                totalDiscount,
                totalTax,
                netRevenue
            },
            paymentBreakdown,
            categorySales,
            productSales,
            staffSales,
            bills: detailedBills
        });
    } catch (error) {
        console.error('Day-end report error:', error);
        res.status(500).json({ message: error.message });
    }
});

// @route   GET /api/reports/section-wise
// @desc    Get Section-wise & Table/Room-wise Sales Report
// @access  Private/Admin
router.get('/section-wise', protect, admin, async (req, res) => {
    try {
        const { date } = req.query;
        let targetDate = date;
        const todayStr = new Date(Date.now() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        const yesterdayDate = new Date(Date.now() - (new Date().getTimezoneOffset() * 60000) - 86400000);
        const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

        if (req.user.role !== 'superadmin') {
            if (targetDate !== todayStr && targetDate !== yesterdayStr) {
                targetDate = todayStr;
            }
        }

        const start = new Date(targetDate + 'T00:00:00');
        const end = new Date(targetDate + 'T23:59:59.999');

        const orders = await Order.find({
            createdAt: { $gte: start, $lte: end },
            status: { $nin: ['cancelled', 'deleted'] }
        })
        .populate('table', 'section tableNumber name areaType')
        .populate('tables', 'section tableNumber name areaType')
        .populate('items.menuItem', 'name category price')
        .populate({ path: 'items.menuItem', populate: { path: 'category', select: 'name' } });

        const sectionMap = {};

        orders.forEach(order => {
            // Determine section name
            let sectionName = 'Takeaway / Direct';
            let tableLabel = order.tableNumber || 'Takeaway';

            if (order.table && order.table.section) {
                sectionName = order.table.section;
            } else if (order.tables && order.tables.length > 0 && order.tables[0].section) {
                sectionName = order.tables[0].section;
            }

            if (!sectionMap[sectionName]) {
                sectionMap[sectionName] = {
                    sectionName,
                    totalOrders: 0,
                    totalRevenue: 0,
                    tables: {},
                    items: {}
                };
            }

            sectionMap[sectionName].totalOrders += 1;
            sectionMap[sectionName].totalRevenue += (order.total || 0);

            // Table breakdown within section
            if (!sectionMap[sectionName].tables[tableLabel]) {
                sectionMap[sectionName].tables[tableLabel] = { tableNumber: tableLabel, ordersCount: 0, totalRevenue: 0 };
            }
            sectionMap[sectionName].tables[tableLabel].ordersCount += 1;
            sectionMap[sectionName].tables[tableLabel].totalRevenue += (order.total || 0);

            // Item breakdown within section
            (order.items || []).forEach(item => {
                const itemName = item.name || item.menuItem?.name || 'Item';
                const qty = item.quantity || 1;
                const rev = item.total || ((item.price || 0) * qty);

                if (!sectionMap[sectionName].items[itemName]) {
                    sectionMap[sectionName].items[itemName] = { name: itemName, qtySold: 0, totalRevenue: 0 };
                }
                sectionMap[sectionName].items[itemName].qtySold += qty;
                sectionMap[sectionName].items[itemName].totalRevenue += rev;
            });
        });

        // Format output
        const sectionReports = Object.values(sectionMap).map(sec => ({
            sectionName: sec.sectionName,
            totalOrders: sec.totalOrders,
            totalRevenue: sec.totalRevenue,
            tableBreakdown: Object.values(sec.tables).sort((a, b) => b.totalRevenue - a.totalRevenue),
            topItems: Object.values(sec.items).sort((a, b) => b.qtySold - a.qtySold)
        })).sort((a, b) => b.totalRevenue - a.totalRevenue);

        res.json({
            date: targetDate,
            sections: sectionReports
        });
    } catch (error) {
        console.error('Section-wise report error:', error);
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
