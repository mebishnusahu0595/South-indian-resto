import React, { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
    FiHome, FiGrid, FiShoppingBag, FiTag, FiPackage,
    FiUsers, FiBarChart2, FiLogOut, FiMenu, FiX, FiLayout,
    FiActivity, FiSettings, FiPlus, FiFileText
} from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { getActiveOrders, getBills, getTables, getBookings } from '../utils/api';
import './AdminLayout.css';

const AdminLayout = () => {
    const { user, logout, socket } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    
    // Sidebar real-time badge counts
    const [counts, setCounts] = useState({
        orders: 0,
        bills: 0,
        bookings: 0,
        tables: 0
    });

    useEffect(() => {
        fetchCounts();
    }, []);

    const fetchCounts = async () => {
        try {
            const todayStr = new Date().toISOString().split('T')[0];
            const [ordersRes, billsRes, tablesRes, bookingsRes] = await Promise.allSettled([
                getActiveOrders(),
                getBills(todayStr),
                getTables(),
                getBookings({ date: todayStr })
            ]);

            const ordersCount = ordersRes.status === 'fulfilled' ? (ordersRes.value.data?.length || 0) : 0;
            const billsCount = billsRes.status === 'fulfilled' ? (billsRes.value.data?.length || 0) : 0;
            const tablesCount = tablesRes.status === 'fulfilled' ? (tablesRes.value.data?.filter(t => t.status !== 'available')?.length || 0) : 0;
            const bookingsCount = bookingsRes.status === 'fulfilled' ? (bookingsRes.value.data?.filter(b => b.status === 'upcoming' || b.status === 'confirmed')?.length || 0) : 0;

            setCounts({
                orders: ordersCount,
                bills: billsCount,
                tables: tablesCount,
                bookings: bookingsCount
            });
        } catch (err) {
            console.error('Error fetching counts:', err);
        }
    };

    useEffect(() => {
        if (socket) {
            const handleOrderChange = () => {
                fetchCounts();
            };

            socket.on('new-order', (order) => {
                setNotifications(prev => [...prev, { type: 'order', message: `New order #${order.orderNumber}`, id: order._id }]);
                playNotificationSound();
                fetchCounts();
            });

            socket.on('bill-requested', (order) => {
                setNotifications(prev => [...prev, { type: 'bill', message: `Bill requested for #${order.orderNumber}`, id: order._id }]);
                playNotificationSound();
                fetchCounts();
            });

            socket.on('bill-generated', () => {
                fetchCounts();
            });

            socket.on('bill-deleted', () => {
                fetchCounts();
            });

            socket.on('new-booking', (booking) => {
                setNotifications(prev => [...prev, { type: 'booking', message: `New booking: ${booking.guestName} (${booking.guestCount} guests)`, id: booking._id }]);
                playNotificationSound();
                fetchCounts();
            });

            socket.on('booking-updated', () => fetchCounts());
            socket.on('booking-deleted', () => fetchCounts());
            socket.on('order-updated', () => fetchCounts());
            socket.on('order-deleted', () => fetchCounts());
            socket.on('table-occupied', () => fetchCounts());
            socket.on('table-freed', () => fetchCounts());
            socket.on('table-updated', () => fetchCounts());

            return () => {
                socket.off('new-order');
                socket.off('bill-requested');
                socket.off('bill-generated');
                socket.off('bill-deleted');
                socket.off('new-booking');
                socket.off('booking-updated');
                socket.off('booking-deleted');
                socket.off('order-updated');
                socket.off('order-deleted');
                socket.off('table-occupied');
                socket.off('table-freed');
                socket.off('table-updated');
            };
        }
    }, [socket]);

    const playNotificationSound = () => {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQkSZ6Hl/J1dFgxTpfX/oGcbGFGq+v+gaBwYT6r6/59pGxlOq/r/nmsbGUyr+v+eaxsZTKv6/55rGxlMq/r/nmsbGUyr+v+eaxsZTKv6/55rGxlMq/r/nmsbGUyr+v+eaxsZTKv6/55rGxlMq/r/nmsbGUyr+v+eaxsZTKv6/55rGxlMq/r/nmsbGUyr');
        audio.play().catch(() => { });
    };

    const handleLogout = () => {
        logout();
        navigate('/admin/login');
    };

    const menuItems = [
        { path: '/admin', icon: FiHome, label: 'Dashboard', exact: true },
        { path: '/admin/analytics', icon: FiBarChart2, label: 'Analytics' },
        { path: '/admin/orders', icon: FiShoppingBag, label: 'Orders', badgeKey: 'orders' },
        { path: '/admin/create-order', icon: FiPlus, label: 'Create Order' },
        { path: '/admin/bills', icon: FiFileText, label: 'Bills', badgeKey: 'bills' },
        { path: '/admin/bookings', icon: FiLayout, label: 'Pre-Bookings', badgeKey: 'bookings' },
        { path: '/admin/history', icon: FiActivity, label: 'History' },
        { path: '/admin/menu', icon: FiGrid, label: 'Menu' },
        { path: '/admin/categories', icon: FiGrid, label: 'Categories' },
        { path: '/admin/collections', icon: FiLayout, label: 'Homepage Sections' },
        { path: '/admin/tables', icon: FiLayout, label: 'Tables', badgeKey: 'tables' },
        { path: '/admin/coupons', icon: FiTag, label: 'Coupons' },
        { path: '/admin/loyalty', icon: FiTag, label: 'Loyalty Points' },
        { path: '/admin/inventory', icon: FiPackage, label: 'Inventory' },
        { path: '/admin/employees', icon: FiUsers, label: 'Employees' },
        { path: '/admin/customers', icon: FiUsers, label: 'Customers' },
        { path: '/admin/settings', icon: FiSettings, label: 'Settings' },
    ];

    const filteredMenuItems = menuItems.filter(item => {
        if (!user) return false;
        if (user.role === 'superadmin') return true;
        
        const restrictedPaths = [
            '/admin/customers',
            '/admin/loyalty',
            '/admin/coupons',
            '/admin/collections',
            '/admin/analytics',
        ];
        return !restrictedPaths.includes(item.path);
    });

    const isActive = (path, exact) => {
        if (exact) return location.pathname === path;
        return location.pathname.startsWith(path);
    };

    return (
        <div className="admin-layout">
            {/* Sidebar */}
            <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <img src="/logo.jpg" alt="Logo" className="sidebar-logo-img" style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #111111', marginRight: '10px' }} />
                    <h2>keabythepool</h2>
                    <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>
                        <FiX />
                    </button>
                </div>

                <nav className="sidebar-nav">
                    {filteredMenuItems.map(item => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`nav-link ${isActive(item.path, item.exact) ? 'active' : ''}`}
                            onClick={() => setSidebarOpen(false)}
                        >
                            <item.icon />
                            <span>{item.label}</span>
                            {item.badgeKey && counts[item.badgeKey] > 0 && (
                                <span className={`sidebar-badge badge-${item.badgeKey}`}>
                                    {counts[item.badgeKey]}
                                </span>
                            )}
                        </Link>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <button onClick={handleLogout} className="logout-link">
                        <FiLogOut />
                        <span>Logout</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <div className="admin-main">
                <header className="admin-header">
                    <button className="menu-toggle" onClick={() => setSidebarOpen(true)}>
                        <FiMenu />
                    </button>
                    <div className="header-right">
                        <div className="admin-user">
                            <span className="admin-name">{user?.name || 'Admin'}</span>
                        </div>
                    </div>
                </header>

                {/* Notifications */}
                {notifications.length > 0 && (
                    <div className="notifications-bar">
                        {notifications.slice(-3).map((notif, index) => (
                            <div
                                key={index}
                                className={`notification ${notif.type}`}
                                onClick={() => {
                                    navigate(`/admin/orders`);
                                    setNotifications(prev => prev.filter((_, i) => i !== index));
                                }}
                            >
                                {notif.message}
                                <button onClick={(e) => {
                                    e.stopPropagation();
                                    setNotifications(prev => prev.filter((_, i) => i !== index));
                                }}>✕</button>
                            </div>
                        ))}
                    </div>
                )}

                <main className="admin-content">
                    <Outlet />
                </main>
            </div>

            {/* Overlay */}
            {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
        </div>
    );
};

export default AdminLayout;
