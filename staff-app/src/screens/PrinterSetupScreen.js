import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Alert
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  discoverPrinters, getSavedPrinters, savePrinterIps, testPrint
} from '../utils/ThermalPrinter';

export default function PrinterSetupScreen({ onBack }) {
  const [scanning, setScanning] = useState(false);
  const [found, setFound] = useState([]);
  const [kitchenIp, setKitchenIp] = useState('');
  const [receptionIp, setReceptionIp] = useState('');
  const [kitchenName, setKitchenName] = useState('Kitchen Printer');
  const [receptionName, setReceptionName] = useState('Reception Printer');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState('');
  const [subnetPrefix, setSubnetPrefix] = useState('');
  const [scanProgress, setScanProgress] = useState('');

  useEffect(() => {
    loadSaved();
    getSubnet();
  }, []);

  const getSubnet = async () => {
    const info = await NetInfo.fetch();
    const ip = info?.details?.ipAddress;
    if (ip) {
      const parts = ip.split('.');
      if (parts.length === 4) {
        setSubnetPrefix(`${parts[0]}.${parts[1]}.${parts[2]}`);
        setScanProgress(`Network: ${ip}`);
      }
    }
  };

  const loadSaved = async () => {
    const { kitchenIp: k, receptionIp: r, kitchenName: kn, receptionName: rn } = await getSavedPrinters();
    setKitchenIp(k);
    setReceptionIp(r);
    if (kn) setKitchenName(kn);
    if (rn) setReceptionName(rn);
  };

  const startScan = () => {
    if (!subnetPrefix) {
      Alert.alert('WiFi Required', 'Please connect to restaurant WiFi first.');
      return;
    }
    setFound([]);
    setScanning(true);
    setScanProgress(`Scanning ${subnetPrefix}.1 – ${subnetPrefix}.254 for printers...`);

    discoverPrinters(
      subnetPrefix,
      (ip) => {
        // onFound callback
        setFound(prev => [...prev, ip]);
        setScanProgress(`Found: ${ip} (port 9100)`);
      },
      (allFound) => {
        // onDone callback
        setScanning(false);
        if (allFound.length === 0) {
          setScanProgress('No printers found. Make sure printer is ON and on same WiFi.');
        } else {
          setScanProgress(`Scan complete. ${allFound.length} printer(s) found.`);
        }
      }
    );
  };

  const assignPrinter = (ip, role) => {
    if (role === 'kitchen') {
      setKitchenIp(ip);
    } else {
      setReceptionIp(ip);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await savePrinterIps({
        kitchenIp: kitchenIp.trim(),
        receptionIp: receptionIp.trim(),
        kitchenName: kitchenName.trim(),
        receptionName: receptionName.trim(),
      });
      Alert.alert('Saved!', 'Printer settings saved. KOTs will now auto-print via WiFi.', [{ text: 'OK', onPress: onBack }]);
    } catch (e) {
      Alert.alert('Error', 'Could not save printer settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (ip, label) => {
    if (!ip) { Alert.alert('No IP', `Set a ${label} printer IP first.`); return; }
    setTesting(label);
    try {
      await testPrint(ip.trim());
      Alert.alert('Test OK!', `Test page printed on ${label} printer (${ip}).`);
    } catch (err) {
      Alert.alert('Print Failed', err.message);
    } finally {
      setTesting('');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Printer Setup</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Info */}
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          Both your phone and thermal printer must be on the same WiFi network.
          Tap "Scan" to auto-discover printers, then assign Kitchen / Reception roles.
        </Text>
      </View>

      {/* Scan Button */}
      <TouchableOpacity
        style={[styles.scanBtn, scanning && styles.scanBtnDisabled]}
        onPress={startScan}
        disabled={scanning}
      >
        {scanning
          ? <ActivityIndicator color="#FFFFFF" />
          : <Text style={styles.scanBtnText}>Scan WiFi for Printers</Text>
        }
      </TouchableOpacity>

      {scanProgress ? (
        <Text style={styles.scanStatus}>{scanProgress}</Text>
      ) : null}

      {/* Discovered Printers */}
      {found.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Discovered Printers (Port 9100)</Text>
          {found.map(ip => (
            <View key={ip} style={styles.printerRow}>
              <Text style={styles.printerIp}>{ip}</Text>
              <TouchableOpacity style={styles.assignBtn} onPress={() => assignPrinter(ip, 'kitchen')}>
                <Text style={styles.assignBtnText}>Kitchen</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.assignBtn, { backgroundColor: '#059669' }]} onPress={() => assignPrinter(ip, 'reception')}>
                <Text style={styles.assignBtnText}>Reception</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Kitchen Printer */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Kitchen Printer (KOT Slips)</Text>
        <TextInput
          style={[styles.ipInput, { marginBottom: 8 }]}
          value={kitchenName}
          onChangeText={setKitchenName}
          placeholder="Printer name (e.g. Kitchen - RTP81)"
          placeholderTextColor="#9CA3AF"
        />
        <View style={styles.ipRow}>
          <TextInput
            style={styles.ipInput}
            value={kitchenIp}
            onChangeText={setKitchenIp}
            placeholder="e.g. 192.168.1.100"
            keyboardType="decimal-pad"
            placeholderTextColor="#9CA3AF"
          />
          <TouchableOpacity
            style={[styles.testBtn, testing === 'Kitchen' && styles.testBtnDisabled]}
            onPress={() => handleTest(kitchenIp, 'Kitchen')}
            disabled={!!testing}
          >
            {testing === 'Kitchen'
              ? <ActivityIndicator size="small" color="#7C3AED" />
              : <Text style={styles.testBtnText}>Test Print</Text>
            }
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>Port 9100 — ESC/POS 80mm thermal</Text>
      </View>

      {/* Reception Printer */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Reception Printer (Customer Bill)</Text>
        <TextInput
          style={[styles.ipInput, { marginBottom: 8 }]}
          value={receptionName}
          onChangeText={setReceptionName}
          placeholder="Printer name (e.g. Reception - RTP81)"
          placeholderTextColor="#9CA3AF"
        />
        <View style={styles.ipRow}>
          <TextInput
            style={styles.ipInput}
            value={receptionIp}
            onChangeText={setReceptionIp}
            placeholder="e.g. 192.168.1.101"
            keyboardType="decimal-pad"
            placeholderTextColor="#9CA3AF"
          />
          <TouchableOpacity
            style={[styles.testBtn, testing === 'Reception' && styles.testBtnDisabled]}
            onPress={() => handleTest(receptionIp, 'Reception')}
            disabled={!!testing}
          >
            {testing === 'Reception'
              ? <ActivityIndicator size="small" color="#7C3AED" />
              : <Text style={styles.testBtnText}>Test Print</Text>
            }
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>Port 9100 — ESC/POS 80mm thermal</Text>
      </View>

      {/* Save Button */}
      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving
          ? <ActivityIndicator color="#FFFFFF" />
          : <Text style={styles.saveBtnText}>Save Printer Settings</Text>
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

  scanBtn: {
    marginHorizontal: 16,
    backgroundColor: '#7C3AED',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#111111',
    padding: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  scanBtnDisabled: { backgroundColor: '#9CA3AF' },
  scanBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },

  scanStatus: {
    marginHorizontal: 16,
    marginBottom: 16,
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
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  printerIp: {
    flex: 1,
    fontWeight: '600',
    fontSize: 14,
    color: '#111111',
  },
  assignBtn: {
    backgroundColor: '#7C3AED',
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  assignBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },

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
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#EDE9FE',
  },
  testBtnDisabled: { opacity: 0.5 },
  testBtnText: { color: '#7C3AED', fontWeight: '700', fontSize: 13 },

  hint: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 6,
    fontStyle: 'italic',
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
