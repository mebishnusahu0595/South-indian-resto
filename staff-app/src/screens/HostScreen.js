import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';

export default function HostScreen({ api, staffName, onBack }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tables, setTables] = useState([]);
  const [sectionsList, setSectionsList] = useState([]);

  // Form state
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestCount, setGuestCount] = useState('2');
  const [selectedTableIds, setSelectedTableIds] = useState([]);
  const [selectedSections, setSelectedSections] = useState([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [fromTime, setFromTime] = useState('19:00');
  const [toTime, setToTime] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [notes, setNotes] = useState('');

  // Quick time preset options
  const timePresets = ['12:00 PM', '01:00 PM', '07:00 PM', '08:00 PM', '09:00 PM', '10:00 PM'];

  useEffect(() => {
    fetchBookings();
    fetchTables();
    fetchSections();
    const today = new Date().toISOString().split('T')[0];
    setFromDate(today);
  }, []);

  const fetchBookings = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await api.get('/bookings', { params: { date: today } });
      setBookings(res.data || []);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTables = async () => {
    try {
      const res = await api.get('/tables');
      setTables(res.data || []);
    } catch (error) {
      console.error('Error fetching tables:', error);
    }
  };

  const fetchSections = async () => {
    try {
      const res = await api.get('/tables/sections');
      setSectionsList(res.data || []);
    } catch (error) {
      console.error('Error fetching sections:', error);
    }
  };

  const toggleTableSelection = (tableId) => {
    setSelectedTableIds(prev =>
      prev.includes(tableId) ? prev.filter(id => id !== tableId) : [...prev, tableId]
    );
  };

  const toggleSectionSelection = (sec) => {
    setSelectedSections(prev =>
      prev.includes(sec) ? prev.filter(s => s !== sec) : [...prev, sec]
    );
  };

  const handleUpdateStatus = async (bookingId, status) => {
    try {
      await api.put(`/bookings/${bookingId}/status`, { status });
      Alert.alert('Updated', `Booking marked as ${status.toUpperCase()}`);
      fetchBookings();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to update booking status');
    }
  };

  const handleSubmit = async () => {
    if (!guestName.trim()) { Alert.alert('Error', 'Guest name is required'); return; }
    if (!guestCount || parseInt(guestCount) < 1) { Alert.alert('Error', 'Guest count must be at least 1'); return; }
    if (!fromDate) { Alert.alert('Error', 'From date is required'); return; }
    if (!fromTime) { Alert.alert('Error', 'From time is required'); return; }

    setSubmitting(true);
    try {
      const data = {
        guestName: guestName.trim(),
        guestPhone: guestPhone.trim(),
        guestCount: parseInt(guestCount),
        tableIds: selectedTableIds,
        sections: selectedSections,
        fromDate,
        toDate: toDate || undefined,
        fromTime,
        toTime: toTime || undefined,
        paymentStatus: parseFloat(paymentAmount) > 0 ? 'paid' : 'pending',
        paymentAmount: parseFloat(paymentAmount) || 0,
        totalAmount: parseFloat(totalAmount) || 0,
        notes: notes.trim()
      };

      await api.post('/bookings', data);
      Alert.alert('Success', 'Booking created! Admin has been notified.');
      resetForm();
      setShowForm(false);
      fetchBookings();
    } catch (error) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to create booking');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setGuestName(''); setGuestPhone(''); setGuestCount('2');
    setSelectedTableIds([]); setSelectedSections([]);
    setToDate(''); setFromTime('19:00'); setToTime('');
    setPaymentAmount(''); setTotalAmount(''); setNotes('');
  };

  const getStatusColor = (status) => {
    const map = { upcoming: '#7C3AED', confirmed: '#10B981', seated: '#0EA5E9', completed: '#6B7280', cancelled: '#EF4444', 'no-show': '#F59E0B' };
    return map[status] || '#6B7280';
  };

  const setQuickDate = (daysAhead) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    setFromDate(d.toISOString().split('T')[0]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Pre-Bookings</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(!showForm)}>
          <Text style={styles.addBtnText}>{showForm ? 'Cancel' : '+ New'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {showForm && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>New Pre-Booking</Text>

            {/* Guest Info */}
            <View style={styles.formRow}>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>Guest Name *</Text>
                <TextInput style={styles.input} value={guestName} onChangeText={setGuestName} placeholder="Guest name" />
              </View>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>Phone</Text>
                <TextInput style={styles.input} value={guestPhone} onChangeText={setGuestPhone} placeholder="Phone" keyboardType="phone-pad" />
              </View>
            </View>

            <View style={styles.formRow}>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>Guest Count *</Text>
                <TextInput style={styles.input} value={guestCount} onChangeText={setGuestCount} placeholder="2" keyboardType="number-pad" />
              </View>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>Total Amount</Text>
                <TextInput style={styles.input} value={totalAmount} onChangeText={setTotalAmount} placeholder="0" keyboardType="number-pad" />
              </View>
            </View>

            {/* Date Selection */}
            <View style={styles.formRow}>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>From Date * (YYYY-MM-DD)</Text>
                <TextInput style={styles.input} value={fromDate} onChangeText={setFromDate} placeholder="2026-07-20" />
              </View>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>To Date (YYYY-MM-DD)</Text>
                <TextInput style={styles.input} value={toDate} onChangeText={setToDate} placeholder="2026-07-20" />
              </View>
            </View>
            <View style={styles.presetRow}>
              <TouchableOpacity style={styles.presetChip} onPress={() => setQuickDate(0)}>
                <Text style={styles.presetText}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.presetChip} onPress={() => setQuickDate(1)}>
                <Text style={styles.presetText}>Tomorrow</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.presetChip} onPress={() => setQuickDate(2)}>
                <Text style={styles.presetText}>In 2 Days</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.presetChip} onPress={() => setToDate(fromDate)}>
                <Text style={styles.presetText}>Same Day</Text>
              </TouchableOpacity>
            </View>

            {/* Time Selection */}
            <View style={[styles.formRow, { marginTop: 10 }]}>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>From Time * (HH:MM)</Text>
                <TextInput style={styles.input} value={fromTime} onChangeText={setFromTime} placeholder="19:00" />
              </View>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>To Time (HH:MM)</Text>
                <TextInput style={styles.input} value={toTime} onChangeText={setToTime} placeholder="21:00" />
              </View>
            </View>

            <Text style={[styles.label, { marginTop: 4, fontSize: 11, color: '#6B7280' }]}>Quick From Time Slots:</Text>
            <View style={styles.presetRow}>
              {['12:00', '13:30', '19:00', '20:00', '21:00', '22:00'].map((t) => (
                <TouchableOpacity key={t} style={[styles.presetChip, fromTime === t && styles.presetChipActive]} onPress={() => setFromTime(t)}>
                  <Text style={[styles.presetText, fromTime === t && styles.presetTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Multi-Section Selection */}
            <Text style={[styles.label, { marginTop: 10 }]}>Sections (tap to select)</Text>
            <View style={styles.chipRow}>
              {sectionsList.map(sec => (
                <TouchableOpacity
                  key={sec}
                  style={[styles.chip, selectedSections.includes(sec) && styles.chipActive]}
                  onPress={() => toggleSectionSelection(sec)}
                >
                  <Text style={[styles.chipText, selectedSections.includes(sec) && styles.chipTextActive]}>{sec}</Text>
                </TouchableOpacity>
              ))}
              {sectionsList.length === 0 && <Text style={styles.mutedText}>No sections available</Text>}
            </View>

            {/* Multi-Table Selection */}
            <Text style={[styles.label, { marginTop: 10 }]}>Tables (tap to select multiple)</Text>
            <View style={styles.chipRow}>
              {tables.filter(t => t.status === 'available').slice(0, 20).map(t => (
                <TouchableOpacity
                  key={t._id}
                  style={[styles.chip, selectedTableIds.includes(t._id) && styles.chipActive]}
                  onPress={() => toggleTableSelection(t._id)}
                >
                  <Text style={[styles.chipText, selectedTableIds.includes(t._id) && styles.chipTextActive]}>
                    T{t.tableNumber} ({t.capacity})
                  </Text>
                </TouchableOpacity>
              ))}
              {tables.filter(t => t.status === 'available').length === 0 && <Text style={styles.mutedText}>No available tables</Text>}
            </View>

            {/* Payment + Notes */}
            <View style={styles.formRow}>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>Advance Payment</Text>
                <TextInput style={styles.input} value={paymentAmount} onChangeText={setPaymentAmount} placeholder="0" keyboardType="number-pad" />
              </View>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>Notes</Text>
                <TextInput style={styles.input} value={notes} onChangeText={setNotes} placeholder="Special requests" />
              </View>
            </View>

            <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={handleSubmit} disabled={submitting}>
              <Text style={styles.submitBtnText}>{submitting ? 'Creating...' : 'Create Booking'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Bookings List */}
        <Text style={styles.sectionTitle}>Today's Bookings</Text>

        {loading ? (
          <ActivityIndicator size="large" color="#7C3AED" />
        ) : bookings.length === 0 ? (
          <View style={styles.emptyState}><Text style={styles.emptyText}>No bookings for today</Text></View>
        ) : (
          bookings.map(booking => (
            <View key={booking._id} style={styles.bookingCard}>
              <View style={styles.bookingHeader}>
                <Text style={styles.guestNameText}>{booking.guestName}</Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(booking.status) + '20', borderColor: getStatusColor(booking.status) }]}>
                  <Text style={[styles.statusText, { color: getStatusColor(booking.status) }]}>{booking.status.toUpperCase()}</Text>
                </View>
              </View>
              <View style={styles.bookingDetails}>
                <Text style={styles.detailText}>Guests: {booking.guestCount}</Text>
                <Text style={styles.detailText}>From: {booking.fromTime} {booking.toTime ? `- ${booking.toTime}` : ''}</Text>
                {booking.tableNumbers ? <Text style={styles.detailText}>Tables: {booking.tableNumbers}</Text> : null}
                {booking.sections && booking.sections.length > 0 ? <Text style={styles.detailText}>Sections: {booking.sections.join(', ')}</Text> : null}
                {booking.guestPhone ? <Text style={styles.detailText}>Phone: {booking.guestPhone}</Text> : null}
                {booking.paymentAmount > 0 && <Text style={[styles.detailText, { color: '#10B981', fontWeight: 'bold' }]}>Advance: Rs.{booking.paymentAmount}</Text>}
                {booking.totalAmount > 0 && <Text style={[styles.detailText, { fontWeight: 'bold' }]}>Total: Rs.{booking.totalAmount}</Text>}
                {booking.notes ? <Text style={[styles.detailText, { fontStyle: 'italic' }]}>Note: {booking.notes}</Text> : null}
              </View>

              {/* Status Action Buttons for Staff */}
              {booking.status !== 'completed' && booking.status !== 'cancelled' && (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
                    onPress={() => handleUpdateStatus(booking._id, 'seated')}
                  >
                    <Text style={styles.actionBtnText}>Seat Guest</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#7C3AED' }]}
                    onPress={() => handleUpdateStatus(booking._id, 'completed')}
                  >
                    <Text style={styles.actionBtnText}>Complete</Text>
                  </TouchableOpacity>
                </View>
              )}

              {booking.createdBy && <Text style={styles.createdBy}>By: {booking.createdBy.name}</Text>}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F3FF' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 2, borderColor: '#111111' },
  backBtn: { backgroundColor: '#F3F4F6', borderWidth: 2, borderColor: '#111111', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  backBtnText: { color: '#111', fontSize: 13, fontWeight: '700' },
  title: { color: '#111', fontSize: 18, fontWeight: '700' },
  addBtn: { backgroundColor: '#7C3AED', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 2, borderColor: '#111111' },
  addBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  content: { padding: 16, paddingBottom: 40 },
  formCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 2, borderColor: '#111111' },
  formTitle: { fontSize: 16, fontWeight: '700', color: '#1F2937', marginBottom: 12 },
  formRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  inputHalf: { flex: 1 },
  label: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginBottom: 4 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: '#111111', borderRadius: 8, padding: 10, fontSize: 14, color: '#1F2937' },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10, marginTop: 4 },
  presetChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1.5, borderColor: '#111111', backgroundColor: '#F3F4F6' },
  presetChipActive: { backgroundColor: '#7C3AED', borderColor: '#111111' },
  presetText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  presetTextActive: { color: '#FFF' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1.5, borderColor: '#111111', backgroundColor: '#F9FAFB' },
  chipActive: { backgroundColor: '#7C3AED', borderColor: '#111111' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  chipTextActive: { color: '#FFF' },
  mutedText: { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' },
  submitBtn: { backgroundColor: '#7C3AED', borderWidth: 2, borderColor: '#111111', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  submitBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1F2937', marginBottom: 12 },
  emptyState: { alignItems: 'center', padding: 40 },
  emptyText: { color: '#9CA3AF', fontSize: 14 },
  bookingCard: { backgroundColor: '#FFF', borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 2, borderColor: '#111111' },
  bookingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  guestNameText: { fontSize: 15, fontWeight: '700', color: '#1F2937' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1 },
  statusText: { fontSize: 10, fontWeight: '700' },
  bookingDetails: { gap: 3 },
  detailText: { fontSize: 13, color: '#4B5563' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 10, borderTopWidth: 1, borderColor: '#F3F4F6', paddingTop: 8 },
  actionBtn: { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center' },
  actionBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  createdBy: { fontSize: 11, color: '#9CA3AF', marginTop: 6 },
});
