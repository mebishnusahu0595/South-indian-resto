import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';

// User Pages
import Home from './pages/Home';
import LoginModal from './components/LoginModal';
import Menu from './pages/Menu';
import Cart from './pages/Cart';
import OrderDetails from './pages/OrderDetails';

import BottomNav from './components/BottomNav';

// Admin Pages
import AdminLogin from './admin/AdminLogin';
import AdminLayout from './admin/AdminLayout';
import AdminDashboard from './admin/AdminDashboard';
import AdminOrders from './admin/AdminOrders';
import AdminCreateOrder from './admin/AdminCreateOrder';
import AdminMenu from './admin/AdminMenu';
import AdminCategories from './admin/AdminCategories';
import AdminCoupons from './admin/AdminCoupons';
import AdminInventory from './admin/AdminInventory';
import AdminEmployees from './admin/AdminEmployees';
import AdminAnalytics from './admin/AdminAnalytics';
import AdminTables from './admin/AdminTables';
import AdminCollections from './admin/AdminCollections';
import AdminHistory from './admin/AdminHistory';
import AdminSettings from './admin/AdminSettings';
import AdminLoyalty from './admin/AdminLoyalty';
import AdminCustomers from './admin/AdminCustomers';
import AdminBills from './admin/AdminBills';
import AdminBookings from './admin/AdminBookings';

import './index.css';

// Protected Route for Admin
const AdminRoute = ({ children }) => {
  const { isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
      </div>
    );
  }

  return isAdmin ? children : <Navigate to="/admin/login" />;
};

// Protected Route for Superadmin-only pages
const SuperadminOnly = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!user || user.role !== 'superadmin') {
    return <Navigate to="/admin" />;
  }

  return children;
};

// User Layout with Bottom Nav and Login Modal
const UserLayout = ({ children }) => {
  const { isAuthenticated, skippedLogin, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
      </div>
    );
  }

  const showLogin = false; // Disable login modal for customer web client

  return (
    <>
      <div className={showLogin ? 'page-blurred' : ''}>
        {children}
        <BottomNav />
      </div>
      {showLogin && <LoginModal />}
    </>
  );
};

function AppRoutes() {
  return (
    <Routes>
      {/* User Routes - All with Login Modal */}
      <Route path="/" element={<UserLayout><Home /></UserLayout>} />
      <Route path="/menu" element={<UserLayout><Menu /></UserLayout>} />
      <Route path="/categories" element={<UserLayout><Menu /></UserLayout>} />
      <Route path="/cart" element={<UserLayout><Cart /></UserLayout>} />
      <Route path="/order/:id" element={<UserLayout><OrderDetails /></UserLayout>} />
      <Route path="/history" element={<Navigate to="/menu" />} />
      <Route path="/profile" element={<Navigate to="/menu" />} />

      {/* Admin Routes */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={
        <AdminRoute>
          <AdminLayout />
        </AdminRoute>
      }>
        <Route index element={<AdminDashboard />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="create-order" element={<AdminCreateOrder />} />
        <Route path="bills" element={<AdminBills />} />
        <Route path="bookings" element={<AdminBookings />} />
        <Route path="menu" element={<AdminMenu />} />
        <Route path="categories" element={<AdminCategories />} />
        <Route path="collections" element={<SuperadminOnly><AdminCollections /></SuperadminOnly>} />
        <Route path="coupons" element={<SuperadminOnly><AdminCoupons /></SuperadminOnly>} />
        <Route path="inventory" element={<AdminInventory />} />
        <Route path="employees" element={<AdminEmployees />} />
        <Route path="tables" element={<AdminTables />} />
        <Route path="analytics" element={<AdminAnalytics />} />
        <Route path="history" element={<AdminHistory />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="loyalty" element={<SuperadminOnly><AdminLoyalty /></SuperadminOnly>} />
        <Route path="customers" element={<SuperadminOnly><AdminCustomers /></SuperadminOnly>} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <AppRoutes />
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

