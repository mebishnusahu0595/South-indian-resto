import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Alert } from 'react-native';

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

  // Edit / Modify Order Modal states
  const [showModifyModal, setShowModifyModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [modifyItems, setModifyItems] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [selectedAddId, setSelectedAddId] = useState('');
  const [modifyNote, setModifyNote] = useState('');
  const [submittingModify, setSubmittingModify] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCatFilter, setSelectedCatFilter] = useState('All');

  const handleOpenModify = async (order) => {
    setEditingOrder(order);
    const initialList = (order.items || []).map(i => ({
      menuItemId: i.menuItem?._id || i.menuItem || i._id,
      name: i.name || i.menuItem?.name || 'Item',
      price: i.price || i.menuItem?.price || 0,
      quantity: i.quantity
    }));
    setModifyItems(initialList);
    setModifyNote('');
    setSearchQuery('');
    setShowModifyModal(true);

    try {
      const res = await api.get('/menu/all');
      setMenuItems(res.data || []);
    } catch (e) {
      console.log('Error fetching menu items for staff modify:', e);
    }
  };

  const handleSaveModify = async () => {
    if (!editingOrder) return;
    setSubmittingModify(true);
    try {
      const payload = {
        updatedItems: modifyItems.map(i => ({
          menuItemId: i.menuItemId,
          quantity: i.quantity
        })),
        modificationNote: modifyNote
      };

      const res = await api.put(`/orders/${editingOrder._id || editingOrder.id}/modify-items`, payload);
      alert('Order modified successfully! KOT generated.');
      setShowModifyModal(false);
      fetchTodayOrders();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to modify order');
    } finally {
      setSubmittingModify(false);
    }
  };

  const handleCancelEntireOrder = async (order) => {
    if (!order) return;
    try {
      await api.put(`/orders/${order._id || order.id}/status`, { status: 'cancelled' });
      alert(`Order #${order.orderNumber} CANCELLED! Cancel KOT emitted.`);
      setShowModifyModal(false);
      fetchTodayOrders();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to cancel order');
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
            const isActiveOrder = !['paid', 'cancelled'].includes(order.status);

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

                {/* Edit & Cancel Buttons for Active Orders */}
                {isActiveOrder && (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                    <TouchableOpacity
                      style={{ flex: 1, backgroundColor: '#7C3AED', paddingVertical: 10, borderRadius: 8, alignItems: 'center' }}
                      onPress={() => handleOpenModify(order)}
                    >
                      <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 13 }}>✏️ Edit / Add / Cancel Items</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Staff Modify Order Modal */}
      {showModifyModal && editingOrder && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 16, zIndex: 100 }}>
          <View style={{ backgroundColor: '#FFF', borderRadius: 12, padding: 16, width: '100%', maxHeight: '85%', borderWidth: 2, borderColor: '#111' }}>
            <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 4, color: '#111' }}>✏️ Edit Order #{editingOrder.orderNumber}</Text>
            <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 12 }}>Add items, change quantities or remove cancelled items</Text>

            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 220, marginBottom: 12, borderBottomWidth: 1, borderColor: '#E5E7EB' }}>
              {modifyItems.map((item, idx) => (
                <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#F3F4F6' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: 'bold', fontSize: 14, color: '#111' }}>{item.name}</Text>
                    <Text style={{ fontSize: 12, color: '#6B7280' }}>₹{item.price} each</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => {
                        setModifyItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: Math.max(0, it.quantity - 1) } : it).filter(it => it.quantity > 0));
                      }}
                      style={{ width: 28, height: 28, borderRadius: 4, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center' }}
                    >
                      <Text style={{ color: '#DC2626', fontWeight: 'bold', fontSize: 16 }}>-</Text>
                    </TouchableOpacity>

                    <Text style={{ fontWeight: 'bold', fontSize: 15, minWidth: 20, textAlign: 'center' }}>x{item.quantity}</Text>

                    <TouchableOpacity
                      onPress={() => {
                        setModifyItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: it.quantity + 1 } : it));
                      }}
                      style={{ width: 28, height: 28, borderRadius: 4, backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center' }}
                    >
                      <Text style={{ color: '#059669', fontWeight: 'bold', fontSize: 16 }}>+</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
                        setModifyItems(prev => prev.filter((_, i) => i !== idx));
                      }}
                      style={{ paddingLeft: 6 }}
                    >
                      <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 16 }}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>

            {/* Add New Menu Item Section */}
            <Text style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4, color: '#374151' }}>➕ Add Item from Menu ({menuItems.length} items available):</Text>
            
            {/* Category Filter Chips */}
            {(() => {
              const categories = ['All', ...new Set(menuItems.map(mi => typeof mi.category === 'object' ? mi.category?.name : mi.category).filter(Boolean))];
              return (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6, maxHeight: 34 }}>
                  {categories.map(cat => {
                    const isActive = (selectedCatFilter || 'All') === cat;
                    return (
                      <TouchableOpacity
                        key={cat}
                        style={{
                          paddingVertical: 4,
                          paddingHorizontal: 10,
                          borderRadius: 14,
                          marginRight: 6,
                          backgroundColor: isActive ? '#7C3AED' : '#F3F4F6',
                          borderWidth: 1,
                          borderColor: isActive ? '#7C3AED' : '#D1D5DB'
                        }}
                        onPress={() => setSelectedCatFilter(cat)}
                      >
                        <Text style={{ fontSize: 11, fontWeight: 'bold', color: isActive ? '#FFF' : '#374151' }}>{cat}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              );
            })()}

            <TextInput
              style={{ borderWidth: 1.5, borderColor: '#111', borderRadius: 6, padding: 8, fontSize: 13, marginBottom: 8, backgroundColor: '#FFF' }}
              placeholder="🔍 Search item name..."
              value={searchQuery}
              onChangeText={setSearchQuery}
            />

            <ScrollView style={{ maxHeight: 180, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 6, padding: 4 }}>
              {menuItems
                .filter(mi => {
                  const catName = typeof mi.category === 'object' ? mi.category?.name : mi.category;
                  const matchesCat = !selectedCatFilter || selectedCatFilter === 'All' || catName === selectedCatFilter;
                  const matchesSearch = !searchQuery || (mi.name || '').toLowerCase().includes(searchQuery.toLowerCase());
                  return matchesCat && matchesSearch;
                })
                .map(mi => {
                  const catName = typeof mi.category === 'object' ? mi.category?.name : (mi.category || '');
                  return (
                    <TouchableOpacity
                      key={mi._id}
                      style={{ paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: 1, borderColor: '#F3F4F6', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                      onPress={() => {
                        const existsIndex = modifyItems.findIndex(i => i.menuItemId === mi._id);
                        if (existsIndex >= 0) {
                          setModifyItems(prev => prev.map((it, i) => i === existsIndex ? { ...it, quantity: it.quantity + 1 } : it));
                        } else {
                          setModifyItems(prev => [...prev, { menuItemId: mi._id, name: mi.name, price: mi.price, quantity: 1 }]);
                        }
                      }}
                    >
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#111' }}>{mi.name}</Text>
                        {catName ? <Text style={{ fontSize: 10, color: '#7C3AED', fontWeight: 'bold' }}>{catName}</Text> : null}
                      </View>
                      <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#059669' }}>+ ₹{mi.price}</Text>
                    </TouchableOpacity>
                  );
                })
              }
            </ScrollView>

            <TextInput
              style={{ borderWidth: 1.5, borderColor: '#111', borderRadius: 6, padding: 8, fontSize: 13, marginBottom: 12, backgroundColor: '#FFF' }}
              placeholder="Modification Reason / KOT Note (Optional)"
              value={modifyNote}
              onChangeText={setModifyNote}
            />

            <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
              <TouchableOpacity
                style={{ backgroundColor: '#FEE2E2', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: '#EF4444' }}
                onPress={() => {
                  if (confirm('Cancel this ENTIRE order?')) {
                    handleCancelEntireOrder(editingOrder);
                  }
                }}
              >
                <Text style={{ color: '#DC2626', fontWeight: 'bold', fontSize: 12 }}>🚫 Cancel Order</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ backgroundColor: '#F3F4F6', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: '#111' }}
                onPress={() => setShowModifyModal(false)}
              >
                <Text style={{ fontWeight: 'bold', fontSize: 12 }}>Close</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ backgroundColor: '#7C3AED', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 6, borderWidth: 1, borderColor: '#111' }}
                onPress={handleSaveModify}
                disabled={submittingModify || modifyItems.length === 0}
              >
                <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 12 }}>
                  {submittingModify ? 'Saving...' : '💾 Save & Send KOT'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
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
