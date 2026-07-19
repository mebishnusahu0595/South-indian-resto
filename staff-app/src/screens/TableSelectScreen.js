import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';

export default function TableSelectScreen({ api, staffName, onNext, onLogout, onOpenHost }) {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [assignedTables, setAssignedTables] = useState([]);
  const [submittingAttendance, setSubmittingAttendance] = useState(false);
  const [performance, setPerformance] = useState(null);
  const [loadingPerformance, setLoadingPerformance] = useState(false);
  
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    fetchTables();
    fetchAttendanceToday();
    fetchMeProfile();
  }, []);

  const fetchTables = async () => {
    try {
      const res = await api.get('/tables');
      setTables(res.data || []);
    } catch (error) {
      console.error('Error fetching tables in mobile app:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAttendanceToday = async () => {
    try {
      const res = await api.get('/employees/attendance/today');
      setAttendance(res.data);
    } catch (error) {
      console.log('Error fetching today attendance:', error);
    }
  };

  const fetchPerformance = async (empId) => {
    setLoadingPerformance(true);
    try {
      const res = await api.get(`/employees/${empId}/performance`);
      setPerformance(res.data);
    } catch (error) {
      console.log('Error fetching performance stats:', error);
    } finally {
      setLoadingPerformance(false);
    }
  };

  const fetchMeProfile = async () => {
    try {
      const res = await api.get('/auth/me');
      if (res.data) {
        if (res.data.assignedTables && res.data.assignedTables.length > 0) {
          setAssignedTables(res.data.assignedTables);
        }
        if (res.data._id || res.data.id) {
          fetchPerformance(res.data._id || res.data.id);
        }
      }
    } catch (error) {
      console.log('Error fetching profile:', error);
    }
  };

  const handleMarkAttendance = async (action) => {
    setSubmittingAttendance(true);
    try {
      const res = await api.post('/employees/attendance/self', { action });
      setAttendance(res.data);
      alert(`Successfully ${action === 'check-in' ? 'checked in' : 'checked out'}!`);
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to mark attendance');
    } finally {
      setSubmittingAttendance(false);
    }
  };

  const handleNext = () => {
    onNext(selectedTable, phone.trim(), name.trim());
  };

  // Determine which tables to display
  // If assignedTables exist -> only show assigned tables
  // Otherwise -> show all tables
  const hasAssigned = assignedTables && assignedTables.length > 0;
  const filteredTables = hasAssigned
    ? tables.filter(t => assignedTables.some(at => (at._id || at) === t._id))
    : tables;

  // Group displayed tables by section
  const sortedTables = [...filteredTables].sort((a, b) => a.tableNumber - b.tableNumber);
  const groupedSections = sortedTables.reduce((acc, table) => {
    const sec = table.section || 'Main Hall';
    if (!acc[sec]) acc[sec] = [];
    acc[sec].push(table);
    return acc;
  }, {});

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1 }} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.welcome}>Hello, {staffName} 👋</Text>
            <Text style={styles.subWelcome}>
              {hasAssigned ? 'Assigned Tables' : 'Select a table to start'}
            </Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
            <Text style={styles.logoutBtnText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* Host / Pre-booking button */}
        <TouchableOpacity style={styles.hostBtn} onPress={onOpenHost}>
          <Text style={styles.hostBtnText}>Pre-Bookings (Host)</Text>
        </TouchableOpacity>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Attendance card */}
          <View style={styles.attendanceCard}>
            <Text style={styles.cardTitle}>⏱️ Shift Attendance</Text>
            {attendance ? (
              <View>
                <Text style={styles.attendanceStatus}>
                  Status: <Text style={{ color: '#10B981', fontWeight: 'bold' }}>{attendance.status.toUpperCase()}</Text>
                </Text>
                {attendance.checkIn ? <Text style={styles.attendanceTime}>📥 Checked In: {attendance.checkIn}</Text> : null}
                {attendance.checkOut ? (
                  <Text style={styles.attendanceTime}>📤 Checked Out: {attendance.checkOut}</Text>
                ) : (
                  <TouchableOpacity 
                    style={[styles.attendanceBtn, { backgroundColor: '#EF4444', marginTop: 10 }]}
                    onPress={() => handleMarkAttendance('check-out')}
                    disabled={submittingAttendance}
                  >
                    <Text style={styles.attendanceBtnText}>
                      {submittingAttendance ? 'Saving...' : 'Check Out'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View>
                <Text style={styles.attendanceStatus}>Status: Not Checked-In Today</Text>
                <TouchableOpacity 
                  style={[styles.attendanceBtn, { backgroundColor: '#10B981', marginTop: 10 }]}
                  onPress={() => handleMarkAttendance('check-in')}
                  disabled={submittingAttendance}
                >
                  <Text style={styles.attendanceBtnText}>
                    {submittingAttendance ? 'Saving...' : 'Check In Now'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Performance Statistics Card */}
          <View style={styles.performanceCard}>
            <Text style={styles.cardTitle}>📊 My Performance Stats</Text>
            {loadingPerformance ? (
              <ActivityIndicator size="small" color="#7C3AED" />
            ) : performance ? (
              <View style={styles.performanceStatsGrid}>
                <View style={styles.performanceStatBox}>
                  <Text style={styles.performanceStatVal}>₹{performance.totalSales || 0}</Text>
                  <Text style={styles.performanceStatLabel}>Sales Value</Text>
                </View>
                <View style={styles.performanceStatBox}>
                  <Text style={styles.performanceStatVal}>{performance.totalOrders || 0}</Text>
                  <Text style={styles.performanceStatLabel}>Total Sent</Text>
                </View>
                <View style={styles.performanceStatBox}>
                  <Text style={[styles.performanceStatVal, { color: '#10B981' }]}>{performance.servedOrders || 0}</Text>
                  <Text style={styles.performanceStatLabel}>Done</Text>
                </View>
                <View style={styles.performanceStatBox}>
                  <Text style={[styles.performanceStatVal, { color: '#D97706' }]}>{performance.pendingOrders || 0}</Text>
                  <Text style={styles.performanceStatLabel}>Pending</Text>
                </View>
                <View style={styles.performanceStatBox}>
                  <Text style={[styles.performanceStatVal, { color: '#EF4444' }]}>{performance.cancelledOrders || 0}</Text>
                  <Text style={styles.performanceStatLabel}>Cancelled</Text>
                </View>
              </View>
            ) : (
              <Text style={{ fontSize: 13, color: '#666' }}>No statistics loaded.</Text>
            )}
          </View>

          {/* Customer Details Form */}
          <View style={styles.formCard}>
            <Text style={styles.cardTitle}>Customer Information (Optional)</Text>
            
            <Text style={styles.label}>Customer Phone Number</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={(val) => setPhone(val.replace(/\D/g, '').slice(0, 10))}
              placeholder="10-digit mobile number"
              keyboardType="phone-pad"
            />

            <Text style={styles.label}>Customer Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Enter customer name"
            />
          </View>

          {/* Table List Section - Grouped by Section */}
          <Text style={styles.mainTitle}>
            {hasAssigned ? '📋 Your Assigned Tables' : '🍽️ All Restaurant Tables'}
          </Text>
          
          {loading ? (
            <ActivityIndicator size="large" color="#7C3AED" style={{ marginVertical: 30 }} />
          ) : Object.keys(groupedSections).length === 0 ? (
            <Text style={styles.noTables}>No tables found</Text>
          ) : (
            Object.keys(groupedSections).map((sectionName) => (
              <View key={sectionName} style={styles.sectionBlock}>
                <Text style={styles.sectionHeader}>📍 {sectionName}</Text>
                <View style={styles.grid}>
                  {groupedSections[sectionName].map((table) => {
                    const isSelected = selectedTable?._id === table._id;
                    const isOccupied = table.status !== 'available';

                    return (
                      <TouchableOpacity
                        key={table._id}
                        style={[
                          styles.tableCard,
                          isOccupied && styles.occupiedCard,
                          isSelected && styles.selectedCard
                        ]}
                        disabled={isOccupied}
                        onPress={() => setSelectedTable(isSelected ? null : table)}
                      >
                        <Text style={[
                          styles.tableNumberText,
                          isSelected && styles.selectedText,
                          isOccupied && styles.occupiedText
                        ]}>
                          T-{table.tableNumber}
                        </Text>
                        <Text style={[
                          styles.tableCapText,
                          isSelected && styles.selectedSubtext,
                          isOccupied && styles.occupiedSubtext
                        ]}>
                          {table.capacity} Seats
                        </Text>
                        {isOccupied && (
                          <Text style={styles.occupiedLabel}>Occupied</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))
          )}
        </ScrollView>

        {/* Footer Navigation */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.nextBtn, !selectedTable && styles.nextBtnDisabled]}
            onPress={handleNext}
            disabled={!selectedTable}
          >
            <Text style={styles.nextBtnText}>
              {selectedTable ? `Continue with Table ${selectedTable.tableNumber}` : 'Select a Table to Continue'}
            </Text>
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
  welcome: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111111',
  },
  subWelcome: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  logoutBtn: {
    backgroundColor: '#F3F4F6',
    borderWidth: 2,
    borderColor: '#111111',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  logoutBtnText: {
    fontWeight: '700',
    fontSize: 13,
    color: '#EF4444',
  },
  hostBtn: {
    backgroundColor: '#7C3AED',
    marginHorizontal: 16,
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  hostBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  content: {
    padding: 16,
    paddingBottom: 120,
  },
  attendanceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#111111',
    marginBottom: 16,
    shadowColor: '#111111',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  attendanceStatus: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  attendanceTime: {
    fontSize: 14,
    color: '#4B5563',
    marginTop: 4,
  },
  attendanceBtn: {
    borderWidth: 2,
    borderColor: '#111111',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    shadowColor: '#111111',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  attendanceBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#111111',
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#111111',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
    color: '#4B5563',
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#111111',
    borderRadius: 6,
    padding: 10,
    fontSize: 15,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  mainTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#111111',
  },
  sectionBlock: {
    marginBottom: 20,
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: '#6B21A8',
    backgroundColor: '#F3E8FF',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  noTables: {
    color: '#6B7280',
    textAlign: 'center',
    marginVertical: 20,
    width: '100%',
  },
  tableCard: {
    width: '47%',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#111111',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#111111',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  selectedCard: {
    backgroundColor: '#7C3AED',
  },
  occupiedCard: {
    backgroundColor: '#E5E7EB',
    borderColor: '#9CA3AF',
    shadowOpacity: 0,
    elevation: 0,
  },
  tableNumberText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111111',
  },
  tableCapText: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  selectedText: {
    color: '#FFFFFF',
  },
  selectedSubtext: {
    color: '#DDD6FE',
  },
  occupiedText: {
    color: '#9CA3AF',
  },
  occupiedSubtext: {
    color: '#9CA3AF',
  },
  occupiedLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#EF4444',
    marginTop: 6,
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
  nextBtn: {
    backgroundColor: '#7C3AED',
    borderWidth: 2,
    borderColor: '#111111',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  nextBtnDisabled: {
    backgroundColor: '#9CA3AF',
  },
  nextBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  performanceCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#111111',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#111111',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  performanceStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  performanceStatBox: {
    width: '30%',
    backgroundColor: '#EDE9FE',
    borderWidth: 1.5,
    borderColor: '#111111',
    borderRadius: 6,
    padding: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  performanceStatVal: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#7C3AED',
  },
  performanceStatLabel: {
    fontSize: 9,
    color: '#4B5563',
    marginTop: 2,
    textAlign: 'center',
  },
});
