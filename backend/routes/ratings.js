const express = require('express');
const router = express.Router();
const Rating = require('../models/Rating');
const Order = require('../models/Order');
const { protect, admin } = require('../middleware/auth');

// Get all ratings (admin view)
router.get('/', protect, admin, async (req, res) => {
    try {
        const { limit = 50 } = req.query;
        const ratings = await Rating.find()
            .populate('order', 'orderNumber tableNumber total')
            .populate('givenBy', 'name')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit));

        res.json(ratings);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get average rating stats
router.get('/stats', protect, async (req, res) => {
    try {
        const stats = await Rating.aggregate([
            {
                $group: {
                    _id: null,
                    avgRating: { $avg: '$rating' },
                    totalRatings: { $sum: 1 },
                    fiveStars: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
                    fourStars: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
                    threeStars: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
                    twoStars: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
                    oneStar: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } }
                }
            }
        ]);

        res.json(stats[0] || { avgRating: 0, totalRatings: 0, fiveStars: 0, fourStars: 0, threeStars: 0, twoStars: 0, oneStar: 0 });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Submit a rating (staff submits after settlement)
router.post('/', protect, async (req, res) => {
    try {
        const { orderId, rating, comment } = req.body;

        if (!orderId || !rating) {
            return res.status(400).json({ message: 'Order ID and rating are required' });
        }

        if (rating < 1 || rating > 5) {
            return res.status(400).json({ message: 'Rating must be between 1 and 5' });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Only allow rating for settled orders
        if (order.status !== 'paid') {
            return res.status(400).json({ message: 'Rating can only be submitted for settled (paid) orders' });
        }

        // Check if already rated
        const existing = await Rating.findOne({ order: orderId });
        if (existing) {
            return res.status(400).json({ message: 'This order has already been rated' });
        }

        const newRating = new Rating({
            order: orderId,
            rating,
            comment: comment || '',
            givenBy: req.user._id,
            tableNumber: order.tableNumber || ''
        });

        await newRating.save();

        const populated = await Rating.findById(newRating._id)
            .populate('order', 'orderNumber tableNumber total')
            .populate('givenBy', 'name');

        // Notify admin
        const io = req.app.get('io');
        if (io) {
            io.to('admin-room').emit('new-rating', populated);
        }

        res.status(201).json(populated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Check if order is already rated
router.get('/check/:orderId', protect, async (req, res) => {
    try {
        const existing = await Rating.findOne({ order: req.params.orderId });
        res.json({ rated: !!existing, rating: existing || null });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
