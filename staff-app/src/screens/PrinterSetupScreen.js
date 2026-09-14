import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Alert, Platform
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { discoverPrinters, testPrint } from '../utils/ThermalPrinter';

const CONNECTION_LABELS = {
  usb: 'USB cable on PC',
  wired: 'Serial/parallel cable on PC',
  network: 'LAN / WiFi',
  other: 'Installed on PC',
};
const printerKey = p => (p.type === 'system' ? `system:${p.agentId}:${p.systemName}` : `tcp:${p.host}:${p.port || 9100}`);
const isIPv4 = value => /^\d{1,3}(\.\d{1,3}){3}$/.test(value);

async function getDeviceId() {
  let id = await AsyncStorage.getItem('kea_device_id');
  if (!id) {
    id = `app-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    await AsyncStorage.setItem('kea_device_id', id);
  }
  return id;
}

// One central list for the whole restaurant: Superadmin ticks which printers print KOT and Bill.
// Printers come from this phone's WiFi scan, the restaurant PC print agent and manual IPs.
export default function PrinterSetupScreen({ api, staffName, onBack }) {
  const [central, setCentral] = useState(null);
  const [registry, setRegistry] = useState([]);
  const [devices, setDevices] = useState([]);
  const [phoneFound, setPhoneFound] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('');
  const [manualIp, setManualIp] = useState('');
  const [saving, setSaving] = useState(false);
  const [testingKey, setTestingKey] = useState('');
  const [loadError, setLoadError] = useState('');
  const cancelScanRef = useRef(null);
  const mountedRef = useRef(false);

  const loadDevices = () => api.get('/settings/printer-devices')
    .then(res => { if (mountedRef.current) setDevices(res.data.devices || []); })
    .catch(() => {});

  const loadServer = async () => {
    try {
      const [printersRes, devicesRes] = await Promise.all([
        api.get('/settings/printers'),
        api.get('/settings/printer-devices'),
      ]);
      if (!mountedRef.current) return;
      setCentral(printersRes.data);
      setRegistry(printersRes.data.printers || []);
      setDevices(devicesRes.data.devices || []);
      setLoadError('');
    } catch (error) {
      if (mountedRef.current) setLoadError(error.response?.data?.message || 'Could not load the printer selection from the server.');
    }
  };

  const reportScan = async (ips) => {
    try {
      await api.post('/settings/printer-devices/report', {
        deviceId: await getDeviceId(),
        deviceName: `${staffName || 'Staff'} (${Platform.OS} phone)`,
        printers: ips.map(host => ({ type: 'tcp', host, port: 9100, connection: 'network', name: `Network printer ${host}` })),
      });
      // New printers may have been auto-ticked on the server; refresh unless the user is editing.
      loadDevices();
    } catch (_) {
      // Only feeds the central list; this screen already shows the result.
    }
  };

  // Scans the /24 of this phone's current WiFi address, read fresh each time (e.g. after joining WiFi).
  const startScan = async () => {
    const info = await NetInfo.fetch();
    if (!mountedRef.current) return;
    const parts = String(info?.details?.ipAddress || '').split('.');
    if (!(info?.type === 'wifi' || info?.type === 'ethernet') || parts.length !== 4) {
      setScanStatus('Connect this phone to the restaurant WiFi, then tap Scan WiFi.');
      return;
    }
    const prefix = parts.slice(0, 3).join('.');

    if (cancelScanRef.current) cancelScanRef.current();
    setPhoneFound([]);
    setScanning(true);
    setScanStatus(`Scanning ${prefix}.1 – ${prefix}.254 for printers…`);
    cancelScanRef.current = discoverPrinters(
      prefix,
      ip => setPhoneFound(prev => (prev.includes(ip) ? prev : [...prev, ip])),
      (all) => {
        cancelScanRef.current = null;
        setScanning(false);
        setScanStatus(all.length
          ? `Scan complete: ${all.length} printer(s) found on ${prefix}.x`
          : `No printer answered on port 9100 in ${prefix}.x. Check the printer is ON and on this WiFi/LAN, then scan again.`);
        reportScan(all);
      },
      (checked, total) => setScanStatus(`Scanning ${prefix}.x … ${checked}/${total} checked`)
    );
  };

  useEffect(() => {
    mountedRef.current = true;
    loadServer();
    startScan();
    return () => {
      mountedRef.current = false;
      if (cancelScanRef.current) cancelScanRef.current();
    };
  }, []);

  const handleScanPC = async () => {
    try {
      const res = await api.post('/settings/printer-devices/scan');
      if (!res.data.agentsOnline) {
        Alert.alert('PC print agent offline', 'Start the Kea print agent on the restaurant PC to detect its USB and LAN printers.');
        return;
      }
      Alert.alert('Scanning from PC', 'The restaurant PC is scanning. This list refreshes in a few seconds.');
      setTimeout(loadDevices, 10000);
    } catch (error) {
      Alert.alert('Scan failed', error.response?.data?.message || 'Could not reach the server.');
    }
  };

  const rows = useMemo(() => {
    const byKey = new Map();
    const add = (printer, source) => {
      const key = printerKey(printer);
      const row = byKey.get(key) || { ...printer, key, sources: [] };
      if (!row.sources.includes(source)) row.sources.push(source);
      byKey.set(key, row);
    };
    registry.forEach(printer => add(printer, 'Saved'));
    devices.forEach(device => (device.printers || []).forEach(printer => add(
      printer.type === 'system'
        ? { ...printer, agentId: device.id, name: `${printer.name || printer.systemName} (${device.name})` }
        : { ...printer, name: printer.name || `Network printer ${printer.host}` },
      device.kind === 'agent' ? `PC: ${device.name}` : 'Phone scan'
    )));
    phoneFound.forEach(host => add({ type: 'tcp', host, port: 9100, connection: 'network', name: `Network printer ${host}` }, 'This phone'));
    return Array.from(byKey.values());
  }, [registry, devices, phoneFound]);

  const toggleJob = (row, job) => {
    setRegistry(prev => {
      const existing = prev.find(printer => printerKey(printer) === row.key);
      if (existing) {
        // Unticked printers stay listed (both off) so auto-select never ticks them again.
        return prev.map(printer => (printer === existing ? { ...existing, [job]: !existing[job] } : printer));
      }
      const { key, sources, status, ...printer } = row;
      return [...prev, { id: `printer-${Date.now()}`, role: 'all', copies: 1, enabled: true, ...printer, kot: job === 'kot', bill: job === 'bill' }];
    });
  };

  const addManualIp = () => {
    const ip = manualIp.trim();
    if (!isIPv4(ip)) {
      Alert.alert('Invalid IP', 'Enter an IP address like 192.168.1.100');
      return;
    }
    setPhoneFound(prev => (prev.includes(ip) ? prev : [...prev, ip]));
    setManualIp('');
  };

  const handleTest = async (row) => {
    setTestingKey(row.key);
    try {
      await testPrint(row.host, row.port || 9100);
      Alert.alert('Printed', `Test slip printed on ${row.name} (${row.host}).`);
    } catch (error) {
      Alert.alert('Print Failed', error.message || 'Make sure the printer is ON and on the same WiFi/LAN.');
    } finally {
      setTestingKey('');
    }
  };

  const handleSave = async () => {
    if (!central) return;
    setSaving(true);
    try {
      await api.put('/settings/printers', {
        printers: registry,
        printerPort: central.printerPort || 9100,
        printerEnabled: central.printerEnabled !== false,
      });
      Alert.alert('Saved', 'KOT and Bill printer selection saved for the whole restaurant.');
      loadServer();
    } catch (error) {
      Alert.alert('Not saved', error.response?.status === 403
        ? 'Only Superadmin can change which printers print KOT and Bill.'
        : (error.response?.data?.message || 'Could not save the printer selection.'));
    } finally {
      setSaving(false);
    }
  };

  const agentsOnline = central?.agentsOnline || 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Printer Setup</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Who prints right now */}
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          {agentsOnline > 0
            ? `🟢 Restaurant PC print agent online (${agentsOnline}). KOT and Bill print automatically on the printers ticked below.`
            : '🔴 Restaurant PC print agent offline. This phone prints KOTs itself over WiFi to the LAN printers ticked for KOT.'}
        </Text>
        <Text style={[styles.infoText, { marginTop: 6 }]}>
          New printers are ticked for KOT + Bill automatically. Untick and Save to change (Superadmin only).
        </Text>
      </View>

      {loadError ? <Text style={[styles.scanStatus, { color: '#DC2626' }]}>{loadError}</Text> : null}

      {/* Scan buttons */}
      <View style={styles.scanRow}>
        <TouchableOpacity
          style={[styles.scanBtn, scanning && styles.scanBtnDisabled]}
          onPress={() => startScan()}
          disabled={scanning}
        >
          {scanning
            ? <ActivityIndicator color="#FFFFFF" />
            : <Text style={styles.scanBtnText}>Scan WiFi (phone)</Text>
          }
        </TouchableOpacity>
        <TouchableOpacity style={[styles.scanBtn, { backgroundColor: '#2563EB' }]} onPress={handleScanPC}>
          <Text style={styles.scanBtnText}>Scan from PC</Text>
        </TouchableOpacity>
      </View>

      {scanStatus ? <Text style={styles.scanStatus}>{scanStatus}</Text> : null}

      {/* All printers */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Printers ({rows.length})</Text>
        {rows.length === 0 ? (
          <Text style={styles.hint}>No printers yet. Keep the printer ON and connected to the same WiFi/LAN router, then scan.</Text>
        ) : rows.map((row) => {
          const selected = registry.find(printer => printerKey(printer) === row.key);
          return (
            <View key={row.key} style={styles.printerRow}>
              <Text style={styles.printerName}>{row.name}</Text>
              <Text style={styles.hint}>
                {CONNECTION_LABELS[row.connection] || 'LAN / WiFi'}
                {row.host ? ` · ${row.host}` : ''}
                {` · ${row.sources.join(', ')}`}
              </Text>
              <View style={styles.rowActions}>
                <TouchableOpacity style={[styles.jobBtn, selected?.kot && styles.jobBtnOn]} onPress={() => toggleJob(row, 'kot')}>
                  <Text style={[styles.jobBtnText, selected?.kot && styles.jobBtnTextOn]}>{selected?.kot ? '✓ KOT' : 'KOT'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.jobBtn, selected?.bill && styles.jobBtnOn]} onPress={() => toggleJob(row, 'bill')}>
                  <Text style={[styles.jobBtnText, selected?.bill && styles.jobBtnTextOn]}>{selected?.bill ? '✓ Bill' : 'Bill'}</Text>
                </TouchableOpacity>
                {row.type !== 'system' && (
                  <TouchableOpacity
                    style={[styles.testBtn, !!testingKey && styles.testBtnDisabled]}
                    onPress={() => handleTest(row)}
                    disabled={!!testingKey}
                  >
                    {testingKey === row.key
                      ? <ActivityIndicator size="small" color="#7C3AED" />
                      : <Text style={styles.testBtnText}>Test Print</Text>
                    }
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* Manual IP, only if a printer does not answer the scan */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Printer not listed? Add its IP</Text>
        <View style={styles.ipRow}>
          <TextInput
            style={styles.ipInput}
            value={manualIp}
            onChangeText={setManualIp}
            placeholder="e.g. 192.168.1.100"
            keyboardType="decimal-pad"
            placeholderTextColor="#9CA3AF"
          />
          <TouchableOpacity style={styles.testBtn} onPress={addManualIp}>
            <Text style={styles.testBtnText}>Add</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>Port is detected automatically (9100). USB printers on the PC appear via "Scan from PC".</Text>
      </View>

      {/* Save */}
      <TouchableOpacity
        style={[styles.saveBtn, (saving || !central) && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving || !central}
      >
        {saving
          ? <ActivityIndicator color="#FFFFFF" />
          : <Text style={styles.saveBtnText}>Save KOT / Bill Printers</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F3FF' },
  content: { paddingBottom: 40 },
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
  backBtnText: { fontWeight: '700', fontSize: 13 },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },

  infoBox: {
    margin: 16,
    backgroundColor: '#EDE9FE',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#7C3AED',
    padding: 14,
  },
  infoText: { color: '#5B21B6', fontSize: 13, lineHeight: 20 },

  scanRow: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  scanBtn: {
    flex: 1,
    backgroundColor: '#7C3AED',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#111111',
    padding: 14,
    alignItems: 'center',
  },
  scanBtnDisabled: { backgroundColor: '#9CA3AF' },
  scanBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },

  scanStatus: {
    marginHorizontal: 16,
    marginBottom: 8,
    color: '#6B7280',
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
  },

  card: {
    margin: 16,
    marginBottom: 0,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#111111',
    borderRadius: 10,
    padding: 14,
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: 14,
    color: '#7C3AED',
    marginBottom: 10,
  },
  printerRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#F3F4F6',
  },
  printerName: {
    fontWeight: '700',
    fontSize: 14,
    color: '#111111',
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  jobBtn: {
    borderWidth: 2,
    borderColor: '#7C3AED',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
  },
  jobBtnOn: { backgroundColor: '#7C3AED' },
  jobBtnText: { color: '#7C3AED', fontWeight: '800', fontSize: 13 },
  jobBtnTextOn: { color: '#FFFFFF' },

  ipRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  ipInput: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#111111',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    backgroundColor: '#F9FAFB',
    color: '#111111',
  },
  testBtn: {
    borderWidth: 2,
    borderColor: '#7C3AED',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#EDE9FE',
  },
  testBtnDisabled: { opacity: 0.5 },
  testBtnText: { color: '#7C3AED', fontWeight: '700', fontSize: 13 },

  hint: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 4,
  },

  saveBtn: {
    margin: 16,
    marginTop: 20,
    backgroundColor: '#059669',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#111111',
    padding: 16,
    alignItems: 'center',
  },
  saveBtnDisabled: { backgroundColor: '#9CA3AF' },
  saveBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
});
