const mongoose = require('mongoose');

const hotelSettlementSchema = new mongoose.Schema({
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        default: null
    },
    orderNumber: {
        type: String,
        default: ''
    },
    roomNumber: {
        type: String,
        required: true,
        trim: true
    },
    orderBusinessDate: {
        type: String,
        required: true,
        index: true
    },
    settlementBusinessDate: {
        type: String,
        required: true,
        index: true
    },
    creditAmount: {
        type: Number,
        default: 0
    },
    settledAmount: {
        type: Number,
        required: true,
        min: [0, 'Amount must be non-negative']
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'upi', 'online', 'card', 'bank_transfer'],
        default: 'cash'
    },
    receivedByName: {
        type: String,
        default: 'Staff'
    },
    notes: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('HotelSettlement', hotelSettlementSchema);
