const mongoose = require('mongoose');

const tableSchema = new mongoose.Schema({
    tableNumber: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        default: ''
    },
    capacity: {
        type: Number,
        default: 4
    },
    section: {
        type: String,
        default: 'Main Hall'
    },
    areaType: {
        type: String,
        default: 'table'
    },
    shape: {
        type: String,
        enum: ['round', 'square', 'rectangle'],
        default: 'square'
    },
    posX: {
        type: Number,
        default: null
    },
    posY: {
        type: Number,
        default: null
    },
    isOccupied: {
        type: Boolean,
        default: false
    },
    currentOrder: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        default: null
    },
    status: {
        type: String,
        enum: ['available', 'occupied', 'reserved', 'maintenance'],
        default: 'available'
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Table', tableSchema);
