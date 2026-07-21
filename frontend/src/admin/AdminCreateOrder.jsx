import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiPlus, FiMinus, FiTrash2, FiSearch, FiShoppingCart, FiUser, FiAlertTriangle, FiX, FiCheck, FiFileText, FiArrowLeft, FiHome, FiSun, FiStar, FiCoffee, FiGrid } from 'react-icons/fi';
import { getCategories, getMenuItems, getTables, createOrder, getBillerSuggestions, generateBill, getCoupons, getMaxDiscount, getTableSections, updateTable } from '../utils/api';
import { getImageUrl } from '../utils/config';
import { useAuth } from '../context/AuthContext';
import Loader from '../components/Loader';
import TableLayoutSelector from '../components/TableLayoutSelector';
import './AdminCreateOrder.css';
import '../components/OrderBill.css';

const AdminCreateOrder = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [step, setStep] = useState('table-select'); // 'table-select' | 'menu'
    const [categories, setCategories] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState('');
    const [menuItems, setMenuItems] = useState([]);
    const [tables, setTables] = useState([]);
    const [sections, setSections] = useState([]);
    const [selectedTableIds, setSelectedTableIds] = useState([]);
    
    // Manual Cart State
    const [cart, setCart] = useState([]);
    const [specialInstructions, setSpecialInstructions] = useState('');
    const [couponCode, setCouponCode] = useState('');
    
    // Customer Info (Optional)
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [coupons, setCoupons] = useState([]);

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    // Bill Generation states
    const [showBillModal, setShowBillModal] = useState(false);
    const [activeOrderId, setActiveOrderId] = useState('');
    const [billerName, setBillerName] = useState('');
    const [billerSuggestions, setBillerSuggestions] = useState([]);
    const [discountInput, setDiscountInput] = useState('');
    const [discountName, setDiscountName] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [createdBill, setCreatedBill] = useState(null);
    const [generatingBill, setGeneratingBill] = useState(false);
    const [createdKOT, setCreatedKOT] = useState(null);

    // Max discount cap
    const [maxDiscountPercent, setMaxDiscountPercent] = useState(20);

    // Kitchen Printer IP state (saved in localStorage)
    const [kitchenPrinterIp, setKitchenPrinterIp] = useState(() => {
        return localStorage.getItem('kea_kitchen_printer_ip') || '';
    });
    const [showPrinterModal, setShowPrinterModal] = useState(false);
    const [tempPrinterIp, setTempPrinterIp] = useState(kitchenPrinterIp);
    const [testingPrinter, setTestingPrinter] = useState(false);
    const [testResult, setTestResult] = useState(null);

    const testWiFiPrinterIp = async (ipToTest) => {
        const cleanIp = (ipToTest || tempPrinterIp).trim();
        if (!cleanIp) {
            setTestResult({ success: false, message: 'Please enter a valid IP address (e.g. 192.168.1.150).' });
            return;
        }

        setTestingPrinter(true);
        setTestResult(null);

        return new Promise((resolve) => {
            let settled = false;
            const img = new Image();

            const timer = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    setTestingPrinter(false);
                    setTestResult({
                        success: false,
                        message: `⚠️ No device responding at ${cleanIp}:9100. Make sure the printer is turned ON and connected to your WiFi router!`
                    });
                    resolve(false);
                }
            }, 2500);

            img.onload = img.onerror = () => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    setTestingPrinter(false);
                    setTestResult({
                        success: true,
                        message: `🟢 Device at ${cleanIp} is ONLINE & reachable on your local network!`
                    });
                    resolve(true);
                }
            };

            img.src = `http://${cleanIp}:9100/favicon.ico?t=${Date.now()}`;
        });
    };

    const handleSavePrinterIp = async () => {
        const clean = tempPrinterIp.trim();
        if (!clean) {
            localStorage.setItem('kea_kitchen_printer_ip', '');
            setKitchenPrinterIp('');
            setShowPrinterModal(false);
            setTestResult(null);
            return;
        }
        localStorage.setItem('kea_kitchen_printer_ip', clean);
        setKitchenPrinterIp(clean);
        setShowPrinterModal(false);
        setTestResult(null);
    };

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.altKey && e.key.toLowerCase() === 's') {
                e.preventDefault();
                document.querySelector('.menu-search-bar input')?.focus();
            }
            if (e.key === 'Escape') {
                setSearchQuery('');
                if (showBillModal && !createdBill) {
                    setShowBillModal(false);
                }
            }
            if (e.key === 'Enter') {
                const activeEl = document.activeElement;
                const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');
                if (step === 'table-select' && !isInput && selectedTableIds.length > 0) {
                    e.preventDefault();
                    setStep('menu');
                }
            }
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                if (cart.length > 0 && !submitting && !showBillModal) {
                    handlePlaceOrder(e);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [step, selectedTableIds, cart, submitting, showBillModal, createdBill]);

    useEffect(() => {
        fetchInitialData();
    }, []);

    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    useEffect(() => {
        fetchMenuItems();
    }, [selectedCategory, debouncedSearchQuery]);

    const fetchInitialData = async () => {
        try {
            const [catRes, tableRes, couponRes, discountRes, sectionsRes] = await Promise.all([
                getCategories(),
                getTables(),
                getCoupons(),
                getMaxDiscount(),
                getTableSections()
            ]);
            setCategories(catRes.data);
            setTables(tableRes.data);
            setCoupons(couponRes.data || []);
            setMaxDiscountPercent(discountRes.data.maxDiscountPercent);
            setSections(sectionsRes.data || []);
        } catch (err) {
            console.error('Error fetching admin order data:', err);
            setError('Failed to load menu categories, tables and coupons');
        } finally {
            setLoading(false);
        }
    };

    const fetchMenuItems = async () => {
        try {
            const params = {};
            if (selectedCategory) params.category = selectedCategory;
            if (debouncedSearchQuery) params.search = debouncedSearchQuery;
            const res = await getMenuItems(params);
            setMenuItems(res.data);
        } catch (err) {
            console.error('Error fetching menu items:', err);
        }
    };

    // Cart Operations
    const addToCart = (item) => {
        setCart(prev => {
            const existing = prev.find(i => i._id === item._id);
            if (existing) {
                return prev.map(i => i._id === item._id ? { ...i, quantity: i.quantity + 1 } : i);
            }
            return [...prev, { ...item, quantity: 1 }];
        });
    };

    const updateQuantity = (itemId, newQty) => {
        if (newQty <= 0) {
            setCart(prev => prev.filter(i => i._id !== itemId));
            return;
        }
        setCart(prev => prev.map(i => i._id === itemId ? { ...i, quantity: newQty } : i));
    };

    const removeItem = (itemId) => {
        setCart(prev => prev.filter(i => i._id !== itemId));
    };

    // Calculate totals (simple client-side preview; backend recalculates securely)
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    // Apply Coupon
    const activeCoupon = coupons.find(c => c.code.toUpperCase() === couponCode.toUpperCase());
    let discount = 0;
    if (activeCoupon) {
        if (activeCoupon.discountType === 'percentage') {
            discount = (subtotal * activeCoupon.discountValue) / 100;
            if (activeCoupon.maxDiscount) {
                discount = Math.min(discount, activeCoupon.maxDiscount);
            }
        } else {
            discount = activeCoupon.discountValue;
        }
    }
    
    const taxableAmount = Math.max(subtotal - discount, 0);
    const gst = taxableAmount * 0.05; // 5% default
    const total = taxableAmount + gst;

    const handlePlaceOrder = async (e) => {
        e?.preventDefault();
        if (cart.length === 0) {
            setError('Please add items to cart before submitting.');
            setSuccessMessage('');
            return;
        }

        setSubmitting(true);
        setError('');

        try {
            const orderData = {
                items: cart.map(item => ({
                    menuItem: item._id,
                    quantity: item.quantity
                })),
                tableIds: selectedTableIds,
                specialInstructions,
                couponCode: couponCode || undefined,
                customerPhone: customerPhone || undefined,
                customerName: customerName || undefined
            };

            const res = await createOrder(orderData);
            const createdOrder = res.data;

            // Clear any error and set success message
            setError('');
            setSuccessMessage(`Order #${createdOrder.orderNumber} created successfully!`);
            
            // Format 80mm KOT ticket object
            const tableNames = selectedTableIds.map(id => {
                const t = tables.find(tbl => tbl._id === id);
                return t ? `Table ${t.tableNumber}` : id;
            }).join(', ');

            const kotObj = {
                kotNumber: createdOrder.kotTicket || `KOT-${createdOrder.orderNumber}`,
                orderNumber: createdOrder.orderNumber,
                tableName: tableNames || 'Takeaway',
                staffName: user?.name || 'Admin',
                items: cart.map(i => ({ name: i.name, quantity: i.quantity })),
                notes: specialInstructions,
                timestamp: new Date()
            };

            // Set KOT modal state & trigger print
            setCreatedKOT(kotObj);
            setTimeout(() => {
                try { window.print(); } catch (_) {}
            }, 300);

            // Reset cart & inputs
            setCart([]);
            setSelectedTableIds([]);
            setStep('table-select');
            setSpecialInstructions('');
            setCouponCode('');
            setCustomerPhone('');
            setCustomerName('');
        } catch (err) {
            setSuccessMessage('');
            setError(err.response?.data?.message || 'Failed to place manual order');
        } finally {
            setSubmitting(false);
        }
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

    const handleConfirmBill = async (e) => {
        e.preventDefault();
        if (!billerName) {
            alert('Biller Name is required');
            return;
        }
        setGeneratingBill(true);
        try {
            const res = await generateBill({
                orderId: activeOrderId,
                billerName,
                discount: parseDiscount(discountInput, subtotal),
                discountName: discountName
            });
            localStorage.setItem('lastBillerName', billerName);
            setCreatedBill(res.data);
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to generate bill');
        } finally {
            setGeneratingBill(false);
        }
    };

    if (loading) return <Loader message="Preparing order entry interface..." />;

    const toggleTable = (table) => {
        setSelectedTableIds(prev =>
            prev.includes(table._id) ? prev.filter(id => id !== table._id) : [...prev, table._id]
        );
    };

    const handleContinueToMenu = () => {
        if (selectedTableIds.length === 0) return;
        setStep('menu');
    };

    const handleBackToTables = () => {
        setStep('table-select');
    };

    const handleSkipTable = () => {
        setSelectedTableIds([]);
        setStep('menu');
    };

    // Drag a chair from one table to another; persist capacity change to DB
    const handleMoveChair = async (fromId, toId) => {
        const from = tables.find(t => t._id === fromId);
        const to = tables.find(t => t._id === toId);
        if (!from || !to) return;
        if ((from.capacity || 0) <= 1) {
            setError('Cannot remove the last chair from a table.');
            setTimeout(() => setError(''), 2500);
            return;
        }
        const newFromCap = from.capacity - 1;
        const newToCap = (to.capacity || 0) + 1;
        // Optimistic UI update
        setTables(prev => prev.map(t =>
            t._id === fromId ? { ...t, capacity: newFromCap }
                : t._id === toId ? { ...t, capacity: newToCap } : t
        ));
        try {
            await Promise.all([
                updateTable(fromId, { capacity: newFromCap }),
                updateTable(toId, { capacity: newToCap })
            ]);
        } catch (err) {
            // Revert on failure
            setTables(prev => prev.map(t =>
                t._id === fromId ? { ...t, capacity: from.capacity }
                    : t._id === toId ? { ...t, capacity: to.capacity } : t
            ));
            setError('Failed to move chair. Please try again.');
            setTimeout(() => setError(''), 2500);
        }
    };

    // Drag a table to reposition it on the floor; persist to DB
    const handleMoveTable = async (tableId, x, y) => {
        setTables(prev => prev.map(t => t._id === tableId ? { ...t, posX: x, posY: y } : t));
        try {
            await updateTable(tableId, { posX: x, posY: y });
        } catch (err) {
            console.error('Failed to save table position', err);
        }
    };

    const selectedTableObjs = tables.filter(t => selectedTableIds.includes(t._id));

    return (
        <div className="admin-create-order">
            {error && (
                <div className="alert alert-danger">
                    <FiAlertTriangle /> {error}
                </div>
            )}
            {successMessage && (
                <div className="alert alert-success">
                    {successMessage}
                </div>
            )}

            {/* Step 1: Table Selection */}
            {step === 'table-select' && (
                <div className="table-select-step">
                    <div className="step-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                        <div>
                            <h1 style={{ margin: 0 }}>Create Order</h1>
                            <p className="step-subtitle" style={{ margin: '4px 0 10px 0' }}>
                                Tap tables to select (pick multiple for one customer). Press <kbd style={{ background: '#E5E7EB', color: '#111', padding: '2px 6px', borderRadius: '4px', border: '1px solid #D1D5DB', fontSize: '0.8rem' }}>Enter ↵</kbd> to continue.
                            </p>
                            {/* Dual Printer Status Bar */}
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', background: '#F8FAFC', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                <span style={{ fontSize: '0.82rem', background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', padding: '4px 10px', borderRadius: '16px', fontWeight: '700' }}>
                                    🖥️ Counter USB: Connected
                                </span>
                                <span style={{ fontSize: '0.82rem', background: kitchenPrinterIp ? '#ECFDF5' : '#FEF3C7', border: kitchenPrinterIp ? '1px solid #A7F3D0' : '1px solid #FDE68A', color: kitchenPrinterIp ? '#065F46' : '#92400E', padding: '4px 10px', borderRadius: '16px', fontWeight: '700' }}>
                                    🖨️ Kitchen WiFi IP: {kitchenPrinterIp ? `${kitchenPrinterIp}:9100` : 'Not Set'}
                                </span>
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    style={{ padding: '4px 10px', fontSize: '0.78rem', fontWeight: 'bold' }}
                                    onClick={() => {
                                        setTempPrinterIp(kitchenPrinterIp);
                                        setShowPrinterModal(true);
                                    }}
                                >
                                    ⚙️ Connect WiFi Printer IP
                                </button>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <button className="btn btn-ghost skip-table-btn" onClick={handleSkipTable}>
                                Skip (Takeaway)
                            </button>
                            <button
                                className="btn btn-primary continue-btn"
                                onClick={handleContinueToMenu}
                                disabled={selectedTableIds.length === 0}
                                style={{ fontWeight: 'bold', padding: '10px 22px', fontSize: '0.95rem', boxShadow: '0 4px 12px rgba(124, 58, 237, 0.3)' }}
                            >
                                Continue {selectedTableIds.length > 0 ? `(${selectedTableIds.length} Table${selectedTableIds.length > 1 ? 's' : ''}) ↵` : ''}
                            </button>
                        </div>
                    </div>
                    <TableLayoutSelector
                        tables={tables}
                        selectedTableIds={selectedTableIds}
                        onToggleTable={toggleTable}
                        sections={sections}
                        onMoveChair={handleMoveChair}
                        onMoveTable={handleMoveTable}
                    />
                    <div className="table-select-actions" style={{ marginTop: '16px' }}>
                        <button className="btn btn-ghost skip-table-btn" onClick={handleSkipTable}>
                            Skip (Takeaway / Parcel)
                        </button>
                        <button
                            className="btn btn-primary continue-btn"
                            onClick={handleContinueToMenu}
                            disabled={selectedTableIds.length === 0}
                        >
                            Continue{selectedTableIds.length > 0 ? ` with ${selectedTableIds.length} table${selectedTableIds.length > 1 ? 's' : ''}` : ''}
                        </button>
                    </div>
                </div>
            )}

            {/* Step 2: Menu & Cart */}
            {step === 'menu' && (
                <>
                    <div className="menu-step-header">
                        <button className="btn btn-ghost back-btn" onClick={handleBackToTables}>
                            <FiArrowLeft /> Change Table
                        </button>
                        <div className="current-table-info">
                            {selectedTableObjs.length > 0 ? (
                                <div className="selected-tables-badges">
                                    {selectedTableObjs.map(t => (
                                        <span key={t._id} className="selected-table-badge">
                                            {t.areaType !== 'table' && <span className="area-icon-badge">{t.areaType === 'room' ? <FiHome size={14} /> : t.areaType === 'outdoor' ? <FiSun size={14} /> : t.areaType === 'vip' ? <FiStar size={14} /> : t.areaType === 'bar' ? <FiCoffee size={14} /> : <FiGrid size={14} />}</span>}
                                            {t.name || `Table ${t.tableNumber}`}
                                            <span className="table-section-tag">{t.section || 'Main Hall'}</span>
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <span className="selected-table-badge takeaway">Takeaway / Parcel</span>
                            )}
                        </div>
                    </div>

                    <div className="create-order-container">
                {/* Left side: Menu Selection */}
                <div className="menu-selector-section sketch-border-subtle sketch-shadow">
                    <div className="menu-search-bar">
                        <FiSearch />
                        <input
                            type="text"
                            placeholder="Search dishes (e.g. Mojito, Pizza...)"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <div className="categories-list">
                        <button
                            className={`category-btn ${!selectedCategory ? 'active' : ''}`}
                            onClick={() => setSelectedCategory('')}
                        >
                            All
                        </button>
                        {categories.map(cat => (
                            <button
                                key={cat._id}
                                className={`category-btn ${selectedCategory === cat._id ? 'active' : ''}`}
                                onClick={() => setSelectedCategory(cat._id)}
                            >
                                {cat.name}
                            </button>
                        ))}
                    </div>

                    <div className="items-grid">
                        {menuItems.length === 0 ? (
                            <p className="no-items">No items match filters</p>
                        ) : (
                            menuItems.map(item => {
                                const cartItem = cart.find(i => i._id === item._id);
                                return (
                                    <div key={item._id} className="menu-select-card sketch-border-subtle">
                                        <div className="menu-select-card-image-container">
                                            {item.image ? (
                                                <img 
                                                    src={getImageUrl(item.image)} 
                                                    alt={item.name} 
                                                    className="menu-select-card-image" 
                                                    onError={(e) => {
                                                        e.target.style.display = 'none';
                                                        e.target.nextSibling && (e.target.nextSibling.style.display = 'flex');
                                                    }}
                                                />
                                            ) : null}
                                            <div className="no-image" style={{ display: item.image ? 'none' : 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', background: '#F3F4F6', flexDirection: 'column', gap: '4px' }}>
                                                <span style={{ fontSize: '1.5rem' }}>🍽️</span>
                                                <span style={{ fontSize: '0.65rem', color: '#6B7280' }}>No Image</span>
                                            </div>
                                        </div>
                                        <div className="item-info">
                                            <span className={`veg-badge ${item.isVeg ? 'badge-veg' : 'badge-non-veg'}`}></span>
                                            <h4>{item.name}</h4>
                                            <p className="price">₹{item.price}</p>
                                        </div>
                                        <div className="item-action">
                                            {cartItem ? (
                                                <div className="qty-selector">
                                                    <button onClick={() => updateQuantity(item._id, cartItem.quantity - 1)}>-</button>
                                                    <span>{cartItem.quantity}</span>
                                                    <button onClick={() => addToCart(item)}>+</button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => addToCart(item)}
                                                    className="add-to-cart-btn"
                                                    disabled={!item.isAvailable}
                                                >
                                                    {item.isAvailable ? 'Add' : 'Out of Stock'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Right side: Cart & Customer Info */}
                <div className="cart-checkout-section sketch-border-subtle sketch-shadow">
                    <h2><FiShoppingCart /> Current Basket ({cart.reduce((s, i) => s + i.quantity, 0)})</h2>
                    
                    {cart.length === 0 ? (
                        <div className="empty-basket">
                            <p>Select items from the menu to start order</p>
                        </div>
                    ) : (
                        <div className="basket-items">
                            {cart.map(item => (
                                <div key={item._id} className="basket-item">
                                    <div className="item-details">
                                        <span className="item-name">{item.name}</span>
                                        <span className="item-price">₹{item.price} each</span>
                                    </div>
                                    <div className="item-controls">
                                        <div className="qty-selector">
                                            <button onClick={() => updateQuantity(item._id, item.quantity - 1)}>-</button>
                                            <span>{item.quantity}</span>
                                            <button onClick={() => updateQuantity(item._id, item.quantity + 1)}>+</button>
                                        </div>
                                        <span className="item-total">₹{item.price * item.quantity}</span>
                                        <button className="delete-item-btn" onClick={() => removeItem(item._id)}>
                                            <FiTrash2 />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <form onSubmit={handlePlaceOrder} className="checkout-form" style={{ gap: '8px' }}>
                        {/* Coupon Selection */}
                        <div className="input-group" style={{ marginBottom: 0 }}>
                            <label style={{ fontSize: '0.8rem', marginBottom: '2px' }}>Apply Coupon</label>
                            <select
                                value={couponCode}
                                onChange={(e) => setCouponCode(e.target.value)}
                                className="input"
                                style={{ padding: '6px 8px', fontSize: '0.9rem' }}
                            >
                                <option value="">-- No Coupon --</option>
                                {coupons.map(c => (
                                    <option key={c._id} value={c.code}>
                                        {c.code}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Customer Info (Optional) - Side-by-Side and Super Compact */}
                        <div className="customer-info-box sketch-border-subtle" style={{ padding: '8px', gap: '6px' }}>
                            <h3 style={{ fontSize: '0.95rem', margin: 0 }}><FiUser /> Customer Info</h3>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                                    <input
                                        type="tel"
                                        placeholder="Phone (10 digit)"
                                        value={customerPhone}
                                        onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, '').slice(0,10))}
                                        className="input"
                                        style={{ padding: '6px', fontSize: '0.85rem' }}
                                    />
                                </div>
                                <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                                    <input
                                        type="text"
                                        placeholder="Name"
                                        value={customerName}
                                        onChange={(e) => setCustomerName(e.target.value)}
                                        className="input"
                                        style={{ padding: '6px', fontSize: '0.85rem' }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Special Instructions */}
                        <div className="input-group" style={{ marginBottom: 0 }}>
                            <input
                                type="text"
                                placeholder="Kitchen / Prep Instructions..."
                                value={specialInstructions}
                                onChange={(e) => setSpecialInstructions(e.target.value)}
                                className="input"
                                style={{ padding: '6px', fontSize: '0.85rem' }}
                            />
                        </div>

                        {/* Totals Summary */}
                        <div className="summary-box" style={{ padding: '10px', gap: '4px' }}>
                            <div className="summary-row" style={{ fontSize: '0.85rem' }}>
                                <span>Subtotal</span>
                                <span>₹{subtotal.toFixed(2)}</span>
                            </div>
                            {discount > 0 && (
                                <div className="summary-row" style={{ color: '#DC2626', fontSize: '0.85rem' }}>
                                    <span>Discount ({couponCode})</span>
                                    <span>-₹{discount.toFixed(2)}</span>
                                </div>
                            )}
                            <div className="summary-row" style={{ fontSize: '0.85rem' }}>
                                <span>GST (5%)</span>
                                <span>₹{gst.toFixed(2)}</span>
                            </div>
                            <div className="summary-row total">
                                <span>GRAND TOTAL</span>
                                <span>₹{total.toFixed(2)}</span>
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary btn-full sketch-border sketch-shadow"
                            disabled={submitting || cart.length === 0}
                        >
                            {submitting ? 'Creating Order...' : `Place Staff Order • ₹${total.toFixed(2)}`}
                        </button>
                        <div className="shortcuts-notice">
                            Keyboard Shortcuts: [Alt + S] Focus Search | [Esc] Clear Search | [Ctrl + Enter] Submit Order
                        </div>
                    </form>
                </div>
            </div>
                </>
            )}

            {/* Bill Generation Modal */}
            {showBillModal && !createdBill && (
                <div className="bill-modal-overlay" onClick={() => setShowBillModal(false)}>
                    <div className="bill-container" onClick={e => e.stopPropagation()} style={{ fontFamily: 'inherit' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #111111', paddingBottom: '10px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.4rem', fontFamily: "'Patrick Hand', cursive" }}>Generate Bill</h2>
                            <button onClick={() => setShowBillModal(false)} style={{ background: 'transparent', border: 'none', fontSize: '1.25rem', cursor: 'pointer' }}><FiX /></button>
                        </div>
                        <form onSubmit={handleConfirmBill} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div className="input-group" style={{ position: 'relative' }}>
                                <label style={{ fontWeight: 600, display: 'block', marginBottom: '6px' }}>Biller Name *</label>
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
                                    style={{ width: '100%', padding: '10px', border: '2px solid #111111', borderRadius: '6px' }}
                                />
                                {showSuggestions && billerSuggestions.length > 0 && (
                                    <div className="biller-suggestions-dropdown">
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

                            <div className="input-group">
                                <label style={{ fontWeight: 600, display: 'block', marginBottom: '6px' }}>Discount (Rupees or %)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. 50 or 10%"
                                    value={discountInput}
                                    onChange={(e) => setDiscountInput(e.target.value)}
                                    className="input"
                                    style={{ width: '100%', padding: '10px', border: '2px solid #111111', borderRadius: '6px' }}
                                />
                                {user?.role !== 'superadmin' && (
                                    <span style={{ fontSize: '0.75rem', color: '#F59E0B', marginTop: '4px', display: 'block' }}>
                                        Max allowed: {maxDiscountPercent}% (set by superadmin)
                                    </span>
                                )}
                            </div>

                            {parseDiscount(discountInput, subtotal) > 0 && (
                                <div className="input-group">
                                    <label style={{ fontWeight: 600, display: 'block', marginBottom: '6px' }}>Discount Reason / Name (e.g. Staff Discount, Birthday Special)</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Staff Discount"
                                        value={discountName}
                                        onChange={(e) => setDiscountName(e.target.value)}
                                        className="input"
                                        style={{ width: '100%', padding: '10px', border: '2px solid #111111', borderRadius: '6px' }}
                                    />
                                </div>
                            )}

                            <div style={{ background: '#F3F4F6', padding: '12px', borderRadius: '6px', border: '1px solid #E5E7EB', margin: '8px 0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '4px', color: '#111111' }}>
                                    <span>Subtotal:</span>
                                    <span>₹{subtotal.toFixed(2)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '4px', color: '#DC2626' }}>
                                    <span>Discount:</span>
                                    <span>- ₹{parseDiscount(discountInput, subtotal).toFixed(2)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '8px', color: '#111111' }}>
                                    <span>GST (5%):</span>
                                    <span>₹{((subtotal - parseDiscount(discountInput, subtotal)) * 0.05).toFixed(2)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.05rem', borderTop: '1px dashed #D1D5DB', paddingTop: '6px', color: '#7C3AED' }}>
                                    <span>GRAND TOTAL:</span>
                                    <span>₹{((subtotal - parseDiscount(discountInput, subtotal)) * 1.05).toFixed(2)}</span>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={generatingBill}
                                className="btn btn-primary btn-full sketch-border sketch-shadow"
                            >
                                {generatingBill ? 'Generating...' : 'Confirm & Print Bill'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Final Printable Bill Receipt Modal */}
            {createdBill && (
                <div className="bill-modal-overlay">
                    <div className="bill-container print-bill-overlay">
                        <button className="sidebar-close" onClick={() => {
                            setShowBillModal(false);
                            setCreatedBill(null);
                            setDiscountInput('');
                            navigate('/admin/bills');
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
                                {createdBill.order?.tableNumber && <span>Table: {createdBill.order.tableNumber}</span>}
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
                                <div key={index} className="bill-item">
                                    <span>{item.name || item.menuItem?.name || 'Item'}</span>
                                    <span className="qty" style={{ textAlign: 'center' }}>{item.quantity}</span>
                                    <span className="total" style={{ textAlign: 'right' }}>₹{((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
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
                                setShowBillModal(false);
                                setCreatedBill(null);
                                setDiscountInput('');
                                navigate('/admin/bills');
                            }}>Close & Done</button>
                        </div>
                    </div>
                </div>
            )}

            {/* 80mm KOT Ticket Printable Modal (Identical size & format to Bill) */}
            {createdKOT && (
                <div className="bill-modal-overlay" onClick={() => setCreatedKOT(null)}>
                    <div className="bill-container print-bill-overlay" onClick={e => e.stopPropagation()}>
                        <div className="bill-header">
                            <h2>KEA BY THE POOL</h2>
                            <p style={{ fontWeight: 'bold', fontSize: '15px', color: '#7C3AED', margin: '4px 0' }}>KITCHEN ORDER TICKET</p>
                            <p style={{ fontWeight: 'bold', fontSize: '17px', margin: 0 }}>{createdKOT.kotNumber}</p>
                        </div>

                        <div className="bill-info">
                            <div className="bill-info-row">
                                <span>TABLE:</span>
                                <strong>{createdKOT.tableName || 'Takeaway'}</strong>
                            </div>
                            <div className="bill-info-row">
                                <span>ORDER #:</span>
                                <strong>#{createdKOT.orderNumber}</strong>
                            </div>
                            <div className="bill-info-row">
                                <span>STAFF:</span>
                                <strong>{createdKOT.staffName}</strong>
                            </div>
                            <div className="bill-info-row">
                                <span>DATE/TIME:</span>
                                <span>{new Date(createdKOT.timestamp).toLocaleDateString('en-IN')} {new Date(createdKOT.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                            </div>
                        </div>

                        <div className="bill-divider"></div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '15px', borderBottom: '2px solid #000', paddingBottom: '4px', marginBottom: '8px' }}>
                            <span>ITEM NAME</span>
                            <span>QTY</span>
                        </div>

                        {createdKOT.items.map((item, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: '600', marginBottom: '6px' }}>
                                <span>{item.name}</span>
                                <strong>x{item.quantity}</strong>
                            </div>
                        ))}

                        {createdKOT.notes && (
                            <>
                                <div className="bill-divider"></div>
                                <div style={{ background: '#FEF3C7', padding: '6px 8px', borderRadius: '4px', border: '1px solid #F59E0B', fontSize: '13px' }}>
                                    <strong>NOTE:</strong> {createdKOT.notes}
                                </div>
                            </>
                        )}

                        <div className="bill-divider"></div>

                        <div className="bill-footer">
                            <p style={{ fontSize: '13px', color: '#000', fontWeight: 'bold' }}>*** KITCHEN COPY (80mm Thermal) ***</p>
                        </div>

                        <div className="bill-actions">
                            <button className="btn-print" style={{ background: '#7C3AED' }} onClick={() => window.print()}>🖨️ Print KOT</button>
                            <button className="btn-close" onClick={() => setCreatedKOT(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Kitchen WiFi Printer IP Modal */}
            {showPrinterModal && (
                <div className="modal-overlay" onClick={() => setShowPrinterModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px', width: '92%' }}>
                        <div className="modal-header">
                            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>🖨️ Configure Kitchen WiFi Printer</h2>
                            <button className="modal-close" onClick={() => setShowPrinterModal(false)}>×</button>
                        </div>
                        <div style={{ padding: '16px 0' }}>
                            <p style={{ fontSize: '0.9rem', color: '#4B5563', margin: '0 0 12px 0', lineHeight: '1.4' }}>
                                Enter the LAN/WiFi IP address of your Kitchen Thermal Printer (Port 9100). Both Counter USB & Kitchen WiFi printers will receive KOT slips.
                            </p>
                            <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.88rem', marginBottom: '6px' }}>
                                Kitchen Printer IP Address:
                            </label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder="e.g. 192.168.1.150 or 192.168.1.67"
                                    value={tempPrinterIp}
                                    onChange={e => {
                                        setTempPrinterIp(e.target.value);
                                        setTestResult(null);
                                    }}
                                    style={{ flex: 1, padding: '10px', fontSize: '1rem', border: '2px solid #111', borderRadius: '6px', boxSizing: 'border-box' }}
                                />
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    disabled={testingPrinter || !tempPrinterIp.trim()}
                                    onClick={() => testWiFiPrinterIp()}
                                    style={{ padding: '10px 14px', fontSize: '0.88rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                                >
                                    {testingPrinter ? 'Scanning...' : '🔍 Test IP'}
                                </button>
                            </div>

                            {testResult && (
                                <div style={{
                                    marginTop: '12px',
                                    padding: '10px 12px',
                                    borderRadius: '6px',
                                    fontSize: '0.85rem',
                                    fontWeight: '600',
                                    background: testResult.success ? '#ECFDF5' : '#FEF2F2',
                                    border: `1px solid ${testResult.success ? '#A7F3D0' : '#FECACA'}`,
                                    color: testResult.success ? '#065F46' : '#991B1B'
                                }}>
                                    {testResult.message}
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                            <button className="btn btn-secondary" onClick={() => setShowPrinterModal(false)}>Cancel</button>
                            <button className="btn btn-primary" style={{ background: '#7C3AED', borderColor: '#7C3AED', fontWeight: 'bold' }} onClick={handleSavePrinterIp}>
                                Save Printer IP
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminCreateOrder;
