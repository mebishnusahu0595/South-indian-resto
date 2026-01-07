import React from 'react';
import './OrderBill.css';

const OrderBill = ({ order, onCancel }) => {
    if (!order) return null;

    const handlePrint = () => {
        window.print();
    };

    // Use stored restaurant info or defaults
    const restaurant = order.restaurantInfo || {
        name: "Chetta's Dosa",
        address: "123 Food Street, Chennai",
        phone: "+91 98765 43210",
        gstNumber: ""
    };

    // Subtotal and totals
    const subtotal = order.subtotal || 0;
    const discount = order.discount || 0;
    const total = order.total || 0;

    return (
        <div className="bill-modal-overlay" onClick={onCancel}>
            <div className="bill-container print-bill-overlay" onClick={e => e.stopPropagation()}>
                <div className="bill-header">
                    <h2>{restaurant.name}</h2>
                    <p>Authentic South Indian Cuisine</p>
                    <p>{restaurant.address}</p>
                    <p>Ph: {restaurant.phone}</p>
                    {restaurant.gstNumber && <p>GSTIN: {restaurant.gstNumber}</p>}
                </div>

                <div className="bill-info">
                    <div className="bill-info-row">
                        <span>Bill No: {order.orderNumber}</span>
                        <span>Date: {new Date(order.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="bill-info-row">
                        <span>Time: {new Date(order.createdAt).toLocaleTimeString()}</span>
                        {order.tableNumber && <span>Table: {order.tableNumber}</span>}
                    </div>
                    <div className="bill-info-row">
                        <span>Cust: {order.user?.name || 'Walk-in'}</span>
                        <span>{order.user?.phone || ''}</span>
                    </div>
                </div>

                <div className="bill-divider"></div>

                <div className="bill-items-header">
                    <span>Item Name</span>
                    <span className="qty">Qty</span>
                    <span className="total">Amount</span>
                </div>

                <div className="bill-items">
                    {(order.items || []).map((item, index) => (
                        <div key={index} className="bill-item">
                            <span>{item.name || item.menuItem?.name || 'Item'}</span>
                            <span className="qty">{item.quantity}</span>
                            <span className="total">₹{((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
                        </div>
                    ))}
                </div>

                <div className="bill-divider"></div>

                <div className="bill-totals">
                    <div className="bill-total-row">
                        <span>Subtotal</span>
                        <span>₹{subtotal.toFixed(2)}</span>
                    </div>
                    {discount > 0 && (
                        <div className="bill-total-row">
                            <span>Discount</span>
                            <span>- ₹{discount.toFixed(2)}</span>
                        </div>
                    )}

                    {/* Render detailed taxes if available, otherwise fallback to generic Tax */}
                    {order.taxDetails && order.taxDetails.length > 0 ? (
                        order.taxDetails.map((t, i) => (
                            <div key={i} className="bill-total-row">
                                <span>{t.name} ({t.rate}%)</span>
                                <span>₹{(t.amount || 0).toFixed(2)}</span>
                            </div>
                        ))
                    ) : (
                        <div className="bill-total-row">
                            <span>Tax ({order.gstRate || 5}%)</span>
                            <span>₹{(order.tax || 0).toFixed(2)}</span>
                        </div>
                    )}

                    <div className="bill-total-row grand-total">
                        <span>GRAND TOTAL</span>
                        <span>₹{total.toFixed(2)}</span>
                    </div>
                </div>

                <div className="bill-footer">
                    <p>Payment: {order.paymentMethod?.toUpperCase() || 'NOT PAID'}</p>
                    <p>Thank you for visiting!</p>
                    <p>Visit again soon!</p>
                </div>

                <div className="bill-actions">
                    <button className="btn-print" onClick={handlePrint}>Print Bill</button>
                    <button className="btn-close" onClick={onCancel}>Close</button>
                </div>
            </div>
        </div>
    );
};

export default OrderBill;
