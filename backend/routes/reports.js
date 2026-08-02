const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Bill = require('../models/Bill');
const Table = require('../models/Table');
const MenuItem = require('../models/MenuItem');
const Employee = require('../models/Employee');
const { protect, admin, superadmin } = require('../middleware/auth');
const { getBusinessDate, getBusinessDayRange } = require('../utils/orderCalculations');

// @route   GET /api/reports/day-end
// @desc    Get Day-End EOD Sales Report (Category, Item, Staff, Payment breakdown)
// @access  Private/Admin
router.get('/day-end', protect, admin, async (req, res) => {
    try {
        const { date } = req.query;
        let targetDate = date || getBusinessDate();
        const todayStr = getBusinessDate();
        const yesterdayStr = getBusinessDate(new Date(Date.now() - 86400000));

        if (req.user.role !== 'superadmin' && targetDate !== todayStr && targetDate !== yesterdayStr) {
            targetDate = todayStr;
        }
        const { start, end } = getBusinessDayRange(targetDate);

        const datedBills = await Bill.find({
            $or: [
                { businessDate: targetDate },
                { businessDate: { $in: ['', null] }, createdAt: { $gte: start, $lte: end } },
                { businessDate: { $exists: false }, createdAt: { $gte: start, $lte: end } }
            ]
        })
            .populate('order', 'orderNumber tableNumber status paymentMethod splitPaymentDetails tables')
            .populate('orders', 'orderNumber tableNumber status paymentMethod splitPaymentDetails tables');
        const bills = datedBills.filter(bill =>
            (bill.paymentMethod && bill.paymentMethod !== 'pending')
            || [...(bill.orders || []), bill.order].some(order => order?.status === 'paid')
        );

        const paidOrderIds = [...new Set(bills.flatMap(bill => [
            ...(bill.orders || []).map(order => order?._id?.toString()),
            bill.order?._id?.toString()
        ]).filter(Boolean))];
        const orders = await Order.find({ _id: { $in: paidOrderIds }, status: 'paid' })
            .populate('items.menuItem', 'name category price')
            .populate({ path: 'items.menuItem', populate: { path: 'category', select: 'name' } })
            .populate('placedBy', 'name');

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

        // Map every source order to its Bill for staff/item attribution.
        const billByOrderId = {};
        bills.forEach(bill => {
            [...(bill.orders || []), bill.order].filter(Boolean).forEach(orderRef => {
                billByOrderId[orderRef._id.toString()] = bill;
            });
        });

        // Monetary totals and payment methods are counted once per Bill, never once per linked order.
        bills.forEach(bill => {
            grossSales += bill.subtotal || 0;
            totalDiscount += bill.discount || 0;
            totalTax += bill.tax || 0;
            netRevenue += bill.total || 0;

            const linkedOrderMethod = [...(bill.orders || []), bill.order]
                .find(order => order?.paymentMethod && order.paymentMethod !== 'pending')?.paymentMethod;
            const method = (bill.paymentMethod && bill.paymentMethod !== 'pending')
                ? bill.paymentMethod
                : (linkedOrderMethod || 'pending');
            if (method === 'cash') paymentBreakdown.cash += bill.total || 0;
            else if (method === 'online' || method === 'upi') paymentBreakdown.online += bill.total || 0;
            else if (method === 'card') paymentBreakdown.card += bill.total || 0;
            else if (method === 'split') {
                paymentBreakdown.split += bill.total || 0;
                const billSplitTotal = (bill.splitPaymentDetails?.cash || 0)
                    + (bill.splitPaymentDetails?.upi || 0)
                    + (bill.splitPaymentDetails?.card || 0);
                const linkedSplit = [...(bill.orders || []), bill.order]
                    .find(order => order?.paymentMethod === 'split' && order.splitPaymentDetails)?.splitPaymentDetails;
                const splitSource = billSplitTotal > 0 ? bill.splitPaymentDetails : (linkedSplit || {});
                paymentBreakdown.splitDetails.cash += splitSource.cash || 0;
                paymentBreakdown.splitDetails.upi += splitSource.upi || 0;
                paymentBreakdown.splitDetails.card += splitSource.card || 0;
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

        // Attribute standalone/pre-booking Bills without adding their money a second time.
        bills.forEach(bill => {
            const hasLinkedOrder = Boolean(bill.order) || (bill.orders && bill.orders.length > 0);
            if (!hasLinkedOrder) {
                const staffName = bill.billerName || 'Pre-Booking';
                if (!staffMap[staffName]) {
                    staffMap[staffName] = { name: staffName, ordersCount: 0, totalSales: 0 };
                }
                staffMap[staffName].ordersCount += 1;
                staffMap[staffName].totalSales += bill.total || 0;

                if (!categoryMap['Pre-Bookings']) {
                    categoryMap['Pre-Bookings'] = { name: 'Pre-Bookings', itemsCount: 0, totalQty: 0, totalRevenue: 0 };
                }
                categoryMap['Pre-Bookings'].totalQty += 1;
                categoryMap['Pre-Bookings'].totalRevenue += bill.total || 0;
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
            paymentMethod: (b.paymentMethod && b.paymentMethod !== 'pending')
                ? b.paymentMethod
                : ([...(b.orders || []), b.order].find(order => order?.paymentMethod && order.paymentMethod !== 'pending')?.paymentMethod || 'cash'),
            orderNumbers: (b.orderNumbers && b.orderNumbers.length > 0)
                ? b.orderNumbers
                : [...(b.orders || []), b.order].filter(Boolean).map(order => order.orderNumber),
            tableNumbers: b.tableNumbers || [],
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
        let targetDate = date || getBusinessDate();
        const todayStr = getBusinessDate();
        const yesterdayStr = getBusinessDate(new Date(Date.now() - 86400000));

        if (req.user.role !== 'superadmin' && targetDate !== todayStr && targetDate !== yesterdayStr) {
            targetDate = todayStr;
        }
        const { start, end } = getBusinessDayRange(targetDate);

        const orders = await Order.find({
            status: 'paid',
            $or: [
                { settledAt: { $gte: start, $lte: end } },
                { settledAt: null, createdAt: { $gte: start, $lte: end } }
            ]
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
