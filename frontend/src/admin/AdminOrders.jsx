import React, { useState, useEffect } from 'react';
import { FiCheck, FiX, FiFileText, FiAlertTriangle, FiTrash2, FiPlus, FiMinus, FiSearch, FiEdit2, FiPrinter, FiEdit3 } from 'react-icons/fi';
import { 
    getActiveOrders, updateOrderStatus, updatePayment, deleteOrder, 
    getAllMenuItems, getCategories, getBillerSuggestions, generateBill, updateOrderItems, modifyOrderItems,
    getCoupons, getMaxDiscount, getKOTs, getTables, moveOrderTable
} from '../utils/api';
import { useAuth } from '../context/AuthContext';
import OrderBill from '../components/OrderBill';
import Loader from '../components/Loader';
import AdminBills from './AdminBills';
import './AdminOrders.css';

const AdminOrders = () => {
    const { user, socket } = useAuth();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [selectedOrdersForBill, setSelectedOrdersForBill] = useState([]);
    const [showBill, setShowBill] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState({});

    // Prepare Bill state
    const [showPrepareModal, setShowPrepareModal] = useState(false);
    const [prepareOrders, setPrepareOrders] = useState([]);
    const [prepareSelectedOrderIds, setPrepareSelectedOrderIds] = useState([]);
    const [prepareBillerName, setPrepareBillerName] = useState('');
    const [prepareDiscountInput, setPrepareDiscountInput] = useState('');
    const [prepareDiscountName, setPrepareDiscountName] = useState('');
    const [prepareDiscountType, setPrepareDiscountType] = useState('%');
    const [prepareSuggestions, setPrepareSuggestions] = useState([]);
    const [showPrepareSuggestions, setShowPrepareSuggestions] = useState(false);
    const [allMenuItems, setAllMenuItems] = useState([]);
    const [searchQueryByOrder, setSearchQueryByOrder] = useState({});
    const [isSavingBill, setIsSavingBill] = useState(false);
    const [coupons, setCoupons] = useState([]);
    // Payment Biller Modal state
    const [showPaymentBillerModal, setShowPaymentBillerModal] = useState(false);
    const [paymentBillerOrderId, setPaymentBillerOrderId] = useState('');
    const [paymentBillerMethod, setPaymentBillerMethod] = useState('cash');
    const [paymentBillerAmount, setPaymentBillerAmount] = useState(0);
    const [paymentBillerName, setPaymentBillerName] = useState('');
    const [paymentDiscountInput, setPaymentDiscountInput] = useState('');
    const [paymentDiscountName, setPaymentDiscountName] = useState('');
    const [paymentDiscountType, setPaymentDiscountType] = useState('%');
    const [showPaymentBillerSuggestions, setShowPaymentBillerSuggestions] = useState(false);

    // Max discount cap
    const [maxDiscountPercent, setMaxDiscountPercent] = useState(20);

    // Split Payment state
    const [showSplitModal, setShowSplitModal] = useState(false);
    const [splitCash, setSplitCash] = useState('');
    const [splitUpi, setSplitUpi] = useState('');
    const [splitCard, setSplitCard] = useState('');

    // Partial Edit / Modify Order state
    const [showModifyModal, setShowModifyModal] = useState(false);
    const [editingOrder, setEditingOrder] = useState(null);
    const [modifyItemsList, setModifyItemsList] = useState([]);
    const [menuItemsList, setMenuItemsList] = useState([]);
    const [menuCategories, setMenuCategories] = useState([]);
    const [modifyCategoryFilter, setModifyCategoryFilter] = useState('');
    const [modifySearchQuery, setModifySearchQuery] = useState('');
    const [selectedAddMenuItem, setSelectedAddMenuItem] = useState('');
    const [modifyNote, setModifyNote] = useState('');
    const [submittingModify, setSubmittingModify] = useState(false);

    // Quick Pay Choice Modal state
    const [showQuickPayModal, setShowQuickPayModal] = useState(false);
    const [quickPayOrder, setQuickPayOrder] = useState(null);
    const [quickPayAmount, setQuickPayAmount] = useState(0);

    // KOTs state
    const [activeTab, setActiveTab] = useState('active'); // 'active' | 'kots' | 'all'
    const [kotList, setKotList] = useState([]);
    const [kotFilterDate, setKotFilterDate] = useState(new Date().toISOString().split('T')[0]);
    const [fetchingKOTs, setFetchingKOTs] = useState(false);
    const [selectedKOTForPrint, setSelectedKOTForPrint] = useState(null);

    // Auto-Print KOT state (saved in localStorage)
    const [autoPrintKOT, setAutoPrintKOT] = useState(() => {
        return localStorage.getItem('kea_auto_print_kot') === 'true';
    });

    const toggleAutoPrintKOT = () => {
        const nextVal = !autoPrintKOT;
        setAutoPrintKOT(nextVal);
        localStorage.setItem('kea_auto_print_kot', nextVal ? 'true' : 'false');
    };

    const fetchKOTs = async (dateVal) => {
        setFetchingKOTs(true);
        try {
            const res = await getKOTs(dateVal || kotFilterDate);
            setKotList(res.data.kots || []);
        } catch (err) {
            console.error('Failed to fetch KOTs:', err);
        } finally {
            setFetchingKOTs(false);
        }
    };

    const fetchBillerSuggestions = async () => {
        try {
            const sug = await getBillerSuggestions();
            setPrepareSuggestions(sug.data || []);
        } catch (err) {
            console.error('Failed to fetch biller suggestions:', err);
        }
    };

    const handlePartialPayment = async (orderId, total) => {
        const amount = paymentAmount[orderId];
        if (amount === undefined || amount === '') return;

        try {
            const res = await updatePayment(orderId, 'cash', parseFloat(amount));
            if (res.data.status === 'paid') {
                // If now fully paid, show bill
                setSelectedOrder(res.data);
                // Also pay for other orders of same table? 
                // For now, let's keep simple payment per order or handle it in backend updatePayment
                // The prompt was about "One Bill", so payment should ideally clear the bill.
                setShowBill(true);
            }
            setPaymentAmount({ ...paymentAmount, [orderId]: '' });
        } catch (error) {
            alert('Failed to update payment');
        }
    };

    useEffect(() => {
        fetchOrders();
        fetchMenuItems();
        fetchCoupons();
        fetchMaxDiscountSetting();
    }, []);

    const fetchMaxDiscountSetting = async () => {
        try {
            const res = await getMaxDiscount();
            setMaxDiscountPercent(res.data.maxDiscountPercent);
        } catch (err) {
            console.error('Failed to fetch max discount:', err);
        }
    };

    const fetchMenuItems = async () => {
        try {
            const res = await getAllMenuItems();
            setAllMenuItems(res.data || []);
        } catch (err) {
            console.error('Failed to fetch menu items:', err);
        }
    };

    const fetchCoupons = async () => {
        try {
            const res = await getCoupons();
            setCoupons(res.data || []);
        } catch (err) {
            console.error('Failed to fetch coupons:', err);
        }
    };

    useEffect(() => {
        if (socket) {
            socket.on('new-order', (order) => {
                console.log('New order received:', order.orderNumber);
                setOrders(prev => [order, ...prev]);

                // Play audio notification chime
                try {
                    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                    audio.play().catch(() => {});
                } catch (_) {}

                // If Auto-Print KOT is enabled on desktop counter, trigger KOT print slip queue
                if (localStorage.getItem('kea_auto_print_kot') === 'true') {
                    const cleanOrdNo = String(order.orderNumber || '').replace(/^CD-/, '');
                    const fullTableName = order.tableName
                        || (order.tables?.length > 0 ? order.tables.map(t => t.name || `Table ${t.tableNumber}`).join(', ') : null)
                        || (order.tableId?.tableNumber ? `Table ${order.tableId.tableNumber}` : null)
                        || (order.tableNumber ? `Table ${order.tableNumber}` : 'Takeaway');
                    const kotData = {
                        kotNumber: order.kotTicket || `KOT-${cleanOrdNo}`,
                        orderNumber: order.orderNumber,
                        tableNumber: fullTableName,
                        staffName: order.placedBy?.name || order.user?.name || 'Staff',
                        items: (order.items || []).map(i => ({ name: i.menuItem?.name || i.name || 'Item', quantity: i.quantity })),
                        notes: order.specialInstructions,
                        timestamp: order.createdAt || new Date()
                    };
                    
                    // Push to print queue and process sequentially
                    setSelectedKOTForPrint(kotData);
                    setTimeout(() => {
                        window.print();
                    }, 400);
                }
            });
            socket.on('order-updated', (order) => {
                console.log('Order updated:', order.orderNumber, 'Status:', order.status);
                setOrders(prev => prev.map(o =>
                    o._id.toString() === order._id.toString() ? order : o
                ));
            });
            // Also listen for bill-requested to update UI in real-time
            socket.on('bill-requested', (order) => {
                console.log('Bill requested for:', order.orderNumber, 'Status:', order.status);
                setOrders(prev => prev.map(o =>
                    o._id.toString() === order._id.toString() ? order : o
                ));
            });
            socket.on('order-deleted', (orderId) => {
                console.log('Order deleted:', orderId);
                setOrders(prev => prev.filter(o => o._id.toString() !== orderId.toString()));
            });
            return () => {
                socket.off('new-order');
                socket.off('order-updated');
                socket.off('bill-requested');
                socket.off('order-deleted');
            };
        }
    }, [socket]);

    const handleDeleteOrder = async (orderId) => {
        if (!window.confirm('Are you absolutely sure you want to permanently delete this order? This will remove all records.')) {
            return;
        }

        try {
            await deleteOrder(orderId);
            setOrders(prev => prev.filter(o => o._id.toString() !== orderId.toString()));
        } catch (error) {
            console.error('Delete order error:', error);
            alert(error.response?.data?.message || 'Failed to delete order');
        }
    };

    const fetchOrders = async () => {
        try {
            const res = await getActiveOrders();
            setOrders(res.data);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    };

    const getSessionOrders = (targetOrder, allList) => {
        const getOrderId = (obj) => obj?._id?.toString() || obj?.toString() || '';
        const orderTime = new Date(targetOrder.createdAt).getTime();
        const ONE_HOUR = 60 * 60 * 1000;

        let sessionOrders = [];
        if (targetOrder.table) {
            const currentTableId = getOrderId(targetOrder.table);
            sessionOrders = allList.filter(o =>
                getOrderId(o.table) === currentTableId &&
                o.status !== 'cancelled' &&
                o.status !== 'paid' &&
                Math.abs(new Date(o.createdAt).getTime() - orderTime) < ONE_HOUR
            );
        } else {
            const currentUserId = getOrderId(targetOrder.user);
            sessionOrders = allList.filter(o =>
                getOrderId(o.user) === currentUserId &&
                targetOrder.user &&
                o.status !== 'cancelled' &&
                o.status !== 'paid' &&
                Math.abs(new Date(o.createdAt).getTime() - orderTime) < ONE_HOUR
            );
        }
        // Ensure at least current is included
        if (!sessionOrders.find(o => o._id === targetOrder._id)) {
            sessionOrders.push(targetOrder);
        }
        return sessionOrders;
    };

    const handleStatusChange = async (orderId, status) => {
        try {
            // Redirect to prepare bill flow for generation
            if (status === 'bill_generated') {
                handleOpenPrepareBill(orderId);
                return;
            }

            await updateOrderStatus(orderId, status);
        } catch (error) {
            alert('Failed to update status');
        }
    };

    const handleOpenPrepareBill = async (orderId) => {
        const targetOrder = orders.find(o => o._id === orderId);
        if (!targetOrder) return;

        const sessionOrders = getSessionOrders(targetOrder, orders);
        setPrepareOrders(sessionOrders);
        setPrepareSelectedOrderIds(sessionOrders.map(o => o._id));
        setPrepareBillerName(localStorage.getItem('lastBillerName') || '');
        setPrepareDiscountInput('');
        setPrepareDiscountName('');
        setShowPrepareModal(true);

        try {
            const sug = await getBillerSuggestions();
            setPrepareSuggestions(sug.data || []);
        } catch (err) {
            console.error(err);
        }
    };

    const handleUpdateItemQuantity = async (orderId, menuItemId, delta) => {
        const order = prepareOrders.find(o => o._id === orderId);
        if (!order) return;

        const updatedItems = order.items.map(item => {
            const isMatch = (item.menuItem?._id || item.menuItem) === menuItemId;
            if (isMatch) {
                const newQty = item.quantity + delta;
                return { ...item, quantity: newQty };
            }
            return item;
        }).filter(item => item.quantity > 0);

        try {
            const res = await updateOrderItems(orderId, updatedItems.map(i => ({
                menuItem: i.menuItem?._id || i.menuItem,
                quantity: i.quantity
            })));
            
            setPrepareOrders(prev => prev.map(o => o._id === orderId ? res.data : o));
            setOrders(prev => prev.map(o => o._id === orderId ? res.data : o));
        } catch (err) {
            alert('Failed to update item quantity');
        }
    };

    const handleRemoveItem = async (orderId, menuItemId) => {
        const order = prepareOrders.find(o => o._id === orderId);
        if (!order) return;

        const updatedItems = order.items.filter(item => (item.menuItem?._id || item.menuItem) !== menuItemId);

        try {
            const res = await updateOrderItems(orderId, updatedItems.map(i => ({
                menuItem: i.menuItem?._id || i.menuItem,
                quantity: i.quantity
            })));
            setPrepareOrders(prev => prev.map(o => o._id === orderId ? res.data : o));
            setOrders(prev => prev.map(o => o._id === orderId ? res.data : o));
        } catch (err) {
            alert('Failed to remove item');
        }
    };

    const handleAddItemToOrder = async (orderId, menuItem) => {
        const order = prepareOrders.find(o => o._id === orderId);
        if (!order) return;

        const existing = order.items.find(i => (i.menuItem?._id || i.menuItem) === menuItem._id);
        let updatedItems = [];
        if (existing) {
            updatedItems = order.items.map(i => 
                (i.menuItem?._id || i.menuItem) === menuItem._id 
                    ? { ...i, quantity: i.quantity + 1 }
                    : i
            );
        } else {
            updatedItems = [...order.items, {
                menuItem: menuItem._id,
                quantity: 1
            }];
        }

        try {
            const res = await updateOrderItems(orderId, updatedItems.map(i => ({
                menuItem: i.menuItem?._id || i.menuItem,
                quantity: i.quantity
            })));
            setPrepareOrders(prev => prev.map(o => o._id === orderId ? res.data : o));
            setOrders(prev => prev.map(o => o._id === orderId ? res.data : o));
            setSearchQueryByOrder(prev => ({ ...prev, [orderId]: '' }));
        } catch (err) {
            alert('Failed to add item');
        }
    };

    const handleDeletePrepareOrder = async (orderId) => {
        if (!window.confirm('Delete this order completely?')) return;
        try {
            await deleteOrder(orderId);
            setPrepareOrders(prev => prev.filter(o => o._id !== orderId));
            setPrepareSelectedOrderIds(prev => prev.filter(id => id !== orderId));
            setOrders(prev => prev.filter(o => o._id !== orderId));
        } catch (err) {
            alert('Failed to delete order');
        }
    };

    const parseDiscount = (input, baseAmt, type) => {
        if (!input && input !== 0) return 0;
        const trimmed = String(input).trim();
        if (!trimmed) return 0;
        const num = parseFloat(trimmed) || 0;
        // If type is explicitly passed, use it; otherwise fall back to string detection
        if (type === '₹') return num;
        if (type === '%') return (baseAmt * num) / 100;
        // Legacy fallback: detect by trailing % character
        if (trimmed.endsWith('%')) return (baseAmt * (parseFloat(trimmed) || 0)) / 100;
        return num;
    };

    const getSelectedSubtotal = () => {
        const selected = prepareOrders.filter(o => prepareSelectedOrderIds.includes(o._id));
        return selected.reduce((sum, order) => {
            const itemSubtotal = (order.items || []).reduce((s, item) => s + ((item.price || 0) * (item.quantity || 1)), 0);
            return sum + (order.subtotal || itemSubtotal);
        }, 0);
    };

    const handleConfirmPrepareBill = async (e) => {
        e.preventDefault();
        if (prepareSelectedOrderIds.length === 0) {
            alert('Please select at least one order to bill.');
            return;
        }
        if (!prepareBillerName.trim()) {
            alert('Please enter a biller name.');
            return;
        }

        setIsSavingBill(true);
        try {
            const res = await generateBill({
                orderIds: prepareSelectedOrderIds,
                billerName: prepareBillerName,
                discount: parseDiscount(prepareDiscountInput, getSelectedSubtotal(), prepareDiscountType),
                discountName: prepareDiscountName
            });

            localStorage.setItem('lastBillerName', prepareBillerName);
            setShowPrepareModal(false);
            
            setSelectedOrdersForBill([res.data.order]); 
            setShowBill(true);
            fetchOrders();
        } catch (err) {
            alert('Failed to generate bill');
        } finally {
            setIsSavingBill(false);
        }
    };

    const handleOpenPaymentBiller = (orderId, method, amount) => {
        const order = orders.find(o => o._id === orderId);
        const orderTotal = order ? (order.total || order.items.reduce((s, i) => s + (i.price * i.quantity), 0) * 1.05) : amount;
        let payAmount = amount;
        let shortageDiscount = 0;

        if (payAmount < orderTotal - 0.01) {
            shortageDiscount = Math.round((orderTotal - payAmount) * 100) / 100;
        }

        setPaymentBillerOrderId(orderId);
        setPaymentBillerMethod(method);
        setPaymentBillerAmount(payAmount);
        setPaymentBillerName(order?.billerName || localStorage.getItem('lastBillerName') || 'Counter');
        setPaymentDiscountInput(shortageDiscount > 0 ? String(shortageDiscount) : (order?.discount ? String(order.discount) : ''));
        setPaymentDiscountType(shortageDiscount > 0 ? '₹' : '%');
        setPaymentDiscountName(shortageDiscount > 0 ? 'Change Shortage Discount' : (order?.discountName || ''));
        setShowPaymentBillerModal(true);
    };

    const handlePayButtonClick = (order) => {
        const customInput = paymentAmount[order._id];
        const remBalance = Math.max(order.total - (order.amountPaid || 0), 0);
        const payVal = (customInput && parseFloat(customInput) > 0) ? parseFloat(customInput) : remBalance;

        if (payVal <= 0) return;

        setQuickPayOrder(order);
        setQuickPayAmount(payVal);
        setShowQuickPayModal(true);
    };

    const handleConfirmPaymentBiller = async (e) => {
        if (e) e.preventDefault();
        if (!paymentBillerName.trim()) {
            alert('Please enter or select a biller name.');
            return;
        }

        try {
            const targetOrder = orders.find(o => o._id === paymentBillerOrderId);
            const sessionOrders = targetOrder ? getSessionOrders(targetOrder, orders) : [];
            const orderIds = sessionOrders.map(o => o._id);
            const baseSubtotal = sessionOrders.reduce((sum, o) => sum + (o.subtotal || o.total), 0);
            const discountVal = parseDiscount(paymentDiscountInput, baseSubtotal, paymentDiscountType);
            const discountPct = baseSubtotal > 0 ? (discountVal / baseSubtotal) * 100 : 0;

            if (user?.role !== 'superadmin' && discountPct > maxDiscountPercent + 0.01) {
                alert(`Discount (${discountPct.toFixed(1)}%) exceeds maximum allowed limit of ${maxDiscountPercent}%. Only superadmin can approve.`);
                return;
            }

            // 1. Generate/Save the Bill document in DB first to persist billerName, discount and create invoice
            const billRes = await generateBill({
                orderIds: orderIds.length > 0 ? orderIds : [paymentBillerOrderId],
                billerName: paymentBillerName,
                discount: discountVal,
                discountName: paymentDiscountName
            });

            // 2. Complete payment
            const finalPayable = ((baseSubtotal - discountVal) * 1.05);
            const res = await updatePayment(paymentBillerOrderId, paymentBillerMethod, finalPayable > 0 ? finalPayable : paymentBillerAmount);
            localStorage.setItem('lastBillerName', paymentBillerName);
            setShowPaymentBillerModal(false);
            fetchOrders();
            setSelectedOrder(res.data);

            if (sessionOrders.length > 0) {
                const updatedSessionOrders = sessionOrders.map(o => 
                    o._id === paymentBillerOrderId ? { ...o, status: 'paid', paymentMethod: paymentBillerMethod, billerName: paymentBillerName, discount: discountVal, discountName: paymentDiscountName, total: finalPayable } : { ...o, billerName: paymentBillerName, discount: discountVal }
                );
                setSelectedOrdersForBill(updatedSessionOrders);
                setShowBill(true);
            }
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to process payment and bill generation');
        }
    };

    const handleOpenSplitPaymentModal = (orderId, amount) => {
        const order = orders.find(o => o._id === orderId);
        setPaymentBillerOrderId(orderId);
        setPaymentBillerAmount(amount);
        setPaymentBillerName(order?.billerName || localStorage.getItem('lastBillerName') || '');
        setPaymentDiscountInput(order?.discount ? String(order.discount) : '');
        setPaymentDiscountType('%');
        setPaymentDiscountName(order?.discountName || '');
        setSplitCash('');
        setSplitUpi('');
        setSplitCard('');
        setShowSplitModal(true);
        fetchBillerSuggestions();
    };

    const handleConfirmSplitPayment = async (e) => {
        if (e) e.preventDefault();
        if (!paymentBillerName.trim()) {
            alert('Please enter or select a biller name.');
            return;
        }

        const cashVal = parseFloat(splitCash) || 0;
        const upiVal = parseFloat(splitUpi) || 0;
        const cardVal = parseFloat(splitCard) || 0;
        const totalSplit = cashVal + upiVal + cardVal;

        if (totalSplit <= 0) {
            alert('Please enter split amounts for Cash, UPI or Card.');
            return;
        }

        try {
            const targetOrder = orders.find(o => o._id === paymentBillerOrderId);
            const sessionOrders = targetOrder ? getSessionOrders(targetOrder, orders) : [];
            const orderIds = sessionOrders.map(o => o._id);
            const baseSubtotal = sessionOrders.reduce((sum, o) => sum + (o.subtotal || o.total), 0);
            const discountVal = parseDiscount(paymentDiscountInput, baseSubtotal, paymentDiscountType);

            await generateBill({
                orderIds: orderIds.length > 0 ? orderIds : [paymentBillerOrderId],
                billerName: paymentBillerName,
                discount: discountVal,
                discountName: paymentDiscountName,
                paymentMethod: 'split',
                splitPaymentDetails: {
                    cash: cashVal,
                    upi: upiVal,
                    card: cardVal
                }
            });

            localStorage.setItem('lastBillerName', paymentBillerName);
            setShowSplitModal(false);
            fetchOrders();

            if (sessionOrders.length > 0) {
                const updatedSessionOrders = sessionOrders.map(o => 
                    o._id === paymentBillerOrderId ? { ...o, status: 'paid', paymentMethod: 'split', splitPaymentDetails: { cash: cashVal, upi: upiVal, card: cardVal }, billerName: paymentBillerName, discount: discountVal, discountName: paymentDiscountName } : { ...o, billerName: paymentBillerName, discount: discountVal }
                );
                setSelectedOrdersForBill(updatedSessionOrders);
                setShowBill(true);
            }
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to process split payment');
        }
    };

    // Move Table state
    const [allTables, setAllTables] = useState([]);
    const [moveSectionFilter, setMoveSectionFilter] = useState('All');
    const [selectedMoveTableId, setSelectedMoveTableId] = useState('');
    const [isMovingTable, setIsMovingTable] = useState(false);

    const fetchTables = async () => {
        try {
            const res = await getTables();
            setAllTables(res.data || []);
        } catch (e) {
            console.error('Error fetching tables:', e);
        }
    };

    useEffect(() => {
        fetchTables();
    }, []);

    useEffect(() => {
        if (socket) {
            const handleTableSync = () => fetchTables();
            socket.on('table-updated', handleTableSync);
            socket.on('table-freed', handleTableSync);
            socket.on('table-occupied', handleTableSync);
            return () => {
                socket.off('table-updated', handleTableSync);
                socket.off('table-freed', handleTableSync);
                socket.off('table-occupied', handleTableSync);
            };
        }
    }, [socket]);

    const handleMoveTableSubmit = async () => {
        if (!editingOrder || !selectedMoveTableId) return;
        setIsMovingTable(true);
        try {
            const res = await moveOrderTable(editingOrder._id, [selectedMoveTableId]);
            alert(`Customer moved to Table ${res.data.tableNumber} successfully!`);
            setEditingOrder(res.data);
            setOrders(prev => prev.map(o => o._id === res.data._id ? res.data : o));
            setPrepareOrders(prev => prev.map(o => o._id === res.data._id ? res.data : o));
            setSelectedMoveTableId('');
            fetchTables();
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to change table');
        } finally {
            setIsMovingTable(false);
        }
    };

    const handleOpenModifyOrder = async (order) => {
        setEditingOrder(order);
        const initialList = (order.items || []).map(i => ({
            menuItemId: i.menuItem?._id || i.menuItem || i._id,
            name: i.name || i.menuItem?.name || 'Item',
            price: i.price || i.menuItem?.price || 0,
            quantity: i.quantity
        }));
        setModifyItemsList(initialList);
        setModifyNote('');
        setModifySearchQuery('');
        setModifyCategoryFilter('');
        setSelectedMoveTableId('');
        setMoveSectionFilter('All');
        fetchTables();
        setShowModifyModal(true);

        try {
            const [menuRes, catRes] = await Promise.all([
                getAllMenuItems(),
                getCategories()
            ]);
            setMenuItemsList(menuRes.data || []);
            setMenuCategories(catRes.data || []);
        } catch (err) {
            console.error('Error fetching menu/categories for modify modal:', err);
        }
    };

    const handleSaveModifyOrder = async (e) => {
        if (e) e.preventDefault();
        if (!editingOrder) return;

        setSubmittingModify(true);
        try {
            const payload = {
                updatedItems: modifyItemsList.map(i => ({
                    menuItemId: i.menuItemId,
                    quantity: i.quantity
                })),
                modificationNote: modifyNote
            };

            const res = await modifyOrderItems(editingOrder._id, payload);
            const { addedKot, cancelledKot } = res.data;

            setShowModifyModal(false);
            fetchOrders();

            if (addedKot) {
                setSelectedKOTForPrint({
                    kotNumber: addedKot.kotNumber,
                    orderNumber: editingOrder.orderNumber,
                    tableNumber: editingOrder.tableNumber || 'Takeaway',
                    staffName: user?.name || 'Admin',
                    items: addedKot.items,
                    notes: addedKot.notes,
                    timestamp: new Date()
                });
            } else if (cancelledKot) {
                setSelectedKOTForPrint({
                    kotNumber: cancelledKot.kotNumber,
                    orderNumber: editingOrder.orderNumber,
                    tableNumber: editingOrder.tableNumber || 'Takeaway',
                    staffName: user?.name || 'Admin',
                    items: cancelledKot.items,
                    notes: cancelledKot.notes,
                    timestamp: new Date()
                });
            }
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to modify order items');
        } finally {
            setSubmittingModify(false);
        }
    };

    const handleShowBill = (order) => {
        if (order.status !== 'bill_generated' && order.status !== 'paid') {
            handleOpenPrepareBill(order._id);
            return;
        }
        const sessionOrders = getSessionOrders(order, orders);
        setSelectedOrdersForBill(sessionOrders);
        setShowBill(true);
    };

    const getNextStatus = (status) => {
        const flow = {
            pending: 'confirmed',
            confirmed: 'preparing',
            preparing: 'ready',
            ready: 'served',
            bill_requested: 'bill_generated'
        };
        return flow[status];
    };

    const getStatusLabel = (status) => ({
        pending: 'Confirm Order',
        confirmed: 'Start Preparing',
        preparing: 'Mark Ready',
        ready: 'Mark Served',
        bill_requested: 'Generate Bill'
    }[status]);

    if (loading) return <Loader message="Cooking up some orders..." />;

    return (
        <div className="admin-orders">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
                <h1 style={{ margin: 0 }}>Orders Management</h1>
                {/* Navigation Tabs */}
                <div className="analytics-tabs" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                        className={`btn ${autoPrintKOT ? 'btn-success' : 'btn-secondary'}`}
                        style={{
                            background: autoPrintKOT ? '#059669' : '#4B5563',
                            color: '#FFFFFF',
                            borderColor: autoPrintKOT ? '#059669' : '#4B5563',
                            fontWeight: 'bold'
                        }}
                        onClick={toggleAutoPrintKOT}
                        title="Auto-trigger 80mm KOT print on desktop USB printer when staff places order"
                    >
                        {autoPrintKOT ? '⚡ Auto-Print KOT: ON' : '⏸️ Auto-Print KOT: OFF'}
                    </button>
                    <button
                        className={`btn ${activeTab === 'active' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setActiveTab('active')}
                    >
                        Active Orders ({orders.filter(o => o.status !== 'paid' && o.status !== 'cancelled').length})
                    </button>
                    <button
                        className={`btn ${activeTab === 'kots' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => {
                            setActiveTab('kots');
                            fetchKOTs();
                        }}
                    >
                        KOTs History Log
                    </button>
                    <button
                        className={`btn ${activeTab === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setActiveTab('all')}
                    >
                        All Orders ({orders.length})
                    </button>
                </div>
            </div>

            {/* KOTs VIEW */}
            {activeTab === 'kots' ? (
                <div className="kots-view-section">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px', background: '#F9FAFB', padding: '12px 16px', borderRadius: '8px', border: '1.5px solid #111' }}>
                        <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>
                            {user?.role === 'superadmin' ? 'Select Date to View KOTs' : "Today's Generated KOT Tickets"}
                        </div>
                        {user?.role === 'superadmin' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Date Filter:</label>
                                <input
                                    type="date"
                                    value={kotFilterDate}
                                    onChange={(e) => {
                                        setKotFilterDate(e.target.value);
                                        fetchKOTs(e.target.value);
                                    }}
                                    className="input"
                                    style={{ padding: '6px 10px', borderRadius: '6px', border: '2px solid #111' }}
                                />
                                <button className="btn btn-secondary btn-sm" onClick={() => fetchKOTs()}>Refresh</button>
                            </div>
                        ) : (
                            <button className="btn btn-secondary btn-sm" onClick={() => fetchKOTs()}>Refresh KOTs</button>
                        )}
                    </div>

                    {fetchingKOTs ? (
                        <Loader message="Loading KOT Tickets..." />
                    ) : kotList.length === 0 ? (
                        <p style={{ textAlign: 'center', color: '#666', padding: '50px', fontStyle: 'italic', background: '#FFF', borderRadius: '8px', border: '1px solid #DDD' }}>
                            No KOT tickets generated for this date.
                        </p>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '16px' }}>
                            {kotList.map(kot => (
                                <div key={kot._id} style={{ background: '#FFF', border: '2px solid #111', borderRadius: '10px', padding: '16px', boxShadow: '3px 3px 0px #111', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #111', paddingBottom: '8px', marginBottom: '10px' }}>
                                            <span style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#7C3AED' }}>{kot.kotNumber}</span>
                                            <span style={{ background: '#E2E8F0', padding: '2px 8px', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 'bold' }}>Table {kot.tableNumber}</span>
                                        </div>

                                        <div style={{ fontSize: '0.85rem', color: '#555', marginBottom: '10px' }}>
                                            <div>👤 <strong>Staff:</strong> {kot.staffName}</div>
                                            <div>🕒 <strong>Time:</strong> {new Date(kot.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                        </div>

                                        <div style={{ borderTop: '1px dashed #CCC', borderBottom: '1px dashed #CCC', padding: '8px 0', marginBottom: '10px' }}>
                                            {kot.items.map((item, idx) => (
                                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '4px' }}>
                                                    <span style={{ fontWeight: '500' }}>{item.name}</span>
                                                    <strong style={{ color: '#111' }}>x{item.quantity}</strong>
                                                </div>
                                            ))}
                                        </div>

                                        {kot.notes && (
                                            <div style={{ background: '#FEF3C7', border: '1px solid #F59E0B', color: '#92400E', padding: '6px 8px', borderRadius: '4px', fontSize: '0.8rem', marginBottom: '10px' }}>
                                                📌 <strong>Note:</strong> {kot.notes}
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => setSelectedKOTForPrint(kot)}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%', marginTop: '8px', background: '#111', color: '#FFF' }}
                                    >
                                        <FiPrinter /> Print KOT Slip
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                /* ACTIVE OR ALL ORDERS GRID */
                <div className="orders-board">
                    {orders.filter(o => activeTab === 'all' ? true : (o.status !== 'paid' && o.status !== 'cancelled')).length === 0 ? (
                        <div className="no-orders">
                            <p>{activeTab === 'all' ? 'No orders recorded' : 'No active orders'}</p>
                        </div>
                    ) : (
                        <div className="orders-grid">
                            {orders.filter(o => activeTab === 'all' ? true : (o.status !== 'paid' && o.status !== 'cancelled')).map(order => (
                                <div key={order._id} className={`order-card status-${order.status}`}>
                                    <div className="order-header">
                                        <span className="order-num">#{order.orderNumber}</span>
                                        <span className={`status-badge ${order.status}`}>
                                            {order.status.replace('_', ' ')}
                                        </span>
                                    </div>

                                    <div className="order-customer">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                            <strong>{order.user?.name || 'Customer'}</strong>
                                            <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: order.placedBy ? '#7C3AED' : '#0EA5E9', color: '#FFF', fontWeight: 'bold' }}>
                                                {order.placedBy ? `Staff: ${order.placedBy.name || 'Staff'}` : 'User'}
                                            </span>
                                        </div>
                                        <span>{order.user?.phone}</span>
                                        {order.tableNumber && <span>Table: {order.tableNumber}</span>}
                                    </div>

                                    <div className="order-items">
                                        {order.items.map((item, i) => (
                                            <div key={i} className="order-item">
                                                <span>{item.name}</span>
                                                <span>x{item.quantity}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {order.specialInstructions && (
                                        <div className="order-special-instructions">
                                            <strong><FiAlertTriangle /> Note:</strong> {order.specialInstructions}
                                        </div>
                                    )}

                                    <div className="order-total">
                                        <div className="total-row">
                                            <span>Total</span>
                                            <span>₹{order.total.toFixed(2)}</span>
                                        </div>
                                        <div className="payment-row">
                                            <div className="payment-status">
                                                <div
                                                    className="payment-fill"
                                                    style={{ width: `${Math.min((order.amountPaid || 0) / order.total * 100, 100)}%` }}
                                                ></div>
                                            </div>
                                            <div className="payment-labels">
                                                <span className="paid">Paid: ₹{order.amountPaid || 0}</span>
                                                <span className="pending">Bal: ₹{Math.max(order.total - (order.amountPaid || 0), 0).toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="order-payment-input">
                                        <input
                                            type="number"
                                            placeholder="Add Pay"
                                            value={paymentAmount[order._id] || ''}
                                            onChange={(e) => setPaymentAmount({ ...paymentAmount, [order._id]: e.target.value })}
                                        />
                                        <button onClick={() => handlePayButtonClick(order)} style={{ cursor: 'pointer', background: '#7C3AED', color: '#FFF', fontWeight: 'bold' }}>Pay</button>
                                    </div>

                                    <div className="order-actions">
                                        {order.status !== 'paid' && (
                                            <div className="payment-btns" style={{ display: 'flex', gap: '6px', width: '100%', flexWrap: 'wrap', position: 'relative', zIndex: 10 }}>
                                                <button
                                                    type="button"
                                                    className="btn btn-success btn-sm"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleOpenPaymentBiller(order._id, 'cash', order.total);
                                                    }}
                                                    style={{ cursor: 'pointer', flex: 1, minWidth: '80px', zIndex: 10 }}
                                                >
                                                    Cash Paid
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-primary btn-sm"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleOpenPaymentBiller(order._id, 'online', order.total);
                                                    }}
                                                    style={{ cursor: 'pointer', flex: 1, minWidth: '80px', zIndex: 10 }}
                                                >
                                                    UPI Paid
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleOpenPaymentBiller(order._id, 'card', order.total);
                                                    }}
                                                    style={{ cursor: 'pointer', flex: 1, minWidth: '80px', background: '#4F46E5', color: '#FFF', border: 'none', zIndex: 10 }}
                                                >
                                                    Card Paid
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleOpenSplitPaymentModal(order._id, order.total);
                                                    }}
                                                    style={{ cursor: 'pointer', flex: 1, minWidth: '80px', background: '#D97706', color: '#FFF', border: 'none', zIndex: 10 }}
                                                >
                                                    Split Pay
                                                </button>
                                            </div>
                                        )}

                                    {order.status === 'pending' && (
                                        <button
                                            className="btn btn-danger btn-sm"
                                            onClick={() => handleStatusChange(order._id, 'cancelled')}
                                        >
                                            <FiX /> Cancel
                                        </button>
                                    )}

                                    {['confirmed', 'preparing', 'ready', 'served', 'bill_requested'].includes(order.status) && (
                                        <div style={{ display: 'flex', gap: '6px', width: '100%', marginTop: '4px' }}>
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleOpenModifyOrder(order);
                                                }}
                                                style={{ flex: 1, background: '#7C3AED', color: '#FFF', border: 'none', fontWeight: 'bold', fontSize: '0.8rem', padding: '6px 8px' }}
                                            >
                                                ✏️ Partial Edit / Cancel
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-danger btn-sm"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (window.confirm('Are you sure you want to cancel this ENTIRE order?')) {
                                                        handleStatusChange(order._id, 'cancelled');
                                                    }
                                                }}
                                                style={{ opacity: 0.85, fontSize: '0.8rem', padding: '6px 10px' }}
                                            >
                                                <FiX /> Cancel All
                                            </button>
                                        </div>
                                    )}

                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => handleShowBill(order)}
                                    >
                                        <FiFileText /> Bill
                                    </button>

                                    {user && user.role === 'superadmin' && (
                                        <button
                                            className="btn btn-danger btn-sm"
                                            onClick={() => handleDeleteOrder(order._id)}
                                            title="Delete Order Permanently"
                                            style={{ backgroundColor: '#EF4444', color: 'white', border: 'none' }}
                                        >
                                            <FiTrash2 /> Delete
                                        </button>
                                    )}
                                </div>

                                <div className="order-time">
                                    {new Date(order.createdAt).toLocaleTimeString()}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            )}

            <div className="admin-orders-bills-section" style={{ marginTop: '40px', paddingTop: '30px', borderTop: '4px dashed #111111' }}>
                <AdminBills />
            </div>

            {/* Prepare Bill Modal */}
            {showPrepareModal && prepareOrders.length > 0 && (
                <div className="bill-modal-overlay" onClick={() => setShowPrepareModal(false)}>
                    <div className="bill-container" onClick={e => e.stopPropagation()} style={{ fontFamily: 'inherit', maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #111111', paddingBottom: '10px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.4rem', fontFamily: "'Patrick Hand', cursive" }}>Prepare Table Bill</h2>
                            <button onClick={() => setShowPrepareModal(false)} style={{ background: 'transparent', border: 'none', fontSize: '1.25rem', cursor: 'pointer' }}><FiX /></button>
                        </div>

                        <p style={{ fontSize: '0.85rem', color: '#6B7280', margin: '-10px 0 15px 0' }}>
                            Select which orders to include in this bill. You can edit quantities, add items or delete orders before generating the bill.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '20px' }}>
                            {prepareOrders.map(order => {
                                const isSelected = prepareSelectedOrderIds.includes(order._id);
                                const q = searchQueryByOrder[order._id] || '';
                                return (
                                    <div key={order._id} style={{ border: '2px solid #111111', borderRadius: '8px', padding: '14px', background: isSelected ? '#FAF5FF' : '#F9FAFB', opacity: isSelected ? 1 : 0.65 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px dashed #DDD', paddingBottom: '8px' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={isSelected}
                                                    onChange={() => {
                                                        if (isSelected) {
                                                            setPrepareSelectedOrderIds(prev => prev.filter(id => id !== order._id));
                                                        } else {
                                                            setPrepareSelectedOrderIds(prev => [...prev, order._id]);
                                                        }
                                                    }}
                                                />
                                                <span>Order #{order.orderNumber}</span>
                                            </label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <span style={{ fontSize: '0.85rem', background: '#E2E8F0', padding: '2px 8px', borderRadius: '4px' }}>Table {order.tableNumber || 'Takeaway'}</span>
                                                {user && user.role === 'superadmin' && (
                                                    <button 
                                                        type="button" 
                                                        onClick={() => handleDeletePrepareOrder(order._id)}
                                                        style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}
                                                    >
                                                        <FiTrash2 /> Delete
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Order Items */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                                            {order.items.map(item => (
                                                <div key={item._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
                                                    <span>{item.name} (₹{item.price})</span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #111', borderRadius: '4px', overflow: 'hidden', background: '#FFF' }}>
                                                            <button 
                                                                type="button" 
                                                                onClick={() => handleUpdateItemQuantity(order._id, item.menuItem?._id || item.menuItem, -1)}
                                                                style={{ padding: '2px 8px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                                                            >-</button>
                                                            <span style={{ padding: '0 4px', fontWeight: 'bold' }}>{item.quantity}</span>
                                                            <button 
                                                                type="button" 
                                                                onClick={() => handleUpdateItemQuantity(order._id, item.menuItem?._id || item.menuItem, 1)}
                                                                style={{ padding: '2px 8px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                                                            >+</button>
                                                        </div>
                                                        <button 
                                                            type="button" 
                                                            onClick={() => handleRemoveItem(order._id, item.menuItem?._id || item.menuItem)}
                                                            style={{ border: 'none', background: 'transparent', color: '#EF4444', cursor: 'pointer' }}
                                                        >
                                                            <FiX />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Quick Add Item Search for this Order */}
                                        <div style={{ position: 'relative' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#FFF', border: '1px solid #111', borderRadius: '6px', padding: '4px 8px' }}>
                                                <FiSearch style={{ color: '#888', fontSize: '0.9rem' }} />
                                                <input 
                                                    type="text" 
                                                    placeholder="Quick Add Item..."
                                                    value={q}
                                                    onChange={(e) => setSearchQueryByOrder(prev => ({ ...prev, [order._id]: e.target.value }))}
                                                    style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.85rem' }}
                                                />
                                                {q && <FiX onClick={() => setSearchQueryByOrder(prev => ({ ...prev, [order._id]: '' }))} style={{ cursor: 'pointer', color: '#888' }} />}
                                            </div>
                                            
                                            {q && (
                                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000, background: '#FFF', border: '1px solid #111', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: '150px', overflowY: 'auto', marginTop: '4px' }}>
                                                    {allMenuItems
                                                        .filter(m => m.name.toLowerCase().includes(q.toLowerCase()))
                                                        .slice(0, 10)
                                                        .map(m => (
                                                            <div 
                                                                key={m._id} 
                                                                onClick={() => handleAddItemToOrder(order._id, m)}
                                                                style={{ padding: '8px 12px', fontSize: '0.85rem', cursor: 'pointer', borderBottom: '1px solid #EEE', display: 'flex', justifyContent: 'space-between' }}
                                                                className="suggestion-item"
                                                            >
                                                                <span>{m.name}</span>
                                                                <span style={{ fontWeight: 'bold' }}>₹{m.price}</span>
                                                            </div>
                                                        ))
                                                    }
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Biller Name & Discount Form */}
                        <form onSubmit={handleConfirmPrepareBill} style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '2px dashed #111', paddingTop: '15px' }}>
                            <div className="input-group" style={{ position: 'relative' }}>
                                <label style={{ fontWeight: 600, display: 'block', marginBottom: '6px' }}>Biller Name *</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Type Biller Name..."
                                    value={prepareBillerName}
                                    onChange={(e) => {
                                        setPrepareBillerName(e.target.value);
                                        setShowPrepareSuggestions(true);
                                    }}
                                    onFocus={() => setShowPrepareSuggestions(true)}
                                    className="input"
                                    style={{ width: '100%', padding: '10px', border: '2px solid #111111', borderRadius: '6px' }}
                                />
                                {showPrepareSuggestions && prepareSuggestions.length > 0 && (
                                    <div className="biller-suggestions-dropdown" style={{ zIndex: 1001 }}>
                                        {prepareSuggestions
                                            .filter(sug => sug.toLowerCase().includes(prepareBillerName.toLowerCase()))
                                            .slice(0, 15)
                                            .map((sug, idx) => (
                                                <div
                                                    key={idx}
                                                    onClick={() => {
                                                        setPrepareBillerName(sug);
                                                        setShowPrepareSuggestions(false);
                                                    }}
                                                    className="suggestion-item"
                                                >
                                                    {sug}
                                                </div>
                                            ))
                                        }
                                    </div>
                                )}
                            </div>

                            {/* Coupon Code Selector for Billing */}
                            <div className="input-group">
                                <label style={{ fontWeight: 600, display: 'block', marginBottom: '6px' }}>Apply Coupon (Optional)</label>
                                <select
                                    value={prepareDiscountInput}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setPrepareDiscountInput(val);
                                        const matchedCoupon = coupons.find(c => (c.discountType === 'percentage' ? `${c.discountValue}%` : `${c.discountValue}`) === val);
                                        if (matchedCoupon) {
                                            setPrepareDiscountName(matchedCoupon.code);
                                        } else {
                                            setPrepareDiscountName('');
                                        }
                                    }}
                                    className="input"
                                    style={{ width: '100%', padding: '10px', border: '2px solid #111111', borderRadius: '6px' }}
                                >
                                    <option value="">-- No Coupon --</option>
                                    {coupons.map(c => (
                                        <option key={c._id} value={c.discountType === 'percentage' ? `${c.discountValue}%` : `${c.discountValue}`}>
                                            {c.code} - {c.discountType === 'percentage' ? `${c.discountValue}%` : `₹${c.discountValue}`} Off (Min: ₹{c.minOrderAmount})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Custom discount text box - Percentage only */}
                            <div className="input-group">
                                <label style={{ fontWeight: 600, display: 'block', marginBottom: '6px' }}>Custom Discount (%)</label>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="any"
                                        placeholder="e.g. 10 (for 10%)"
                                        value={prepareDiscountInput}
                                        onChange={(e) => setPrepareDiscountInput(e.target.value)}
                                        className="input"
                                        style={{ flex: 1, padding: '10px', border: '2px solid #111111', borderRadius: '6px' }}
                                    />
                                    <span style={{ padding: '8px 14px', background: '#7C3AED', color: '#FFF', borderRadius: '6px', fontWeight: 'bold', fontSize: '1rem' }}>%</span>
                                </div>
                            </div>

                            {/* Custom discount name / reason */}
                            {parseDiscount(prepareDiscountInput, getSelectedSubtotal(), prepareDiscountType) > 0 && (
                                <div className="input-group">
                                    <label style={{ fontWeight: 600, display: 'block', marginBottom: '6px' }}>Discount Reason / Name (e.g. Staff Discount, Birthday Special)</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Birthday Offer"
                                        value={prepareDiscountName}
                                        onChange={(e) => setPrepareDiscountName(e.target.value)}
                                        className="input"
                                        style={{ width: '100%', padding: '10px', border: '2px solid #111111', borderRadius: '6px' }}
                                    />
                                </div>
                            )}

                            {/* Live Summary & Violation Alert */}
                            {(() => {
                                const subtotal = getSelectedSubtotal();
                                const discVal = parseDiscount(prepareDiscountInput, subtotal, prepareDiscountType);
                                const discPct = subtotal > 0 ? (discVal / subtotal) * 100 : 0;
                                const isExceeding = user?.role !== 'superadmin' && discPct > maxDiscountPercent + 0.01;
                                const taxVal = (subtotal - discVal) * 0.05;
                                const grandTotal = (subtotal - discVal) + taxVal;

                                return (
                                    <>
                                        {isExceeding && (
                                            <div style={{ background: '#FEE2E2', border: '2px solid #EF4444', color: '#B91C1C', padding: '10px 12px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, margin: '6px 0' }}>
                                                ⛔ DISCOUNT EXCEEDED! Maximum allowed discount is {maxDiscountPercent}%. You applied {discPct.toFixed(1)}%. Bill generation is BLOCKED. Only superadmin can approve.
                                            </div>
                                        )}

                                        <div style={{ background: '#F3F4F6', padding: '12px', borderRadius: '6px', border: '1px solid #E5E7EB', margin: '8px 0' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '4px', color: '#111111' }}>
                                                <span>Subtotal:</span>
                                                <span>₹{subtotal.toFixed(2)}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '4px', color: '#DC2626' }}>
                                                <span>Discount ({discPct.toFixed(1)}%):</span>
                                                <span>- ₹{discVal.toFixed(2)}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '8px', color: '#111111' }}>
                                                <span>GST (5%):</span>
                                                <span>₹{taxVal.toFixed(2)}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.05rem', borderTop: '1px dashed #D1D5DB', paddingTop: '6px', color: '#7C3AED' }}>
                                                <span>GRAND TOTAL:</span>
                                                <span>₹{grandTotal.toFixed(2)}</span>
                                            </div>
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={isSavingBill || prepareSelectedOrderIds.length === 0 || isExceeding}
                                            className="btn btn-primary btn-full sketch-border sketch-shadow"
                                            style={{
                                                opacity: isExceeding ? 0.5 : 1,
                                                cursor: isExceeding ? 'not-allowed' : 'pointer',
                                                backgroundColor: isExceeding ? '#9CA3AF' : undefined
                                            }}
                                        >
                                            {isSavingBill ? 'Generating Bill...' : isExceeding ? `Blocked: Exceeds ${maxDiscountPercent}% Max Limit` : 'Confirm & Generate Bill'}
                                        </button>
                                    </>
                                );
                            })()}
                        </form>
                    </div>
                </div>
            )}
            {/* Payment Biller Selection Modal */}
            {showPaymentBillerModal && (
                <div className="bill-modal-overlay" onClick={() => setShowPaymentBillerModal(false)}>
                    <div className="bill-container" onClick={e => e.stopPropagation()} style={{ fontFamily: 'inherit', maxWidth: '480px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #111111', paddingBottom: '10px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.4rem', fontFamily: "'Patrick Hand', cursive" }}>Confirm Payment & Bill</h2>
                            <button onClick={() => setShowPaymentBillerModal(false)} style={{ background: 'transparent', border: 'none', fontSize: '1.25rem', cursor: 'pointer' }}><FiX /></button>
                        </div>
                        <form onSubmit={handleConfirmPaymentBiller} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div style={{ fontSize: '0.9rem', color: '#555' }}>
                                Mark payment as <strong style={{ color: 'var(--primary)' }}>{paymentBillerMethod.toUpperCase()}</strong>.
                            </div>

                            {/* Biller Name */}
                            <div className="input-group" style={{ position: 'relative', marginBottom: 0 }}>
                                <label style={{ fontWeight: 600, display: 'block', marginBottom: '4px', fontSize: '0.85rem' }}>Biller Name *</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Type or select biller..."
                                    value={paymentBillerName}
                                    onChange={(e) => {
                                        setPaymentBillerName(e.target.value);
                                        setShowPaymentBillerSuggestions(true);
                                    }}
                                    onFocus={() => setShowPaymentBillerSuggestions(true)}
                                    className="input"
                                    style={{ width: '100%', padding: '8px 10px', border: '2px solid #111111', borderRadius: '6px', fontSize: '0.9rem' }}
                                />
                                {showPaymentBillerSuggestions && prepareSuggestions.length > 0 && (
                                    <div className="biller-suggestions-dropdown" style={{ zIndex: 1004 }}>
                                        {prepareSuggestions
                                            .filter(sug => sug.toLowerCase().includes(paymentBillerName.toLowerCase()))
                                            .slice(0, 15)
                                            .map((sug, idx) => (
                                                <div
                                                    key={idx}
                                                    onClick={() => {
                                                        setPaymentBillerName(sug);
                                                        setShowPaymentBillerSuggestions(false);
                                                    }}
                                                    className="suggestion-item"
                                                >
                                                    {sug}
                                                </div>
                                            ))
                                        }
                                    </div>
                                )}
                            </div>

                            {/* Coupon Code Selector */}
                            <div className="input-group" style={{ marginBottom: 0 }}>
                                <label style={{ fontWeight: 600, display: 'block', marginBottom: '4px', fontSize: '0.85rem' }}>Apply Coupon (Optional)</label>
                                <select
                                    value={paymentDiscountInput}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setPaymentDiscountInput(val);
                                        const matchedCoupon = coupons.find(c => (c.discountType === 'percentage' ? `${c.discountValue}%` : `${c.discountValue}`) === val);
                                        if (matchedCoupon) {
                                            setPaymentDiscountName(matchedCoupon.code);
                                        } else {
                                            setPaymentDiscountName('');
                                        }
                                    }}
                                    className="input"
                                    style={{ width: '100%', padding: '8px 10px', border: '2px solid #111111', borderRadius: '6px', fontSize: '0.9rem' }}
                                >
                                    <option value="">-- No Coupon --</option>
                                    {coupons.map(c => (
                                        <option key={c._id} value={c.discountType === 'percentage' ? `${c.discountValue}%` : `${c.discountValue}`}>
                                            {c.code} - {c.discountType === 'percentage' ? `${c.discountValue}%` : `₹${c.discountValue}`} Off (Min: ₹{c.minOrderAmount})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Custom Discount Input - Percentage only */}
                            <div className="input-group" style={{ marginBottom: 0 }}>
                                <label style={{ fontWeight: 600, display: 'block', marginBottom: '4px', fontSize: '0.85rem' }}>Discount (%)</label>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="any"
                                        placeholder="e.g. 10 (for 10%)"
                                        value={paymentDiscountInput}
                                        onChange={(e) => setPaymentDiscountInput(e.target.value)}
                                        className="input"
                                        style={{ flex: 1, padding: '8px 10px', border: '2px solid #111111', borderRadius: '6px', fontSize: '0.9rem' }}
                                    />
                                    <span style={{ padding: '6px 12px', background: '#7C3AED', color: '#FFF', borderRadius: '6px', fontWeight: 'bold', fontSize: '0.95rem' }}>%</span>
                                </div>
                            </div>

                            {/* Reason for Discount */}
                            {parseDiscount(paymentDiscountInput, (orders.find(o => o._id === paymentBillerOrderId)?.subtotal || paymentBillerAmount), paymentDiscountType) > 0 && (
                                <div className="input-group" style={{ marginBottom: 0 }}>
                                    <label style={{ fontWeight: 600, display: 'block', marginBottom: '4px', fontSize: '0.85rem' }}>Discount Reason / Note</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Staff Discount / Birthday"
                                        value={paymentDiscountName}
                                        onChange={(e) => setPaymentDiscountName(e.target.value)}
                                        className="input"
                                        style={{ width: '100%', padding: '8px 10px', border: '2px solid #111111', borderRadius: '6px', fontSize: '0.9rem' }}
                                    />
                                </div>
                            )}

                            {/* Live Summary Box & Max Discount Violation Check */}
                            {(() => {
                                const currentOrd = orders.find(o => o._id === paymentBillerOrderId);
                                const baseSub = currentOrd?.subtotal || (paymentBillerAmount / 1.05);
                                const discVal = parseDiscount(paymentDiscountInput, baseSub, paymentDiscountType);
                                const discPct = baseSub > 0 ? (discVal / baseSub) * 100 : 0;
                                const isExceeding = user?.role !== 'superadmin' && discPct > maxDiscountPercent + 0.01;
                                const taxVal = (baseSub - discVal) * 0.05;
                                const finalTot = (baseSub - discVal) + taxVal;

                                return (
                                    <>
                                        {isExceeding && (
                                            <div style={{ background: '#FEE2E2', border: '2px solid #EF4444', color: '#B91C1C', padding: '10px 12px', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 600 }}>
                                                ⛔ DISCOUNT EXCEEDED! Maximum allowed discount is {maxDiscountPercent}%. You applied {discPct.toFixed(1)}%. Bill generation is BLOCKED. Only superadmin can approve.
                                            </div>
                                        )}

                                        <div style={{ background: '#F9FAFB', padding: '10px 12px', borderRadius: '6px', border: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                                <span>Subtotal:</span>
                                                <span>₹{baseSub.toFixed(2)}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#DC2626' }}>
                                                <span>Discount ({discPct.toFixed(1)}%):</span>
                                                <span>- ₹{discVal.toFixed(2)}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                                <span>GST (5%):</span>
                                                <span>₹{taxVal.toFixed(2)}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '0.95rem', borderTop: '1px dashed #D1D5DB', paddingTop: '4px', color: '#7C3AED' }}>
                                                <span>FINAL PAYABLE:</span>
                                                <span>₹{finalTot.toFixed(2)}</span>
                                            </div>
                                        </div>

                                        <div style={{ fontSize: '0.75rem', color: '#6B7280', textAlign: 'center', marginTop: '4px' }}>
                                            ⚠️ Final Settlement will lock payment & discount details permanently.
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={isExceeding || !paymentBillerName.trim()}
                                            className="btn btn-primary btn-full sketch-border sketch-shadow"
                                            style={{
                                                marginTop: '6px',
                                                padding: '10px',
                                                opacity: isExceeding ? 0.5 : 1,
                                                cursor: isExceeding ? 'not-allowed' : 'pointer',
                                                backgroundColor: isExceeding ? '#9CA3AF' : undefined
                                            }}
                                        >
                                            {isExceeding ? `Blocked: Exceeds ${maxDiscountPercent}% Max Limit` : '🔒 Confirm Final Settlement & Lock Bill'}
                                        </button>
                                    </>
                                );
                            })()}
                        </form>
                    </div>
                </div>
            )}
            {/* Split Payment Modal (Cash / UPI / Card Breakdown) */}
            {showSplitModal && (
                <div className="bill-modal-overlay" onClick={() => setShowSplitModal(false)}>
                    <div className="bill-container" onClick={e => e.stopPropagation()} style={{ fontFamily: 'inherit', maxWidth: '480px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '2px solid #111111', paddingBottom: '10px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.4rem', fontFamily: "'Patrick Hand', cursive" }}>✂️ Split Payment (Cash / UPI / Card)</h2>
                            <button onClick={() => setShowSplitModal(false)} style={{ background: 'transparent', border: 'none', fontSize: '1.25rem', cursor: 'pointer' }}><FiX /></button>
                        </div>
                        
                        <form onSubmit={handleConfirmSplitPayment} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div style={{ background: '#F5F3FF', border: '1px solid #C4B5FD', padding: '10px 14px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: '600', fontSize: '0.9rem', color: '#5B21B6' }}>Total Order Bill:</span>
                                <strong style={{ fontSize: '1.25rem', color: '#7C3AED' }}>₹{paymentBillerAmount.toFixed(2)}</strong>
                            </div>

                            {/* Biller Name */}
                            <div className="input-group" style={{ position: 'relative', marginBottom: 0 }}>
                                <label style={{ fontWeight: 600, display: 'block', marginBottom: '4px', fontSize: '0.85rem' }}>Biller Name *</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Type or select biller..."
                                    value={paymentBillerName}
                                    onChange={(e) => {
                                        setPaymentBillerName(e.target.value);
                                        setShowPaymentBillerSuggestions(true);
                                    }}
                                    onFocus={() => setShowPaymentBillerSuggestions(true)}
                                    className="input"
                                    style={{ width: '100%', padding: '8px 10px', border: '2px solid #111111', borderRadius: '6px', fontSize: '0.9rem' }}
                                />
                                {showPaymentBillerSuggestions && prepareSuggestions.length > 0 && (
                                    <div className="biller-suggestions-dropdown" style={{ zIndex: 1004 }}>
                                        {prepareSuggestions
                                            .filter(sug => sug.toLowerCase().includes(paymentBillerName.toLowerCase()))
                                            .slice(0, 15)
                                            .map((sug, idx) => (
                                                <div
                                                    key={idx}
                                                    onClick={() => {
                                                        setPaymentBillerName(sug);
                                                        setShowPaymentBillerSuggestions(false);
                                                    }}
                                                    className="suggestion-item"
                                                >
                                                    {sug}
                                                </div>
                                            ))
                                        }
                                    </div>
                                )}
                            </div>

                            {/* Split Amount Inputs */}
                            <div style={{ background: '#FFF', border: '2px solid #111', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', boxSizing: 'border-box', width: '100%' }}>
                                <label style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#111', borderBottom: '1px dashed #CCC', paddingBottom: '4px' }}>
                                    Enter Amount Breakdown:
                                </label>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', boxSizing: 'border-box' }}>
                                    <span style={{ width: '105px', minWidth: '105px', fontWeight: 'bold', fontSize: '0.85rem' }}>💵 Cash:</span>
                                    <span style={{ fontWeight: 'bold' }}>₹</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="any"
                                        placeholder="0.00"
                                        value={splitCash}
                                        onChange={e => setSplitCash(e.target.value)}
                                        style={{ flex: 1, width: '100%', minWidth: 0, padding: '8px 10px', border: '1.5px solid #111', borderRadius: '6px', fontWeight: 'bold', fontSize: '0.95rem', boxSizing: 'border-box' }}
                                    />
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', boxSizing: 'border-box' }}>
                                    <span style={{ width: '105px', minWidth: '105px', fontWeight: 'bold', fontSize: '0.85rem' }}>📱 UPI / QR:</span>
                                    <span style={{ fontWeight: 'bold' }}>₹</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="any"
                                        placeholder="0.00"
                                        value={splitUpi}
                                        onChange={e => setSplitUpi(e.target.value)}
                                        style={{ flex: 1, width: '100%', minWidth: 0, padding: '8px 10px', border: '1.5px solid #111', borderRadius: '6px', fontWeight: 'bold', fontSize: '0.95rem', boxSizing: 'border-box' }}
                                    />
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', boxSizing: 'border-box' }}>
                                    <span style={{ width: '105px', minWidth: '105px', fontWeight: 'bold', fontSize: '0.85rem' }}>💳 Card / POS:</span>
                                    <span style={{ fontWeight: 'bold' }}>₹</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="any"
                                        placeholder="0.00"
                                        value={splitCard}
                                        onChange={e => setSplitCard(e.target.value)}
                                        style={{ flex: 1, width: '100%', minWidth: 0, padding: '8px 10px', border: '1.5px solid #111', borderRadius: '6px', fontWeight: 'bold', fontSize: '0.95rem', boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>

                            {/* Calculation Summary */}
                            {(() => {
                                const c = parseFloat(splitCash) || 0;
                                const u = parseFloat(splitUpi) || 0;
                                const cd = parseFloat(splitCard) || 0;
                                const totalEntered = c + u + cd;
                                const diff = paymentBillerAmount - totalEntered;

                                return (
                                    <div style={{ background: Math.abs(diff) < 0.01 ? '#ECFDF5' : '#FEF2F2', border: `1px solid ${Math.abs(diff) < 0.01 ? '#A7F3D0' : '#FECACA'}`, padding: '10px 12px', borderRadius: '6px', fontSize: '0.85rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                            <span>Total Entered:</span>
                                            <strong>₹{totalEntered.toFixed(2)}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: Math.abs(diff) < 0.01 ? '#059669' : '#DC2626' }}>
                                            <span>{Math.abs(diff) < 0.01 ? '✓ Exact Amount Matched!' : diff > 0 ? 'Remaining Balance:' : 'Overpaid:'}</span>
                                            <span>₹{Math.abs(diff).toFixed(2)}</span>
                                        </div>
                                    </div>
                                );
                            })()}

                            <button
                                type="submit"
                                className="btn btn-primary btn-full sketch-border sketch-shadow"
                                style={{ padding: '12px', fontWeight: 'bold', fontSize: '1rem', background: '#7C3AED', borderColor: '#7C3AED' }}
                            >
                                🔒 Confirm Split Payment & Generate Bill
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Partial Edit / Item Cancel Modal */}
            {showModifyModal && editingOrder && (
                <div className="bill-modal-overlay" onClick={() => setShowModifyModal(false)}>
                    <div className="bill-container" onClick={e => e.stopPropagation()} style={{ fontFamily: 'inherit', maxWidth: '520px', width: '94%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '2px solid #111111', paddingBottom: '10px' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.25rem' }}>✏️ Partial Modify / Cancel Order #{editingOrder.orderNumber}</h2>
                                <span style={{ fontSize: '0.8rem', color: '#6B7280' }}>Add items, change quantities, or remove cancelled items</span>
                            </div>
                            <button onClick={() => setShowModifyModal(false)} style={{ background: 'transparent', border: 'none', fontSize: '1.25rem', cursor: 'pointer' }}><FiX /></button>
                        </div>

                        <form onSubmit={handleSaveModifyOrder} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {/* Current Items List */}
                            <div style={{ background: '#F9FAFB', border: '2px solid #111', borderRadius: '8px', padding: '12px', maxHeight: '240px', overflowY: 'auto' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '0.85rem', borderBottom: '1px solid #E5E7EB', paddingBottom: '6px', marginBottom: '8px' }}>
                                    <span>ITEM NAME</span>
                                    <span>QTY / ACTION</span>
                                </div>

                                {modifyItemsList.map((item, idx) => (
                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px dashed #E5E7EB' }}>
                                        <div>
                                            <strong style={{ fontSize: '0.9rem', display: 'block' }}>{item.name}</strong>
                                            <span style={{ fontSize: '0.78rem', color: '#6B7280' }}>₹{item.price} each</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setModifyItemsList(prev => prev.map((it, i) => i === idx ? { ...it, quantity: Math.max(0, it.quantity - 1) } : it).filter(it => it.quantity > 0));
                                                }}
                                                style={{ width: '28px', height: '28px', borderRadius: '4px', border: '1px solid #DC2626', background: '#FEE2E2', color: '#DC2626', fontWeight: 'bold', cursor: 'pointer' }}
                                            >
                                                -
                                            </button>
                                            <span style={{ fontWeight: 'bold', fontSize: '0.95rem', minWidth: '24px', textAlign: 'center' }}>x{item.quantity}</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setModifyItemsList(prev => prev.map((it, i) => i === idx ? { ...it, quantity: it.quantity + 1 } : it));
                                                }}
                                                style={{ width: '28px', height: '28px', borderRadius: '4px', border: '1px solid #059669', background: '#ECFDF5', color: '#059669', fontWeight: 'bold', cursor: 'pointer' }}
                                            >
                                                +
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setModifyItemsList(prev => prev.filter((_, i) => i !== idx));
                                                }}
                                                style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', marginLeft: '4px' }}
                                                title="Cancel / Remove Item"
                                            >
                                                <FiTrash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {modifyItemsList.length === 0 && (
                                    <div style={{ color: '#EF4444', fontSize: '0.85rem', textAlign: 'center', padding: '10px' }}>
                                        ⚠️ All items removed. Click "Cancel All" if you want to cancel the entire order.
                                    </div>
                                )}
                            </div>

                            {/* Add New Item Selector with Search & Category Filters */}
                            {(() => {
                                const filteredMenuItems = menuItemsList.filter(item => {
                                    const catId = item.category?._id || item.category;
                                    const matchesCat = !modifyCategoryFilter || catId === modifyCategoryFilter;
                                    const matchesSearch = !modifySearchQuery || (item.name || '').toLowerCase().includes(modifySearchQuery.toLowerCase());
                                    return matchesCat && matchesSearch;
                                });

                                const calculatedSubtotal = modifyItemsList.reduce((acc, i) => acc + (i.price * i.quantity), 0);
                                const calculatedGst = Math.round(calculatedSubtotal * 0.05 * 100) / 100;
                                const calculatedTotal = Math.round((calculatedSubtotal + calculatedGst) * 100) / 100;

                                return (
                                    <>
                                        <div style={{ background: '#F8FAFC', border: '1.5px solid #CBD5E1', borderRadius: '8px', padding: '12px' }}>
                                            <label style={{ fontWeight: 'bold', fontSize: '0.86rem', display: 'block', marginBottom: '8px', color: '#0F172A' }}>
                                                ➕ Add Menu Items to Order
                                            </label>
                                            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                                <input
                                                    type="text"
                                                    placeholder="🔍 Search item (e.g. Soup, Naan, Paneer)..."
                                                    value={modifySearchQuery}
                                                    onChange={e => setModifySearchQuery(e.target.value)}
                                                    style={{ flex: 1, padding: '8px 10px', fontSize: '0.88rem', border: '1.5px solid #111', borderRadius: '6px', background: '#FFF' }}
                                                />
                                                <select
                                                    value={modifyCategoryFilter}
                                                    onChange={e => setModifyCategoryFilter(e.target.value)}
                                                    style={{ maxWidth: '160px', padding: '8px', fontSize: '0.85rem', border: '1.5px solid #111', borderRadius: '6px', fontWeight: 'bold', background: '#FFF' }}
                                                >
                                                    <option value="">All Categories</option>
                                                    {menuCategories.map(cat => (
                                                        <option key={cat._id} value={cat._id}>{cat.name}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <select
                                                    className="input"
                                                    value={selectedAddMenuItem}
                                                    onChange={e => setSelectedAddMenuItem(e.target.value)}
                                                    style={{ flex: 1, padding: '8px', fontSize: '0.88rem', border: '1.5px solid #111', borderRadius: '6px', background: '#FFF', fontWeight: '600' }}
                                                >
                                                    <option value="">-- Choose Item ({filteredMenuItems.length} items available) --</option>
                                                    {filteredMenuItems.map(mi => (
                                                        <option key={mi._id} value={mi._id}>{mi.name} — ₹{mi.price}</option>
                                                    ))}
                                                </select>
                                                <button
                                                    type="button"
                                                    className="btn btn-primary"
                                                    onClick={() => {
                                                        if (!selectedAddMenuItem) return;
                                                        const mi = menuItemsList.find(m => m._id === selectedAddMenuItem);
                                                        if (!mi) return;
                                                        const existsIndex = modifyItemsList.findIndex(i => i.menuItemId === mi._id);
                                                        if (existsIndex >= 0) {
                                                            setModifyItemsList(prev => prev.map((it, i) => i === existsIndex ? { ...it, quantity: it.quantity + 1 } : it));
                                                        } else {
                                                            setModifyItemsList(prev => [...prev, { menuItemId: mi._id, name: mi.name, price: mi.price, quantity: 1 }]);
                                                        }
                                                        setSelectedAddMenuItem('');
                                                    }}
                                                    style={{ padding: '8px 16px', fontSize: '0.88rem', fontWeight: 'bold', background: '#7C3AED', borderColor: '#7C3AED', whiteSpace: 'nowrap' }}
                                                >
                                                    + Add Item
                                                </button>
                                            </div>
                                        </div>

                                        {/* Live New Total Summary */}
                                        <div style={{ background: '#ECFDF5', border: '1.5px solid #A7F3D0', padding: '10px 12px', borderRadius: '6px', fontSize: '0.86rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ color: '#065F46', fontWeight: '600' }}>Updated Bill Estimation:</span>
                                            <span style={{ fontSize: '1.05rem', fontWeight: 'bold', color: '#047857' }}>
                                                Subtotal: ₹{calculatedSubtotal.toFixed(2)} | GST (5%): ₹{calculatedGst.toFixed(2)} = <strong>₹{calculatedTotal.toFixed(2)}</strong>
                                            </span>
                                        </div>
                                    </>
                                );
                            })()}

                            {/* Change Table / Move Seat Section */}
                            <div style={{ background: '#FFFBEB', border: '2px solid #F59E0B', borderRadius: '8px', padding: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <label style={{ fontWeight: 'bold', fontSize: '0.88rem', color: '#92400E', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        🪑 Change Customer Table / Seat
                                    </label>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#B45309' }}>
                                        Current: {editingOrder.tableNumber ? `Table ${editingOrder.tableNumber}` : 'Takeaway'}
                                    </span>
                                </div>

                                {(() => {
                                    const sections = ['All', ...new Set(allTables.map(t => t.section || 'Main Hall').filter(Boolean))];
                                    const filteredTablesForMove = allTables.filter(t => moveSectionFilter === 'All' || (t.section || 'Main Hall') === moveSectionFilter);
                                    
                                    return (
                                        <>
                                            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px', marginBottom: '8px' }}>
                                                {sections.map(sec => (
                                                    <button
                                                        key={sec}
                                                        type="button"
                                                        onClick={() => setMoveSectionFilter(sec)}
                                                        style={{
                                                            padding: '4px 10px',
                                                            fontSize: '0.78rem',
                                                            fontWeight: 'bold',
                                                            borderRadius: '16px',
                                                            border: '1.5px solid #111',
                                                            background: moveSectionFilter === sec ? '#F59E0B' : '#FFF',
                                                            color: moveSectionFilter === sec ? '#FFF' : '#111',
                                                            cursor: 'pointer',
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                    >
                                                        📍 {sec}
                                                    </button>
                                                ))}
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '8px', maxHeight: '130px', overflowY: 'auto' }}>
                                                {filteredTablesForMove.map(table => {
                                                    const isOccupied = table.isOccupied || table.status === 'occupied';
                                                    const isCurrentTable = (editingOrder.tables || []).some(t => (t._id || t) === table._id) || editingOrder.table === table._id;
                                                    const isSelected = selectedMoveTableId === table._id;

                                                    return (
                                                        <button
                                                            key={table._id}
                                                            type="button"
                                                            disabled={isOccupied && !isCurrentTable}
                                                            onClick={() => setSelectedMoveTableId(table._id)}
                                                            style={{
                                                                padding: '6px 4px',
                                                                borderRadius: '6px',
                                                                border: isSelected ? '2px solid #7C3AED' : isCurrentTable ? '2px solid #3B82F6' : isOccupied ? '1.5px dashed #9CA3AF' : '1.5px solid #10B981',
                                                                background: isSelected ? '#EDE9FE' : isCurrentTable ? '#DBEAFE' : isOccupied ? '#F3F4F6' : '#ECFDF5',
                                                                color: isSelected ? '#7C3AED' : isCurrentTable ? '#1D4ED8' : isOccupied ? '#9CA3AF' : '#047857',
                                                                fontWeight: 'bold',
                                                                fontSize: '0.82rem',
                                                                cursor: (isOccupied && !isCurrentTable) ? 'not-allowed' : 'pointer',
                                                                opacity: (isOccupied && !isCurrentTable) ? 0.55 : 1,
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                alignItems: 'center',
                                                                gap: '2px'
                                                            }}
                                                        >
                                                            <span>T-{table.tableNumber}</span>
                                                            <span style={{ fontSize: '0.66rem', fontWeight: 'normal' }}>
                                                                {isCurrentTable ? '(Current)' : isOccupied ? 'Occupied' : 'Free'}
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            {selectedMoveTableId && (
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                                                    <button
                                                        type="button"
                                                        disabled={isMovingTable}
                                                        onClick={handleMoveTableSubmit}
                                                        style={{
                                                            padding: '6px 14px',
                                                            fontSize: '0.82rem',
                                                            fontWeight: 'bold',
                                                            borderRadius: '6px',
                                                            background: '#D97706',
                                                            color: '#FFF',
                                                            border: '1.5px solid #111',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        {isMovingTable ? 'Moving Table...' : '🔄 Confirm Table Change'}
                                                    </button>
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>

                            {/* Note for KOT */}
                            <div>
                                <label style={{ fontWeight: 600, display: 'block', marginBottom: '4px', fontSize: '0.82rem' }}>Modification Reason / Note (Printed on KOT)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Guest changed mind / Less spicy requested"
                                    value={modifyNote}
                                    onChange={e => setModifyNote(e.target.value)}
                                    style={{ width: '100%', padding: '8px', border: '1.5px solid #111', borderRadius: '6px', fontSize: '0.88rem', boxSizing: 'border-box' }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '6px' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModifyModal(false)}>Cancel</button>
                                <button
                                    type="submit"
                                    disabled={submittingModify || modifyItemsList.length === 0}
                                    className="btn btn-primary"
                                    style={{ background: '#7C3AED', borderColor: '#7C3AED', fontWeight: 'bold' }}
                                >
                                    {submittingModify ? 'Saving...' : '💾 Save & Print Modified KOT'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Quick Payment Method Chooser Modal */}
            {showQuickPayModal && quickPayOrder && (
                <div className="bill-modal-overlay" onClick={() => setShowQuickPayModal(false)}>
                    <div className="bill-container" onClick={e => e.stopPropagation()} style={{ fontFamily: 'inherit', maxWidth: '440px', width: '92%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '2px solid #111', paddingBottom: '8px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem' }}>💳 Select Payment Method</h3>
                            <button onClick={() => setShowQuickPayModal(false)} style={{ background: 'transparent', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}><FiX /></button>
                        </div>

                        <div style={{ padding: '4px 0' }}>
                            <div style={{ background: '#F8FAFC', border: '1.5px solid #CBD5E1', borderRadius: '8px', padding: '12px', marginBottom: '14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '4px' }}>
                                    <span>Order Total:</span>
                                    <strong>₹{quickPayOrder.total.toFixed(2)}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.05rem', fontWeight: 'bold', color: '#7C3AED', marginBottom: '4px' }}>
                                    <span>Customer Paying:</span>
                                    <span>₹{quickPayAmount.toFixed(2)}</span>
                                </div>

                                {quickPayAmount < quickPayOrder.total && (
                                    <div style={{ marginTop: '8px', background: '#FEF3C7', border: '1px solid #F59E0B', padding: '8px 10px', borderRadius: '6px', fontSize: '0.82rem', color: '#92400E' }}>
                                        💡 Shortage of <strong>₹{(quickPayOrder.total - quickPayAmount).toFixed(2)}</strong> will be automatically applied as <strong>Change Shortage Discount</strong>!
                                    </div>
                                )}
                            </div>

                            <p style={{ fontWeight: 'bold', fontSize: '0.88rem', marginBottom: '10px', color: '#334155' }}>
                                Choose payment option to complete order & generate bill:
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <button
                                    type="button"
                                    className="btn btn-success"
                                    style={{ padding: '12px', fontSize: '1rem', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                                    onClick={() => {
                                        setShowQuickPayModal(false);
                                        handleOpenPaymentBiller(quickPayOrder._id, 'cash', quickPayAmount);
                                    }}
                                >
                                    💵 Cash Paid (₹{quickPayAmount.toFixed(2)})
                                </button>

                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    style={{ padding: '12px', fontSize: '1rem', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', background: '#7C3AED', borderColor: '#7C3AED' }}
                                    onClick={() => {
                                        setShowQuickPayModal(false);
                                        handleOpenPaymentBiller(quickPayOrder._id, 'online', quickPayAmount);
                                    }}
                                >
                                    📱 UPI / Online Paid (₹{quickPayAmount.toFixed(2)})
                                </button>

                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{ padding: '12px', fontSize: '1rem', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', background: '#4F46E5', color: '#FFF', border: 'none' }}
                                    onClick={() => {
                                        setShowQuickPayModal(false);
                                        handleOpenPaymentBiller(quickPayOrder._id, 'card', quickPayAmount);
                                    }}
                                >
                                    💳 Card Paid (₹{quickPayAmount.toFixed(2)})
                                </button>

                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{ padding: '10px', fontSize: '0.9rem', fontWeight: 'bold', background: '#D97706', color: '#FFF', border: 'none' }}
                                    onClick={() => {
                                        setShowQuickPayModal(false);
                                        handleOpenSplitPaymentModal(quickPayOrder._id, quickPayAmount);
                                    }}
                                >
                                    🔀 Split Payment (Cash + UPI + Card)
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showBill && selectedOrdersForBill.length > 0 && (
                <OrderBill
                    orders={selectedOrdersForBill}
                    onCancel={() => {
                        setShowBill(false);
                        setSelectedOrdersForBill([]);
                        fetchOrders(); // Refresh to remove paid ones
                    }}
                />
            )}

            {/* KOT Print Preview Modal */}
            {selectedKOTForPrint && (
                <div className="modal-overlay" onClick={() => setSelectedKOTForPrint(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '360px', width: '92%' }}>
                        <div className="modal-header">
                            <h2>KOT Ticket Preview</h2>
                            <button className="modal-close" onClick={() => setSelectedKOTForPrint(null)}>×</button>
                        </div>
                        <div id="kot-printable-slip" style={{ background: '#FFF', padding: '16px', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.4', border: '1px solid #CCC', borderRadius: '6px' }}>
                            <div style={{ textAlign: 'center', borderBottom: '2px dashed #000', paddingBottom: '8px', marginBottom: '8px' }}>
                                <h2 style={{ margin: '0 0 2px', fontSize: '18px', textTransform: 'uppercase' }}>KEA BY THE POOL</h2>
                                <h3 style={{ margin: 0, fontSize: '14px', color: '#555' }}>KITCHEN ORDER TICKET</h3>
                                <div style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '4px', color: '#7C3AED' }}>{selectedKOTForPrint.kotNumber}</div>
                            </div>

                            <div style={{ marginBottom: '8px', fontSize: '12px' }}>
                                <div><strong>TABLE:</strong> {selectedKOTForPrint.tableNumber}</div>
                                <div><strong>STAFF:</strong> {selectedKOTForPrint.staffName}</div>
                                <div><strong>DATE/TIME:</strong> {new Date(selectedKOTForPrint.timestamp).toLocaleDateString('en-IN')} {new Date(selectedKOTForPrint.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            </div>

                            <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '6px 0', marginBottom: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginBottom: '4px' }}>
                                    <span>ITEM NAME</span>
                                    <span>QTY</span>
                                </div>
                                {selectedKOTForPrint.items.map((item, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', margin: '3px 0' }}>
                                        <span>{item.name}</span>
                                        <strong>{item.quantity}</strong>
                                    </div>
                                ))}
                            </div>

                            {selectedKOTForPrint.notes && (
                                <div style={{ marginBottom: '8px', fontSize: '12px', background: '#FEF3C7', padding: '4px 6px', borderRadius: '4px' }}>
                                    <strong>SPECIAL NOTE:</strong> {selectedKOTForPrint.notes}
                                </div>
                            )}

                            <div style={{ textAlign: 'center', borderTop: '1px dashed #000', paddingTop: '6px', fontSize: '11px', color: '#666' }}>
                                --- KITCHEN / RECEPTION COPY ---
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
                            <button
                                className="btn btn-primary btn-full"
                                onClick={() => window.print()}
                            >
                                <FiPrinter /> Print 80MM KOT
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminOrders;
