import React, { useState, useEffect } from 'react';
import { FiSearch, FiFileText, FiClock, FiCheckCircle, FiXCircle, FiDownload, FiCalendar, FiX, FiTrash2 } from 'react-icons/fi';
import { getAllOrders, deleteOrder } from '../utils/api';
import { exportToCSV, orderExportColumns, getFilenameDate } from '../utils/exportUtils';
import { useAuth } from '../context/AuthContext';
import OrderBill from '../components/OrderBill';
import './AdminHistory.css';

const getLocalDateString = (date = new Date()) => {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
};

const AdminHistory = () => {
    const { user } = useAuth();
    const isSuperadmin = user?.role === 'superadmin';
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [allTime, setAllTime] = useState(false);
    const [filters, setFilters] = useState({
        status: '',
        date: getLocalDateString()
    });
    const [showExportModal, setShowExportModal] = useState(false);
    const [exportRange, setExportRange] = useState({
        startDate: '',
        endDate: ''
    });

    // Bulk select for superadmin
    const [selectedIds, setSelectedIds] = useState([]);
    const [bulkDeleting, setBulkDeleting] = useState(false);

    useEffect(() => {
        fetchOrders();
    }, [filters, allTime]);

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const apiFilters = { ...filters };
            if (allTime) delete apiFilters.date;

            const res = await getAllOrders(apiFilters);
            setOrders(res.data);
        } catch (error) {
            console.error('Error fetching history:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteOrder = async (orderId) => {
        if (!window.confirm('Are you absolutely sure you want to permanently delete this order? This will remove all records.')) {
            return;
        }

        try {
            await deleteOrder(orderId);
            setOrders(prev => prev.filter(o => o._id !== orderId));
            setSelectedIds(prev => prev.filter(id => id !== orderId));
        } catch (error) {
            console.error('Delete error:', error);
            alert('Failed to delete order');
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        if (!window.confirm(`Delete ${selectedIds.length} orders permanently? This cannot be undone.`)) return;
        setBulkDeleting(true);
        try {
            for (const id of selectedIds) {
                await deleteOrder(id);
            }
            setOrders(prev => prev.filter(o => !selectedIds.includes(o._id)));
            setSelectedIds([]);
        } catch (error) {
            alert('Some orders failed to delete');
            fetchOrders();
        } finally {
            setBulkDeleting(false);
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === orders.length) setSelectedIds([]);
        else setSelectedIds(orders.map(o => o._id));
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'paid': return <FiCheckCircle className="text-success" />;
            case 'cancelled': return <FiXCircle className="text-danger" />;
            default: return <FiClock className="text-warning" />;
        }
    };

    const handleExport = async () => {
        try {
            const params = {
                ...(exportRange.startDate && { startDate: exportRange.startDate }),
                ...(exportRange.endDate && { endDate: exportRange.endDate })
            };
            const res = await getAllOrders(params);
            const dataToExport = res.data || [];

            const filename = exportRange.startDate && exportRange.endDate
                ? `orders_${exportRange.startDate}_to_${exportRange.endDate}`
                : `orders_${getFilenameDate()}`;

            exportToCSV(dataToExport, orderExportColumns, filename);
            setShowExportModal(false);
            setExportRange({ startDate: '', endDate: '' });
        } catch (error) {
            console.error('Export error:', error);
            alert('Failed to export data');
        }
    };

    return (
        <div className="admin-history">
            <div className="page-header">
                <div className="header-main">
                    <h1>Order History</h1>
                    <div className="history-tabs">
                        <button
                            className={`tab-btn ${!allTime ? 'active' : ''}`}
                            onClick={() => setAllTime(false)}
                        >
                            Daily
                        </button>
                        {isSuperadmin && (
                            <button
                                className={`tab-btn ${allTime ? 'active' : ''}`}
                                onClick={() => setAllTime(true)}
                            >
                                All Time
                            </button>
                        )}
                        {isSuperadmin && (
                            <button className="btn btn-primary export-btn" onClick={() => setShowExportModal(true)}>
                                <FiDownload /> Export
                            </button>
                        )}
                        {isSuperadmin && selectedIds.length > 0 && (
                            <button
                                className="btn btn-danger export-btn"
                                onClick={handleBulkDelete}
                                disabled={bulkDeleting}
                                style={{ marginLeft: 8 }}
                            >
                                <FiTrash2 /> {bulkDeleting ? 'Deleting...' : `Delete (${selectedIds.length})`}
                            </button>
                        )}
                    </div>
                </div>
                <div className="filters">
                    {!allTime && (
                        <input
                            type="date"
                            className="input"
                            value={filters.date}
                            onChange={(e) => setFilters({ ...filters, date: e.target.value })}
                            max={!isSuperadmin ? getLocalDateString() : undefined}
                            min={!isSuperadmin ? getLocalDateString() : undefined}
                            disabled={!isSuperadmin}
                        />
                    )}
                    <select
                        className="input"
                        value={filters.status}
                        onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                    >
                        <option value="">All Status</option>
                        <option value="paid">Paid</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="pending">Pending</option>
                    </select>
                </div>
            </div>

            <div className="history-table-container">
                {loading ? (
                    <div className="admin-loading"><div className="spinner"></div></div>
                ) : (
                    <table className="admin-table">
                        <thead>
                            <tr>
                                {isSuperadmin && (
                                    <th style={{ width: '40px' }}>
                                        <input type="checkbox" checked={selectedIds.length === orders.length && orders.length > 0} onChange={toggleSelectAll} />
                                    </th>
                                )}
                                <th>Order #</th>
                                <th>Customer</th>
                                <th>Items</th>
                                <th>Total</th>
                                <th>Status</th>
                                <th>Time</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orders.map(order => (
                                <tr key={order._id}>
                                    {isSuperadmin && (
                                        <td><input type="checkbox" checked={selectedIds.includes(order._id)} onChange={() => toggleSelect(order._id)} /></td>
                                    )}
                                    <td className="font-bold">{order.orderNumber}</td>
                                    <td>
                                        <div className="cust-info">
                                            <span>{order.user?.name || 'Walk-in'}</span>
                                            <span className="text-muted">{order.user?.phone}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="items-preview">
                                            {order.items.length} items
                                        </div>
                                    </td>
                                    <td className="font-bold text-primary">₹{order.total.toFixed(2)}</td>
                                    <td>
                                        <span className={`status-pill ${order.status}`}>
                                            {getStatusIcon(order.status)} {order.status}
                                        </span>
                                    </td>
                                    <td>
                                        {allTime ? (
                                            new Date(order.createdAt).toLocaleDateString('en-IN', {
                                                day: '2-digit',
                                                month: 'short',
                                                year: 'numeric'
                                            })
                                        ) : (
                                            new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                        )}
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                className="btn-view-bill"
                                                onClick={() => setSelectedOrder(order)}
                                            >
                                                <FiFileText /> Bill
                                            </button>
                                            {isSuperadmin && (
                                                <button
                                                    className="btn-view-bill"
                                                    onClick={() => handleDeleteOrder(order._id)}
                                                    style={{ backgroundColor: '#EF4444', borderColor: '#EF4444', color: 'white' }}
                                                    title="Delete Order Permanently"
                                                >
                                                    <FiTrash2 /> Delete
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {!loading && orders.length === 0 && (
                    <div className="no-data">
                        <FiSearch size={48} />
                        <p>No orders found for this selection</p>
                    </div>
                )}
            </div>

            {selectedOrder && (
                <OrderBill
                    order={selectedOrder}
                    onCancel={() => setSelectedOrder(null)}
                />
            )}

            {/* Export Modal */}
            {showExportModal && (
                <div className="modal-overlay" onClick={() => setShowExportModal(false)}>
                    <div className="export-modal" onClick={e => e.stopPropagation()}>
                        <button className="close-btn" onClick={() => setShowExportModal(false)}><FiX /></button>
                        <h2><FiDownload /> Export Orders</h2>
                        <p>Download order history as CSV file</p>

                        <div className="date-range-section">
                            <h4><FiCalendar /> Date Range</h4>
                            <p className="hint">Select dates or leave empty for all orders</p>
                            <div className="date-inputs">
                                <div className="input-group">
                                    <label>From Date</label>
                                    <input
                                        type="date"
                                        value={exportRange.startDate}
                                        onChange={(e) => setExportRange({ ...exportRange, startDate: e.target.value })}
                                    />
                                </div>
                                <div className="input-group">
                                    <label>To Date</label>
                                    <input
                                        type="date"
                                        value={exportRange.endDate}
                                        onChange={(e) => setExportRange({ ...exportRange, endDate: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="export-info">
                            <p>📋 Export includes: Order ID, Date, Customer, Items, Total, Payment Method, Status</p>
                        </div>

                        <div className="modal-actions">
                            <button className="btn btn-secondary" onClick={() => setShowExportModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleExport}>
                                <FiDownload /> Download CSV
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminHistory;
