import React, { useState, useEffect } from 'react';
import { FiCheck, FiX, FiFileText } from 'react-icons/fi';
import { getActiveOrders, updateOrderStatus, updatePayment } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import OrderBill from '../components/OrderBill';
import Loader from '../components/Loader';
import './AdminOrders.css';

const AdminOrders = () => {
    const { socket } = useAuth();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [showBill, setShowBill] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState({});

    const handlePartialPayment = async (orderId, total) => {
        const amount = paymentAmount[orderId];
        if (amount === undefined || amount === '') return;

        try {
            const res = await updatePayment(orderId, 'cash', parseFloat(amount));
            if (res.data.status === 'paid') {
                // If now fully paid, show bill
                setSelectedOrder(res.data);
                setShowBill(true);
            }
            setPaymentAmount({ ...paymentAmount, [orderId]: '' });
        } catch (error) {
            alert('Failed to update payment');
        }
    };

    useEffect(() => {
        fetchOrders();
    }, []);

    useEffect(() => {
        if (socket) {
            socket.on('new-order', (order) => {
                console.log('New order received:', order.orderNumber);
                setOrders(prev => [order, ...prev]);
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
            return () => {
                socket.off('new-order');
                socket.off('order-updated');
                socket.off('bill-requested');
            };
        }
    }, [socket]);

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

    const handleStatusChange = async (orderId, status) => {
        try {
            await updateOrderStatus(orderId, status);
        } catch (error) {
            alert('Failed to update status');
        }
    };

    const handlePayment = async (orderId, method) => {
        try {
            const res = await updatePayment(orderId, method);
            setSelectedOrder(res.data);
            setShowBill(true);
        } catch (error) {
            alert('Failed to update payment');
        }
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
            <h1>Orders Management</h1>

            <div className="orders-board">
                {orders.length === 0 ? (
                    <div className="no-orders">
                        <p>No active orders</p>
                    </div>
                ) : (
                    <div className="orders-grid">
                        {orders.map(order => (
                            <div key={order._id} className={`order-card status-${order.status}`}>
                                <div className="order-header">
                                    <span className="order-num">#{order.orderNumber}</span>
                                    <span className={`status-badge ${order.status}`}>
                                        {order.status.replace('_', ' ')}
                                    </span>
                                </div>

                                <div className="order-customer">
                                    <strong>{order.user?.name || 'Customer'}</strong>
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
                                        <strong>⚠️ Note:</strong> {order.specialInstructions}
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
                                    {getNextStatus(order.status) && (
                                        <button
                                            className="btn btn-primary btn-sm"
                                            onClick={() => handleStatusChange(order._id, getNextStatus(order.status))}
                                        >
                                            <FiCheck /> {getStatusLabel(order.status)}
                                        </button>
                                    )}

                                    {order.status === 'bill_generated' && (
                                        <div className="payment-btns">
                                            <button
                                                className="btn btn-success btn-sm"
                                                onClick={() => handlePayment(order._id, 'cash')}
                                            >
                                                Cash Paid
                                            </button>
                                            <button
                                                className="btn btn-primary btn-sm"
                                                onClick={() => handlePayment(order._id, 'online')}
                                            >
                                                Online Paid
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

                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => {
                                            setSelectedOrder(order);
                                            setShowBill(true);
                                        }}
                                    >
                                        <FiFileText /> Bill
                                    </button>
                                </div>

                                <div className="order-time">
                                    {new Date(order.createdAt).toLocaleTimeString()}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {showBill && selectedOrder && (
                <OrderBill
                    order={selectedOrder}
                    onCancel={() => {
                        setShowBill(false);
                        setSelectedOrder(null);
                        fetchOrders(); // Refresh to remove paid ones
                    }}
                />
            )}
        </div>
    );
};

export default AdminOrders;
