import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend, AreaChart, Area } from 'recharts';
import { getDashboardStats, getRevenueData, getCategorySales, getTopItems, getUserAnalytics, updateSetting, getAllSettings, getDayEndReport, getSectionWiseReport } from '../utils/api';
import { exportToCSV, revenueExportColumns, getFilenameDate } from '../utils/exportUtils';
import { useAuth } from '../context/AuthContext';
import Loader from '../components/Loader';
import { FiUsers, FiUserPlus, FiActivity, FiRepeat, FiSettings, FiDownload, FiPrinter, FiFileText, FiGrid, FiLayers } from 'react-icons/fi';
import './AdminAnalytics.css';

const COLORS = ['#C87316', '#E08A2E', '#22C55E', '#3B82F6', '#9333EA', '#EC4899'];

const AdminAnalytics = () => {
    const { user, socket } = useAuth();
    const [period, setPeriod] = useState('week');
    const [stats, setStats] = useState(null);
    const [revenueData, setRevenueData] = useState([]);
    const [categorySales, setCategorySales] = useState([]);
    const [topItems, setTopItems] = useState([]);
    const [userStats, setUserStats] = useState(null);
    const [margin, setMargin] = useState(30);
    const [showMarginInput, setShowMarginInput] = useState(false);
    const [loading, setLoading] = useState(true);

    // EOD & Section Report state
    const [activeTab, setActiveTab] = useState('day-end'); // 'day-end' | 'section-wise' | 'analytics'
    const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
    const [dayEndData, setDayEndData] = useState(null);
    const [sectionData, setSectionData] = useState(null);
    const [fetchingReport, setFetchingReport] = useState(false);

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
    }, [period, user]);

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

    const fetchSectionReport = async (dateVal) => {
        setFetchingReport(true);
        try {
            const res = await getSectionWiseReport(dateVal || reportDate);
            setSectionData(res.data);
        } catch (err) {
            console.error('Failed to fetch Section-wise report:', err);
        } finally {
            setFetchingReport(false);
        }
    };

    useEffect(() => {
        if (socket) {
            socket.on('order-updated', () => fetchData());
            return () => socket.off('order-updated');
        }
    }, [socket]);

    const fetchData = async () => {
        try {
            const [statsRes, revenueRes, catRes, topRes, userRes, settingsRes] = await Promise.all([
                getDashboardStats(),
                getRevenueData(period),
                getCategorySales(period),
                getTopItems(),
                getUserAnalytics(period),
                getAllSettings()
            ]);
            setStats(statsRes.data);
            setRevenueData(revenueRes.data.map(d => ({
                ...d,
                date: new Date(d._id).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
            })));
            setCategorySales(catRes.data);
            setTopItems(topRes.data);
            setUserStats(userRes.data);

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

    const handleExportRevenue = () => {
        const filename = `revenue_${period}_${getFilenameDate()}`;
        exportToCSV(revenueData, revenueExportColumns, filename);
    };

    if (loading) return <Loader message="Crunching the numbers..." />;

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
                        <div className="period-selector">
                            {['today', 'week', 'month', 'year'].map(p => (
                                <button
                                    key={p}
                                    className={`period-btn ${period === p ? 'active' : ''}`}
                                    onClick={() => setPeriod(p)}
                                >
                                    {p.charAt(0).toUpperCase() + p.slice(1)}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="period-restricted-label" style={{ background: 'var(--bg-secondary)', border: '2.5px solid #111111', padding: '6px 12px', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 'bold', boxShadow: '2px 2px 0px #111111' }}>
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
            </div>

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
                                        className={`btn ${reportDate === (new Date(Date.now() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0]) ? 'btn-primary' : 'btn-secondary'}`}
                                        onClick={() => {
                                            const t = new Date(Date.now() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0];
                                            setReportDate(t);
                                            fetchDayEndReport(t);
                                        }}
                                    >
                                        Today
                                    </button>
                                    <button
                                        className={`btn ${reportDate === (new Date(Date.now() - (new Date().getTimezoneOffset() * 60000) - 86400000).toISOString().split('T')[0]) ? 'btn-primary' : 'btn-secondary'}`}
                                        onClick={() => {
                                            const y = new Date(Date.now() - (new Date().getTimezoneOffset() * 60000) - 86400000).toISOString().split('T')[0];
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
                            <button className="btn btn-primary" onClick={() => window.print()}>
                                <FiPrinter /> Print / Export PDF
                            </button>
                        )}
                    </div>

                    {fetchingReport ? (
                        <Loader message="Generating Day-End Report..." />
                    ) : dayEndData ? (
                        <div className="report-printable-area" style={{ background: '#FFF', padding: '24px', borderRadius: '12px', border: '2px solid #111', boxShadow: '4px 4px 0px #111' }}>
                            <div style={{ textAlign: 'center', borderBottom: '2px solid #111', paddingBottom: '16px', marginBottom: '20px' }}>
                                <h1 style={{ margin: '0 0 4px', fontSize: '1.8rem', textTransform: 'uppercase' }}>Kea By The Pool</h1>
                                <h3 style={{ margin: '0 0 4px', color: '#7C3AED' }}>DAY-END (EOD) SALES REPORT</h3>
                                <p style={{ margin: 0, fontSize: '0.9rem', color: '#555' }}>
                                    Date: <strong>{new Date(dayEndData.date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong> | Printed: {new Date().toLocaleTimeString()}
                                </p>
                            </div>

                            {/* Summary Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                                <div style={{ background: '#F3F4F6', padding: '12px', borderRadius: '8px', border: '1px solid #DDD' }}>
                                    <span style={{ fontSize: '0.78rem', color: '#666' }}>Total Orders</span>
                                    <h3 style={{ margin: '4px 0 0', fontSize: '1.4rem' }}>{dayEndData.summary.totalOrders}</h3>
                                </div>
                                <div style={{ background: '#F3F4F6', padding: '12px', borderRadius: '8px', border: '1px solid #DDD' }}>
                                    <span style={{ fontSize: '0.78rem', color: '#666' }}>Gross Sales</span>
                                    <h3 style={{ margin: '4px 0 0', fontSize: '1.4rem' }}>₹{dayEndData.summary.grossSales.toFixed(2)}</h3>
                                </div>
                                <div style={{ background: '#FEF2F2', padding: '12px', borderRadius: '8px', border: '1px solid #FCA5A5' }}>
                                    <span style={{ fontSize: '0.78rem', color: '#DC2626' }}>Discounts</span>
                                    <h3 style={{ margin: '4px 0 0', fontSize: '1.4rem', color: '#DC2626' }}>-₹{dayEndData.summary.totalDiscount.toFixed(2)}</h3>
                                </div>
                                <div style={{ background: '#F3F4F6', padding: '12px', borderRadius: '8px', border: '1px solid #DDD' }}>
                                    <span style={{ fontSize: '0.78rem', color: '#666' }}>Taxes (GST)</span>
                                    <h3 style={{ margin: '4px 0 0', fontSize: '1.4rem' }}>₹{dayEndData.summary.totalTax.toFixed(2)}</h3>
                                </div>
                                <div style={{ background: '#ECFDF5', padding: '12px', borderRadius: '8px', border: '2px solid #10B981' }}>
                                    <span style={{ fontSize: '0.78rem', color: '#059669', fontWeight: 'bold' }}>NET REVENUE</span>
                                    <h3 style={{ margin: '4px 0 0', fontSize: '1.5rem', color: '#059669', fontWeight: 'bold' }}>₹{dayEndData.summary.netRevenue.toFixed(2)}</h3>
                                </div>
                            </div>

                            {/* Payment Method Breakdown */}
                            <div style={{ marginBottom: '24px' }}>
                                <h3 style={{ borderBottom: '1.5px solid #111', paddingBottom: '6px', marginBottom: '12px' }}>💳 Payment Method Breakdown</h3>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                    <thead>
                                        <tr style={{ background: '#F3F4F6', textAlign: 'left' }}>
                                            <th style={{ padding: '8px', border: '1px solid #DDD' }}>Payment Method</th>
                                            <th style={{ padding: '8px', border: '1px solid #DDD', textAlign: 'right' }}>Total Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td style={{ padding: '8px', border: '1px solid #DDD' }}>💵 Cash Paid</td>
                                            <td style={{ padding: '8px', border: '1px solid #DDD', textAlign: 'right', fontWeight: 'bold' }}>₹{dayEndData.paymentBreakdown.cash.toFixed(2)}</td>
                                        </tr>
                                        <tr>
                                            <td style={{ padding: '8px', border: '1px solid #DDD' }}>📱 UPI / Online Paid</td>
                                            <td style={{ padding: '8px', border: '1px solid #DDD', textAlign: 'right', fontWeight: 'bold' }}>₹{dayEndData.paymentBreakdown.online.toFixed(2)}</td>
                                        </tr>
                                        <tr>
                                            <td style={{ padding: '8px', border: '1px solid #DDD' }}>💳 Card Paid</td>
                                            <td style={{ padding: '8px', border: '1px solid #DDD', textAlign: 'right', fontWeight: 'bold' }}>₹{dayEndData.paymentBreakdown.card.toFixed(2)}</td>
                                        </tr>
                                        <tr>
                                            <td style={{ padding: '8px', border: '1px solid #DDD' }}>
                                                🔀 Split Payment Total
                                                <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '2px' }}>
                                                    (Cash: ₹{dayEndData.paymentBreakdown.splitDetails.cash.toFixed(2)} | UPI: ₹{dayEndData.paymentBreakdown.splitDetails.upi.toFixed(2)} | Card: ₹{dayEndData.paymentBreakdown.splitDetails.card.toFixed(2)})
                                                </div>
                                            </td>
                                            <td style={{ padding: '8px', border: '1px solid #DDD', textAlign: 'right', fontWeight: 'bold' }}>₹{dayEndData.paymentBreakdown.split.toFixed(2)}</td>
                                        </tr>
                                        <tr style={{ background: '#F9FAFB', fontWeight: 'bold' }}>
                                            <td style={{ padding: '8px', border: '1px solid #DDD' }}>TOTAL COLLECTED</td>
                                            <td style={{ padding: '8px', border: '1px solid #DDD', textAlign: 'right', color: '#7C3AED' }}>₹{dayEndData.summary.netRevenue.toFixed(2)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Category Sales */}
                            <div style={{ marginBottom: '24px' }}>
                                <h3 style={{ borderBottom: '1.5px solid #111', paddingBottom: '6px', marginBottom: '12px' }}>🍽️ Category-Wise Sales Summary</h3>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                    <thead>
                                        <tr style={{ background: '#F3F4F6', textAlign: 'left' }}>
                                            <th style={{ padding: '8px', border: '1px solid #DDD' }}>Category Name</th>
                                            <th style={{ padding: '8px', border: '1px solid #DDD', textAlign: 'center' }}>Total Qty Sold</th>
                                            <th style={{ padding: '8px', border: '1px solid #DDD', textAlign: 'right' }}>Total Revenue</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dayEndData.categorySales.map((cat, idx) => (
                                            <tr key={idx}>
                                                <td style={{ padding: '8px', border: '1px solid #DDD', fontWeight: '600' }}>{cat.name}</td>
                                                <td style={{ padding: '8px', border: '1px solid #DDD', textAlign: 'center' }}>{cat.totalQty}</td>
                                                <td style={{ padding: '8px', border: '1px solid #DDD', textAlign: 'right', fontWeight: 'bold' }}>₹{cat.totalRevenue.toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Product Sales */}
                            <div style={{ marginBottom: '24px' }}>
                                <h3 style={{ borderBottom: '1.5px solid #111', paddingBottom: '6px', marginBottom: '12px' }}>📦 Product / Item Sales Breakdown</h3>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ background: '#F3F4F6', textAlign: 'left' }}>
                                            <th style={{ padding: '6px 8px', border: '1px solid #DDD' }}>Item Name</th>
                                            <th style={{ padding: '6px 8px', border: '1px solid #DDD' }}>Category</th>
                                            <th style={{ padding: '6px 8px', border: '1px solid #DDD', textAlign: 'center' }}>Qty Sold</th>
                                            <th style={{ padding: '6px 8px', border: '1px solid #DDD', textAlign: 'right' }}>Revenue</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dayEndData.productSales.map((prod, idx) => (
                                            <tr key={idx}>
                                                <td style={{ padding: '6px 8px', border: '1px solid #DDD', fontWeight: '500' }}>{prod.name}</td>
                                                <td style={{ padding: '6px 8px', border: '1px solid #DDD', color: '#666' }}>{prod.category}</td>
                                                <td style={{ padding: '6px 8px', border: '1px solid #DDD', textAlign: 'center', fontWeight: 'bold' }}>{prod.qtySold}</td>
                                                <td style={{ padding: '6px 8px', border: '1px solid #DDD', textAlign: 'right', fontWeight: 'bold' }}>₹{prod.totalRevenue.toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Staff Sales */}
                            <div>
                                <h3 style={{ borderBottom: '1.5px solid #111', paddingBottom: '6px', marginBottom: '12px' }}>👤 Staff Sales Performance</h3>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                    <thead>
                                        <tr style={{ background: '#F3F4F6', textAlign: 'left' }}>
                                            <th style={{ padding: '8px', border: '1px solid #DDD' }}>Staff / Biller Name</th>
                                            <th style={{ padding: '8px', border: '1px solid #DDD', textAlign: 'center' }}>Orders Count</th>
                                            <th style={{ padding: '8px', border: '1px solid #DDD', textAlign: 'right' }}>Total Sales</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dayEndData.staffSales.map((st, idx) => (
                                            <tr key={idx}>
                                                <td style={{ padding: '8px', border: '1px solid #DDD', fontWeight: '600' }}>{st.name}</td>
                                                <td style={{ padding: '8px', border: '1px solid #DDD', textAlign: 'center' }}>{st.ordersCount}</td>
                                                <td style={{ padding: '8px', border: '1px solid #DDD', textAlign: 'right', fontWeight: 'bold' }}>₹{st.totalSales.toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : null}
                </div>
            )}

            {/* SECTION & TABLE SALES TAB */}
            {activeTab === 'section-wise' && (
                <div className="section-wise-report-view">
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
                                            fetchSectionReport(e.target.value);
                                        }}
                                        className="input"
                                        style={{ padding: '8px 12px', borderRadius: '6px', border: '2px solid #111' }}
                                    />
                                    <button className="btn btn-secondary" onClick={() => fetchSectionReport()}>Refresh</button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <label style={{ fontWeight: 'bold' }}>Date:</label>
                                    <button
                                        className={`btn ${reportDate === (new Date(Date.now() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0]) ? 'btn-primary' : 'btn-secondary'}`}
                                        onClick={() => {
                                            const t = new Date(Date.now() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0];
                                            setReportDate(t);
                                            fetchSectionReport(t);
                                        }}
                                    >
                                        Today
                                    </button>
                                    <button
                                        className={`btn ${reportDate === (new Date(Date.now() - (new Date().getTimezoneOffset() * 60000) - 86400000).toISOString().split('T')[0]) ? 'btn-primary' : 'btn-secondary'}`}
                                        onClick={() => {
                                            const y = new Date(Date.now() - (new Date().getTimezoneOffset() * 60000) - 86400000).toISOString().split('T')[0];
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
                            <button className="btn btn-primary" onClick={() => window.print()}>
                                <FiPrinter /> Print / Export PDF
                            </button>
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
                                    Date: <strong>{new Date(sectionData.date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong> | Printed: {new Date().toLocaleTimeString()}
                                </p>
                            </div>

                            {sectionData.sections.length === 0 ? (
                                <p style={{ textAlign: 'center', color: '#666', fontStyle: 'italic', padding: '40px' }}>No section sales recorded for this date.</p>
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
                    <span className="label">This {period}</span>
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
                            <span className="label">This {period}</span>
                        </div>
                        <div className="summary-card active">
                            <div className="card-icon"><FiActivity /></div>
                            <h3>Active Users</h3>
                            <p className="value">{userStats.activeUsers}</p>
                            <span className="label">Ordered this {period}</span>
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
                                <th>Profit</th>
                            </tr>
                        </thead>
                        <tbody>
                            {revenueData.map((day, index) => (
                                <tr key={index}>
                                    <td>{day.date}</td>
                                    <td>{day.orders}</td>
                                    <td>₹{day.revenue.toFixed(2)}</td>
                                    <td className="profit-cell">₹{day.profit.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            </>
            )}
        </div>
    );
};

export default AdminAnalytics;

