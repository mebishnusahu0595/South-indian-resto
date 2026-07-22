import React, { useState, useEffect } from 'react';
import { FiChevronLeft, FiChevronRight, FiCalendar, FiTrash2, FiPrinter, FiX, FiPlus, FiMinus, FiSearch } from 'react-icons/fi';
import { getBills, getBillerSuggestions, generateBill, deleteBill, bulkDeleteBills, getAllMenuItems, updateOrderItems, getCoupons, getMaxDiscount } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import Loader from '../components/Loader';
import '../components/OrderBill.css';
import './AdminBills.css';

const getLocalDateString = (date = new Date()) => {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
};

const AdminBills = () => {
    const { user, socket } = useAuth();
    const [bills, setBills] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(getLocalDateString());
    const [error, setError] = useState('');

    // Edit/Reissue Bill modal states
    const [showEditModal, setShowEditModal] = useState(false);
    const [activeBill, setActiveBill] = useState(null);
    const [billerName, setBillerName] = useState('');
    const [billerSuggestions, setBillerSuggestions] = useState([]);
    const [discountInput, setDiscountInput] = useState('');
    const [discountName, setDiscountName] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [createdBill, setCreatedBill] = useState(null);
    const [saving, setSaving] = useState(false);
    const [allMenuItems, setAllMenuItems] = useState([]);
    const [coupons, setCoupons] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [maxDiscountPercent, setMaxDiscountPercent] = useState(20);
    // Payment method edit states (superadmin only)
    const [editPaymentMethod, setEditPaymentMethod] = useState('pending');
    const [editSplitCash, setEditSplitCash] = useState('');
    const [editSplitUpi, setEditSplitUpi] = useState('');
    const [editSplitCard, setEditSplitCard] = useState('');

    // Bulk select state
    const [selectedBillIds, setSelectedBillIds] = useState([]);
    const [bulkDeleting, setBulkDeleting] = useState(false);

    useEffect(() => {
        fetchBills();
        fetchMaxDiscountLimit();
    }, [selectedDate]);

    const fetchMaxDiscountLimit = async () => {
        try {
            const res = await getMaxDiscount();
            setMaxDiscountPercent(res.data.maxDiscountPercent);
        } catch (err) { /* silent */ }
    };

    // WebSocket listeners for real-time updates
    useEffect(() => {
        if (socket) {
            socket.on('bill-generated', (newBill) => {
                const billDate = new Date(newBill.createdAt).toISOString().split('T')[0];
                if (billDate === selectedDate) {
                    setBills(prev => {
                        const exists = prev.find(b => b._id === newBill._id);
                        let updated;
                        if (exists) {
                            updated = prev.map(b => b._id === newBill._id ? newBill : b);
                        } else {
                            updated = [newBill, ...prev];
                        }
                        // Keep descending order
                        return updated.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                    });
                }
            });

            socket.on('bill-deleted', (billId) => {
                setBills(prev => prev.filter(b => b._id !== billId));
            });

            socket.on('bill-deleted-for-order', (orderId) => {
                setBills(prev => prev.filter(b => b.order?._id !== orderId));
            });

            return () => {
                socket.off('bill-generated');
                socket.off('bill-deleted');
                socket.off('bill-deleted-for-order');
            };
        }
    }, [socket, selectedDate]);

    const fetchBills = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await getBills(selectedDate);
            // Sort descending: latest bill on top
            const sorted = (res.data || []).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            setBills(sorted);
        } catch (err) {
            setError('Failed to fetch bills');
        } finally {
            setLoading(false);
        }
    };

    const handlePrevDay = () => {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() - 1);
        setSelectedDate(getLocalDateString(d));
    };

    const handleNextDay = () => {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() + 1);
        setSelectedDate(getLocalDateString(d));
    };

    const handleDelete = async (billId) => {
        if (!window.confirm('Deleting this bill will also PERMANENTLY delete the corresponding order and remove its revenue. Continue?')) {
            return;
        }
        try {
            await deleteBill(billId);
            setBills(prev => prev.filter(b => b._id !== billId));
        } catch (err) {
            alert('Failed to delete bill');
        }
    };

    const handleBulkDelete = async () => {
        if (selectedBillIds.length === 0) return;
        if (!window.confirm(`Are you sure you want to delete ${selectedBillIds.length} bills and their corresponding orders? This cannot be undone.`)) {
            return;
        }
        setBulkDeleting(true);
        try {
            await bulkDeleteBills(selectedBillIds);
            setBills(prev => prev.filter(b => !selectedBillIds.includes(b._id)));
            setSelectedBillIds([]);
        } catch (err) {
            alert('Failed to bulk delete bills');
        } finally {
            setBulkDeleting(false);
        }
    };

    const toggleBillSelect = (billId) => {
        setSelectedBillIds(prev =>
            prev.includes(billId) ? prev.filter(id => id !== billId) : [...prev, billId]
        );
    };

    const toggleSelectAll = () => {
        if (selectedBillIds.length === bills.length) {
            setSelectedBillIds([]);
        } else {
            setSelectedBillIds(bills.map(b => b._id));
        }
    };

    const handleOpenEdit = async (bill) => {
        // Block editing settled bills unless superadmin
        if (bill.order?.status === 'paid' && user?.role !== 'superadmin') {
            alert('This bill has been settled. Only superadmin can modify settled bills.');
            return;
        }

        setActiveBill(bill);
        setBillerName(bill.billerName || '');
        setDiscountInput(bill.discount ? bill.discount.toString() : '');
        setDiscountName(bill.discountName || '');
        setSearchQuery('');
        // Pre-fill payment method for superadmin
        const pm = bill.order?.paymentMethod || bill.paymentMethod || 'pending';
        setEditPaymentMethod(pm);
        const sp = bill.order?.splitPaymentDetails || bill.splitPaymentDetails || {};
        setEditSplitCash(sp.cash ? String(sp.cash) : '');
        setEditSplitUpi(sp.upi ? String(sp.upi) : '');
        setEditSplitCard(sp.card ? String(sp.card) : '');
        
        try {
            const sug = await getBillerSuggestions();
            setBillerSuggestions(sug.data || []);
            
            const resMenu = await getAllMenuItems();
            setAllMenuItems(resMenu.data || []);

            const resCoupons = await getCoupons();
            setCoupons(resCoupons.data || []);
        } catch (err) {
            console.error(err);
        }
        setShowEditModal(true);
        setCreatedBill(null);
    };

    const parseDiscount = (input, baseAmt) => {
        if (!input) return 0;
        const trimmed = input.trim();
        if (trimmed.endsWith('%')) {
            const pct = parseFloat(trimmed.replace('%', '')) || 0;
            return (baseAmt * pct) / 100;
        }
        return parseFloat(trimmed) || 0;
    };

    const handleUpdateItemQuantity = async (orderId, menuItemId, delta) => {
        const order = activeBill.order;
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
            
            const updatedOrder = res.data;
            setActiveBill(prev => {
                const subtotal = updatedOrder.subtotal;
                const gstRate = updatedOrder.gstRate || 5;
                const discountVal = parseDiscount(discountInput, subtotal);
                const taxableAmount = subtotal - discountVal;
                const tax = taxableAmount * (gstRate / 100);
                const total = taxableAmount + tax;
                return {
                    ...prev,
                    order: updatedOrder,
                    subtotal,
                    tax,
                    total
                };
            });
            fetchBills();
        } catch (err) {
            alert('Failed to update item quantity');
        }
    };

    const handleRemoveItem = async (orderId, menuItemId) => {
        const order = activeBill.order;
        if (!order) return;

        const updatedItems = order.items.filter(item => (item.menuItem?._id || item.menuItem) !== menuItemId);

        try {
            const res = await updateOrderItems(orderId, updatedItems.map(i => ({
                menuItem: i.menuItem?._id || i.menuItem,
                quantity: i.quantity
            })));
            
            const updatedOrder = res.data;
            setActiveBill(prev => {
                const subtotal = updatedOrder.subtotal;
                const gstRate = updatedOrder.gstRate || 5;
                const discountVal = parseDiscount(discountInput, subtotal);
                const taxableAmount = subtotal - discountVal;
                const tax = taxableAmount * (gstRate / 100);
                const total = taxableAmount + tax;
                return {
                    ...prev,
                    order: updatedOrder,
                    subtotal,
                    tax,
                    total
                };
            });
            fetchBills();
        } catch (err) {
            alert('Failed to remove item');
        }
    };

    const handleAddItemToOrder = async (orderId, menuItem) => {
        const order = activeBill.order;
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
            
            const updatedOrder = res.data;
            setActiveBill(prev => {
                const subtotal = updatedOrder.subtotal;
                const gstRate = updatedOrder.gstRate || 5;
                const discountVal = parseDiscount(discountInput, subtotal);
                const taxableAmount = subtotal - discountVal;
                const tax = taxableAmount * (gstRate / 100);
                const total = taxableAmount + tax;
                return {
                    ...prev,
                    order: updatedOrder,
                    subtotal,
                    tax,
                    total
                };
            });
            setSearchQuery('');
            fetchBills();
        } catch (err) {
            alert('Failed to add item');
        }
    };

    const handleSaveAndPrint = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const isSuperadmin = user?.role === 'superadmin';
            const payload = {
                orderId: activeBill.order?._id || activeBill.order,
                billerName,
                discount: parseDiscount(discountInput, activeBill.subtotal),
                discountName: discountName
            };
            // Superadmin can also set payment method
            if (isSuperadmin) {
                payload.paymentMethod = editPaymentMethod || 'pending';
                if (editPaymentMethod === 'split') {
                    payload.splitPaymentDetails = {
                        cash: parseFloat(editSplitCash) || 0,
                        upi: parseFloat(editSplitUpi) || 0,
                        card: parseFloat(editSplitCard) || 0
                    };
                }
            }
            const res = await generateBill(payload);
            localStorage.setItem('lastBillerName', billerName);
            setCreatedBill(res.data);
            fetchBills();
        } catch (err) {
            const msg = err?.response?.data?.message || 'Failed to update and issue bill';
            alert(msg);
        } finally {
            setSaving(false);
        }
    };

    // Payment status filter
    const [paymentFilter, setPaymentFilter] = useState('all');

    const filteredBills = bills.filter(bill => {
        const isPaid = bill.order?.status === 'paid';
        const method = (bill.order?.paymentMethod || 'cash').toLowerCase();
        if (paymentFilter === 'paid') return isPaid;
        if (paymentFilter === 'pending') return !isPaid;
        if (paymentFilter === 'cash') return isPaid && method === 'cash';
        if (paymentFilter === 'online') return isPaid && (method === 'online' || method === 'upi' || method === 'card');
        return true;
    });

    return (
        <div className="admin-bills-page">
            <div className="bills-header-row">
                <h1>Billing Registry & Invoices</h1>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    {/* Payment Status Filter */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#FFF', border: '2px solid #111', borderRadius: '6px', padding: '4px 10px' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Payment Filter:</span>
                        <select 
                            value={paymentFilter} 
                            onChange={(e) => setPaymentFilter(e.target.value)}
                            style={{ border: 'none', outline: 'none', background: 'transparent', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem' }}
                        >
                            <option value="all">All Bills</option>
                            <option value="paid">Paid & Settled</option>
                            <option value="pending">Pending Payment</option>
                            <option value="cash">Cash Paid</option>
                            <option value="online">Online / UPI Paid</option>
                        </select>
                    </div>

                    {user?.role === 'superadmin' && selectedBillIds.length > 0 && (
                        <button
                            className="btn btn-danger"
                            onClick={handleBulkDelete}
                            disabled={bulkDeleting}
                            style={{ fontSize: '0.85rem', padding: '8px 16px' }}
                        >
                            <FiTrash2 /> {bulkDeleting ? 'Deleting...' : `Delete Selected (${selectedBillIds.length})`}
                        </button>
                    )}
                    
                    <div className="date-filter-control sketch-border-subtle">
                        <button className="date-arrow-btn" onClick={handlePrevDay}>
                            <FiChevronLeft />
                        </button>
                        <div className="date-display-box">
                            <FiCalendar />
                            <input 
                                type="date" 
                                value={selectedDate} 
                                onChange={(e) => setSelectedDate(e.target.value)} 
                            />
                        </div>
                        <button className="date-arrow-btn" onClick={handleNextDay}>
                            <FiChevronRight />
                        </button>
                    </div>
                </div>
            </div>

            {error && <div className="alert alert-danger">{error}</div>}

            {loading ? (
                <Loader message="Loading invoices..." fullScreen={false} />
            ) : (
                <div className="bills-table-container sketch-border-subtle sketch-shadow">
                    {filteredBills.length === 0 ? (
                        <p className="no-bills-message">No matching bills found.</p>
                    ) : (
                        <table className="bills-table">
                            <thead>
                                <tr>
                                    {user?.role === 'superadmin' && (
                                        <th style={{ width: '40px' }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedBillIds.length === filteredBills.length && filteredBills.length > 0}
                                                onChange={toggleSelectAll}
                                            />
                                        </th>
                                    )}
                                    <th>Bill No</th>
                                    <th>Time</th>
                                    <th>Order No</th>
                                    <th>Table</th>
                                    <th>Customer</th>
                                    <th>Biller</th>
                                    <th>Status</th>
                                    <th>Subtotal</th>
                                    <th>Discount</th>
                                    <th>Total</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredBills.map(bill => {
                                    const isPaid = bill.order?.status === 'paid';
                                    return (
                                        <tr key={bill._id}>
                                            {user?.role === 'superadmin' && (
                                                <td>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedBillIds.includes(bill._id)}
                                                        onChange={() => toggleBillSelect(bill._id)}
                                                    />
                                                </td>
                                            )}
                                            <td><strong>{bill.billNumber}</strong></td>
                                            <td>{new Date(bill.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                            <td>#{bill.order?.orderNumber || 'Deleted'}</td>
                                            <td>{bill.order?.tableNumber ? `Table ${bill.order.tableNumber}` : 'Takeaway'}</td>
                                            <td>{bill.order?.user?.name || 'Walk-in'}</td>
                                            <td>{bill.billerName}</td>
                                            <td>
                                                <span style={{
                                                    fontSize: '0.75rem',
                                                    padding: '3px 8px',
                                                    borderRadius: '4px',
                                                    fontWeight: 'bold',
                                                    background: isPaid ? '#D1FAE5' : '#FEF3C7',
                                                    color: isPaid ? '#047857' : '#D97706',
                                                    border: `1px solid ${isPaid ? '#10B981' : '#F59E0B'}`
                                                }}>
                                                    {isPaid ? `PAID (${(bill.order?.paymentMethod || 'cash').toUpperCase()})` : 'UNPAID'}
                                                </span>
                                            </td>
                                            <td>₹{bill.subtotal.toFixed(2)}</td>
                                            <td style={{ color: bill.discount > 0 ? '#DC2626' : 'inherit' }}>
                                                {bill.discount > 0 ? `-₹${bill.discount.toFixed(2)}` : '₹0.00'}
                                            </td>
                                            <td><strong>₹{bill.total.toFixed(2)}</strong></td>
                                            <td className="actions-cell">
                                                {isPaid ? (
                                                    <button 
                                                        className="btn-action print" 
                                                        title="View & Print Bill"
                                                        onClick={() => setCreatedBill(bill)}
                                                        style={{ background: '#059669', color: 'white' }}
                                                    >
                                                        <FiPrinter /> View
                                                    </button>
                                                ) : (
                                                    <button 
                                                        className="btn-action reissue" 
                                                        title="Re-issue Bill"
                                                        onClick={() => handleOpenEdit(bill)}
                                                    >
                                                        <FiPrinter /> Re-issue
                                                    </button>
                                                )}
                                                {user && user.role === 'superadmin' && (
                                                    <button 
                                                        className="btn-action delete" 
                                                        title="Delete Bill & Order"
                                                        onClick={() => handleDelete(bill._id)}
                                                    >
                                                        <FiTrash2 />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Edit / Reissue Bill modal */}
            {showEditModal && !createdBill && activeBill && (
                <div className="bill-modal-overlay" onClick={() => setShowEditModal(false)}>
                    <div className="bill-container" onClick={e => e.stopPropagation()} style={{ fontFamily: 'inherit' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #111111', paddingBottom: '10px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.4rem', fontFamily: "'Patrick Hand', cursive" }}>Re-issue Bill</h2>
                            <button onClick={() => setShowEditModal(false)} style={{ background: 'transparent', border: 'none', fontSize: '1.25rem', cursor: 'pointer' }}><FiX /></button>
                        </div>
                        {/* Items editing block */}
                        {activeBill.order && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderBottom: '2px dashed #111', paddingBottom: '15px' }}>
                                <h3 style={{ margin: '0 0 5px 0', fontSize: '1.05rem', fontFamily: "'Patrick Hand', cursive" }}>Edit Order Items</h3>
                                
                                {/* Add Item search bar */}
                                <div style={{ position: 'relative' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', border: '2px solid #111', borderRadius: '6px', padding: '4px 8px', background: '#FFF' }}>
                                        <FiSearch style={{ color: '#888', marginRight: '6px' }} />
                                        <input
                                            type="text"
                                            placeholder="Quick add item..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.85rem' }}
                                        />
                                        {searchQuery && <FiX onClick={() => setSearchQuery('')} style={{ cursor: 'pointer', color: '#888' }} />}
                                    </div>
                                    {searchQuery && (
                                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1002, background: '#FFF', border: '1px solid #111', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: '150px', overflowY: 'auto', marginTop: '4px' }}>
                                            {allMenuItems
                                                .filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()))
                                                .slice(0, 8)
                                                .map(m => (
                                                    <div
                                                        key={m._id}
                                                        onClick={() => handleAddItemToOrder(activeBill.order._id, m)}
                                                        style={{ padding: '8px 12px', fontSize: '0.85rem', cursor: 'pointer', borderBottom: '1px solid #EEE', display: 'flex', justifyContent: 'space-between' }}
                                                    >
                                                        <span>{m.name}</span>
                                                        <span style={{ fontWeight: 'bold' }}>₹{m.price}</span>
                                                    </div>
                                                ))
                                            }
                                        </div>
                                    )}
                                </div>

                                {/* List of items */}
                                <div style={{ maxHeight: '160px', overflowY: 'auto', border: '2px solid #111', borderRadius: '6px', padding: '6px', display: 'flex', flexDirection: 'column', gap: '6px', background: '#FAFAFA' }}>
                                    {activeBill.order.items.length === 0 ? (
                                        <div style={{ textAlignment: 'center', color: '#888', padding: '10px', fontSize: '0.85rem' }}>No items in order</div>
                                    ) : (
                                        activeBill.order.items.map((item, idx) => {
                                            const itemId = item.menuItem?._id || item.menuItem;
                                            return (
                                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', padding: '4px 0', borderBottom: '1px solid #EEE' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                                        <span style={{ fontWeight: 600 }}>{item.name || item.menuItem?.name}</span>
                                                        <span style={{ fontSize: '0.75rem', color: '#666' }}>₹{item.price} each</span>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <button 
                                                            type="button"
                                                            onClick={() => handleUpdateItemQuantity(activeBill.order._id, itemId, -1)}
                                                            style={{ border: '1px solid #111', background: '#FFF', width: '22px', height: '22px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                        >
                                                            <FiMinus size={10} />
                                                        </button>
                                                        <span style={{ fontWeight: 'bold', minWidth: '15px', textAlign: 'center' }}>{item.quantity}</span>
                                                        <button 
                                                            type="button"
                                                            onClick={() => handleUpdateItemQuantity(activeBill.order._id, itemId, 1)}
                                                            style={{ border: '1px solid #111', background: '#FFF', width: '22px', height: '22px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                        >
                                                            <FiPlus size={10} />
                                                        </button>
                                                        <span style={{ fontWeight: 'bold', minWidth: '50px', textAlign: 'right' }}>₹{item.total.toFixed(2)}</span>
                                                        <button 
                                                            type="button"
                                                            onClick={() => handleRemoveItem(activeBill.order._id, itemId)}
                                                            style={{ background: 'transparent', border: 'none', color: '#DC2626', cursor: 'pointer', padding: '0 4px' }}
                                                        >
                                                            <FiTrash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        )}

                        <form onSubmit={handleSaveAndPrint} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div className="input-group" style={{ position: 'relative', marginBottom: 0 }}>
                                <label style={{ fontWeight: 600, display: 'block', marginBottom: '2px', fontSize: '0.85rem' }}>Biller Name *</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Type Biller Name..."
                                    value={billerName}
                                    onChange={(e) => {
                                        setBillerName(e.target.value);
                                        setShowSuggestions(true);
                                    }}
                                    onFocus={() => setShowSuggestions(true)}
                                    className="input"
                                    style={{ width: '100%', padding: '8px', border: '2px solid #111111', borderRadius: '6px', fontSize: '0.9rem' }}
                                />
                                {showSuggestions && billerSuggestions.length > 0 && (
                                    <div className="biller-suggestions-dropdown" style={{ zIndex: 1003 }}>
                                        {billerSuggestions
                                            .filter(sug => sug.toLowerCase().includes(billerName.toLowerCase()))
                                            .slice(0, 15)
                                            .map((sug, idx) => (
                                                <div
                                                    key={idx}
                                                    onClick={() => {
                                                        setBillerName(sug);
                                                        setShowSuggestions(false);
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
                                <label style={{ fontWeight: 600, display: 'block', marginBottom: '2px', fontSize: '0.85rem' }}>Apply Coupon (Optional)</label>
                                <select
                                    value={discountInput}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setDiscountInput(val);
                                        const matchedCoupon = coupons.find(c => (c.discountType === 'percentage' ? `${c.discountValue}%` : `${c.discountValue}`) === val);
                                        if (matchedCoupon) {
                                            setDiscountName(matchedCoupon.code);
                                        } else {
                                            setDiscountName('');
                                        }
                                    }}
                                    className="input"
                                    style={{ width: '100%', padding: '8px', border: '2px solid #111111', borderRadius: '6px', fontSize: '0.9rem' }}
                                >
                                    <option value="">-- No Coupon --</option>
                                    {coupons.map(c => (
                                        <option key={c._id} value={c.discountType === 'percentage' ? `${c.discountValue}%` : `${c.discountValue}`}>
                                            {c.code} - {c.discountType === 'percentage' ? `${c.discountValue}%` : `₹${c.discountValue}`} Off (Min: ₹{c.minOrderAmount})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="input-group" style={{ marginBottom: 0 }}>
                                <label style={{ fontWeight: 600, display: 'block', marginBottom: '2px', fontSize: '0.85rem' }}>Custom Discount (e.g. 50 or 10%)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. 50 or 10%"
                                    value={discountInput}
                                    onChange={(e) => setDiscountInput(e.target.value)}
                                    className="input"
                                    style={{ width: '100%', padding: '8px', border: '2px solid #111111', borderRadius: '6px', fontSize: '0.9rem' }}
                                />
                                {user?.role !== 'superadmin' && (
                                    <span style={{ fontSize: '0.7rem', color: '#F59E0B', marginTop: '3px', display: 'block' }}>
                                        Max allowed: {maxDiscountPercent}% (set by superadmin)
                                    </span>
                                )}
                            </div>

                            {/* Custom discount name / reason */}
                            {parseDiscount(discountInput, activeBill.subtotal) > 0 && (
                                <div className="input-group" style={{ marginBottom: 0 }}>
                                    <label style={{ fontWeight: 600, display: 'block', marginBottom: '2px', fontSize: '0.85rem' }}>Discount Reason / Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Birthday Special"
                                        value={discountName}
                                        onChange={(e) => setDiscountName(e.target.value)}
                                        className="input"
                                        style={{ width: '100%', padding: '8px', border: '2px solid #111111', borderRadius: '6px', fontSize: '0.9rem' }}
                                    />
                                </div>
                            )}

                            <div style={{ background: '#F3F4F6', padding: '10px', borderRadius: '6px', border: '1px solid #E5E7EB', margin: '4px 0', gap: '4px', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#111111' }}>
                                    <span>Subtotal:</span>
                                    <span>₹{activeBill.subtotal.toFixed(2)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#DC2626' }}>
                                    <span>Discount:</span>
                                    <span>- ₹{parseDiscount(discountInput, activeBill.subtotal).toFixed(2)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#111111' }}>
                                    <span>GST (5%):</span>
                                    <span>₹{((activeBill.subtotal - parseDiscount(discountInput, activeBill.subtotal)) * 0.05).toFixed(2)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1rem', borderTop: '1px dashed #D1D5DB', paddingTop: '4px', color: '#7C3AED' }}>
                                    <span>GRAND TOTAL:</span>
                                    <span>₹{((activeBill.subtotal - parseDiscount(discountInput, activeBill.subtotal)) * 1.05).toFixed(2)}</span>
                                </div>
                            </div>

                            {/* Payment Method — Superadmin Only */}
                            {user?.role === 'superadmin' && (
                                <div style={{ background: '#FEF3C7', border: '2px solid #F59E0B', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#92400E', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        🔐 Superadmin: Edit Payment Method
                                    </div>
                                    <select
                                        value={editPaymentMethod}
                                        onChange={(e) => setEditPaymentMethod(e.target.value)}
                                        style={{ width: '100%', padding: '8px', border: '2px solid #F59E0B', borderRadius: '6px', fontWeight: 'bold', fontSize: '0.9rem', background: '#FFFBEB', cursor: 'pointer' }}
                                    >
                                        <option value="pending">⏳ Pending (Unpaid)</option>
                                        <option value="cash">💵 Cash</option>
                                        <option value="upi">📱 UPI / Online</option>
                                        <option value="card">💳 Card</option>
                                        <option value="split">🔀 Split Payment</option>
                                    </select>
                                    {editPaymentMethod === 'split' && (() => {
                                        const grandTotal = ((activeBill.subtotal - parseDiscount(discountInput, activeBill.subtotal)) * 1.05);
                                        const sumSplit = (parseFloat(editSplitCash) || 0) + (parseFloat(editSplitUpi) || 0) + (parseFloat(editSplitCard) || 0);
                                        const diff = Math.abs(sumSplit - grandTotal);
                                        return (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <div style={{ flex: 1 }}>
                                                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#92400E', display: 'block', marginBottom: '2px' }}>💵 Cash</label>
                                                        <input type="number" min="0" step="0.01" placeholder="0.00" value={editSplitCash} onChange={e => setEditSplitCash(e.target.value)} style={{ width: '100%', padding: '6px 8px', border: '1px solid #F59E0B', borderRadius: '5px', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#92400E', display: 'block', marginBottom: '2px' }}>📱 UPI</label>
                                                        <input type="number" min="0" step="0.01" placeholder="0.00" value={editSplitUpi} onChange={e => setEditSplitUpi(e.target.value)} style={{ width: '100%', padding: '6px 8px', border: '1px solid #F59E0B', borderRadius: '5px', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#92400E', display: 'block', marginBottom: '2px' }}>💳 Card</label>
                                                        <input type="number" min="0" step="0.01" placeholder="0.00" value={editSplitCard} onChange={e => setEditSplitCard(e.target.value)} style={{ width: '100%', padding: '6px 8px', border: '1px solid #F59E0B', borderRadius: '5px', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, color: diff > 1 ? '#DC2626' : '#059669', padding: '4px 6px', background: diff > 1 ? '#FEE2E2' : '#D1FAE5', borderRadius: '4px' }}>
                                                    <span>Split Total: ₹{sumSplit.toFixed(2)}</span>
                                                    <span>{diff > 1 ? `⚠️ Mismatch: ₹${diff.toFixed(2)}` : '✅ Matches Grand Total'}</span>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                    {editPaymentMethod !== 'pending' && editPaymentMethod !== 'split' && (
                                        <div style={{ fontSize: '0.78rem', color: '#78350F', background: '#FEF9C3', padding: '5px 8px', borderRadius: '4px' }}>
                                            ⚠️ Setting to <strong>{editPaymentMethod.toUpperCase()}</strong> will mark order as <strong>PAID</strong> and free the table.
                                        </div>
                                    )}
                                    {editPaymentMethod === 'pending' && (
                                        <div style={{ fontSize: '0.78rem', color: '#1D4ED8', background: '#DBEAFE', padding: '5px 8px', borderRadius: '4px' }}>
                                            ℹ️ Order will remain as <strong>bill_generated</strong> (Unpaid).
                                        </div>
                                    )}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={saving || (activeBill.order && activeBill.order.items.length === 0) || (editPaymentMethod === 'split' && user?.role === 'superadmin' && Math.abs(((parseFloat(editSplitCash)||0)+(parseFloat(editSplitUpi)||0)+(parseFloat(editSplitCard)||0)) - ((activeBill.subtotal - parseDiscount(discountInput, activeBill.subtotal)) * 1.05)) > 1)}
                                className="btn btn-primary btn-full sketch-border sketch-shadow"
                                style={{ padding: '8px', fontSize: '0.95rem' }}
                            >
                                {saving ? 'Saving...' : 'Confirm & Re-issue Bill'}
                            </button>
                        </form>

                    </div>
                </div>
            )}

            {/* Printable Modal Overlay */}
            {createdBill && (
                <div className="bill-modal-overlay">
                    <div className="bill-container print-bill-overlay">
                        <button className="sidebar-close" onClick={() => {
                            setShowEditModal(false);
                            setCreatedBill(null);
                        }} style={{ position: 'absolute', top: '10px', right: '10px', background: 'transparent', border: 'none', fontSize: '1.25rem', cursor: 'pointer', zIndex: 10 }}>
                            <FiX />
                        </button>
                        <div className="bill-header">
                            <h2>{createdBill.order?.restaurantInfo?.name || 'Kea By The Pool'}</h2>
                            <p>Eat • Chill • Repeat</p>
                            <p>{createdBill.order?.restaurantInfo?.address || 'Risali, Bhilai'}</p>
                            <p>Ph: {createdBill.order?.restaurantInfo?.phone || '+91 98765 43210'}</p>
                            {createdBill.order?.restaurantInfo?.gstNumber && <p>GSTIN: {createdBill.order.restaurantInfo.gstNumber}</p>}
                        </div>

                        <div className="bill-info">
                            <div className="bill-info-row">
                                <span>Bill No: {createdBill.billNumber}</span>
                                <span>Date: {new Date(createdBill.createdAt).toLocaleDateString()}</span>
                            </div>
                            <div className="bill-info-row">
                                <span>Time: {new Date(createdBill.createdAt).toLocaleTimeString()}</span>
                                <span>Table: {createdBill.order?.tableNumber || createdBill.order?.table?.tableNumber || 'Takeaway'}</span>
                            </div>
                            <div className="bill-info-row">
                                <span>Cust: {createdBill.order?.user?.name || 'Walk-in'}</span>
                                <span>{createdBill.order?.user?.phone || ''}</span>
                            </div>
                            <div className="bill-info-row" style={{ fontWeight: 'bold', marginTop: '4px' }}>
                                <span>Biller: {createdBill.billerName}</span>
                            </div>
                        </div>

                        <div className="bill-divider"></div>

                        <div className="bill-items-header">
                            <span>Item Name</span>
                            <span className="qty" style={{ textAlign: 'center' }}>Qty</span>
                            <span className="total" style={{ textAlign: 'right' }}>Amount</span>
                        </div>

                        <div className="bill-items">
                            {createdBill.order?.items?.map((item, index) => (
                                <div key={index} style={{ marginBottom: '4px' }}>
                                    <div className="bill-item">
                                        <span>{item.name || item.menuItem?.name || 'Item'}</span>
                                        <span className="qty" style={{ textAlign: 'center' }}>{item.quantity}</span>
                                        <span className="total" style={{ textAlign: 'right' }}>₹{((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
                                    </div>
                                    {item.notes && (
                                        <div style={{ fontSize: '0.75rem', color: '#666', marginLeft: '8px', fontStyle: 'italic', textAlign: 'left' }}>
                                            ↳ Note: {item.notes}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="bill-divider"></div>

                        <div className="bill-totals">
                            <div className="bill-total-row">
                                <span>Subtotal</span>
                                <span>₹{createdBill.subtotal.toFixed(2)}</span>
                            </div>
                            {createdBill.discount > 0 && (
                                <div className="bill-total-row" style={{ color: '#DC2626' }}>
                                    <span>Discount</span>
                                    <span>- ₹{createdBill.discount.toFixed(2)}</span>
                                </div>
                            )}
                            <div className="bill-total-row">
                                <span>GST (5%)</span>
                                <span>₹{createdBill.tax.toFixed(2)}</span>
                            </div>
                            <div className="bill-total-row grand-total">
                                <span>GRAND TOTAL</span>
                                <span>₹{createdBill.total.toFixed(2)}</span>
                            </div>
                        </div>

                        <div className="bill-footer">
                            <p>Payment: {createdBill.order?.paymentMethod?.toUpperCase() || 'PENDING'}</p>
                            <p>Thank you for visiting!</p>
                            <p>Visit again soon!</p>
                        </div>

                        <div className="bill-actions">
                            <button className="btn-print" onClick={() => window.print()}>Print Bill</button>
                            <button className="btn-close" onClick={() => {
                                setShowEditModal(false);
                                setCreatedBill(null);
                            }}>Close & Done</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminBills;
