const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
    guestName: {
        type: String,
        required: true
    },
    guestPhone: {
        type: String,
        default: ''
    },
    guestCount: {
        type: Number,
        required: true,
        min: 1
    },
    tables: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Table'
    }],
    tableNumbers: {
        type: String,
        default: ''
    },
    sections: [{
        type: String
    }],
    fromDate: {
        type: Date,
        required: true
    },
    toDate: {
        type: Date,
        default: null
    },
    fromTime: {
        type: String,
        required: true
    },
    toTime: {
        type: String,
        default: ''
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'partial'],
        default: 'pending'
    },
    paymentAmount: {
        type: Number,
        default: 0
    },
    totalAmount: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['upcoming', 'confirmed', 'seated', 'completed', 'cancelled', 'no-show'],
        default: 'upcoming'
    },
    notes: {
        type: String,
        default: ''
    },
    billGenerated: {
        type: Boolean,
        default: false
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        default: null
    }
}, { timestamps: true });

module.exports = mongoose.model('Booking', bookingSchema);
