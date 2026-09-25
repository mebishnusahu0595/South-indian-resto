const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Expense title is required'],
        trim: true
    },
    amount: {
        type: Number,
        required: [true, 'Expense amount in Rupees is required'],
        min: [0, 'Amount must be a positive value']
    },
    category: {
        type: String,
        trim: true,
        default: 'General'
    },
    businessDate: {
        type: String,
        required: true,
        index: true
    },
    date: {
        type: Date,
        default: Date.now
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'upi', 'online', 'card', 'bank_transfer', 'other'],
        default: 'cash'
    },
    notes: {
        type: String,
        trim: true,
        default: ''
    },
    addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    addedByName: {
        type: String,
        default: 'Admin'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Expense', expenseSchema);
