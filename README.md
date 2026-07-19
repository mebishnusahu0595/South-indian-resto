# Kea By The Pool - Restaurant Management System

A comprehensive full-stack restaurant management system for **Kea By The Pool** featuring customer ordering, real-time order tracking, admin dashboard, inventory management, employee attendance, and analytics.

## 🌟 Features

### Customer Features
- **2FA Phone Login**: OTP-based authentication for customers
- **Browse Menu**: Categories with horizontal scrolling (like Zomato/Swiggy)
- **Smart Cart**: Add items, apply coupons, see recommendations
- **Real-time Order Tracking**: Live status updates via Socket.IO
- **Bill Management**: Request bill, view bill, payment confirmation
- **Order History**: View all past orders

### Admin Features
- **Dashboard**: Real-time stats, revenue, pending orders
- **Orders Management**: Confirm, prepare, serve, generate bill, mark paid, delete orders
- **Menu Management**: Add/edit categories and items with images
- **Stock Control**: Mark items as out of stock
- **Coupons & Offers**: Create percentage/fixed discount coupons
- **Inventory Management**: Track ingredients, low stock alerts
- **Employee Management**: Add employees, track attendance
- **Analytics Dashboard**: Revenue charts, category sales, top items

## 🎨 Design

- **Primary Color**: `#7C3AED` (Purple)
- **Background**: Soft light purple & white sketch theme
- **Design**: Hand-drawn wobbly sketch borders with animated floating food doodles
- **Typography**: `Patrick Hand` & `Caveat` (Google Fonts)

## 🛠️ Tech Stack

- **Frontend**: React + Vite
- **Backend**: Node.js + Express
- **Database**: MongoDB
- **Real-time**: Socket.IO
- **Charts**: Recharts
- **Styling**: Vanilla CSS

## 📦 Installation

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)

### 1. Clone and Install

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Configure Environment

Edit `backend/.env`:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/keabythepool
JWT_SECRET=your_secret_key
FRONTEND_URL=http://localhost:5173
```

### 3. Start MongoDB

```bash
mongod
```

### 4. Run Application

```bash
# Terminal 1 - Backend
cd backend
npm start

# Terminal 2 - Frontend
cd frontend
npm run dev
```

### 5. Access Application

- **Customer App**: http://localhost:5173
- **Admin Panel**: http://localhost:5173/admin/login

### Default Admin Credentials
- **Phone**: 9999999999
- **Password**: admin123

## 📱 Customer Flow

1. Visit website → Enter phone number
2. Receive OTP (shown in console for development)
3. Enter OTP + optional name/email
4. Browse categories → Select items → Add to cart
5. View cart → Apply coupon → Place order
6. Track order status in real-time
7. When served → Request bill
8. Admin generates bill → View bill
9. Pay at counter → Admin marks as paid

## 🔧 Admin Flow

1. Login at `/admin/login`
2. **Orders**: Confirm → Prepare → Ready → Served → Bill → Paid (Delete option available)
3. **Menu**: Add categories, add items, set bestseller/new
4. **Inventory**: Track stock, restock items
5. **Employees**: Add staff, mark daily attendance
6. **Analytics**: View revenue, sales by category

## 📁 Project Structure

```
├── backend/
│   ├── config/          # Database config
│   ├── middleware/      # Auth, upload
│   ├── models/          # MongoDB schemas
│   ├── routes/          # API routes
│   ├── utils/           # Helper functions
│   ├── uploads/         # Image uploads
│   └── server.js        # Entry point
│
├── frontend/
│   ├── src/
│   │   ├── admin/       # Admin pages
│   │   ├── components/  # Reusable components
│   │   ├── context/     # Auth & Cart context
│   │   ├── pages/       # Customer pages
│   │   └── utils/       # API functions
│   └── index.html
│
└── staff-app/
    ├── src/             # Staff React Native screens (Login, Table Select, Menu, Cart)
    ├── App.js           # Expo App entry point
    └── package.json     # Expo config
```

## 🔌 API Endpoints

### Auth
- `POST /api/auth/send-otp` - Send OTP
- `POST /api/auth/verify-otp` - Verify & login
- `POST /api/auth/admin-login` - Admin login

### Menu
- `GET /api/categories` - Get categories
- `GET /api/menu` - Get menu items
- `GET /api/menu/bestsellers` - Bestsellers
- `GET /api/menu/recommended` - Recommendations

### Orders
- `POST /api/orders` - Create order (Manual creation supported)
- `GET /api/orders/current` - Current order
- `PUT /api/orders/:id/status` - Update status
- `PUT /api/orders/:id/request-bill` - Request bill
- `DELETE /api/orders/:id` - Hard delete order

### Admin
- `GET /api/analytics/dashboard` - Stats
- `GET /api/analytics/revenue` - Revenue data
- `GET /api/inventory` - Inventory list
- `GET /api/employees` - Employee list

## 🚀 Production Deployment

1. Set up MongoDB Atlas
2. Update `MONGODB_URI` in `.env`
3. Enable Twilio for real SMS OTP
4. Build frontend: `npm run build`
5. Deploy to Vercel/Railway/Render

## 📝 License

MIT License

---

**Built for Kea By The Pool** 🍹
