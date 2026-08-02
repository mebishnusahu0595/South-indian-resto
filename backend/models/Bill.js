const mongoose = require('mongoose');

const billItemSchema = new mongoose.Schema({
    menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: false },
    name: String,
    price: Number,
    quantity: Number,
    total: Number,
    notes: { type: String, default: '' }
}, { _id: false });

const taxDetailSchema = new mongoose.Schema({
    name: String,
    rate: Number,
    amount: Number
}, { _id: false });

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
    orders: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order'
    }],
    items: [billItemSchema],
    taxDetails: [taxDetailSchema],
    orderNumbers: [{ type: String }],
    tableNumbers: [{ type: String }],
    restaurantInfo: {
        name: String,
        address: String,
        phone: String,
        gstNumber: String
    },
    customer: {
        name: String,
        phone: String
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
        enum: ['cash', 'online', 'upi', 'card', 'split', 'pending'],
        default: 'pending'
    },
    splitPaymentDetails: {
        cash: { type: Number, default: 0 },
        upi: { type: Number, default: 0 },
        card: { type: Number, default: 0 }
    },
    businessDate: {
        type: String,
        index: true,
        default: ''
    },
    paidAt: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

billSchema.pre('save', function () {
    this.updatedAt = Date.now();
});

module.exports = mongoose.model('Bill', billSchema);
