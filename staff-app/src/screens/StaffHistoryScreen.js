import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';

export default function StaffHistoryScreen({ api, socket, onBack }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTodayOrders();
  }, []);

  // WebSocket real-time status updates
  useEffect(() => {
    if (socket) {
      const handleOrderUpdate = (updatedOrder) => {
        setOrders(prev => prev.map(o => (o._id || o.id) === (updatedOrder._id || updatedOrder.id) ? { ...o, ...updatedOrder } : o));
      };

      const handleNewOrder = (newOrder) => {
        setOrders(prev => [newOrder, ...prev]);
      };

      socket.on('order-updated', handleOrderUpdate);
      socket.on('new-order', handleNewOrder);
      socket.on('bill-generated', (bill) => {
        if (bill && bill.order) {
          handleOrderUpdate(bill.order);
        }
      });

      return () => {
        socket.off('order-updated', handleOrderUpdate);
        socket.off('new-order', handleNewOrder);
        socket.off('bill-generated');
      };
    }
  }, [socket]);

  const fetchTodayOrders = async () => {
    setLoading(true);
    try {
      const res = await api.get('/orders');
      const all = res.data || [];
      const todayStr = new Date().toISOString().split('T')[0];

      // Filter for today's orders
      const todayOrders = all.filter(o => {
        if (!o.createdAt) return false;
        const orderDate = new Date(o.createdAt).toISOString().split('T')[0];
        return orderDate === todayStr;
      });

      setOrders(todayOrders);
    } catch (error) {
      console.error('Error fetching today orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case 'pending': return { bg: '#FEF3C7', color: '#D97706', text: 'PENDING' };
      case 'confirmed': return { bg: '#E0E7FF', color: '#4F46E5', text: 'CONFIRMED' };
      case 'preparing': return { bg: '#FDE68A', color: '#B45309', text: 'PREPARING' };
      case 'ready': return { bg: '#D1FAE5', color: '#059669', text: 'READY TO SERVE' };
      case 'served': return { bg: '#DBEAFE', color: '#2563EB', text: 'SERVED' };
      case 'bill_requested': return { bg: '#FCE7F3', color: '#DB2777', text: 'BILL REQUESTED' };
      case 'bill_generated': return { bg: '#EDE9FE', color: '#7C3AED', text: 'BILL GENERATED' };
      case 'paid': return { bg: '#D1FAE5', color: '#047857', text: 'PAID & SETTLED' };
      case 'cancelled': return { bg: '#FEE2E2', color: '#DC2626', text: 'CANCELLED' };
      default: return { bg: '#F3F4F6', color: '#4B5563', text: (status || '').toUpperCase() };
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Today's Orders History</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={fetchTodayOrders}>
          <Text style={styles.refreshBtnText}>🔄</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator size="large" color="#7C3AED" style={{ marginTop: 40 }} />
        ) : orders.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No orders placed today yet.</Text>
          </View>
        ) : (
          orders.map((order) => {
            const badge = getStatusBadgeStyle(order.status);
            const subtotal = order.subtotal || order.items.reduce((s, i) => s + (i.price * i.quantity), 0);
            const discount = order.discount || 0;
            const total = order.total || (subtotal - discount) * 1.05;
            const customerName = order.user?.name || order.customerName || 'Walk-in Guest';
            const customerPhone = order.user?.phone || order.customerPhone || '';

            return (
              <View key={order._id || order.id} style={styles.orderCard}>
                {/* Top Row: Order # & Status Badge */}
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.orderNum}>Order #{order.orderNumber}</Text>
                    <Text style={styles.orderTime}>
                      {order.createdAt ? new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      {order.tableNumber ? ` • Table ${order.tableNumber}` : ' • Takeaway'}
                    </Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.badgeText, { color: badge.color }]}>{badge.text}</Text>
                  </View>
                </View>

                {/* Customer Details */}
                <View style={styles.customerRow}>
                  <Text style={styles.customerName}>👤 {customerName}</Text>
                  {customerPhone ? <Text style={styles.customerPhone}>📞 +91 {customerPhone}</Text> : null}
                </View>

                {/* Items List */}
                <View style={styles.itemsList}>
                  <Text style={styles.itemsTitle}>Ordered Items:</Text>
                  {order.items && order.items.map((item, idx) => (
                    <View key={idx} style={styles.itemRow}>
                      <Text style={styles.itemName}>{item.name || item.menuItem?.name || 'Item'} × {item.quantity}</Text>
                      <Text style={styles.itemPrice}>₹{(item.price * item.quantity).toFixed(2)}</Text>
                    </View>
                  ))}
                </View>

                {/* Bill & Discount Summary */}
                <View style={styles.billSummary}>
                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>Subtotal:</Text>
                    <Text style={styles.billVal}>₹{subtotal.toFixed(2)}</Text>
                  </View>

                  {discount > 0 ? (
                    <View style={styles.billRow}>
                      <Text style={[styles.billLabel, { color: '#EF4444' }]}>Discount:</Text>
                      <Text style={[styles.billVal, { color: '#EF4444' }]}>- ₹{discount.toFixed(2)}</Text>
                    </View>
                  ) : null}

                  <View style={[styles.billRow, styles.totalRow]}>
                    <Text style={styles.totalLabel}>Total Bill:</Text>
                    <Text style={styles.totalVal}>₹{total.toFixed(2)}</Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F3FF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 2,
    borderColor: '#111111',
  },
  backBtn: {
    backgroundColor: '#F3F4F6',
    borderWidth: 2,
    borderColor: '#111111',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  backBtnText: {
    fontWeight: '700',
    fontSize: 13,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#111111',
  },
  refreshBtn: {
    padding: 6,
  },
  refreshBtnText: {
    fontSize: 18,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 30,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#111111',
    marginTop: 20,
  },
  emptyText: {
    fontSize: 15,
    color: '#6B7280',
  },
  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
    borderColor: '#111111',
    marginBottom: 16,
    shadowColor: '#111111',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderColor: '#F3F4F6',
    paddingBottom: 8,
  },
  orderNum: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111111',
  },
  orderTime: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  customerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    backgroundColor: '#F9FAFB',
    padding: 8,
    borderRadius: 6,
  },
  customerName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  customerPhone: {
    fontSize: 12,
    color: '#6B7280',
  },
  itemsList: {
    marginBottom: 10,
  },
  itemsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 4,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  itemName: {
    fontSize: 13,
    color: '#111111',
    fontWeight: '600',
  },
  itemPrice: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '600',
  },
  billSummary: {
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#D1D5DB',
    paddingTop: 8,
    marginTop: 4,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  billLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  billVal: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111111',
  },
  totalRow: {
    marginTop: 4,
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
    paddingTop: 4,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#7C3AED',
  },
  totalVal: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#7C3AED',
  },
});
