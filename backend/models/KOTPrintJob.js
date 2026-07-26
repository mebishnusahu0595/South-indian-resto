const mongoose = require('mongoose');

const kotPrintJobSchema = new mongoose.Schema({
    eventId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    status: {
        type: String,
        enum: ['pending', 'printed'],
        default: 'pending',
        index: true
    },
    payload: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    attempts: {
        type: Number,
        default: 0
    },
    lastError: {
        type: String,
        default: ''
    },
    agentId: {
        type: String,
        default: ''
    },
    results: {
        type: mongoose.Schema.Types.Mixed,
        default: []
    },
    printedAt: {
        type: Date,
        default: null
    },
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)),
        expires: 0
    }
}, { timestamps: true });

module.exports = mongoose.model('KOTPrintJob', kotPrintJobSchema);
