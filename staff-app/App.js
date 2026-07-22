import React, { useState, useEffect, Component } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, LogBox, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import io from 'socket.io-client';
import axios from 'axios';

// Suppress non-critical warnings
LogBox.ignoreLogs(['Possible Unhandled Promise', 'Setting a timer']);

// Import Screens
import LoginScreen from './src/screens/LoginScreen';
import TableSelectScreen from './src/screens/TableSelectScreen';
import MenuScreen from './src/screens/MenuScreen';
import CartScreen from './src/screens/CartScreen';
import HostScreen from './src/screens/HostScreen';
import RatingScreen from './src/screens/RatingScreen';
import StaffHistoryScreen from './src/screens/StaffHistoryScreen';
import PrinterSetupScreen from './src/screens/PrinterSetupScreen';

// ─── Error Boundary ────────────────────────────────────────
class ErrorBoundary extends Component {
  state = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={ebStyles.container}>
          <Text style={ebStyles.title}>Something went wrong</Text>
          <Text style={ebStyles.message}>{this.state.error?.message || 'Unknown error'}</Text>
          <ScrollView style={ebStyles.detailBox}>
            <Text style={ebStyles.detail}>{this.state.errorInfo?.componentStack || ''}</Text>
          </ScrollView>
          <TouchableOpacity
            style={ebStyles.retryBtn}
            onPress={() => this.setState({ hasError: false, error: null, errorInfo: null })}
          >
            <Text style={ebStyles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const ebStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: '700', color: '#DC2626', marginBottom: 8 },
  message: { fontSize: 14, color: '#7F1D1D', marginBottom: 16, textAlign: 'center' },
  detailBox: { maxHeight: 200, width: '100%', backgroundColor: '#FFF', borderRadius: 8, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#FECACA' },
  detail: { fontSize: 11, color: '#6B7280', fontFamily: 'monospace' },
  retryBtn: { backgroundColor: '#7C3AED', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 8 },
  retryText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
});

// ─── Main App ──────────────────────────────────────────────
function MainApp() {
  const [activeScreen, setActiveScreen] = useState('login');
  const [serverUrl, setServerUrl] = useState('https://keabythepool.com');
  const [token, setToken] = useState(null);
  const [staffName, setStaffName] = useState('Staff');
  const [isInitializing, setIsInitializing] = useState(true);

  // Socket state
  const [socket, setSocket] = useState(null);

  // Shared order state
  const [selectedTable, setSelectedTable] = useState(null);
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [cart, setCart] = useState([]);
  const [instructions, setInstructions] = useState('');
  const [ratingOrder, setRatingOrder] = useState(null);
  const [appConfig, setAppConfig] = useState(null);
  const [lastError, setLastError] = useState('');

  // 1. Restore persistent login session from AsyncStorage on startup
  useEffect(() => {
    restoreSession();
  }, []);

  const restoreSession = async () => {
    try {
      const savedToken = await AsyncStorage.getItem('staff_token');
      const savedName = await AsyncStorage.getItem('staff_name');
      const savedUrl = await AsyncStorage.getItem('server_url') || 'https://keabythepool.com';

      if (savedToken) {
        setToken(savedToken);
        setStaffName(savedName || 'Staff');
        setServerUrl(savedUrl);
        setActiveScreen('table-select');
        fetchAppConfig(savedUrl, savedToken);
      }
    } catch (e) {
      console.log('Error restoring session:', e);
    } finally {
      setIsInitializing(false);
    }
  };

  // 2. Initialize WebSocket when logged in
  useEffect(() => {
    if (token && serverUrl) {
      const targetUrl = serverUrl.replace(/\/+$/, '');
      const newSocket = io(targetUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true
      });
      setSocket(newSocket);

      return () => {
        newSocket.disconnect();
      };
    }
  }, [token, serverUrl]);

  const fetchAppConfig = async (url, authToken) => {
    try {
      const res = await axios.get(`${url}/api/settings/app-config`, {
        headers: { Authorization: `Bearer ${authToken}` },
        timeout: 5000,
      });
      setAppConfig(res.data || {});
    } catch (err) {
      console.log('[AppConfig] Could not fetch:', err.message);
    }
  };

  const getApi = () => {
    const instance = axios.create({
      baseURL: `${serverUrl}/api`,
      timeout: 12000,
    });
    if (token) {
      instance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    instance.interceptors.response.use(
      (response) => {
        setLastError('');
        return response;
      },
      (error) => {
        const msg = error.response?.data?.message || error.message || 'Network error';
        const status = error.response?.status;
        setLastError(`[${status || 'NET'}] ${msg}`);
        if (status === 401) {
          handleLogout();
        }
        return Promise.reject(error);
      }
    );
    return instance;
  };

  const handleLogin = async (jwtToken, name, url) => {
    setToken(jwtToken);
    setStaffName(name);
    setServerUrl(url);
    setActiveScreen('table-select');
    fetchAppConfig(url, jwtToken);

    // Save session to AsyncStorage
    try {
      await AsyncStorage.setItem('staff_token', jwtToken);
      await AsyncStorage.setItem('staff_name', name);
      await AsyncStorage.setItem('server_url', url);
    } catch (e) {
      console.log('Error saving session:', e);
    }
  };

  const handleLogout = async () => {
    setToken(null);
    setCart([]);
    setSelectedTable(null);
    setCustomerPhone('');
    setCustomerName('');
    setInstructions('');
    setRatingOrder(null);
    setAppConfig(null);
    setLastError('');
    setActiveScreen('login');

    try {
      await AsyncStorage.removeItem('staff_token');
      await AsyncStorage.removeItem('staff_name');
    } catch (e) {
      console.log('Error clearing session:', e);
    }
  };

  const resetOrder = (completedOrder) => {
    setCart([]);
    setSelectedTable(null);
    setCustomerPhone('');
    setCustomerName('');
    setInstructions('');

    if (completedOrder && completedOrder.status === 'paid') {
      setRatingOrder(completedOrder);
      setActiveScreen('rating');
    } else {
      setActiveScreen('table-select');
    }
  };

  if (isInitializing) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F3FF' }}>
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
        <StatusBar style="light" backgroundColor="#7C3AED" translucent={false} />

        {activeScreen === 'login' && (
          <LoginScreen serverUrl={serverUrl} onLogin={handleLogin} />
        )}

        {activeScreen === 'table-select' && (
          <TableSelectScreen
            api={getApi()}
            staffName={staffName}
            selectedTable={selectedTable}
            customerPhone={customerPhone}
            customerName={customerName}
            onNext={(table, phone, name) => {
              setSelectedTable(table);
              setCustomerPhone(phone);
              setCustomerName(name);
              setActiveScreen('menu');
            }}
            onLogout={handleLogout}
            onOpenHost={() => setActiveScreen('host')}
            onOpenHistory={() => setActiveScreen('history')}
            onOpenPrinterSetup={() => setActiveScreen('printer-setup')}
          />
        )}

        {activeScreen === 'menu' && (
          <MenuScreen
            api={getApi()}
            cart={cart}
            selectedTable={selectedTable}
            onUpdateCart={setCart}
            onBack={() => setActiveScreen('table-select')}
            onNext={() => setActiveScreen('cart')}
          />
        )}

        {activeScreen === 'cart' && (
          <CartScreen
            api={getApi()}
            cart={cart}
            selectedTable={selectedTable}
            customerPhone={customerPhone}
            customerName={customerName}
            instructions={instructions}
            staffName={staffName}
            onUpdateInstructions={setInstructions}
            onUpdateCart={setCart}
            onBack={() => setActiveScreen('menu')}
            onSubmitSuccess={resetOrder}
            onOpenPrinterSetup={() => setActiveScreen('printer-setup')}
          />
        )}

        {activeScreen === 'host' && (
          <HostScreen api={getApi()} staffName={staffName} onBack={() => setActiveScreen('table-select')} />
        )}

        {activeScreen === 'printer-setup' && (
          <PrinterSetupScreen onBack={() => setActiveScreen('cart')} />
        )}

        {activeScreen === 'history' && (
          <StaffHistoryScreen api={getApi()} socket={socket} onBack={() => setActiveScreen('table-select')} />
        )}

        {activeScreen === 'rating' && ratingOrder && (
          <RatingScreen
            api={getApi()}
            order={ratingOrder}
            onDone={() => { setRatingOrder(null); setActiveScreen('table-select'); }}
            onSkip={() => { setRatingOrder(null); setActiveScreen('table-select'); }}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F3FF',
  },
});
