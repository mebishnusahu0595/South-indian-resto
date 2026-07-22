const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    menuItem: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MenuItem',
        required: false
    },
    name: String,
    price: Number,
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    total: Number,
    notes: {
        type: String,
        default: ''
    }
});

const orderSchema = new mongoose.Schema({
    orderNumber: {
        type: String,
        required: true,
        unique: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    items: [orderItemSchema],
    subtotal: {
        type: Number,
        required: true
    },
    discount: {
        type: Number,
        default: 0
    },
    couponCode: {
        type: String,
        default: ''
    },
    tax: {
        type: Number,
        default: 0
    },
    gstRate: {
        type: Number,
        default: 5
    },
    taxDetails: [{
        name: String,
        rate: Number,
        amount: Number
    }],
    restaurantInfo: {
        name: String,
        address: String,
        phone: String,
        gstNumber: String
    },
    total: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'preparing', 'ready', 'served', 'bill_requested', 'bill_generated', 'paid', 'cancelled'],
        default: 'pending'
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
    kotHistory: [{
        kotNumber: String,
        timestamp: { type: Date, default: Date.now },
        items: [orderItemSchema],
        notes: String
    }],
    amountPaid: {
        type: Number,
        default: 0
    },
    tableNumber: {
        type: String,
        default: ''
    },
    table: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Table',
        default: null
    },
    tables: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Table'
    }],
    specialInstructions: {
        type: String,
        default: ''
    },
    loyaltyOffer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LoyaltyOffer',
        default: null
    },
    pointsRedeemed: {
        type: Number,
        default: 0
    },
    placedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        default: null
    },
    cancelledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        default: null
    },
    cancelledByName: {
        type: String,
        default: ''
    },
    billerName: {
        type: String,
        default: ''
    },
    discountName: {
        type: String,
        default: ''
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

orderSchema.pre('save', function () {
    this.updatedAt = Date.now();
});

module.exports = mongoose.model('Order', orderSchema);
