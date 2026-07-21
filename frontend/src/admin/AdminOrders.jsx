import React, { useState, useEffect } from 'react';
import { FiCheck, FiX, FiFileText, FiAlertTriangle, FiTrash2, FiPlus, FiMinus, FiSearch, FiEdit2, FiPrinter } from 'react-icons/fi';
import { 
    getActiveOrders, updateOrderStatus, updatePayment, deleteOrder, 
    getAllMenuItems, getBillerSuggestions, generateBill, updateOrderItems,
    getCoupons, getMaxDiscount, getKOTs
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
                    const kotData = {
                        kotNumber: order.kotTicket || `KOT-${order.orderNumber}`,
                        orderNumber: order.orderNumber,
                        tableNumber: order.tableId?.tableNumber || (order.tableIds?.length ? order.tableIds.map(t => t.tableNumber || t).join(', ') : 'Takeaway'),
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
            alert('Failed to delete order');
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
        setPaymentBillerOrderId(orderId);
        setPaymentBillerMethod(method);
        setPaymentBillerAmount(amount);
        setPaymentBillerName(order?.billerName || localStorage.getItem('lastBillerName') || '');
        setPaymentDiscountInput(order?.discount ? String(order.discount) : '');
        setPaymentDiscountType('%');
        setPaymentDiscountName(order?.discountName || '');
        setShowPaymentBillerModal(true);
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
                    cash: parseFloat(splitCash) || 0,
                    upi: parseFloat(splitUpi) || 0,
                    card: parseFloat(splitCard) || 0
                }
            });

            localStorage.setItem('lastBillerName', paymentBillerName);
            setShowSplitModal(false);
            fetchOrders();

            if (sessionOrders.length > 0) {
                const updatedSessionOrders = sessionOrders.map(o => 
                    o._id === paymentBillerOrderId ? { ...o, status: 'paid', paymentMethod: 'split', billerName: paymentBillerName, discount: discountVal, discountName: paymentDiscountName } : { ...o, billerName: paymentBillerName, discount: discountVal }
                );
                setSelectedOrdersForBill(updatedSessionOrders);
                setShowBill(true);
            }
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to process split payment');
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
                                        <button onClick={() => handlePartialPayment(order._id, order.total)}>Pay</button>
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
                                        <button
                                            className="btn btn-danger btn-sm"
                                            onClick={() => {
                                                if (window.confirm('Are you sure you want to cancel this order?')) {
                                                    handleStatusChange(order._id, 'cancelled');
                                                }
                                            }}
                                            style={{ opacity: 0.8 }}
                                        >
                                            <FiX /> Cancel
                                        </button>
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
                                <div><strong>TABLE:</strong> Table {selectedKOTForPrint.tableNumber}</div>
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
