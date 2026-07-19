const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    comment: {
        type: String,
        default: ''
    },
    givenBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        default: null
    },
    tableNumber: {
        type: String,
        default: ''
    }
}, { timestamps: true });

module.exports = mongoose.model('Rating', ratingSchema);
