const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const axios = require('axios');
const User = require('../models/User');
const { generateOTP } = require('../utils/helpers');
const { protect, admin } = require('../middleware/auth');

// SMS Configuration from environment
const SMS_PROVIDER = process.env.SMS_PROVIDER || 'twofactor';
const SMS_API_KEY = process.env.SMS_API_KEY;
const OTP_LENGTH = parseInt(process.env.OTP_LENGTH) || 6;
const OTP_TTL_SECONDS = parseInt(process.env.OTP_TTL_SECONDS) || 300;
const OTP_RESEND_SECONDS = parseInt(process.env.OTP_RESEND_SECONDS) || 30;

// @route   POST /api/auth/send-otp
// @desc    Send OTP to phone number via TwoFactor SMS
// @access  Public
router.post('/send-otp', async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({ message: 'Phone number is required' });
        }

        // Validate phone format (10 digits for India)
        const cleanPhone = phone.replace(/\D/g, '');
        if (cleanPhone.length !== 10) {
            return res.status(400).json({ message: 'Invalid phone number. Enter 10 digits.' });
        }

        let user = await User.findOne({ phone: cleanPhone });

        // Check resend cooldown
        if (user && user.otpExpiry) {
            const timeSinceLastOTP = (Date.now() - (user.otpExpiry.getTime() - OTP_TTL_SECONDS * 1000)) / 1000;
            if (timeSinceLastOTP < OTP_RESEND_SECONDS) {
                const waitTime = Math.ceil(OTP_RESEND_SECONDS - timeSinceLastOTP);
                return res.status(429).json({
                    message: `Please wait ${waitTime} seconds before requesting new OTP`,
                    retryAfter: waitTime
                });
            }
        }

        if (!user) {
            user = new User({ phone: cleanPhone });
        }

        // Generate OTP
        const otp = generateOTP(OTP_LENGTH);
        user.otp = otp;
        user.otpExpiry = new Date(Date.now() + OTP_TTL_SECONDS * 1000);
        await user.save();

        // Send OTP via TwoFactor API
        if (SMS_API_KEY && SMS_PROVIDER === 'twofactor') {
            try {
                const smsUrl = `https://2factor.in/API/V1/${SMS_API_KEY}/SMS/${cleanPhone}/${otp}/OTP1`;
                const smsResponse = await axios.get(smsUrl);
                console.log(`OTP sent to ${cleanPhone}: Status - ${smsResponse.data.Status}`);
            } catch (smsError) {
                console.error('SMS API Error:', smsError.response?.data || smsError.message);
                // Don't fail - still allow login for testing
            }
        } else {
            // Development mode - log OTP
            console.log(`[DEV] OTP for ${cleanPhone}: ${otp}`);
        }

        res.json({
            message: 'OTP sent successfully',
            phone: cleanPhone,
            otpLength: OTP_LENGTH,
            expiresIn: OTP_TTL_SECONDS,
            // Show OTP for easy local testing
            otp
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   POST /api/auth/verify-otp
// @desc    Verify OTP and login
// @access  Public
router.post('/verify-otp', async (req, res) => {
    try {
        const { phone, otp, name, email } = req.body;

        if (!phone || !otp) {
            return res.status(400).json({ message: 'Phone and OTP are required' });
        }

        const cleanPhone = phone.replace(/\D/g, '');
        const user = await User.findOne({ phone: cleanPhone });

        if (!user) {
            return res.status(400).json({ message: 'User not found. Please request OTP first.' });
        }

        if (user.otp !== otp) {
            return res.status(400).json({ message: 'Invalid OTP' });
        }

        if (new Date() > user.otpExpiry) {
            return res.status(400).json({ message: 'OTP expired. Please request a new one.' });
        }

        // Check if new user (no name yet) - name is required
        const isNewUser = !user.name;
        if (isNewUser && !name) {
            return res.status(400).json({
                message: 'Name is required',
                requiresProfile: true
            });
        }

        user.otp = null;
        user.otpExpiry = null;
        user.isVerified = true;

        // Update name (required for new users)
        if (name) user.name = name.trim();
        // Update email (optional)
        if (email) user.email = email.trim();

        await user.save();

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN || '30d'
        });

        res.json({
            token,
            user: {
                id: user._id,
                phone: user.phone,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', protect, async (req, res) => {
    try {
        if (req.user.isEmployee) {
            const Employee = require('../models/Employee');
            const emp = await Employee.findById(req.user._id).populate('assignedTables');
            if (!emp) return res.status(404).json({ message: 'Employee profile not found' });
            return res.json({
                id: emp._id,
                _id: emp._id,
                phone: emp.phone,
                name: emp.name,
                email: emp.email || '',
                role: emp.role,
                isEmployee: true,
                assignedTables: emp.assignedTables || []
            });
        }
        const user = await User.findById(req.user._id).select('-otp -otpExpiry');
        res.json(user);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', protect, async (req, res) => {
    try {
        const { name, email } = req.body;

        const user = await User.findById(req.user._id);

        if (name) user.name = name;
        if (email) user.email = email;

        await user.save();

        res.json({
            id: user._id,
            phone: user.phone,
            name: user.name,
            email: user.email,
            role: user.role
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   POST /api/auth/admin-login
// @desc    Admin login with phone and password
// @access  Public
router.post('/admin-login', async (req, res) => {
    try {
        const { phone, password } = req.body;

        if (!phone || !password) {
            return res.status(400).json({ message: 'Phone and password are required' });
        }

        const rawPhone = (phone || '').trim();
        const cleanPhone = rawPhone.replace(/\D/g, '').slice(-10);
        const trimmedPassword = (password || '').trim();

        const phoneMatches = [
            rawPhone,
            cleanPhone,
            `+91${cleanPhone}`,
            `+91 ${cleanPhone}`
        ];

        // Try admin first
        const user = await User.findOne({
            phone: { $in: phoneMatches },
            role: { $in: ['admin', 'superadmin'] }
        });

        if (user) {
            const expectedPassword = (user.password || 'admin123').trim();
            if (trimmedPassword !== expectedPassword) {
                return res.status(401).json({ message: 'Invalid credentials' });
            }

            const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
                expiresIn: process.env.JWT_EXPIRES_IN || '30d'
            });

            return res.json({
                token,
                user: {
                    id: user._id,
                    phone: user.phone,
                    name: user.name,
                    email: user.email,
                    role: user.role
                }
            });
        }

        // Try active employee next
        const Employee = require('../models/Employee');
        const emp = await Employee.findOne({
            phone: { $in: phoneMatches },
            isActive: true
        }).populate('assignedTables');

        if (emp) {
            const expectedEmpPassword = (emp.password || '').trim();
            if (trimmedPassword !== expectedEmpPassword) {
                return res.status(401).json({ message: 'Invalid credentials' });
            }

            const token = jwt.sign({ id: emp._id }, process.env.JWT_SECRET, {
                expiresIn: process.env.JWT_EXPIRES_IN || '30d'
            });

            return res.json({
                token,
                user: {
                    id: emp._id,
                    phone: emp.phone,
                    name: emp.name,
                    email: emp.email || '',
                    role: emp.role,
                    isEmployee: true,
                    assignedTables: emp.assignedTables || []
                }
            });
        }

        return res.status(401).json({ message: 'Invalid credentials' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   PUT /api/auth/change-password
// @desc    Change admin password
// @access  Private/Admin
router.put('/change-password', protect, admin, async (req, res) => {
    try {
        const { newPassword } = req.body;
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ message: 'New password must be at least 6 characters long' });
        }
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: 'Admin user not found' });
        }
        user.password = newPassword;
        await user.save();
        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
