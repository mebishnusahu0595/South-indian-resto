import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiShoppingBag, FiDollarSign, FiAlertCircle, FiTrendingUp, FiSettings, FiUsers, FiBarChart2, FiCalendar } from 'react-icons/fi';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getDashboardStats, getActiveOrders, getLowStock, getGstRate, updateGstRate, getUserAnalytics, getRevenueData } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import Loader from '../components/Loader';
import './AdminDashboard.css';

const AdminDashboard = () => {
    const { user, socket } = useAuth();

    const getLocalDateString = (d = new Date()) => {
        const offset = d.getTimezoneOffset();
        const localDate = new Date(d.getTime() - (offset * 60 * 1000));
        return localDate.toISOString().split('T')[0];
    };

    const getFirstOfMonthDateString = () => {
        const d = new Date();
        const first = new Date(d.getFullYear(), d.getMonth(), 1);
        return getLocalDateString(first);
    };

    const [startDate, setStartDate] = useState(getLocalDateString());
    const [endDate, setEndDate] = useState(getLocalDateString());

    const [stats, setStats] = useState(null);
    const [activeOrders, setActiveOrders] = useState([]);
    const [lowStock, setLowStock] = useState([]);
    const [userStats, setUserStats] = useState(null);
    const [revenueData, setRevenueData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [gstRate, setGstRate] = useState(5);
    const [newGstRate, setNewGstRate] = useState(5);
    const [gstSaving, setGstSaving] = useState(false);

    useEffect(() => {
        fetchData(getLocalDateString(), getLocalDateString());
        fetchGstRate();
    }, []);

    useEffect(() => {
        if (socket) {
            socket.on('new-order', () => fetchData());
            socket.on('order-updated', () => fetchData());
            return () => {
                socket.off('new-order');
                socket.off('order-updated');
            };
        }
    }, [socket]);

    const fetchData = async (start = startDate, end = endDate) => {
        try {
            const [statsRes, ordersRes, stockRes, userRes, revenueRes] = await Promise.all([
                getDashboardStats(),
                getActiveOrders(),
                getLowStock(),
                getUserAnalytics('month'),
                getRevenueData('month', { startDate: start, endDate: end })
            ]);
            setStats(statsRes.data);
            setActiveOrders(ordersRes.data);
            setLowStock(stockRes.data);
            setUserStats(userRes.data);
            setRevenueData(revenueRes.data.map(d => ({
                ...d,
                date: new Date(d._id).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
            })));
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchGstRate = async () => {
        try {
            const res = await getGstRate();
            setGstRate(res.data.gstRate || 5);
            setNewGstRate(res.data.gstRate || 5);
        } catch (error) {
            console.error('Error fetching GST rate:', error);
        }
    };

    const handleGstUpdate = async () => {
        if (newGstRate < 0 || newGstRate > 100) {
            alert('GST rate must be between 0 and 100');
            return;
        }
        setGstSaving(true);
        try {
            await updateGstRate(parseFloat(newGstRate));
            setGstRate(newGstRate);
            alert('GST rate updated successfully!');
        } catch (error) {
            alert('Failed to update GST rate');
        } finally {
            setGstSaving(false);
        }
    };

    const rangeRevenue = revenueData.reduce((sum, d) => sum + d.revenue, 0);
    const rangeOrders = revenueData.reduce((sum, d) => sum + d.orders, 0);
    const avgOrderValue = rangeOrders > 0 ? (rangeRevenue / rangeOrders) : 0;

    const formatDateLabel = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    };

    if (loading) {
        return <Loader message="Setting up your dashboard..." />;
    }

    return (
        <div className="admin-dashboard">
            <h1>Dashboard</h1>

            {/* Date Range Filter Bar */}
            <div className="dashboard-filter-bar sketch-border-subtle sketch-shadow" style={{
                background: 'white',
                padding: '16px',
                borderRadius: '12px',
                marginBottom: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FiCalendar style={{ color: '#C87316', fontSize: '1.2rem' }} />
                    <span style={{ fontWeight: 'bold', fontFamily: "'Patrick Hand', cursive", fontSize: '1.2rem' }}>Sales Date Filter:</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#666' }}>From:</label>
                        <input 
                            type="date" 
                            value={startDate}
                            min={user && user.role === 'admin' ? getFirstOfMonthDateString() : undefined}
                            max={getLocalDateString()}
                            onChange={(e) => setStartDate(e.target.value)}
                            style={{ padding: '6px 12px', borderRadius: '6px', border: '1.5px solid #111111', fontFamily: 'inherit' }}
                        />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#666' }}>To:</label>
                        <input 
                            type="date" 
                            value={endDate}
                            min={user && user.role === 'admin' ? getFirstOfMonthDateString() : undefined}
                            max={getLocalDateString()}
                            onChange={(e) => setEndDate(e.target.value)}
                            style={{ padding: '6px 12px', borderRadius: '6px', border: '1.5px solid #111111', fontFamily: 'inherit' }}
                        />
                    </div>
                    <button 
                        onClick={() => fetchData(startDate, endDate)} 
                        className="btn btn-primary sketch-border-subtle sketch-shadow"
                        style={{ padding: '6px 16px', fontSize: '0.9rem', cursor: 'pointer' }}
                    >
                        Apply Filter
                    </button>
                    <button 
                        onClick={() => {
                            const today = getLocalDateString();
                            setStartDate(today);
                            setEndDate(today);
                            fetchData(today, today);
                        }} 
                        className="btn btn-secondary sketch-border-subtle sketch-shadow"
                        style={{ padding: '6px 16px', fontSize: '0.9rem', cursor: 'pointer' }}
                    >
                        Today
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon revenue"><FiDollarSign /></div>
                    <div className="stat-content">
                        <span className="stat-label">Range Revenue</span>
                        <span className="stat-value">₹{rangeRevenue.toFixed(2)}</span>
                        <span style={{ fontSize: '0.75rem', color: '#666' }}>{formatDateLabel(startDate)} - {formatDateLabel(endDate)}</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon orders"><FiShoppingBag /></div>
                    <div className="stat-content">
                        <span className="stat-label">Range Orders</span>
                        <span className="stat-value">{rangeOrders}</span>
                        <span style={{ fontSize: '0.75rem', color: '#666' }}>{formatDateLabel(startDate)} - {formatDateLabel(endDate)}</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon month"><FiTrendingUp /></div>
                    <div className="stat-content">
                        <span className="stat-label">Average Order</span>
                        <span className="stat-value">₹{avgOrderValue.toFixed(2)}</span>
                        <span style={{ fontSize: '0.75rem', color: '#666' }}>{formatDateLabel(startDate)} - {formatDateLabel(endDate)}</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon pending"><FiAlertCircle /></div>
                    <div className="stat-content">
                        <span className="stat-label">Pending Orders</span>
                        <span className="stat-value">{stats?.pendingOrders || 0}</span>
                        <span style={{ fontSize: '0.75rem', color: '#666' }}>Active Now</span>
                    </div>
                </div>
            </div>

            {/* Monthly Sales Report Chart */}
            <div className="chart-card sketch-border-subtle sketch-shadow" style={{ marginTop: '24px', marginBottom: '24px', background: 'white', padding: '20px', borderRadius: '12px' }}>
                <h2 style={{ fontFamily: "'Patrick Hand', cursive", fontSize: '1.6rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}><FiBarChart2 /> Sales Report (Current Month)</h2>
                <div className="chart-container" style={{ height: '280px', width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={revenueData}>
                            <defs>
                                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#C87316" stopOpacity={0.4}/>
                                    <stop offset="95%" stopColor="#C87316" stopOpacity={0.01}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
                            <XAxis dataKey="date" stroke="#666" style={{ fontSize: '0.8rem' }} />
                            <YAxis stroke="#666" style={{ fontSize: '0.8rem' }} />
                            <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: '8px' }} />
                            <Area type="monotone" dataKey="revenue" stroke="#C87316" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRevenue)" name="Revenue" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="dashboard-grid">
                {/* Top Spenders */}
                {user && user.role === 'superadmin' && (
                    <div className="dashboard-card">
                        <div className="card-header">
                            <h2>Top Spenders (Month)</h2>
                            <Link to="/admin/customers" className="view-all">View All</Link>
                        </div>
                        <div className="customer-list">
                            {userStats?.topCustomers?.length === 0 ? (
                                <p className="no-data">No data available</p>
                            ) : (
                                userStats?.topCustomers?.slice(0, 5).map(customer => (
                                    <div key={customer._id} className="customer-item">
                                        <div className="customer-info">
                                            <span className="customer-name">{customer.name}</span>
                                            <span className="customer-orders">{customer.orderCount} orders</span>
                                        </div>
                                        <span className="customer-spent">₹{customer.totalSpent.toFixed(0)}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {/* Active Orders */}
                <div className="dashboard-card" style={user && user.role === 'admin' ? { gridColumn: 'span 2' } : {}}>
                    <div className="card-header">
                        <h2>Active Orders</h2>
                        <Link to="/admin/orders" className="view-all">View All</Link>
                    </div>
                    <div className="orders-list">
                        {activeOrders.length === 0 ? (
                            <p className="no-data">No active orders</p>
                        ) : (
                            activeOrders.slice(0, 5).map(order => (
                                <div key={order._id} className="order-item">
                                    <div className="order-info">
                                        <span className="order-number">#{order.orderNumber}</span>
                                        <span className="order-customer">{order.user?.name || order.user?.phone}</span>
                                    </div>
                                    <span className={`order-status status-${order.status}`}>
                                        {order.status.replace('_', ' ')}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {user && user.role === 'superadmin' && (
                <div className="dashboard-grid">
                    {/* Low Stock */}
                    <div className="dashboard-card">
                        <div className="card-header">
                            <h2>Low Stock Alert</h2>
                            <Link to="/admin/inventory" className="view-all">View All</Link>
                        </div>
                        <div className="stock-list">
                            {lowStock.length === 0 ? (
                                <p className="no-data">All stock levels normal</p>
                            ) : (
                                lowStock.slice(0, 5).map(item => (
                                    <div key={item._id} className="stock-item">
                                        <span className="stock-name">{item.name}</span>
                                        <span className="stock-qty low">{item.currentStock} {item.unit}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Quick Settings Link */}
                    <div className="dashboard-card">
                        <div className="card-header">
                            <h2>System Quick View</h2>
                            <Link to="/admin/settings" className="view-all">Configure</Link>
                        </div>
                        <div className="gst-content-mini">
                            <div className="gst-status">
                                <span>Current GST Rate:</span>
                                <strong>{gstRate}%</strong>
                            </div>
                            <p className="mini-text">Manage tax rates and restaurant profile in settings.</p>
                            <Link to="/admin/settings" className="btn btn-secondary btn-sm">Open Settings</Link>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDashboard;
