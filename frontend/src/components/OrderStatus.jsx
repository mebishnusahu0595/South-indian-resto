import React from 'react';
import './OrderStatus.css';

const statusSteps = [
    { key: 'pending', label: 'Order Placed', icon: '📝' },
    { key: 'confirmed', label: 'Confirmed', icon: '✅' },
    { key: 'preparing', label: 'Preparing', icon: '👨‍🍳' },
    { key: 'ready', label: 'Ready', icon: '🍽️' },
    { key: 'served', label: 'Served', icon: '✨' },
];

const OrderStatus = ({ status }) => {
    const currentIndex = statusSteps.findIndex(s => s.key === status);

    if (status === 'paid') {
        return (
            <div className="order-status-complete">
                <div className="complete-icon">✅</div>
                <span>Order Complete & Paid</span>
            </div>
        );
    }

    if (status === 'bill_requested' || status === 'bill_generated') {
        return (
            <div className="order-status-bill">
                <div className="bill-icon">🧾</div>
                <span>{status === 'bill_requested' ? 'Bill Requested' : 'Bill Ready'}</span>
            </div>
        );
    }

    return (
        <div className="order-status-tracker">
            {statusSteps.map((step, index) => (
                <div
                    key={step.key}
                    className={`status-step ${index <= currentIndex ? 'completed' : ''} ${index === currentIndex ? 'current' : ''}`}
                >
                    <div className="step-icon">{step.icon}</div>
                    <div className="step-label">{step.label}</div>
                    {index < statusSteps.length - 1 && (
                        <div className={`step-line ${index < currentIndex ? 'completed' : ''}`}></div>
                    )}
                </div>
            ))}
        </div>
    );
};

export default OrderStatus;
