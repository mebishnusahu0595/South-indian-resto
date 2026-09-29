import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend, AreaChart, Area } from 'recharts';
import { getDashboardStats, getRevenueData, getCategorySales, getTopItems, getUserAnalytics, updateSetting, getAllSettings, getDayEndReport, getSectionWiseReport, getItemWiseSales, getExpenses, createExpense, updateExpense, deleteExpense } from '../utils/api';
import { exportToCSV, downloadCSV, revenueExportColumns } from '../utils/exportUtils';
import { useAuth } from '../context/AuthContext';
import Loader from '../components/Loader';
import { FiUsers, FiUserPlus, FiActivity, FiRepeat, FiSettings, FiDownload, FiPrinter, FiFileText, FiGrid, FiLayers, FiCalendar, FiSearch, FiShoppingBag, FiFilter, FiX, FiDollarSign, FiPlus, FiTrash2, FiEdit2 } from 'react-icons/fi';
import './AdminAnalytics.css';

const COLORS = ['#C87316', '#E08A2E', '#22C55E', '#3B82F6', '#9333EA', '#EC4899'];

const BUSINESS_DAY_CUTOFF_HOURS = 3;
const BUSINESS_DAY_CUTOFF_MS = BUSINESS_DAY_CUTOFF_HOURS * 60 * 60 * 1000;

const getLocalDateString = (date = new Date()) => {
    const rawDate = date instanceof Date ? date : new Date(date);
    const adjustedDate = new Date(rawDate.getTime() - BUSINESS_DAY_CUTOFF_MS);
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(adjustedDate);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
};

const getRelativeBusinessDate = days => {
    const today = new Date(`${getLocalDateString()}T00:00:00+05:30`);
    return getLocalDateString(new Date(today.getTime() + days * 86400000));
};

const formatBusinessDate = (dateString, options) => {
    if (!dateString) return '';
    if (typeof dateString === 'string' && dateString.includes(' to ')) {
        return dateString;
    }
    try {
        return new Intl.DateTimeFormat('en-IN', {
            timeZone: 'Asia/Kolkata',
            ...options
        }).format(new Date(`${dateString}T00:00:00+05:30`));
    } catch (_) {
        return dateString;
    }
};

const AdminAnalytics = () => {
    const { user, socket } = useAuth();
    const [period, setPeriod] = useState('week');
    const [customStartDate, setCustomStartDate] = useState(getLocalDateString());
    const [customEndDate, setCustomEndDate] = useState(getLocalDateString());
    const [customRange, setCustomRange] = useState(null);
    const [stats, setStats] = useState(null);
    const [revenueData, setRevenueData] = useState([]);
    const [categorySales, setCategorySales] = useState([]);
    const [topItems, setTopItems] = useState([]);
    const [userStats, setUserStats] = useState(null);
    const [margin, setMargin] = useState(30);
    const [showMarginInput, setShowMarginInput] = useState(false);
    const [loading, setLoading] = useState(true);

    // Navigation Tabs state
    const [activeTab, setActiveTab] = useState('day-end'); // 'analytics' | 'item-sales' | 'day-end' | 'section-wise'

    // Day-End Report state
    const [reportDate, setReportDate] = useState(getLocalDateString());
    const [dayEndData, setDayEndData] = useState(null);

    // Section-Wise Report state (supports From-To range for superadmin)
    const [sectionPeriod, setSectionPeriod] = useState('today');
    const [sectionStartDate, setSectionStartDate] = useState(getLocalDateString());
    const [sectionEndDate, setSectionEndDate] = useState(getLocalDateString());
    const [sectionRange, setSectionRange] = useState(null);
    const [sectionData, setSectionData] = useState(null);

    // Item-Wise Sales state
    const [itemSalesPeriod, setItemSalesPeriod] = useState('month');
    const [itemSalesStartDate, setItemSalesStartDate] = useState(getLocalDateString());
    const [itemSalesEndDate, setItemSalesEndDate] = useState(getLocalDateString());
    const [itemSalesRange, setItemSalesRange] = useState(null);
    const [itemSearchQuery, setItemSearchQuery] = useState('');
    const [itemCategoryFilter, setItemCategoryFilter] = useState('All');
    const [itemSortBy, setItemSortBy] = useState('revenue');
    const [itemSortOrder, setItemSortOrder] = useState('desc');
    const [itemSalesData, setItemSalesData] = useState(null);
    const [fetchingItemSales, setFetchingItemSales] = useState(false);

    // Daily Expenses state
    const [expensesList, setExpensesList] = useState([]);
    const [totalPeriodExpenses, setTotalPeriodExpenses] = useState(0);
    const [expensesPeriod, setExpensesPeriod] = useState('today');
    const [expensesStartDate, setExpensesStartDate] = useState(getLocalDateString());
    const [expensesEndDate, setExpensesEndDate] = useState(getLocalDateString());
    const [expensesRange, setExpensesRange] = useState(null);
    const [expenseCategoryFilter, setExpenseCategoryFilter] = useState('All');
    const [fetchingExpenses, setFetchingExpenses] = useState(false);
    const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
    const [editingExpenseId, setEditingExpenseId] = useState(null);
    const [modalMode, setModalMode] = useState('single'); // 'single' | 'bulk'
    const [submittingExpense, setSubmittingExpense] = useState(false);
    const [expenseForm, setExpenseForm] = useState({
        title: '',
        amount: '',
        category: 'Kitchen Supplies',
        businessDate: getLocalDateString(),
        paymentMethod: 'cash',
        notes: ''
    });
    const [splitDetails, setSplitDetails] = useState({
        cash: '',
        upi: '',
        card: '',
        bank_transfer: '',
        other: ''
    });
    const [bulkExpenseRows, setBulkExpenseRows] = useState([
        { title: '', amount: '', category: 'Kitchen Supplies', paymentMethod: 'cash', notes: '' },
        { title: '', amount: '', category: 'Raw Materials / Grocery', paymentMethod: 'cash', notes: '' },
        { title: '', amount: '', category: 'Dairy & Beverages', paymentMethod: 'cash', notes: '' }
    ]);

    const [fetchingReport, setFetchingReport] = useState(false);

    const handlePrintReport = () => {
        document.documentElement.classList.add('printing-report');
        document.body.classList.add('printing-report');

        // Dynamically inject A4 print page styles only during report printing (never affects bills)
        let printStyle = document.getElementById('report-print-page-style');
        if (!printStyle) {
            printStyle = document.createElement('style');
            printStyle.id = 'report-print-page-style';
            printStyle.innerHTML = `
                @page {
                    size: A4 portrait !important;
                    margin: 8mm 10mm !important;
                }
            `;
            document.head.appendChild(printStyle);
        }

        setTimeout(() => {
            window.print();
        }, 50);
    };

    useEffect(() => {
        const cleanup = () => {
            document.documentElement.classList.remove('printing-report');
            document.body.classList.remove('printing-report');
            const printStyle = document.getElementById('report-print-page-style');
            if (printStyle) {
                printStyle.remove();
            }
        };
        window.addEventListener('afterprint', cleanup);
        return () => {
            window.removeEventListener('afterprint', cleanup);
            cleanup();
        };
    }, []);

    useEffect(() => {
        if (user && user.role === 'superadmin') {
            setActiveTab('analytics');
        } else {
            setActiveTab('day-end');
            fetchDayEndReport();
        }
        if (user && user.role === 'admin' && period !== 'month') {
            setPeriod('month');
        } else {
            fetchData();
        }
    }, [period, user, customRange]);

    const fetchDayEndReport = async (dateVal) => {
        setFetchingReport(true);
        try {
            const res = await getDayEndReport(dateVal || reportDate);
            setDayEndData(res.data);
        } catch (err) {
            console.error('Failed to fetch Day-End report:', err);
        } finally {
            setFetchingReport(false);
        }
    };

    const fetchSectionReport = async (overrideParams = {}) => {
        setFetchingReport(true);
        try {
            let params = {};
            if (overrideParams.startDate && overrideParams.endDate) {
                params = { startDate: overrideParams.startDate, endDate: overrideParams.endDate };
            } else if (typeof overrideParams === 'string') {
                params = { date: overrideParams };
            } else if (sectionPeriod === 'custom' && sectionRange) {
                params = { startDate: sectionRange.startDate, endDate: sectionRange.endDate };
            } else if (sectionPeriod === 'today') {
                params = { date: getLocalDateString() };
            } else if (sectionPeriod === 'yesterday') {
                params = { date: getRelativeBusinessDate(-1) };
            } else if (sectionPeriod === 'week') {
                params = { startDate: getRelativeBusinessDate(-6), endDate: getLocalDateString() };
            } else if (sectionPeriod === 'month') {
                const today = getLocalDateString();
                params = { startDate: `${today.slice(0, 7)}-01`, endDate: today };
            } else {
                params = { date: sectionStartDate };
            }

            const res = await getSectionWiseReport(params);
            setSectionData(res.data);
        } catch (err) {
            console.error('Failed to fetch Section-wise report:', err);
        } finally {
            setFetchingReport(false);
        }
    };

    const fetchItemSalesData = async (overrideParams = {}) => {
        setFetchingItemSales(true);
        try {
            const dateParams = itemSalesPeriod === 'custom' && itemSalesRange ? itemSalesRange : {};
            const res = await getItemWiseSales({
                period: itemSalesPeriod,
                ...dateParams,
                search: itemSearchQuery || undefined,
                category: itemCategoryFilter !== 'All' ? itemCategoryFilter : undefined,
                sortBy: itemSortBy,
                order: itemSortOrder,
                ...overrideParams
            });
            setItemSalesData(res.data);
        } catch (err) {
            console.error('Failed to fetch Item-wise sales report:', err);
        } finally {
            setFetchingItemSales(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'item-sales') {
            fetchItemSalesData();
        }
    }, [activeTab, itemSalesPeriod, itemSalesRange, itemCategoryFilter, itemSortBy, itemSortOrder]);

    useEffect(() => {
        if (activeTab === 'expenses') {
            fetchExpenses();
        }
    }, [activeTab, expensesPeriod, expensesRange, expenseCategoryFilter]);

    const handleApplyItemSalesSearch = (e) => {
        if (e) e.preventDefault();
        fetchItemSalesData();
    };

    const fetchExpenses = async (overrideParams = {}) => {
        setFetchingExpenses(true);
        try {
            let params = {};
            if (overrideParams.startDate && overrideParams.endDate) {
                params = { startDate: overrideParams.startDate, endDate: overrideParams.endDate };
            } else if (typeof overrideParams === 'string') {
                params = { date: overrideParams };
            } else if (expensesPeriod === 'custom' && expensesRange) {
                params = { startDate: expensesRange.startDate, endDate: expensesRange.endDate };
            } else if (expensesPeriod === 'today') {
                params = { date: getLocalDateString() };
            } else if (expensesPeriod === 'yesterday') {
                params = { date: getRelativeBusinessDate(-1) };
            } else if (expensesPeriod === 'week') {
                params = { startDate: getRelativeBusinessDate(-6), endDate: getLocalDateString() };
            } else if (expensesPeriod === 'month') {
                const today = getLocalDateString();
                params = { startDate: `${today.slice(0, 7)}-01`, endDate: today };
            }

            if (expenseCategoryFilter && expenseCategoryFilter !== 'All') {
                params.category = expenseCategoryFilter;
            }

            const res = await getExpenses({ ...params, ...overrideParams });
            setExpensesList(res.data?.expenses || []);
        } catch (err) {
            console.error('Failed to fetch expenses:', err);
        } finally {
            setFetchingExpenses(false);
        }
    };

    const openAddExpenseModal = (dateVal) => {
        setEditingExpenseId(null);
        setModalMode('single');
        setExpenseForm({
            title: '',
            amount: '',
            category: 'Kitchen Supplies',
            businessDate: dateVal || reportDate || getLocalDateString(),
            paymentMethod: 'cash',
            notes: ''
        });
        setSplitDetails({
            cash: '',
            upi: '',
            card: '',
            bank_transfer: '',
            other: ''
        });
        setBulkExpenseRows([
            { title: '', amount: '', category: 'Kitchen Supplies', paymentMethod: 'cash', notes: '' },
            { title: '', amount: '', category: 'Raw Materials / Grocery', paymentMethod: 'cash', notes: '' },
            { title: '', amount: '', category: 'Dairy & Beverages', paymentMethod: 'cash', notes: '' }
        ]);
        setShowAddExpenseModal(true);
    };

    const openEditExpenseModal = (exp) => {
        setEditingExpenseId(exp._id);
        setModalMode('single');
        setExpenseForm({
            title: exp.title || '',
            amount: exp.amount !== undefined ? exp.amount.toString() : '',
            category: exp.category || 'Kitchen Supplies',
            businessDate: exp.businessDate || getLocalDateString(),
            paymentMethod: exp.paymentMethod || 'cash',
            notes: exp.notes || ''
        });
        setSplitDetails({
            cash: exp.splitPayments?.cash ? exp.splitPayments.cash.toString() : '',
            upi: exp.splitPayments?.upi ? exp.splitPayments.upi.toString() : '',
            card: exp.splitPayments?.card ? exp.splitPayments.card.toString() : '',
            bank_transfer: exp.splitPayments?.bank_transfer ? exp.splitPayments.bank_transfer.toString() : '',
            other: exp.splitPayments?.other ? exp.splitPayments.other.toString() : ''
        });
        setShowAddExpenseModal(true);
    };

    const handleSaveExpense = async (e) => {
        if (e) e.preventDefault();

        // 1. Bulk Mode (Multiple Expenses)
        if (modalMode === 'bulk' && !editingExpenseId) {
            const validRows = bulkExpenseRows.filter(r => r.title && r.title.trim() && parseFloat(r.amount) > 0);
            if (validRows.length === 0) {
                alert('Please enter at least one valid expense row with a title and amount (> 0).');
                return;
            }

            setSubmittingExpense(true);
            try {
                const payload = validRows.map(r => ({
                    title: r.title.trim(),
                    amount: parseFloat(r.amount),
                    category: r.category || 'Kitchen Supplies',
                    paymentMethod: r.paymentMethod || 'cash',
                    businessDate: expenseForm.businessDate,
                    notes: (r.notes && r.notes.trim()) || ''
                }));

                await createExpense({ expenses: payload, businessDate: expenseForm.businessDate });
                setShowAddExpenseModal(false);
                fetchDayEndReport(reportDate);
                fetchExpenses();
                fetchData();
            } catch (err) {
                console.error('Failed to create multiple expenses:', err);
                alert(err.response?.data?.message || 'Failed to save multiple expenses');
            } finally {
                setSubmittingExpense(false);
            }
            return;
        }

        // 2. Single Expense Mode (Create or Edit)
        if (!expenseForm.title || !expenseForm.title.trim()) {
            alert('Please enter an expense title/description.');
            return;
        }
        const amt = parseFloat(expenseForm.amount);
        if (isNaN(amt) || amt <= 0) {
            alert('Please enter a valid amount in Rupees (> 0).');
            return;
        }

        // Prepare split payments if paymentMethod === 'split'
        let splitPayload = {};
        if (expenseForm.paymentMethod === 'split') {
            const cashPart = parseFloat(splitDetails.cash) || 0;
            const upiPart = parseFloat(splitDetails.upi) || 0;
            const cardPart = parseFloat(splitDetails.card) || 0;
            const bankPart = parseFloat(splitDetails.bank_transfer) || 0;
            const otherPart = parseFloat(splitDetails.other) || 0;
            const splitSum = cashPart + upiPart + cardPart + bankPart + otherPart;

            if (splitSum > 0 && Math.abs(splitSum - amt) > 0.5) {
                if (!window.confirm(`Notice: Split amounts sum to ₹${splitSum.toFixed(2)}, but total expense is ₹${amt.toFixed(2)}. Do you want to proceed anyway?`)) {
                    return;
                }
            }
            splitPayload = {
                cash: cashPart,
                upi: upiPart,
                card: cardPart,
                bank_transfer: bankPart,
                other: otherPart
            };
        }

        setSubmittingExpense(true);
        try {
            const payload = {
                ...expenseForm,
                title: expenseForm.title.trim(),
                amount: amt,
                splitPayments: expenseForm.paymentMethod === 'split' ? splitPayload : undefined
            };

            if (editingExpenseId) {
                await updateExpense(editingExpenseId, payload);
            } else {
                await createExpense(payload);
            }

            setShowAddExpenseModal(false);
            setEditingExpenseId(null);
            fetchDayEndReport(reportDate);
            fetchExpenses();
            fetchData();
        } catch (err) {
            console.error('Failed to save expense:', err);
            alert(err.response?.data?.message || 'Failed to save expense');
        } finally {
            setSubmittingExpense(false);
        }
    };

    const handleDeleteExpense = async (expenseId) => {
        if (!window.confirm('Are you sure you want to delete this expense record?')) {
            return;
        }
        try {
            await deleteExpense(expenseId);
            fetchDayEndReport(reportDate);
            fetchExpenses();
            fetchData();
        } catch (err) {
            console.error('Failed to delete expense:', err);
            alert(err.response?.data?.message || 'Failed to delete expense');
        }
    };

    const renderPaymentMethodBadge = (exp) => {
        if (!exp) return '💵 Cash';
        if (exp.paymentMethod === 'split' && exp.splitPayments) {
            const parts = [];
            if (exp.splitPayments.cash > 0) parts.push(`Cash: ₹${exp.splitPayments.cash}`);
            if (exp.splitPayments.upi > 0) parts.push(`UPI: ₹${exp.splitPayments.upi}`);
            if (exp.splitPayments.card > 0) parts.push(`Card: ₹${exp.splitPayments.card}`);
            if (exp.splitPayments.bank_transfer > 0) parts.push(`Bank: ₹${exp.splitPayments.bank_transfer}`);
            if (exp.splitPayments.other > 0) parts.push(`Other: ₹${exp.splitPayments.other}`);
            return (
                <div>
                    <span style={{ fontWeight: 'bold', color: '#7C3AED' }}>🔀 Split</span>
                    <div style={{ fontSize: '0.74rem', color: '#555', marginTop: '2px' }}>
                        {parts.length > 0 ? parts.join(' | ') : 'Multi-Method'}
                    </div>
                </div>
            );
        }
        const labels = {
            cash: '💵 Cash',
            upi: '📱 UPI',
            online: '📱 Online / UPI',
            card: '💳 Card',
            bank_transfer: '🏦 Bank Transfer',
            split: '🔀 Split',
            cheque: '📜 Cheque',
            other: 'Other'
        };
        return labels[exp.paymentMethod] || (exp.paymentMethod ? exp.paymentMethod.toUpperCase() : 'Cash');
    };

    const handleDownloadDayEndReport = (dayEndData) => {
        if (!dayEndData) return;
        const dateStr = dayEndData.date || getLocalDateString();
        const totalExp = dayEndData.summary?.totalExpenses || 0;
        const netProf = dayEndData.summary?.netProfit !== undefined ? dayEndData.summary.netProfit : ((dayEndData.summary?.netRevenue || 0) - totalExp);

        let csv = `KEA BY THE POOL - DAY-END (EOD) SALES REPORT\n`;
        csv += `Date,${dateStr}\n\n`;
        
        csv += `SUMMARY\n`;
        csv += `Total Orders,Gross Sales (Rs.),Discounts (Rs.),Taxes GST (Rs.),Net Revenue (Rs.),Total Expenses (Rs.),Realized Net Profit (Rs.)\n`;
        csv += `${dayEndData.summary?.totalOrders || 0},${(dayEndData.summary?.grossSales || 0).toFixed(2)},${(dayEndData.summary?.totalDiscount || 0).toFixed(2)},${(dayEndData.summary?.totalTax || 0).toFixed(2)},${(dayEndData.summary?.netRevenue || 0).toFixed(2)},${totalExp.toFixed(2)},${netProf.toFixed(2)}\n\n`;

        csv += `PAYMENT METHOD BREAKDOWN\n`;
        csv += `Payment Method,Total Amount (Rs.)\n`;
        csv += `Cash Paid,${(dayEndData.paymentBreakdown?.cash || 0).toFixed(2)}\n`;
        csv += `UPI / Online Paid,${(dayEndData.paymentBreakdown?.online || 0).toFixed(2)}\n`;
        csv += `Card Paid,${(dayEndData.paymentBreakdown?.card || 0).toFixed(2)}\n`;
        csv += `Split Payment Total,${(dayEndData.paymentBreakdown?.split || 0).toFixed(2)}\n`;
        csv += `  - Split Cash,${(dayEndData.paymentBreakdown?.splitDetails?.cash || 0).toFixed(2)}\n`;
        csv += `  - Split UPI,${(dayEndData.paymentBreakdown?.splitDetails?.upi || 0).toFixed(2)}\n`;
        csv += `  - Split Card,${(dayEndData.paymentBreakdown?.splitDetails?.card || 0).toFixed(2)}\n`;
        csv += `TOTAL COLLECTED,${(dayEndData.summary?.netRevenue || 0).toFixed(2)}\n\n`;

        if (dayEndData.expenses && dayEndData.expenses.length > 0) {
            csv += `DAILY EXPENSES BREAKDOWN\n`;
            csv += `Title / Description,Category,Payment Method,Added By,Amount (Rs.),Notes\n`;
            dayEndData.expenses.forEach(exp => {
                csv += `"${exp.title}","${exp.category || 'General'}","${exp.paymentMethod || 'cash'}","${exp.addedByName || ''}",${(exp.amount || 0).toFixed(2)},"${exp.notes || ''}"\n`;
            });
            csv += `TOTAL EXPENSES,,,,${totalExp.toFixed(2)},\n`;
            csv += `REALIZED NET PROFIT,,,,${netProf.toFixed(2)},\n\n`;
        }

        csv += `CATEGORY-WISE SALES SUMMARY\n`;
        csv += `Category Name,Total Qty Sold,Total Revenue (Rs.)\n`;
        (dayEndData.categorySales || []).forEach(cat => {
            csv += `"${cat.name}",${cat.totalQty},${cat.totalRevenue.toFixed(2)}\n`;
        });
        csv += `\n`;

        csv += `DETAILED BILLS RECORD\n`;
        csv += `Bill No,Time,Order No,Table,Biller,Status,Subtotal,Discount,Tax,Total\n`;
        (dayEndData.bills || []).forEach(b => {
            const time = new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const ordNo = b.orderNumbers?.length
                ? `#${b.orderNumbers.join(' / ')}`
                : (b.order?.orderNumber ? `#${b.order.orderNumber}` : '-');
            const tbl = b.tableNumbers?.length
                ? b.tableNumbers.join(', ')
                : (b.order?.tableNumber || 'Takeaway');
            const status = b.paymentMethod && b.paymentMethod !== 'pending' ? 'paid' : (b.order?.status || 'pending');
            csv += `"${b.billNumber}",${time},"${ordNo}","${tbl}","${b.billerName || ''}",${status},${(b.subtotal || 0).toFixed(2)},${(b.discount || 0).toFixed(2)},${(b.tax || 0).toFixed(2)},${(b.total || 0).toFixed(2)}\n`;
        });

        downloadCSV(csv, `Day_End_Report_${dateStr}`, { saleReportFolder: true });
    };

    const handleDownloadSectionReport = (sectionData) => {
        if (!sectionData || !sectionData.sections) return;
        const dateStr = sectionData.date || getLocalDateString();

        let csv = `KEA BY THE POOL - SECTION & TABLE SETTLEMENT SALES REPORT\n`;
        csv += `Date Range / Date,${dateStr}\n\n`;

        csv += `SECTION SUMMARY\n`;
        csv += `Section Name,Total Orders,Total Sales (Rs.)\n`;
        (sectionData.sections || []).forEach(sec => {
            csv += `"${sec.sectionName}",${sec.totalOrders},${(sec.totalRevenue || 0).toFixed(2)}\n`;
        });
        csv += `\n`;

        csv += `TABLE-WISE SETTLEMENT BREAKDOWN\n`;
        csv += `Section,Table Name / No,Total Orders,Total Sales (Rs.)\n`;
        (sectionData.sections || []).forEach(sec => {
            (sec.tableBreakdown || []).forEach(tbl => {
                const tblName = typeof tbl.tableNumber === 'string' && tbl.tableNumber.startsWith('Table') ? tbl.tableNumber : `Table ${tbl.tableNumber}`;
                csv += `"${sec.sectionName}","${tblName}",${tbl.ordersCount},${(tbl.totalRevenue || 0).toFixed(2)}\n`;
            });
        });
        csv += `\n`;

        csv += `SECTION ITEM SALES BREAKDOWN\n`;
        csv += `Section,Item Name,Qty Sold,Total Sales (Rs.)\n`;
        (sectionData.sections || []).forEach(sec => {
            (sec.topItems || []).forEach(item => {
                csv += `"${sec.sectionName}","${item.name}",${item.qtySold},${(item.totalRevenue || 0).toFixed(2)}\n`;
            });
        });

        downloadCSV(csv, `Table_Section_Settlement_Report_${String(dateStr).replace(/[^a-zA-Z0-9]/g, '_')}`, { saleReportFolder: true });
    };

    const handleDownloadItemSalesReport = (data) => {
        if (!data || !data.items) return;
        const periodStr = itemSalesPeriod === 'custom' && itemSalesRange
            ? `${itemSalesRange.startDate}_to_${itemSalesRange.endDate}`
            : itemSalesPeriod;

        let csv = `KEA BY THE POOL - ITEM-WISE SALES REPORT\n`;
        csv += `Period,${periodStr}\n\n`;

        csv += `SUMMARY\n`;
        csv += `Total Distinct Items,Total Units Sold,Total Orders,Total Revenue (Rs.)\n`;
        csv += `${data.totalItems || 0},${data.totalQty || 0},${data.totalOrders || 0},${(data.totalAmount || 0).toFixed(2)}\n\n`;

        csv += `ITEM SALES BREAKDOWN\n`;
        csv += `Rank,Item Name,Category,Avg Unit Price (Rs.),Quantity Sold,Orders Count,Total Revenue (Rs.),Sales Share (%)\n`;
        const grandTotal = data.totalAmount || 1;
        (data.items || []).forEach((item, idx) => {
            const share = ((item.totalRevenue / grandTotal) * 100).toFixed(1);
            csv += `${idx + 1},"${item.name}","${item.category}",${(item.unitPrice || 0).toFixed(2)},${item.totalQuantity},${item.ordersCount || 0},${(item.totalRevenue || 0).toFixed(2)},${share}%\n`;
        });

        downloadCSV(csv, `Item_Wise_Sales_Report_${periodStr}`, { saleReportFolder: true });
    };

    useEffect(() => {
        if (!socket) return undefined;
        const handleOrderUpdate = () => fetchData();
        socket.on('order-updated', handleOrderUpdate);
        return () => socket.off('order-updated', handleOrderUpdate);
    }, [socket, period, customRange]);

    const fetchData = async () => {
        try {
            const dateParams = period === 'custom' && customRange ? customRange : {};
            const [statsRes, revenueRes, catRes, topRes, userRes, settingsRes, expensesRes] = await Promise.all([
                getDashboardStats(),
                getRevenueData(period, dateParams),
                getCategorySales(period, dateParams),
                getTopItems({ period, ...dateParams }),
                getUserAnalytics(period, dateParams),
                getAllSettings(),
                getExpenses({ period, ...dateParams }).catch(() => ({ data: { totalExpenses: 0, expenses: [] } }))
            ]);
            setStats(statsRes.data);
            setRevenueData(revenueRes.data.map(d => ({
                ...d,
                date: formatBusinessDate(d._id, { day: 'numeric', month: 'short' })
            })));
            setCategorySales(catRes.data);
            setTopItems(topRes.data);
            setUserStats(userRes.data);
            setTotalPeriodExpenses(expensesRes?.data?.totalExpenses || 0);

            const settingsArr = Array.isArray(settingsRes.data) ? settingsRes.data : (Array.isArray(settingsRes.data?.data) ? settingsRes.data.data : []);
            const marginSetting = settingsArr.find(s => s.key === 'profit_margin');
            if (marginSetting) setMargin(marginSetting.value);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateMargin = async () => {
        try {
            await updateSetting('profit_margin', margin);
            setShowMarginInput(false);
            fetchData();
        } catch (error) {
            console.error('Error updating margin:', error);
        }
    };

    const handlePeriodSelect = selectedPeriod => {
        setCustomRange(null);
        setPeriod(selectedPeriod);
    };

    const handleApplyCustomRange = () => {
        if (!customStartDate || !customEndDate) {
            alert('Please select both From and To dates.');
            return;
        }
        if (customStartDate > customEndDate) {
            alert('From date cannot be after To date.');
            return;
        }
        setCustomRange({ startDate: customStartDate, endDate: customEndDate });
        setPeriod('custom');
    };

    const periodLabel = period === 'custom' && customRange
        ? `${customRange.startDate} to ${customRange.endDate}`
        : period.charAt(0).toUpperCase() + period.slice(1);

    const handleExportRevenue = () => {
        const rangeName = period === 'custom' && customRange
            ? `${customRange.startDate}_to_${customRange.endDate}`
            : period;
        const filename = `revenue_${rangeName}_${getLocalDateString()}`;
        exportToCSV(revenueData, revenueExportColumns, filename, { saleReportFolder: true });
    };

    if (loading && (!stats || Object.keys(stats).length === 0)) return <Loader message="Crunching the numbers..." />;

    const totalRevenue = revenueData.reduce((sum, d) => sum + d.revenue, 0);
    const totalProfit = revenueData.reduce((sum, d) => sum + d.profit, 0);
    const totalOrders = revenueData.reduce((sum, d) => sum + d.orders, 0);

    return (
        <div className="admin-analytics">
            <div className="page-header">
                <h1>Analytics & Reports</h1>
                <div className="header-actions">
                    <button className="btn btn-secondary export-btn" onClick={handleExportRevenue}>
                        <FiDownload /> Export CSV
                    </button>
                    {user && user.role === 'superadmin' ? (
                        <div className="analytics-filter-controls">
                            <div className="period-selector">
                                {['today', 'yesterday', 'week', 'month', 'year'].map(p => (
                                    <button
                                        key={p}
                                        className={`period-btn ${period === p ? 'active' : ''}`}
                                        onClick={() => handlePeriodSelect(p)}
                                    >
                                        {p.charAt(0).toUpperCase() + p.slice(1)}
                                    </button>
                                ))}
                            </div>
                            <div className={`custom-date-filter ${period === 'custom' ? 'active' : ''}`}>
                                <FiCalendar />
                                <label>
                                    From
                                    <input
                                        type="date"
                                        value={customStartDate}
                                        max={getLocalDateString()}
                                        onChange={event => setCustomStartDate(event.target.value)}
                                    />
                                </label>
                                <label>
                                    To
                                    <input
                                        type="date"
                                        value={customEndDate}
                                        min={customStartDate}
                                        max={getLocalDateString()}
                                        onChange={event => setCustomEndDate(event.target.value)}
                                    />
                                </label>
                                <button type="button" className="period-btn custom-apply-btn" onClick={handleApplyCustomRange}>
                                    Apply Date
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="period-restricted-label" style={{ background: '#FFFFFF', color: '#000000', border: '2.5px solid #111111', padding: '8px 14px', borderRadius: '8px', fontSize: '0.92rem', fontWeight: 'bold', boxShadow: '3px 3px 0px #111111' }}>
                            📅 Current Month (1st to Present)
                        </div>
                    )}
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="analytics-tabs" style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
                {user?.role === 'superadmin' && (
                    <button
                        className={`btn ${activeTab === 'analytics' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setActiveTab('analytics')}
                    >
                        <FiActivity /> Overview Analytics
                    </button>
                )}
                <button
                    className={`btn ${activeTab === 'item-sales' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => {
                        setActiveTab('item-sales');
                        fetchItemSalesData();
                    }}
                >
                    <FiShoppingBag /> Item-Wise Sales
                </button>
                <button
                    className={`btn ${activeTab === 'day-end' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => {
                        setActiveTab('day-end');
                        fetchDayEndReport();
                    }}
                >
                    <FiFileText /> Day-End (EOD) Report
                </button>
                <button
                    className={`btn ${activeTab === 'section-wise' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => {
                        setActiveTab('section-wise');
                        fetchSectionReport();
                    }}
                >
                    <FiLayers /> Section & Table Sales
                </button>
                <button
                    className={`btn ${activeTab === 'expenses' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => {
                        setActiveTab('expenses');
                        fetchExpenses();
                    }}
                >
                    <FiDollarSign /> Daily Expenses
                </button>
            </div>

            {/* ITEM-WISE SALES TAB */}
            {activeTab === 'item-sales' && (
                <div className="item-sales-view">
                    {/* Header & Date / Period Filters */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            {user?.role === 'superadmin' ? (
                                <div className="analytics-filter-controls" style={{ justifyContent: 'flex-start' }}>
                                    <div className="period-selector">
                                        {['today', 'yesterday', 'week', 'month', 'year'].map(p => (
                                            <button
                                                key={p}
                                                className={`period-btn ${itemSalesPeriod === p ? 'active' : ''}`}
                                                onClick={() => {
                                                    setItemSalesRange(null);
                                                    setItemSalesPeriod(p);
                                                }}
                                            >
                                                {p.charAt(0).toUpperCase() + p.slice(1)}
                                            </button>
                                        ))}
                                    </div>
                                    <div className={`custom-date-filter ${itemSalesPeriod === 'custom' ? 'active' : ''}`}>
                                        <FiCalendar />
                                        <label>
                                            From
                                            <input
                                                type="date"
                                                value={itemSalesStartDate}
                                                max={getLocalDateString()}
                                                onChange={e => setItemSalesStartDate(e.target.value)}
                                            />
                                        </label>
                                        <label>
                                            To
                                            <input
                                                type="date"
                                                value={itemSalesEndDate}
                                                min={itemSalesStartDate}
                                                max={getLocalDateString()}
                                                onChange={e => setItemSalesEndDate(e.target.value)}
                                            />
                                        </label>
                                        <button
                                            type="button"
                                            className="period-btn custom-apply-btn"
                                            onClick={() => {
                                                if (!itemSalesStartDate || !itemSalesEndDate) {
                                                    alert('Please select both From and To dates.');
                                                    return;
                                                }
                                                if (itemSalesStartDate > itemSalesEndDate) {
                                                    alert('From date cannot be after To date.');
                                                    return;
                                                }
                                                setItemSalesRange({ startDate: itemSalesStartDate, endDate: itemSalesEndDate });
                                                setItemSalesPeriod('custom');
                                            }}
                                        >
                                            Apply Range
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <button
                                        className={`btn ${itemSalesPeriod === 'today' ? 'btn-primary' : 'btn-secondary'}`}
                                        onClick={() => {
                                            setItemSalesRange(null);
                                            setItemSalesPeriod('today');
                                        }}
                                    >
                                        Today
                                    </button>
                                    <button
                                        className={`btn ${itemSalesPeriod === 'yesterday' ? 'btn-primary' : 'btn-secondary'}`}
                                        onClick={() => {
                                            setItemSalesRange(null);
                                            setItemSalesPeriod('yesterday');
                                        }}
                                    >
                                        Yesterday
                                    </button>
                                    <button
                                        className={`btn ${itemSalesPeriod === 'month' ? 'btn-primary' : 'btn-secondary'}`}
                                        onClick={() => {
                                            setItemSalesRange(null);
                                            setItemSalesPeriod('month');
                                        }}
                                    >
                                        This Month
                                    </button>
                                </div>
                            )}
                        </div>

                        {itemSalesData && (
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="btn btn-secondary" onClick={() => handleDownloadItemSalesReport(itemSalesData)} style={{ fontWeight: 'bold' }}>
                                    <FiDownload /> Export CSV
                                </button>
                                <button className="btn btn-primary" onClick={handlePrintReport}>
                                    <FiPrinter /> Print PDF
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Search & Category Filter Bar */}
                    <div style={{ background: '#FFFFFF', padding: '16px 20px', borderRadius: '12px', border: '2px solid #111111', boxShadow: '3px 3px 0px #111111', marginBottom: '24px', display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <form onSubmit={handleApplyItemSalesSearch} style={{ display: 'flex', flex: 1, minWidth: '280px', gap: '8px' }}>
                            <div className="item-sales-search-box">
                                <FiSearch style={{ color: '#6B7280', fontSize: '1.2rem' }} />
                                <input
                                    type="text"
                                    placeholder="Search dish / item by name (e.g. Paneer, Pizza, Coffee, Biryani...)"
                                    value={itemSearchQuery}
                                    onChange={(e) => {
                                        setItemSearchQuery(e.target.value);
                                    }}
                                />
                                {itemSearchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setItemSearchQuery('');
                                            fetchItemSalesData({ search: undefined });
                                        }}
                                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#6B7280', display: 'flex' }}
                                    >
                                        <FiX />
                                    </button>
                                )}
                            </div>
                            <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', fontWeight: 'bold' }}>
                                Search
                            </button>
                        </form>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <label style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#374151' }}>Category:</label>
                            <select
                                className="item-sales-filter-select"
                                value={itemCategoryFilter}
                                onChange={(e) => setItemCategoryFilter(e.target.value)}
                            >
                                <option value="All">All Categories ({itemSalesData?.categories?.length || 0})</option>
                                {(itemSalesData?.categories || []).map((cat, idx) => (
                                    <option key={idx} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <label style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#374151' }}>Sort By:</label>
                            <select
                                className="item-sales-filter-select"
                                value={itemSortBy}
                                onChange={(e) => setItemSortBy(e.target.value)}
                            >
                                <option value="revenue">Highest Sales (₹)</option>
                                <option value="quantity">Highest Quantity Sold</option>
                                <option value="orders">Most Ordered</option>
                                <option value="name">Item Name (A - Z)</option>
                            </select>
                        </div>
                    </div>

                    {/* Summary KPI Cards */}
                    {itemSalesData && (
                        <div className="summary-grid" style={{ marginBottom: '24px' }}>
                            <div className="summary-card revenue" style={{ border: '2px solid #111', boxShadow: '3px 3px 0px #111' }}>
                                <h3>Total Sales Revenue</h3>
                                <p className="value" style={{ color: '#059669' }}>₹{(itemSalesData.totalAmount || 0).toFixed(2)}</p>
                                <span className="label">
                                    {itemSalesPeriod === 'custom' && itemSalesRange
                                        ? `${itemSalesRange.startDate} to ${itemSalesRange.endDate}`
                                        : itemSalesPeriod.toUpperCase()}
                                </span>
                            </div>
                            <div className="summary-card orders" style={{ border: '2px solid #111', boxShadow: '3px 3px 0px #111' }}>
                                <h3>Total Units Sold (Qty)</h3>
                                <p className="value" style={{ color: '#2563EB' }}>{itemSalesData.totalQty || 0}</p>
                                <span className="label">Cumulative Quantity Sold</span>
                            </div>
                            <div className="summary-card avg" style={{ border: '2px solid #111', boxShadow: '3px 3px 0px #111' }}>
                                <h3>Distinct Items Sold</h3>
                                <p className="value" style={{ color: '#7C3AED' }}>{itemSalesData.totalItems || 0}</p>
                                <span className="label">{itemCategoryFilter !== 'All' ? `In ${itemCategoryFilter}` : 'Across all categories'}</span>
                            </div>
                            <div className="summary-card profit" style={{ border: '2px solid #111', boxShadow: '3px 3px 0px #111' }}>
                                <h3>Avg Revenue / Item</h3>
                                <p className="value" style={{ color: '#D97706' }}>
                                    ₹{itemSalesData.totalItems ? ((itemSalesData.totalAmount || 0) / itemSalesData.totalItems).toFixed(2) : '0.00'}
                                </p>
                                <span className="label">Per menu item</span>
                            </div>
                        </div>
                    )}

                    {/* Report Table / Printable Area */}
                    {fetchingItemSales ? (
                        <Loader message="Calculating item-wise sales metrics..." />
                    ) : itemSalesData ? (
                        <div className="report-printable-area" style={{ background: '#FFF', padding: '24px', borderRadius: '12px', border: '2px solid #111', boxShadow: '4px 4px 0px #111' }}>
                            <div style={{ textAlign: 'center', borderBottom: '2px solid #111', paddingBottom: '16px', marginBottom: '20px' }}>
                                <h1 style={{ margin: '0 0 4px', fontSize: '1.8rem', textTransform: 'uppercase' }}>Kea By The Pool</h1>
                                <h3 style={{ margin: '0 0 4px', color: '#C87316' }}>ITEM-WISE SALES & QUANTITY REPORT</h3>
                                <p style={{ margin: 0, fontSize: '0.9rem', color: '#555' }}>
                                    Period: <strong>{itemSalesPeriod === 'custom' && itemSalesRange ? `${itemSalesRange.startDate} to ${itemSalesRange.endDate}` : itemSalesPeriod.toUpperCase()}</strong> (Shift: 3:00 AM – 3:00 AM IST) | Generated: {new Date().toLocaleTimeString()}
                                </p>
                                {itemSearchQuery && (
                                    <p style={{ margin: '6px 0 0', fontSize: '0.88rem', color: '#2563EB', fontWeight: 'bold' }}>
                                        🔍 Filtered by search: "{itemSearchQuery}" ({itemSalesData.items.length} items matched)
                                    </p>
                                )}
                            </div>

                            {itemSalesData.items.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '50px 20px', color: '#666' }}>
                                    <FiShoppingBag style={{ fontSize: '3rem', color: '#D1D5DB', marginBottom: '12px' }} />
                                    <p style={{ fontSize: '1.1rem', margin: 0, fontWeight: 'bold' }}>No items found for this selection.</p>
                                    <p style={{ fontSize: '0.9rem', color: '#9CA3AF' }}>Try choosing another date range or clearing the search filter.</p>
                                </div>
                            ) : (
                                <div className="table-container">
                                    <table className="item-sales-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ textAlign: 'center', width: '60px' }}>#</th>
                                                <th>Item Name</th>
                                                <th>Category</th>
                                                <th style={{ textAlign: 'right' }}>Avg Price</th>
                                                <th style={{ textAlign: 'center' }}>Quantity Sold</th>
                                                <th style={{ textAlign: 'center' }}>Orders Count</th>
                                                <th style={{ textAlign: 'right' }}>Total Revenue (₹)</th>
                                                <th style={{ textAlign: 'right', width: '120px' }}>Sales Share</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {itemSalesData.items.map((item, idx) => {
                                                const grandTotal = itemSalesData.totalAmount || 1;
                                                const sharePercent = ((item.totalRevenue / grandTotal) * 100).toFixed(1);
                                                return (
                                                    <tr key={idx}>
                                                        <td style={{ textAlign: 'center' }}>
                                                            <span className={`item-rank-badge ${idx === 0 ? 'top-1' : idx === 1 ? 'top-2' : idx === 2 ? 'top-3' : ''}`}>
                                                                {idx + 1}
                                                            </span>
                                                        </td>
                                                        <td style={{ fontWeight: '600', color: '#111827', fontSize: '0.95rem' }}>
                                                            {item.name}
                                                        </td>
                                                        <td>
                                                            <span style={{ background: '#F3F4F6', padding: '3px 8px', borderRadius: '4px', fontSize: '0.8rem', color: '#4B5563', fontWeight: '500' }}>
                                                                {item.category}
                                                            </span>
                                                        </td>
                                                        <td style={{ textAlign: 'right', color: '#4B5563' }}>
                                                            ₹{(item.unitPrice || 0).toFixed(2)}
                                                        </td>
                                                        <td style={{ textAlign: 'center', fontWeight: '700', fontSize: '1rem', color: '#2563EB' }}>
                                                            {item.totalQuantity}
                                                        </td>
                                                        <td style={{ textAlign: 'center', color: '#6B7280' }}>
                                                            {item.ordersCount}
                                                        </td>
                                                        <td style={{ textAlign: 'right', fontWeight: '700', fontSize: '1rem', color: '#059669' }}>
                                                            ₹{(item.totalRevenue || 0).toFixed(2)}
                                                        </td>
                                                        <td style={{ textAlign: 'right' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                                                                <span style={{ fontSize: '0.82rem', fontWeight: '600', color: '#4B5563' }}>{sharePercent}%</span>
                                                                <div style={{ width: '40px', height: '6px', background: '#E5E7EB', borderRadius: '3px', overflow: 'hidden' }}>
                                                                    <div style={{ width: `${Math.min(Number(sharePercent) * 2, 100)}%`, height: '100%', background: '#C87316' }}></div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot>
                                            <tr style={{ background: '#F9FAFB', fontWeight: 'bold', borderTop: '2px solid #111' }}>
                                                <td colSpan={4} style={{ padding: '12px', textAlign: 'right', fontSize: '0.95rem' }}>TOTAL:</td>
                                                <td style={{ padding: '12px', textAlign: 'center', fontSize: '1.05rem', color: '#2563EB' }}>{itemSalesData.totalQty}</td>
                                                <td style={{ padding: '12px', textAlign: 'center', color: '#6B7280' }}>{itemSalesData.totalOrders}</td>
                                                <td style={{ padding: '12px', textAlign: 'right', fontSize: '1.1rem', color: '#059669' }}>₹{(itemSalesData.totalAmount || 0).toFixed(2)}</td>
                                                <td style={{ padding: '12px', textAlign: 'right' }}>100%</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>
            )}

            {/* DAY-END REPORT TAB */}
            {activeTab === 'day-end' && (
                <div className="day-end-report-view">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {user?.role === 'superadmin' ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <label style={{ fontWeight: 'bold' }}>Select Date:</label>
                                    <input
                                        type="date"
                                        value={reportDate}
                                        onChange={(e) => {
                                            setReportDate(e.target.value);
                                            fetchDayEndReport(e.target.value);
                                        }}
                                        className="input"
                                        style={{ padding: '8px 12px', borderRadius: '6px', border: '2px solid #111' }}
                                    />
                                    <button className="btn btn-secondary" onClick={() => fetchDayEndReport()}>Refresh</button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <label style={{ fontWeight: 'bold' }}>Date:</label>
                                    <button
                                        className={`btn ${reportDate === getLocalDateString() ? 'btn-primary' : 'btn-secondary'}`}
                                        onClick={() => {
                                            const t = getLocalDateString();
                                            setReportDate(t);
                                            fetchDayEndReport(t);
                                        }}
                                    >
                                        Today
                                    </button>
                                    <button
                                        className={`btn ${reportDate === getRelativeBusinessDate(-1) ? 'btn-primary' : 'btn-secondary'}`}
                                        onClick={() => {
                                            const y = getRelativeBusinessDate(-1);
                                            setReportDate(y);
                                            fetchDayEndReport(y);
                                        }}
                                    >
                                        Yesterday
                                    </button>
                                </div>
                            )}
                        </div>
                        {dayEndData && (
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <button className="btn btn-secondary no-print" onClick={() => openAddExpenseModal(dayEndData.date || reportDate)} style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <FiPlus /> Add Expense
                                </button>
                                <button className="btn btn-secondary" onClick={() => handleDownloadDayEndReport(dayEndData)} style={{ fontWeight: 'bold' }}>
                                    <FiDownload /> Download Day-End Report
                                </button>
                                <button className="btn btn-primary" onClick={handlePrintReport}>
                                    <FiPrinter /> Print PDF
                                </button>
                            </div>
                        )}
                    </div>

                    {fetchingReport ? (
                        <Loader message="Generating Day-End Report..." />
                    ) : dayEndData ? (
                        <div className="report-printable-area eod-report-container">
                            <div className="eod-report-header">
                                <div className="eod-report-brand">Kea By The Pool</div>
                                <div className="eod-report-title">DAY-END (EOD) SALES REPORT</div>
                                <div className="eod-report-meta">
                                    <span>Date: <strong>{formatBusinessDate(dayEndData.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong></span>
                                    <span>Shift: <strong>3:00 AM – 3:00 AM IST</strong></span>
                                    <span>Printed: <strong>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong></span>
                                </div>
                            </div>

                            {/* Summary Grid */}
                            <div className="eod-metrics-grid">
                                <div className="eod-stat-box">
                                    <span className="eod-stat-label">Total Orders</span>
                                    <h3 className="eod-stat-val">{dayEndData.summary.totalOrders}</h3>
                                </div>
                                <div className="eod-stat-box">
                                    <span className="eod-stat-label">Gross Sales</span>
                                    <h3 className="eod-stat-val">₹{dayEndData.summary.grossSales.toFixed(2)}</h3>
                                </div>
                                <div className="eod-stat-box box-discount">
                                    <span className="eod-stat-label">Discounts</span>
                                    <h3 className="eod-stat-val">-₹{dayEndData.summary.totalDiscount.toFixed(2)}</h3>
                                </div>
                                <div className="eod-stat-box">
                                    <span className="eod-stat-label">Taxes (GST)</span>
                                    <h3 className="eod-stat-val">₹{dayEndData.summary.totalTax.toFixed(2)}</h3>
                                </div>
                                <div className="eod-stat-box box-net">
                                    <span className="eod-stat-label">NET REVENUE</span>
                                    <h3 className="eod-stat-val">₹{dayEndData.summary.netRevenue.toFixed(2)}</h3>
                                </div>
                                <div className="eod-stat-box box-expenses">
                                    <span className="eod-stat-label">TOTAL EXPENSES</span>
                                    <h3 className="eod-stat-val">-₹{(dayEndData.summary.totalExpenses || 0).toFixed(2)}</h3>
                                    <span className="eod-stat-sub">{(dayEndData.expenses || []).length} logged</span>
                                </div>
                                <div className="eod-stat-box box-profit">
                                    <span className="eod-stat-label">ESTIMATE NET PROFIT</span>
                                    <h3 className="eod-stat-val">₹{(dayEndData.summary.netProfit !== undefined ? dayEndData.summary.netProfit : (dayEndData.summary.netRevenue - (dayEndData.summary.totalExpenses || 0))).toFixed(2)}</h3>
                                    <span className="eod-stat-sub">Revenue - Expenses</span>
                                </div>
                            </div>

                            {/* Payment Method Breakdown */}
                            <div className="eod-report-section">
                                <h3 className="eod-section-title">💳 Payment Method Breakdown</h3>
                                <table className="eod-report-table">
                                    <thead>
                                        <tr>
                                            <th>Payment Method</th>
                                            <th style={{ textAlign: 'right' }}>Total Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td>💵 Cash Paid</td>
                                            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>₹{dayEndData.paymentBreakdown.cash.toFixed(2)}</td>
                                        </tr>
                                        <tr>
                                            <td>📱 UPI / Online Paid</td>
                                            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>₹{dayEndData.paymentBreakdown.online.toFixed(2)}</td>
                                        </tr>
                                        <tr>
                                            <td>💳 Card Paid</td>
                                            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>₹{dayEndData.paymentBreakdown.card.toFixed(2)}</td>
                                        </tr>
                                        <tr>
                                            <td>
                                                🔀 Split Payment Total
                                                <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '2px' }}>
                                                    (Cash: ₹{dayEndData.paymentBreakdown.splitDetails.cash.toFixed(2)} | UPI: ₹{dayEndData.paymentBreakdown.splitDetails.upi.toFixed(2)} | Card: ₹{dayEndData.paymentBreakdown.splitDetails.card.toFixed(2)})
                                                </div>
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>₹{dayEndData.paymentBreakdown.split.toFixed(2)}</td>
                                        </tr>
                                        <tr style={{ background: '#F9FAFB', fontWeight: 'bold' }}>
                                            <td>TOTAL COLLECTED</td>
                                            <td style={{ textAlign: 'right', color: '#7C3AED' }}>₹{dayEndData.summary.netRevenue.toFixed(2)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Daily Expenses Breakdown */}
                            <div className="eod-report-section">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid #111', paddingBottom: '6px', marginBottom: '12px' }}>
                                    <h3 style={{ margin: 0 }} className="eod-section-title-clean">💸 Daily Expenses Breakdown</h3>
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm no-print"
                                        onClick={() => openAddExpenseModal(dayEndData.date || reportDate)}
                                        style={{ fontSize: '0.82rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    >
                                        <FiPlus /> Add Expense
                                    </button>
                                </div>
                                {(!dayEndData.expenses || dayEndData.expenses.length === 0) ? (
                                    <div style={{ padding: '14px', background: '#F9FAFB', border: '1px dashed #CCC', borderRadius: '6px', textAlign: 'center', color: '#666', fontSize: '0.9rem' }}>
                                        No expenses recorded for this business day.
                                        <button
                                            type="button"
                                            className="btn btn-secondary btn-sm no-print"
                                            onClick={() => openAddExpenseModal(dayEndData.date || reportDate)}
                                            style={{ marginLeft: '10px', fontSize: '0.8rem', padding: '2px 8px' }}
                                        >
                                            <FiPlus /> Add Expense
                                        </button>
                                    </div>
                                ) : (
                                    <table className="eod-report-table">
                                        <thead>
                                            <tr>
                                                <th>Expense / Title</th>
                                                <th>Category</th>
                                                <th>Payment Mode</th>
                                                <th>Added By</th>
                                                <th style={{ textAlign: 'right' }}>Amount (₹)</th>
                                                <th className="no-print" style={{ textAlign: 'center', width: '60px' }}>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {dayEndData.expenses.map((exp, idx) => (
                                                <tr key={exp._id || idx}>
                                                    <td style={{ fontWeight: '500' }}>
                                                        {exp.title}
                                                        {exp.notes && <div style={{ fontSize: '0.78rem', color: '#666' }}>{exp.notes}</div>}
                                                    </td>
                                                    <td>
                                                        <span className="expense-badge">{exp.category || 'General'}</span>
                                                    </td>
                                                    <td>
                                                        {renderPaymentMethodBadge(exp)}
                                                    </td>
                                                    <td style={{ color: '#555', fontSize: '0.85rem' }}>
                                                        {exp.addedByName || 'Admin'}
                                                    </td>
                                                    <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#E11D48' }}>
                                                        ₹{(exp.amount || 0).toFixed(2)}
                                                    </td>
                                                    <td className="no-print" style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => openEditExpenseModal(exp)}
                                                            title="Edit Expense"
                                                            className="btn-icon-action"
                                                            style={{ color: '#2563EB', marginRight: '6px' }}
                                                        >
                                                            <FiEdit2 size={16} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteExpense(exp._id)}
                                                            title="Delete Expense"
                                                            className="btn-icon-action"
                                                            style={{ color: '#EF4444' }}
                                                        >
                                                            <FiTrash2 size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            <tr style={{ background: '#FFF1F2', fontWeight: 'bold' }}>
                                                <td colSpan={4} style={{ textAlign: 'right', color: '#9F1239' }}>
                                                    TOTAL EXPENSES DEDUCTED:
                                                </td>
                                                <td style={{ textAlign: 'right', color: '#E11D48', fontSize: '1rem' }}>
                                                    -₹{(dayEndData.summary.totalExpenses || 0).toFixed(2)}
                                                </td>
                                                <td className="no-print"></td>
                                            </tr>
                                            <tr style={{ background: '#ECFDF5', fontWeight: 'bold' }}>
                                                <td colSpan={4} style={{ textAlign: 'right', color: '#065F46' }}>
                                                    ESTIMATE NET PROFIT (Net Revenue - Expenses):
                                                </td>
                                                <td style={{ textAlign: 'right', color: '#059669', fontSize: '1.1rem' }}>
                                                    ₹{(dayEndData.summary.netProfit !== undefined ? dayEndData.summary.netProfit : (dayEndData.summary.netRevenue - (dayEndData.summary.totalExpenses || 0))).toFixed(2)}
                                                </td>
                                                <td className="no-print"></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            {/* Category Sales */}
                            <div className="eod-report-section">
                                <h3 className="eod-section-title">🍽️ Category-Wise Sales Summary</h3>
                                <table className="eod-report-table">
                                    <thead>
                                        <tr>
                                            <th>Category Name</th>
                                            <th style={{ textAlign: 'center' }}>Total Qty Sold</th>
                                            <th style={{ textAlign: 'right' }}>Total Revenue</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dayEndData.categorySales.map((cat, idx) => (
                                            <tr key={idx}>
                                                <td style={{ fontWeight: '600' }}>{cat.name}</td>
                                                <td style={{ textAlign: 'center' }}>{cat.totalQty}</td>
                                                <td style={{ textAlign: 'right', fontWeight: 'bold' }}>₹{cat.totalRevenue.toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Product Sales */}
                            <div className="eod-report-section">
                                <h3 className="eod-section-title">📦 Product / Item Sales Breakdown</h3>
                                <table className="eod-report-table" style={{ fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr>
                                            <th>Item Name</th>
                                            <th>Category</th>
                                            <th style={{ textAlign: 'center' }}>Qty Sold</th>
                                            <th style={{ textAlign: 'right' }}>Revenue</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dayEndData.productSales.map((prod, idx) => (
                                            <tr key={idx}>
                                                <td style={{ fontWeight: '500' }}>{prod.name}</td>
                                                <td style={{ color: '#666' }}>{prod.category}</td>
                                                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{prod.qtySold}</td>
                                                <td style={{ textAlign: 'right', fontWeight: 'bold' }}>₹{prod.totalRevenue.toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Staff Sales */}
                            <div className="eod-report-section">
                                <h3 className="eod-section-title">👤 Staff Sales Performance</h3>
                                <table className="eod-report-table">
                                    <thead>
                                        <tr>
                                            <th>Staff / Biller Name</th>
                                            <th style={{ textAlign: 'center' }}>Orders Count</th>
                                            <th style={{ textAlign: 'right' }}>Total Sales</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dayEndData.staffSales.map((st, idx) => (
                                            <tr key={idx}>
                                                <td style={{ fontWeight: '600' }}>{st.name}</td>
                                                <td style={{ textAlign: 'center' }}>{st.ordersCount}</td>
                                                <td style={{ textAlign: 'right', fontWeight: 'bold' }}>₹{st.totalSales.toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="eod-report-footer">
                                <span>Kea By The Pool • Day-End Sales & Expense Report • Confidential Business Report</span>
                            </div>
                        </div>
                    ) : null}
                </div>
            )}

            {/* SECTION & TABLE SALES TAB */}
            {activeTab === 'section-wise' && (
                <div className="section-wise-report-view">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            {user?.role === 'superadmin' ? (
                                <div className="analytics-filter-controls" style={{ justifyContent: 'flex-start' }}>
                                    <div className="period-selector">
                                        {['today', 'yesterday', 'week', 'month'].map(p => (
                                            <button
                                                key={p}
                                                className={`period-btn ${sectionPeriod === p ? 'active' : ''}`}
                                                onClick={() => {
                                                    setSectionRange(null);
                                                    setSectionPeriod(p);
                                                    if (p === 'today') fetchSectionReport({ date: getLocalDateString() });
                                                    else if (p === 'yesterday') fetchSectionReport({ date: getRelativeBusinessDate(-1) });
                                                    else if (p === 'week') fetchSectionReport({ startDate: getRelativeBusinessDate(-6), endDate: getLocalDateString() });
                                                    else if (p === 'month') {
                                                        const today = getLocalDateString();
                                                        fetchSectionReport({ startDate: `${today.slice(0, 7)}-01`, endDate: today });
                                                    }
                                                }}
                                            >
                                                {p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : p.charAt(0).toUpperCase() + p.slice(1)}
                                            </button>
                                        ))}
                                    </div>
                                    <div className={`custom-date-filter ${sectionPeriod === 'custom' ? 'active' : ''}`}>
                                        <FiCalendar />
                                        <label>
                                            From
                                            <input
                                                type="date"
                                                value={sectionStartDate}
                                                max={getLocalDateString()}
                                                onChange={event => setSectionStartDate(event.target.value)}
                                            />
                                        </label>
                                        <label>
                                            To
                                            <input
                                                type="date"
                                                value={sectionEndDate}
                                                min={sectionStartDate}
                                                max={getLocalDateString()}
                                                onChange={event => setSectionEndDate(event.target.value)}
                                            />
                                        </label>
                                        <button
                                            type="button"
                                            className="period-btn custom-apply-btn"
                                            onClick={() => {
                                                if (!sectionStartDate || !sectionEndDate) {
                                                    alert('Please select both From and To dates.');
                                                    return;
                                                }
                                                if (sectionStartDate > sectionEndDate) {
                                                    alert('From date cannot be after To date.');
                                                    return;
                                                }
                                                setSectionRange({ startDate: sectionStartDate, endDate: sectionEndDate });
                                                setSectionPeriod('custom');
                                                fetchSectionReport({ startDate: sectionStartDate, endDate: sectionEndDate });
                                            }}
                                        >
                                            Apply Date Range
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <label style={{ fontWeight: 'bold' }}>Date:</label>
                                    <button
                                        className={`btn ${reportDate === getLocalDateString() ? 'btn-primary' : 'btn-secondary'}`}
                                        onClick={() => {
                                            const t = getLocalDateString();
                                            setReportDate(t);
                                            fetchSectionReport(t);
                                        }}
                                    >
                                        Today
                                    </button>
                                    <button
                                        className={`btn ${reportDate === getRelativeBusinessDate(-1) ? 'btn-primary' : 'btn-secondary'}`}
                                        onClick={() => {
                                            const y = getRelativeBusinessDate(-1);
                                            setReportDate(y);
                                            fetchSectionReport(y);
                                        }}
                                    >
                                        Yesterday
                                    </button>
                                </div>
                            )}
                        </div>
                        {sectionData && (
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="btn btn-secondary" onClick={() => handleDownloadSectionReport(sectionData)} style={{ fontWeight: 'bold' }}>
                                    <FiDownload /> Download Section Report
                                </button>
                                <button className="btn btn-primary" onClick={handlePrintReport}>
                                    <FiPrinter /> Print PDF
                                </button>
                            </div>
                        )}
                    </div>

                    {fetchingReport ? (
                        <Loader message="Generating Section-wise Sales Report..." />
                    ) : sectionData ? (
                        <div className="report-printable-area" style={{ background: '#FFF', padding: '24px', borderRadius: '12px', border: '2px solid #111', boxShadow: '4px 4px 0px #111' }}>
                            <div style={{ textAlign: 'center', borderBottom: '2px solid #111', paddingBottom: '16px', marginBottom: '20px' }}>
                                <h1 style={{ margin: '0 0 4px', fontSize: '1.8rem', textTransform: 'uppercase' }}>Kea By The Pool</h1>
                                <h3 style={{ margin: '0 0 4px', color: '#7C3AED' }}>SECTION & TABLE-WISE SALES REPORT</h3>
                                <p style={{ margin: 0, fontSize: '0.9rem', color: '#555' }}>
                                    Date: <strong>{formatBusinessDate(sectionData.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong> (Shift: 3:00 AM – 3:00 AM IST) | Printed: {new Date().toLocaleTimeString()}
                                </p>
                            </div>

                            {sectionData.sections.length === 0 ? (
                                <p style={{ textAlign: 'center', color: '#666', fontStyle: 'italic', padding: '40px' }}>No section sales recorded for this date range.</p>
                            ) : (
                                sectionData.sections.map((sec, sIdx) => (
                                    <div key={sIdx} style={{ marginBottom: '28px', border: '1.5px solid #111', borderRadius: '8px', padding: '16px', background: '#FAFAFA' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #7C3AED', paddingBottom: '8px', marginBottom: '12px' }}>
                                            <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#7C3AED' }}>🏢 {sec.sectionName}</h2>
                                            <div style={{ fontSize: '0.95rem' }}>
                                                <span>Orders: <strong>{sec.totalOrders}</strong></span>
                                                <span style={{ marginLeft: '16px', color: '#059669', fontWeight: 'bold' }}>Revenue: ₹{sec.totalRevenue.toFixed(2)}</span>
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                            {/* Table / Room Breakdown */}
                                            <div>
                                                <h4 style={{ margin: '0 0 8px', fontSize: '0.95rem' }}>📍 Table / Room Breakdown</h4>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                                    <thead>
                                                        <tr style={{ background: '#E5E7EB', textAlign: 'left' }}>
                                                            <th style={{ padding: '6px', border: '1px solid #CCC' }}>Table / Room</th>
                                                            <th style={{ padding: '6px', border: '1px solid #CCC', textAlign: 'center' }}>Orders</th>
                                                            <th style={{ padding: '6px', border: '1px solid #CCC', textAlign: 'right' }}>Revenue</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {sec.tableBreakdown.map((tbl, tIdx) => (
                                                            <tr key={tIdx}>
                                                                <td style={{ padding: '6px', border: '1px solid #DDD', fontWeight: '600' }}>{tbl.tableNumber}</td>
                                                                <td style={{ padding: '6px', border: '1px solid #DDD', textAlign: 'center' }}>{tbl.ordersCount}</td>
                                                                <td style={{ padding: '6px', border: '1px solid #DDD', textAlign: 'right', fontWeight: 'bold' }}>₹{tbl.totalRevenue.toFixed(2)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>

                                            {/* Top Selling Items in Section */}
                                            <div>
                                                <h4 style={{ margin: '0 0 8px', fontSize: '0.95rem' }}>🍽️ Top Items in Section</h4>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                                    <thead>
                                                        <tr style={{ background: '#E5E7EB', textAlign: 'left' }}>
                                                            <th style={{ padding: '6px', border: '1px solid #CCC' }}>Item Name</th>
                                                            <th style={{ padding: '6px', border: '1px solid #CCC', textAlign: 'center' }}>Qty</th>
                                                            <th style={{ padding: '6px', border: '1px solid #CCC', textAlign: 'right' }}>Revenue</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {sec.topItems.map((itm, iIdx) => (
                                                            <tr key={iIdx}>
                                                                <td style={{ padding: '6px', border: '1px solid #DDD', fontWeight: '500' }}>{itm.name}</td>
                                                                <td style={{ padding: '6px', border: '1px solid #DDD', textAlign: 'center', fontWeight: 'bold' }}>{itm.qtySold}</td>
                                                                <td style={{ padding: '6px', border: '1px solid #DDD', textAlign: 'right', fontWeight: 'bold' }}>₹{itm.totalRevenue.toFixed(2)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    ) : null}
                </div>
            )}

            {/* OVERVIEW ANALYTICS TAB */}
            {activeTab === 'analytics' && (
                <>

            {/* Revenue Summary Cards */}
            <div className="summary-grid">
                <div className="summary-card revenue">
                    <h3>Total Revenue</h3>
                    <p className="value">₹{totalRevenue.toFixed(2)}</p>
                    <span className="label">{periodLabel}</span>
                </div>
                <div className="summary-card profit" style={{ borderLeft: '4px solid #E11D48' }}>
                    <div className="card-header-with-action">
                        <h3>Total Expenses</h3>
                        <button className="btn btn-secondary btn-sm" onClick={() => openAddExpenseModal()} style={{ padding: '2px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <FiPlus /> Add
                        </button>
                    </div>
                    <p className="value" style={{ color: '#E11D48' }}>₹{totalPeriodExpenses.toFixed(2)}</p>
                    <span className="label">{periodLabel}</span>
                </div>
                <div className="summary-card profit" style={{ borderLeft: '4px solid #059669' }}>
                    <h3>Realized Net Profit</h3>
                    <p className="value" style={{ color: '#059669' }}>₹{(totalRevenue - totalPeriodExpenses).toFixed(2)}</p>
                    <span className="label">Revenue - Expenses</span>
                </div>
                <div className="summary-card profit">
                    <div className="card-header-with-action">
                        <h3>Estimated Profit</h3>
                        <button className="settings-btn" onClick={() => setShowMarginInput(!showMarginInput)}>
                            <FiSettings />
                        </button>
                    </div>
                    <p className="value">₹{totalProfit.toFixed(2)}</p>
                    {showMarginInput ? (
                        <div className="margin-input-group">
                            <input
                                type="number"
                                value={margin}
                                onChange={(e) => setMargin(Number(e.target.value))}
                                className="margin-input"
                                min="0"
                                max="100"
                            />
                            <span>%</span>
                            <button onClick={handleUpdateMargin} className="btn-save-sm">Save</button>
                        </div>
                    ) : (
                        <span className="label">~{margin}% margin</span>
                    )}
                </div>
                <div className="summary-card orders">
                    <h3>Total Orders</h3>
                    <p className="value">{totalOrders}</p>
                    <span className="label">Completed orders</span>
                </div>
                <div className="summary-card avg">
                    <h3>Avg Order Value</h3>
                    <p className="value">₹{totalOrders ? (totalRevenue / totalOrders).toFixed(2) : 0}</p>
                    <span className="label">Per order</span>
                </div>
            </div>

            {/* User Analytics Section */}
            {userStats && (
                <>
                    <h2 className="section-title">👥 User Analytics</h2>
                    <div className="summary-grid user-grid">
                        <div className="summary-card users">
                            <div className="card-icon"><FiUsers /></div>
                            <h3>Total Users</h3>
                            <p className="value">{userStats.totalUsers}</p>
                            <span className="label">Registered customers</span>
                        </div>
                        <div className="summary-card new-users">
                            <div className="card-icon"><FiUserPlus /></div>
                            <h3>New Users</h3>
                            <p className="value">{userStats.newUsers}</p>
                            <span className="label">{periodLabel}</span>
                        </div>
                        <div className="summary-card active">
                            <div className="card-icon"><FiActivity /></div>
                            <h3>Active Users</h3>
                            <p className="value">{userStats.activeUsers}</p>
                            <span className="label">Ordered: {periodLabel}</span>
                        </div>
                        <div className="summary-card returning">
                            <div className="card-icon"><FiRepeat /></div>
                            <h3>Returning Customers</h3>
                            <p className="value">{userStats.returningCustomers}</p>
                            <span className="label">Multiple orders</span>
                        </div>
                    </div>

                    <div className="charts-row">
                        {/* User Growth Chart */}
                        <div className="chart-card">
                            <h2>User Registrations</h2>
                            <div className="chart-container">
                                <ResponsiveContainer width="100%" height={250}>
                                    <AreaChart data={userStats.userGrowth}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
                                        <XAxis dataKey="date" stroke="#666" />
                                        <YAxis stroke="#666" />
                                        <Tooltip />
                                        <Area type="monotone" dataKey="users" stroke="#3B82F6" fill="rgba(59, 130, 246, 0.2)" name="New Users" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Top Customers */}
                        <div className="chart-card">
                            <h2>🏆 Top Customers</h2>
                            <div className="top-customers-list">
                                {userStats.topCustomers.map((customer, index) => (
                                    <div key={index} className="customer-row">
                                        <div className="customer-rank">{index + 1}</div>
                                        <div className="customer-info">
                                            <span className="customer-name">{customer.name || 'Customer'}</span>
                                            <span className="customer-phone">{customer.phone}</span>
                                        </div>
                                        <div className="customer-stats">
                                            <span className="orders-count">{customer.orderCount} orders</span>
                                            <span className="total-spent">₹{customer.totalSpent.toFixed(2)}</span>
                                        </div>
                                    </div>
                                ))}
                                {userStats.topCustomers.length === 0 && (
                                    <p className="no-data">No customer data yet</p>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Revenue Chart */}
            <div className="chart-card">
                <h2>Revenue & Profit Trend</h2>
                <div className="chart-container">
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={revenueData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
                            <XAxis dataKey="date" stroke="#666" />
                            <YAxis stroke="#666" />
                            <Tooltip
                                contentStyle={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: '8px' }}
                            />
                            <Legend />
                            <Line type="monotone" dataKey="revenue" stroke="#C87316" strokeWidth={3} dot={{ fill: '#C87316' }} name="Revenue" />
                            <Line type="monotone" dataKey="profit" stroke="#22C55E" strokeWidth={3} dot={{ fill: '#22C55E' }} name="Profit" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="charts-row">
                {/* Category Sales */}
                <div className="chart-card">
                    <h2>Sales by Category</h2>
                    <div className="chart-container">
                        <ResponsiveContainer width="100%" height={250}>
                            <PieChart>
                                <Pie
                                    data={categorySales}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={2}
                                    dataKey="total"
                                    nameKey="_id"
                                    label={({ _id, percent }) => `${_id} (${(percent * 100).toFixed(0)}%)`}
                                >
                                    {categorySales.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value) => `₹${value.toFixed(2)}`} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Top Items */}
                <div className="chart-card">
                    <h2>Top Selling Items</h2>
                    <div className="chart-container">
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={topItems.slice(0, 5)} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
                                <XAxis type="number" stroke="#666" />
                                <YAxis dataKey="name" type="category" width={100} stroke="#666" tick={{ fontSize: 12 }} />
                                <Tooltip />
                                <Bar dataKey="totalQuantity" fill="#C87316" radius={[0, 4, 4, 0]} name="Quantity Sold" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Orders Table */}
            <div className="chart-card">
                <h2>Daily Breakdown</h2>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Orders</th>
                                <th>Revenue</th>
                                <th>Expenses</th>
                                <th>Est. Margin Profit</th>
                                <th>Net Profit (Rev - Exp)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {revenueData.map((day, index) => {
                                const dayExp = day.expenses || 0;
                                const dayNet = day.netProfit !== undefined ? day.netProfit : (day.revenue - dayExp);
                                return (
                                    <tr key={index}>
                                        <td>{day.date}</td>
                                        <td>{day.orders}</td>
                                        <td>₹{day.revenue.toFixed(2)}</td>
                                        <td style={{ color: dayExp > 0 ? '#E11D48' : '#6B7280', fontWeight: dayExp > 0 ? '600' : 'normal' }}>
                                            {dayExp > 0 ? `-₹${dayExp.toFixed(2)}` : '₹0.00'}
                                        </td>
                                        <td style={{ color: '#4B5563' }}>₹{day.profit.toFixed(2)}</td>
                                        <td className="profit-cell" style={{ color: dayNet >= 0 ? '#059669' : '#DC2626', fontWeight: 'bold' }}>
                                            ₹{dayNet.toFixed(2)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            </>
            )}

            {/* DAILY EXPENSES TAB */}
            {activeTab === 'expenses' && (
                <div className="daily-expenses-view">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <div className="analytics-filter-controls" style={{ justifyContent: 'flex-start' }}>
                                <div className="period-selector">
                                    {['today', 'yesterday', 'week', 'month'].map(p => (
                                        <button
                                            key={p}
                                            className={`period-btn ${expensesPeriod === p ? 'active' : ''}`}
                                            onClick={() => {
                                                setExpensesRange(null);
                                                setExpensesPeriod(p);
                                            }}
                                        >
                                            {p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : p.charAt(0).toUpperCase() + p.slice(1)}
                                        </button>
                                    ))}
                                </div>
                                <div className={`custom-date-filter ${expensesPeriod === 'custom' ? 'active' : ''}`}>
                                    <FiCalendar />
                                    <label>
                                        From
                                        <input
                                            type="date"
                                            value={expensesStartDate}
                                            max={getLocalDateString()}
                                            onChange={e => setExpensesStartDate(e.target.value)}
                                        />
                                    </label>
                                    <label>
                                        To
                                        <input
                                            type="date"
                                            value={expensesEndDate}
                                            min={expensesStartDate}
                                            max={getLocalDateString()}
                                            onChange={e => setExpensesEndDate(e.target.value)}
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        className="period-btn custom-apply-btn"
                                        onClick={() => {
                                            if (!expensesStartDate || !expensesEndDate) {
                                                alert('Please select both From and To dates.');
                                                return;
                                            }
                                            if (expensesStartDate > expensesEndDate) {
                                                alert('From date cannot be after To date.');
                                                return;
                                            }
                                            setExpensesRange({ startDate: expensesStartDate, endDate: expensesEndDate });
                                            setExpensesPeriod('custom');
                                        }}
                                    >
                                        Apply Date Range
                                    </button>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <label style={{ fontWeight: 'bold', fontSize: '0.88rem' }}>Category:</label>
                                <select
                                    value={expenseCategoryFilter}
                                    onChange={e => setExpenseCategoryFilter(e.target.value)}
                                    style={{ padding: '7px 10px', borderRadius: '6px', border: '2px solid #111', fontWeight: '500' }}
                                >
                                    <option value="All">All Categories</option>
                                    <option value="Kitchen Supplies">Kitchen Supplies</option>
                                    <option value="Raw Materials / Grocery">Raw Materials / Grocery</option>
                                    <option value="Dairy & Beverages">Dairy & Beverages</option>
                                    <option value="Maintenance & Repairs">Maintenance & Repairs</option>
                                    <option value="Utilities & Bills">Utilities & Bills</option>
                                    <option value="Staff & Salaries">Staff & Salaries</option>
                                    <option value="Packaging & Delivery">Packaging & Delivery</option>
                                    <option value="Miscellaneous">Miscellaneous</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                className="btn btn-primary"
                                onClick={() => openAddExpenseModal()}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                <FiPlus /> Add New Expense
                            </button>
                            <button
                                className="btn btn-secondary"
                                onClick={() => fetchExpenses()}
                            >
                                Refresh
                            </button>
                        </div>
                    </div>

                    {/* Stat Cards for Expenses */}
                    {(() => {
                        const totalExp = expensesList.reduce((sum, e) => sum + (e.amount || 0), 0);
                        const cashExp = expensesList.filter(e => e.paymentMethod === 'cash').reduce((sum, e) => sum + (e.amount || 0), 0);
                        const onlineExp = expensesList.filter(e => e.paymentMethod === 'online' || e.paymentMethod === 'upi').reduce((sum, e) => sum + (e.amount || 0), 0);
                        return (
                            <div className="summary-grid" style={{ marginBottom: '24px' }}>
                                <div className="summary-card" style={{ borderLeft: '4px solid #E11D48' }}>
                                    <h3>Total Expenses</h3>
                                    <p className="value" style={{ color: '#E11D48' }}>₹{totalExp.toFixed(2)}</p>
                                    <span className="label">{expensesList.length} expenses recorded</span>
                                </div>
                                <div className="summary-card" style={{ borderLeft: '4px solid #F59E0B' }}>
                                    <h3>Cash Paid</h3>
                                    <p className="value" style={{ color: '#D97706' }}>₹{cashExp.toFixed(2)}</p>
                                    <span className="label">Out of cash drawer</span>
                                </div>
                                <div className="summary-card" style={{ borderLeft: '4px solid #3B82F6' }}>
                                    <h3>Online / UPI Paid</h3>
                                    <p className="value" style={{ color: '#2563EB' }}>₹{onlineExp.toFixed(2)}</p>
                                    <span className="label">Bank / UPI transfer</span>
                                </div>
                                <div className="summary-card" style={{ borderLeft: '4px solid #8B5CF6' }}>
                                    <h3>Total Records</h3>
                                    <p className="value">{expensesList.length}</p>
                                    <span className="label">Filtered count</span>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Expenses Table */}
                    {fetchingExpenses ? (
                        <Loader message="Loading expenses..." />
                    ) : (
                        <div className="chart-card">
                            <h2>Expenses Records</h2>
                            {expensesList.length === 0 ? (
                                <div style={{ padding: '40px', textAlign: 'center', color: '#666', fontStyle: 'italic' }}>
                                    No expenses found for the selected period.
                                    <div style={{ marginTop: '12px' }}>
                                        <button className="btn btn-primary" onClick={() => openAddExpenseModal()}>
                                            <FiPlus /> Add First Expense
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="table-container">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Title / Description</th>
                                                <th>Category</th>
                                                <th>Payment Mode</th>
                                                <th>Added By</th>
                                                <th>Notes</th>
                                                <th style={{ textAlign: 'right' }}>Amount (₹)</th>
                                                <th style={{ textAlign: 'center', width: '70px' }}>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {expensesList.map((exp) => (
                                                <tr key={exp._id}>
                                                    <td style={{ fontWeight: '600' }}>{exp.businessDate || formatBusinessDate(exp.createdAt, { day: 'numeric', month: 'short' })}</td>
                                                    <td style={{ fontWeight: '500' }}>{exp.title}</td>
                                                    <td>
                                                        <span className="expense-badge">{exp.category || 'General'}</span>
                                                    </td>
                                                    <td>
                                                        {renderPaymentMethodBadge(exp)}
                                                    </td>
                                                    <td style={{ color: '#555', fontSize: '0.88rem' }}>{exp.addedByName || 'Admin'}</td>
                                                    <td style={{ color: '#777', fontSize: '0.85rem' }}>{exp.notes || '-'}</td>
                                                    <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#E11D48', fontSize: '1rem' }}>
                                                        ₹{(exp.amount || 0).toFixed(2)}
                                                    </td>
                                                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => openEditExpenseModal(exp)}
                                                            title="Edit Expense"
                                                            className="btn-icon-action"
                                                            style={{ color: '#2563EB', marginRight: '6px' }}
                                                        >
                                                            <FiEdit2 size={18} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteExpense(exp._id)}
                                                            title="Delete Expense"
                                                            className="btn-icon-action"
                                                            style={{ color: '#EF4444' }}
                                                        >
                                                            <FiTrash2 size={18} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr style={{ background: '#F9FAFB', fontWeight: 'bold', borderTop: '2px solid #111' }}>
                                                <td colSpan={6} style={{ padding: '12px', textAlign: 'right', fontSize: '0.95rem' }}>TOTAL EXPENSES:</td>
                                                <td style={{ padding: '12px', textAlign: 'right', fontSize: '1.15rem', color: '#E11D48' }}>
                                                    ₹{expensesList.reduce((sum, e) => sum + (e.amount || 0), 0).toFixed(2)}
                                                </td>
                                                <td></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ADD / EDIT EXPENSE MODAL */}
            {showAddExpenseModal && (
                <div className="expense-modal-overlay" onClick={() => !submittingExpense && setShowAddExpenseModal(false)}>
                    <div className="expense-modal-content" style={{ maxWidth: modalMode === 'bulk' && !editingExpenseId ? '720px' : '520px' }} onClick={e => e.stopPropagation()}>
                        <div className="expense-modal-header">
                            <h2>
                                <FiDollarSign style={{ color: '#E11D48' }} />
                                {editingExpenseId ? 'Edit Expense' : (modalMode === 'bulk' ? 'Add Multiple Expenses' : 'Record New Expense')}
                            </h2>
                            <button
                                type="button"
                                onClick={() => setShowAddExpenseModal(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                            >
                                <FiX size={22} />
                            </button>
                        </div>

                        {/* Mode Switcher (Only when adding new, not when editing) */}
                        {!editingExpenseId && (
                            <div className="expense-mode-toggle">
                                <button
                                    type="button"
                                    className={`expense-mode-btn ${modalMode === 'single' ? 'active' : ''}`}
                                    onClick={() => setModalMode('single')}
                                >
                                    Single Expense
                                </button>
                                <button
                                    type="button"
                                    className={`expense-mode-btn ${modalMode === 'bulk' ? 'active' : ''}`}
                                    onClick={() => setModalMode('bulk')}
                                >
                                    ⚡ Multiple Expenses (Bulk Add)
                                </button>
                            </div>
                        )}

                        <form onSubmit={handleSaveExpense} className="expense-form">
                            {/* SINGLE MODE */}
                            {modalMode === 'single' ? (
                                <>
                                    <div className="expense-form-row">
                                        <div className="expense-form-group">
                                            <label>Business Date *</label>
                                            <input
                                                type="date"
                                                className="input"
                                                required
                                                value={expenseForm.businessDate}
                                                max={getLocalDateString()}
                                                onChange={e => setExpenseForm({ ...expenseForm, businessDate: e.target.value })}
                                            />
                                        </div>
                                        <div className="expense-form-group">
                                            <label>Amount (in Rupees ₹) *</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0.01"
                                                placeholder="e.g. 100"
                                                className="input"
                                                required
                                                value={expenseForm.amount}
                                                onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div className="expense-form-group">
                                        <label>Expense Title / Description *</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Vegetables, Milk, Gas Cylinder, Cleaning Supplies"
                                            className="input"
                                            required
                                            value={expenseForm.title}
                                            onChange={e => setExpenseForm({ ...expenseForm, title: e.target.value })}
                                        />
                                    </div>

                                    <div className="expense-form-row">
                                        <div className="expense-form-group">
                                            <label>Category</label>
                                            <select
                                                value={expenseForm.category}
                                                onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })}
                                            >
                                                <option value="Kitchen Supplies">Kitchen Supplies</option>
                                                <option value="Raw Materials / Grocery">Raw Materials / Grocery</option>
                                                <option value="Dairy & Beverages">Dairy & Beverages</option>
                                                <option value="Maintenance & Repairs">Maintenance & Repairs</option>
                                                <option value="Utilities & Bills">Utilities & Bills</option>
                                                <option value="Staff & Salaries">Staff & Salaries</option>
                                                <option value="Packaging & Delivery">Packaging & Delivery</option>
                                                <option value="Miscellaneous">Miscellaneous</option>
                                                <option value="Other">Other</option>
                                            </select>
                                        </div>
                                        <div className="expense-form-group">
                                            <label>Payment Method *</label>
                                            <select
                                                value={expenseForm.paymentMethod}
                                                onChange={e => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value })}
                                            >
                                                <option value="cash">💵 Cash</option>
                                                <option value="upi">📱 UPI (GPay / PhonePe / Paytm)</option>
                                                <option value="card">💳 Card (Debit / Credit)</option>
                                                <option value="bank_transfer">🏦 Bank Transfer</option>
                                                <option value="split">🔀 Split Payment (Multi-Method)</option>
                                                <option value="cheque">📜 Cheque</option>
                                                <option value="other">Other</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Split Payment Multi-Method Details */}
                                    {expenseForm.paymentMethod === 'split' && (
                                        <div className="expense-split-box">
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <strong style={{ fontSize: '0.9rem', color: '#1E40AF' }}>🔀 Split Payment Breakdown (Rupees ₹)</strong>
                                                <span style={{ fontSize: '0.8rem', color: '#6B7280' }}>Total: ₹{parseFloat(expenseForm.amount) || 0}</span>
                                            </div>
                                            <div className="expense-split-grid">
                                                <div className="expense-form-group">
                                                    <label style={{ fontSize: '0.8rem' }}>💵 Cash</label>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        placeholder="0.00"
                                                        className="input"
                                                        value={splitDetails.cash}
                                                        onChange={e => setSplitDetails({ ...splitDetails, cash: e.target.value })}
                                                    />
                                                </div>
                                                <div className="expense-form-group">
                                                    <label style={{ fontSize: '0.8rem' }}>📱 UPI / Online</label>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        placeholder="0.00"
                                                        className="input"
                                                        value={splitDetails.upi}
                                                        onChange={e => setSplitDetails({ ...splitDetails, upi: e.target.value })}
                                                    />
                                                </div>
                                                <div className="expense-form-group">
                                                    <label style={{ fontSize: '0.8rem' }}>💳 Card</label>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        placeholder="0.00"
                                                        className="input"
                                                        value={splitDetails.card}
                                                        onChange={e => setSplitDetails({ ...splitDetails, card: e.target.value })}
                                                    />
                                                </div>
                                                <div className="expense-form-group">
                                                    <label style={{ fontSize: '0.8rem' }}>🏦 Bank Transfer</label>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        placeholder="0.00"
                                                        className="input"
                                                        value={splitDetails.bank_transfer}
                                                        onChange={e => setSplitDetails({ ...splitDetails, bank_transfer: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                            {(() => {
                                                const currentSum = (parseFloat(splitDetails.cash) || 0)
                                                    + (parseFloat(splitDetails.upi) || 0)
                                                    + (parseFloat(splitDetails.card) || 0)
                                                    + (parseFloat(splitDetails.bank_transfer) || 0)
                                                    + (parseFloat(splitDetails.other) || 0);
                                                const totalReq = parseFloat(expenseForm.amount) || 0;
                                                const diff = totalReq - currentSum;
                                                return (
                                                    <div className="expense-split-summary">
                                                        <span>Sum of Split: <strong>₹{currentSum.toFixed(2)}</strong></span>
                                                        <span style={{ color: Math.abs(diff) < 0.01 ? '#059669' : '#DC2626' }}>
                                                            {Math.abs(diff) < 0.01 ? '✓ Balanced' : `Remaining: ₹${diff.toFixed(2)}`}
                                                        </span>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )}

                                    <div className="expense-form-group">
                                        <label>Notes / Vendor Details (Optional)</label>
                                        <textarea
                                            rows="2"
                                            placeholder="Any additional remarks, invoice number, or vendor name..."
                                            value={expenseForm.notes}
                                            onChange={e => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                                        />
                                    </div>
                                </>
                            ) : (
                                /* BULK MODE (Multiple Expenses) */
                                <>
                                    <div className="expense-form-group" style={{ maxWidth: '240px' }}>
                                        <label>Business Date for All Entries *</label>
                                        <input
                                            type="date"
                                            className="input"
                                            required
                                            value={expenseForm.businessDate}
                                            max={getLocalDateString()}
                                            onChange={e => setExpenseForm({ ...expenseForm, businessDate: e.target.value })}
                                        />
                                    </div>

                                    <div style={{ margin: '8px 0 4px', fontSize: '0.88rem', fontWeight: 'bold', color: '#374151' }}>
                                        List of Expense Items:
                                    </div>

                                    <div className="expense-bulk-container">
                                        {bulkExpenseRows.map((row, idx) => (
                                            <div key={idx} className="expense-bulk-row">
                                                <input
                                                    type="text"
                                                    className="input"
                                                    placeholder={`Expense #${idx + 1} (e.g. Milk, Onions)`}
                                                    value={row.title}
                                                    onChange={e => {
                                                        const updated = [...bulkExpenseRows];
                                                        updated[idx].title = e.target.value;
                                                        setBulkExpenseRows(updated);
                                                    }}
                                                />
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    className="input"
                                                    placeholder="₹ Amount"
                                                    value={row.amount}
                                                    onChange={e => {
                                                        const updated = [...bulkExpenseRows];
                                                        updated[idx].amount = e.target.value;
                                                        setBulkExpenseRows(updated);
                                                    }}
                                                />
                                                <select
                                                    value={row.category}
                                                    onChange={e => {
                                                        const updated = [...bulkExpenseRows];
                                                        updated[idx].category = e.target.value;
                                                        setBulkExpenseRows(updated);
                                                    }}
                                                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid #CCC', fontSize: '0.88rem' }}
                                                >
                                                    <option value="Kitchen Supplies">Kitchen Supplies</option>
                                                    <option value="Raw Materials / Grocery">Raw Materials</option>
                                                    <option value="Dairy & Beverages">Dairy & Bev</option>
                                                    <option value="Maintenance & Repairs">Maintenance</option>
                                                    <option value="Utilities & Bills">Utilities</option>
                                                    <option value="Staff & Salaries">Staff/Salary</option>
                                                    <option value="Packaging & Delivery">Packaging</option>
                                                    <option value="Miscellaneous">Misc</option>
                                                    <option value="Other">Other</option>
                                                </select>
                                                <select
                                                    value={row.paymentMethod}
                                                    onChange={e => {
                                                        const updated = [...bulkExpenseRows];
                                                        updated[idx].paymentMethod = e.target.value;
                                                        setBulkExpenseRows(updated);
                                                    }}
                                                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid #CCC', fontSize: '0.88rem' }}
                                                >
                                                    <option value="cash">💵 Cash</option>
                                                    <option value="upi">📱 UPI</option>
                                                    <option value="card">💳 Card</option>
                                                    <option value="bank_transfer">🏦 Bank</option>
                                                    <option value="other">Other</option>
                                                </select>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (bulkExpenseRows.length <= 1) return;
                                                        setBulkExpenseRows(bulkExpenseRows.filter((_, i) => i !== idx));
                                                    }}
                                                    title="Remove Row"
                                                    style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: '4px' }}
                                                >
                                                    <FiX size={18} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                                        <button
                                            type="button"
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => setBulkExpenseRows([
                                                ...bulkExpenseRows,
                                                { title: '', amount: '', category: 'Kitchen Supplies', paymentMethod: 'cash', notes: '' }
                                            ])}
                                            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                                        >
                                            <FiPlus /> Add Another Item
                                        </button>
                                        <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>
                                            Total: <span style={{ color: '#E11D48' }}>₹{bulkExpenseRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0).toFixed(2)}</span>
                                        </div>
                                    </div>
                                </>
                            )}

                            <div className="expense-modal-actions">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    disabled={submittingExpense}
                                    onClick={() => setShowAddExpenseModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={submittingExpense}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                    {submittingExpense
                                        ? 'Saving...'
                                        : (editingExpenseId
                                            ? 'Update Expense'
                                            : (modalMode === 'bulk'
                                                ? `Save All Expenses (${bulkExpenseRows.filter(r => r.title?.trim() && parseFloat(r.amount) > 0).length})`
                                                : 'Save Expense'))}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminAnalytics;

