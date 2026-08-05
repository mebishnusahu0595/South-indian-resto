import React, { useEffect, useState } from 'react';
import './OrderBill.css';
import { FiCheck, FiX, FiFileText, FiPrinter } from 'react-icons/fi';
import { printBill } from '../utils/api';

const OrderBill = ({ order, orders, bill, onCancel }) => {
    const [silentQueued, setSilentQueued] = useState(false);
    // Prefer the backend Bill snapshot so consolidated totals/items are rendered exactly once.
    const ordersList = bill?.orders?.length
        ? bill.orders
        : (orders || (bill?.order ? [bill.order] : (order ? [order] : [])));

    useEffect(() => {
        if (bill?._id) {
            printBill(bill._id)
                .then(() => setSilentQueued(true))
                .catch(err => {
                    console.warn('Silent bill print queue failed, opening browser print fallback:', err.message);
                    window.print();
                });
        } else if (ordersList.length > 0) {
            const timer = setTimeout(() => {
                window.print();
            }, 350);
            return () => clearTimeout(timer);
        }
    }, [bill, ordersList]);

    if (ordersList.length === 0) return null;

    const handlePrint = async () => {
        if (bill?._id) {
            try {
                await printBill(bill._id);
                setSilentQueued(true);
            } catch (err) {
                console.error('Silent print failed, fallback to browser print dialog:', err);
                window.print();
            }
        } else {
            window.print();
        }
    };

    const handleBrowserPrint = () => {
        window.print();
    };

    // Use restaurant info from the first order or defaults
    const restaurant = bill?.restaurantInfo || ordersList[0].restaurantInfo || {
        name: "Kea By The Pool",
        address: "Dhanora, Risali, Bhilai",
        phone: "+91 98765 43210",
        gstNumber: ""
    };

    // Bill snapshots are authoritative. Legacy order-only views retain aggregation fallback.
    const aggregated = bill ? {
        subtotal: Number(bill.subtotal) || 0,
        discount: Number(bill.discount) || 0,
        tax: Number(bill.tax) || 0,
        total: Number(bill.total) || 0,
        items: bill.items || [],
        taxDetails: bill.taxDetails || []
    } : ordersList.reduce((acc, curr) => {
        acc.subtotal += (curr.subtotal || 0);
        acc.discount += (curr.discount || 0);
        acc.tax += (curr.tax || 0);
        acc.total += (curr.total || 0);
        (curr.items || []).forEach(item => acc.items.push(item));
        (curr.taxDetails || []).forEach(tax => {
            const existing = acc.taxDetails.find(item => item.name === tax.name && item.rate === tax.rate);
            if (existing) existing.amount += tax.amount;
            else acc.taxDetails.push({ ...tax });
        });
        return acc;
    }, { subtotal: 0, discount: 0, tax: 0, total: 0, items: [], taxDetails: [] });

    // Consolidate items by ID/name to show quantities neatly
    const consolidatedItems = {};
    aggregated.items.forEach(item => {
        const id = item.menuItem?._id || item.menuItem || item.name; // Fallback key
        if (consolidatedItems[id]) {
            consolidatedItems[id].quantity += item.quantity;
            consolidatedItems[id].total += (item.total || (item.price * item.quantity));
        } else {
            consolidatedItems[id] = {
                ...item,
                total: (item.total || (item.price * item.quantity))
            };
        }
    });
    const finalItems = Object.values(consolidatedItems);

    const mainOrder = bill?.order || ordersList[0];
    const tableNumbers = bill?.tableNumbers?.length
        ? bill.tableNumbers.join(', ')
        : Array.from(new Set(ordersList.map(item => item.tableNumber || item.table?.tableNumber).filter(Boolean))).join(', ');
    const billDate = bill?.createdAt || mainOrder.createdAt;
    const billNumber = bill?.billNumber || mainOrder.orderNumber;

    return (
        <div className="bill-modal-overlay" onClick={onCancel}>
            <div className="bill-container print-bill-overlay" onClick={e => e.stopPropagation()}>
                <div className="bill-header">
                    <h2>{restaurant.name}</h2>
                    <p>Eat • Chill • Repeat</p>
                    <p>{restaurant.address}</p>
                    <p>Ph: {restaurant.phone}</p>
                    {restaurant.gstNumber && <p>GSTIN: {restaurant.gstNumber}</p>}
                </div>

                <div className="bill-info">
                    <div className="bill-info-row">
                        <span>Bill No: {billNumber}</span>
                        <span>Date: {new Date(billDate).toLocaleDateString()}</span>
                    </div>
                    <div className="bill-info-row">
                        <span>Time: {new Date(billDate).toLocaleTimeString()}</span>
                        <span>Table: {tableNumbers || 'Takeaway'}</span>
                    </div>
                    <div className="bill-info-row">
                        <span>Cust: {bill?.customer?.name || mainOrder.user?.name || 'Walk-in'}</span>
                        <span>{bill?.customer?.phone || mainOrder.user?.phone || ''}</span>
                    </div>
                </div>

                <div className="bill-divider"></div>

                <div className="bill-items-header">
                    <span>Item Name</span>
                    <span className="qty">Qty</span>
                    <span className="total">Amount</span>
                </div>

                <div className="bill-items">
                    {finalItems.map((item, index) => (
                        <div key={index} style={{ marginBottom: '4px' }}>
                            <div className="bill-item">
                                <span>{item.name || item.menuItem?.name || 'Item'}</span>
                                <span className="qty">{item.quantity}</span>
                                <span className="total">₹{((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
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
                        <span>₹{aggregated.subtotal.toFixed(2)}</span>
                    </div>
                    {aggregated.discount > 0 && (
                        <div className="bill-total-row">
                            <span>Discount {mainOrder.discountName ? `(${mainOrder.discountName})` : ''}</span>
                            <span>- ₹{aggregated.discount.toFixed(2)}</span>
                        </div>
                    )}

                    {/* Render detailed taxes if available, otherwise fallback to generic Tax */}
                    {aggregated.taxDetails.length > 0 ? (
                        aggregated.taxDetails.map((t, i) => (
                            <div key={i} className="bill-total-row">
                                <span>{t.name} ({t.rate}%)</span>
                                <span>₹{(t.amount || 0).toFixed(2)}</span>
                            </div>
                        ))
                    ) : (
                        <div className="bill-total-row">
                            <span>Tax</span>
                            <span>₹{(aggregated.tax || 0).toFixed(2)}</span>
                        </div>
                    )}

                    <div className="bill-total-row grand-total">
                        <span>GRAND TOTAL</span>
                        <span>₹{aggregated.total.toFixed(2)}</span>
                    </div>
                </div>

                <div className="bill-footer">
                    {(bill?.billerName || mainOrder.billerName) && <p style={{ fontWeight: '600', margin: '4px 0', borderTop: '1px dotted #DDD', paddingTop: '4px' }}>Biller: {bill?.billerName || mainOrder.billerName}</p>}
                    {mainOrder.status === 'cancelled' && (
                        <p style={{ color: '#EF4444', fontWeight: 'bold', margin: '4px 0', borderTop: '1px dotted #DDD', paddingTop: '4px' }}>
                            Cancelled By: {mainOrder.cancelledByName || 'Staff'}
                        </p>
                    )}
                    <p>Payment: {(bill?.paymentMethod || mainOrder.paymentMethod)?.toUpperCase() || 'NOT PAID'}</p>
                    <p>Thank you for visiting!</p>
                    <p>Visit again soon!</p>
                </div>

                <div className="bill-actions">
                    <button className="btn-print" onClick={handlePrint} style={{ background: silentQueued ? '#10B981' : '#2563EB' }}>
                        <FiPrinter /> {silentQueued ? '✓ Thermal Printed' : 'Thermal Print'}
                    </button>
                    <button className="btn-print" onClick={handleBrowserPrint} style={{ background: '#4B5563' }}>
                        Browser Print
                    </button>
                    <button className="btn-close" onClick={onCancel}>Close</button>
                </div>
            </div>
        </div>
    );
};

export default OrderBill;
