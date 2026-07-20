const mongoose = require('mongoose');

const billSchema = new mongoose.Schema({
    billNumber: {
        type: String,
        required: true,
        unique: true
    },
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: false
    },
    billerName: {
        type: String,
        required: true
    },
    subtotal: {
        type: Number,
        required: true
    },
    discount: {
        type: Number,
        default: 0
    },
    discountName: {
        type: String,
        default: ''
    },
    tax: {
        type: Number,
        default: 0
    },
    total: {
        type: Number,
        required: true
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'online', 'card', 'split', 'pending'],
        default: 'pending'
    },
    splitPaymentDetails: {
        cash: { type: Number, default: 0 },
        upi: { type: Number, default: 0 },
        card: { type: Number, default: 0 }
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Bill', billSchema);
