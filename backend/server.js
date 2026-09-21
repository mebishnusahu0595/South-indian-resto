require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');

// Import routes
const authRoutes = require('./routes/auth');
const categoryRoutes = require('./routes/categories');
const menuRoutes = require('./routes/menu');
const orderRoutes = require('./routes/orders');
const couponRoutes = require('./routes/coupons');
const inventoryRoutes = require('./routes/inventory');
const employeeRoutes = require('./routes/employees');
const analyticsRoutes = require('./routes/analytics');
const tableRoutes = require('./routes/tables');
const settingsRoutes = require('./routes/settings');
const collectionRoutes = require('./routes/collections');
const loyaltyRoutes = require('./routes/loyalty');
const billRoutes = require('./routes/bills');
const bookingRoutes = require('./routes/bookings');
const ratingRoutes = require('./routes/ratings');

const app = express();
app.set('trust proxy', 1); // Enable proxy trust for Nginx
const server = http.createServer(app);

// Socket.IO setup
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:5173',
        methods: ['GET', 'POST', 'PUT', 'DELETE']
    }
});

// Make io accessible in routes
app.set('io', io);

// Connect to MongoDB
connectDB();

// Initialize Redis (optional - for caching)
const { initRedis } = require('./utils/redis');
if (process.env.NODE_ENV === 'production') {
    initRedis().then(() => {
        console.log('Redis caching initialized');
    }).catch(err => {
        console.warn('Redis unavailable, caching disabled:', err.message);
    });
}

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const reportRoutes = require('./routes/reports');

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/loyalty', loyaltyRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/reports', reportRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: "Kea By The Pool API is running" });
});

const { registerAgent, unregisterSocket } = require('./utils/printAgents');
const { getPrinterConfig, addDetectedPrinters } = require('./utils/printerConfig');

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Join user-specific room
    socket.on('join-user-room', (userId) => {
        socket.join(`user-${userId}`);
        console.log(`User ${userId} joined their room`);
    });

    // Join admin room
    socket.on('join-admin-room', () => {
        socket.join('admin-room');
        console.log('Admin joined admin room');
    });

    // Restaurant PC print agent announces itself and every printer it can reach.
    socket.on('print-agent:register', async (payload) => {
        const agent = registerAgent(socket, payload, io);
        if (!agent) return;
        io.emit('printer-devices-updated', { at: Date.now() });
        try {
            // Default: newly detected printers are ticked for KOT and Bill (auto-select).
            const added = await addDetectedPrinters(agent.printers, { agentId: agent.id, deviceName: agent.name });
            const config = await getPrinterConfig();
            if (added) io.emit('printer-settings-updated', config);
            else socket.emit('printer-settings-updated', config);
        } catch (error) {
            console.error('Could not sync printer registry with print agent:', error.message);
        }
    });

    socket.on('print-agent:test-result', (result) => {
        if (!socket.data.printAgentId) return;
        io.emit('printer-test-result', {
            agentId: socket.data.printAgentId,
            printerName: String(result?.printerName || '').slice(0, 80),
            ok: result?.ok === true,
            error: String(result?.error || '').slice(0, 300)
        });
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        if (unregisterSocket(socket)) io.emit('printer-devices-updated', { at: Date.now() });
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something went wrong!' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Create default admin user
const User = require('./models/User');
const createDefaultAdmin = async () => {
    try {
        const adminExists = await User.findOne({ role: 'admin' });
        if (!adminExists) {
            await User.create({
                phone: '9999999999',
                name: 'Admin',
                email: 'admin@keabythepool.com',
                role: 'admin',
                isVerified: true
            });
            console.log('Default admin created: phone: 9999999999, password: admin123');
        }

        // Create default superadmin if not exists
        const ownerExists = await User.findOne({ phone: '7879291871' });
        if (!ownerExists) {
            await User.create({
                phone: '7879291871',
                name: 'Owner Admin',
                email: 'owner@keabythepool.com',
                role: 'superadmin',
                password: 'admin123',
                isVerified: true
            });
            console.log('Owner superadmin created: phone: 7879291871, password: admin123');
        }

        const superadminExists = await User.findOne({ role: 'superadmin' });
        if (!superadminExists) {
            await User.create({
                phone: '8888888888',
                name: 'Super Admin',
                email: 'superadmin@keabythepool.com',
                role: 'superadmin',
                isVerified: true
            });
            console.log('Default superadmin created: phone: 8888888888, password: admin123');
        }
    } catch (error) {
        console.error('Error creating default admin:', error);
    }
};

setTimeout(createDefaultAdmin, 2000);
