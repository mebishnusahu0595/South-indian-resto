import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { getSavedPrinters, formatKOT, printToIp } from '../utils/ThermalPrinter';

export default function CartScreen({ api, cart, selectedTable, customerPhone, customerName, instructions, onUpdateInstructions, onUpdateCart, onBack, onSubmitSuccess, staffName, onOpenPrinterSetup }) {
  const [submitting, setSubmitting] = useState(false);
  const [printers, setPrinters] = useState({ kitchenIp: '', receptionIp: '', kitchenName: '', receptionName: '' });

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const gst = subtotal * 0.05;
  const total = subtotal + gst;

  useEffect(() => {
    // Load saved printer IPs from AsyncStorage (set once in Printer Setup)
    getSavedPrinters().then(p => setPrinters(p)).catch(() => {});
  }, []);

  const updateQuantity = (itemId, newQty) => {
    if (newQty <= 0) {
      onUpdateCart(cart.filter(i => i._id !== itemId));
    } else {
      onUpdateCart(cart.map(i => i._id === itemId ? { ...i, quantity: newQty } : i));
    }
  };

  // Auto-print KOT to a single printer — returns { ok, ip, name, error }
  const printKOT = async (ip, name, orderData) => {
    if (!ip) return { ok: false, ip, name, error: 'Not configured' };
    try {
      const tableName = Array.isArray(orderData.selectedTable)
        ? orderData.selectedTable.map(t => t.name || `T${t.tableNumber}`).join(', ')
        : (orderData.selectedTable ? (orderData.selectedTable.name || `T${orderData.selectedTable.tableNumber}`) : 'Takeaway');

      const kotData = formatKOT({
        orderNumber: orderData.orderNumber,
        tableNumber: orderData.selectedTable?.tableNumber,
        tableName,
        items: orderData.items,
        instructions: orderData.instructions,
        staffName: orderData.staffName,
        timestamp: new Date(),
      });
      await printToIp(ip, kotData);
      return { ok: true, ip, name };
    } catch (err) {
      return { ok: false, ip, name, error: err.message };
    }
  };

  const handlePlaceOrder = async () => {
    if (cart.length === 0) {
      Alert.alert('Error', 'Your cart is empty');
      return;
    }

    setSubmitting(true);

    try {
      const isMulti = Array.isArray(selectedTable);
      const primaryTable = isMulti ? selectedTable[0] : selectedTable;
      const tableIdsList = isMulti ? selectedTable.map(t => t._id) : (selectedTable ? [selectedTable._id] : []);

      const orderPayload = {
        items: cart.map(item => ({
          menuItem: item._id,
          quantity: item.quantity,
          notes: item.notes || ''
        })),
        tableId: primaryTable ? primaryTable._id : null,
        tableIds: tableIdsList,
        specialInstructions: instructions,
        customerPhone: customerPhone || undefined,
        customerName: customerName || undefined
      };

      const res = await api.post('/orders', orderPayload);
      const order = res.data;

      // ── Auto-print KOT to both printers via WiFi ──────────────
      const orderData = {
        orderNumber: order.orderNumber,
        selectedTable,
        items: order.items || cart.map(i => ({ name: i.name, quantity: i.quantity, price: i.price, notes: i.notes })),
        instructions,
        staffName: staffName || '',
      };

      // Fire both prints simultaneously (don't block success flow)
      const [kitchenResult, receptionResult] = await Promise.all([
        printKOT(printers.kitchenIp, printers.kitchenName || 'Kitchen', orderData),
        printKOT(printers.receptionIp, printers.receptionName || 'Reception', orderData),
      ]);

      // Build print status message
      const kitchenLabel = printers.kitchenName ? `${printers.kitchenName} (${printers.kitchenIp})` : (printers.kitchenIp || 'Kitchen — Not Setup');
      const receptionLabel = printers.receptionName ? `${printers.receptionName} (${printers.receptionIp})` : (printers.receptionIp || 'Reception — Not Setup');
      const kitchenStatus = kitchenResult.ok ? `✓ ${kitchenLabel}` : `✗ ${kitchenLabel}: ${kitchenResult.error}`;
      const receptionStatus = receptionResult.ok ? `✓ ${receptionLabel}` : `✗ ${receptionLabel}: ${receptionResult.error}`;

      const allPrinted = kitchenResult.ok && receptionResult.ok;
      const noneConfigured = !printers.kitchenIp && !printers.receptionIp;

      let alertTitle = allPrinted ? 'Order Placed & KOT Printed!' : 'Order Placed';
      let alertMsg = `Order #${order.orderNumber} confirmed!\n\n`;
      if (noneConfigured) {
        alertMsg += 'No printers configured. Go to Printer Setup to add printers.';
      } else {
        alertMsg += `KOT Print Status:\n${kitchenStatus}\n${receptionStatus}`;
      }

      Alert.alert(alertTitle, alertMsg, [{ text: 'OK', onPress: () => onSubmitSuccess() }]);

    } catch (error) {
      console.log('Order placement error:', error);
      Alert.alert('Order Failed', error.response?.data?.message || 'Could not connect to server to place order.');
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <KeyboardAvoidingView 
      style={{ flex: 1 }} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <Text style={styles.backBtnText}>← Menu</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Review Order</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Active Thermal Printers Status */}
          <View style={[styles.infoCard, { backgroundColor: '#F5F3FF', borderColor: '#7C3AED' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={[styles.infoTitle, { color: '#6D28D9', marginBottom: 0 }]}>Thermal Printers</Text>
              {onOpenPrinterSetup && (
                <TouchableOpacity onPress={onOpenPrinterSetup} style={{ backgroundColor: '#7C3AED', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 10 }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>Setup</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Kitchen Printer */}
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Kitchen:</Text>
              <View style={{ flex: 1 }}>
                {printers.kitchenIp ? (
                  <>
                    <Text style={{ color: '#059669', fontWeight: '700', fontSize: 13 }}>
                      {printers.kitchenName || 'Kitchen Printer'}
                    </Text>
                    <Text style={{ color: '#6B7280', fontSize: 11 }}>{printers.kitchenIp} · port 9100</Text>
                  </>
                ) : (
                  <Text style={{ color: '#D97706', fontWeight: '600', fontSize: 13 }}>Not Configured</Text>
                )}
              </View>
            </View>

            <View style={{ height: 8 }} />

            {/* Reception Printer */}
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Reception:</Text>
              <View style={{ flex: 1 }}>
                {printers.receptionIp ? (
                  <>
                    <Text style={{ color: '#059669', fontWeight: '700', fontSize: 13 }}>
                      {printers.receptionName || 'Reception Printer'}
                    </Text>
                    <Text style={{ color: '#6B7280', fontSize: 11 }}>{printers.receptionIp} · port 9100</Text>
                  </>
                ) : (
                  <Text style={{ color: '#D97706', fontWeight: '600', fontSize: 13 }}>Not Configured</Text>
                )}
              </View>
            </View>

            {!printers.kitchenIp && !printers.receptionIp && (
              <Text style={{ color: '#EF4444', fontSize: 11, marginTop: 8, fontStyle: 'italic' }}>
                Tap Setup to configure WiFi printers. KOT will auto-print after this.
              </Text>
            )}
          </View>


          {/* Destination Summary */}
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Order Destination</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Table(s):</Text>
              <Text style={styles.infoValue}>
                {Array.isArray(selectedTable)
                  ? selectedTable.map(t => `Table ${t.tableNumber}`).join(', ')
                  : (selectedTable ? `Table ${selectedTable.tableNumber}` : 'Takeaway')}
              </Text>
            </View>
            {customerPhone ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Customer:</Text>
                <Text style={styles.infoValue}>
                  {customerName || 'Guest'} (+91 {customerPhone})
                </Text>
              </View>
            ) : null}
          </View>

          {/* Selected Items */}
          <Text style={styles.sectionTitle}>Cart Items</Text>
          <View style={styles.itemsCard}>
            {cart.map((item) => (
              <View key={item._id} style={[styles.itemRow, { flexDirection: 'column', alignItems: 'stretch' }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={styles.itemDetails}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemPrice}>₹{item.price} each</Text>
                  </View>
                  <View style={styles.itemActions}>
                    <View style={styles.qtyContainer}>
                      <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQuantity(item._id, item.quantity - 1)}>
                        <Text style={styles.qtyBtnText}>-</Text>
                      </TouchableOpacity>
                      <Text style={styles.qtyVal}>{item.quantity}</Text>
                      <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQuantity(item._id, item.quantity + 1)}>
                        <Text style={styles.qtyBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.itemTotal}>₹{item.price * item.quantity}</Text>
                  </View>
                </View>
                <TextInput
                  style={{
                    borderWidth: 1,
                    borderColor: '#DDD',
                    borderRadius: 6,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    fontSize: 12,
                    marginTop: 6,
                    backgroundColor: '#FAFAFA',
                    color: '#000'
                  }}
                  placeholder="Instructions for this item..."
                  value={item.notes || ''}
                  onChangeText={(txt) => {
                    onUpdateCart(cart.map(i => i._id === item._id ? { ...i, notes: txt } : i));
                  }}
                />
              </View>
            ))}
          </View>

          {/* Special Instructions */}
          <Text style={styles.sectionTitle}>Special Notes</Text>
          <TextInput
            style={styles.notesInput}
            placeholder="e.g. No ice in mocktails, extra spicy, etc."
            value={instructions}
            onChangeText={onUpdateInstructions}
            multiline
            numberOfLines={3}
          />

          {/* Price Breakdown */}
          <Text style={styles.sectionTitle}>Bill Breakdown</Text>
          <View style={styles.billCard}>
            <View style={styles.billRow}>
              <Text style={styles.billLabel}>Subtotal</Text>
              <Text style={styles.billVal}>₹{subtotal.toFixed(2)}</Text>
            </View>
            <View style={styles.billRow}>
              <Text style={styles.billLabel}>GST (5%)</Text>
              <Text style={styles.billVal}>₹{gst.toFixed(2)}</Text>
            </View>
            <View style={[styles.billRow, styles.grandTotalRow]}>
              <Text style={styles.grandTotalLabel}>GRAND TOTAL</Text>
              <Text style={styles.grandTotalVal}>₹{total.toFixed(2)}</Text>
            </View>
          </View>
        </ScrollView>

        {/* Place Order Button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            disabled={submitting || cart.length === 0}
            onPress={handlePlaceOrder}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitBtnText}>SUBMIT ORDER (₹{total.toFixed(2)})</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
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
    fontSize: 18,
    fontWeight: 'bold',
  },
  content: {
    padding: 16,
    paddingBottom: 120,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#111111',
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#7C3AED',
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  infoLabel: {
    width: 80,
    fontWeight: '600',
    color: '#4B5563',
  },
  infoValue: {
    fontWeight: 'bold',
    color: '#111111',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111111',
    marginBottom: 8,
    marginTop: 10,
  },
  itemsCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#111111',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
  },
  itemDetails: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#111111',
  },
  itemPrice: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  qtyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#111111',
    borderRadius: 6,
    backgroundColor: '#F9FAFB',
    marginRight: 10,
  },
  qtyBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  qtyBtnText: {
    fontWeight: 'bold',
    fontSize: 14,
  },
  qtyVal: {
    paddingHorizontal: 6,
    fontWeight: '700',
  },
  itemTotal: {
    fontWeight: 'bold',
    fontSize: 14,
    minWidth: 55,
    textAlign: 'right',
  },
  notesInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#111111',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  billCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#111111',
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  billLabel: {
    color: '#4B5563',
  },
  billVal: {
    fontWeight: '600',
  },
  grandTotalRow: {
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#111111',
    paddingTop: 8,
    marginTop: 4,
    marginBottom: 0,
  },
  grandTotalLabel: {
    fontWeight: 'bold',
    color: '#7C3AED',
  },
  grandTotalVal: {
    fontWeight: '800',
    color: '#7C3AED',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 2,
    borderColor: '#111111',
    padding: 12,
  },
  submitBtn: {
    backgroundColor: '#7C3AED',
    borderWidth: 2,
    borderColor: '#111111',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    backgroundColor: '#9CA3AF',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
