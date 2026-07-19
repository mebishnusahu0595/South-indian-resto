import React, { useState, useEffect, Component } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, LogBox } from 'react-native';
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

// ─── Error Boundary ────────────────────────────────────────
// Catches any JS crash in the component tree and shows a recovery screen
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
  const [serverUrl, setServerUrl] = useState('http://10.0.2.2:5000');
  const [token, setToken] = useState(null);
  const [staffName, setStaffName] = useState('Staff');

  // Shared order state
  const [selectedTable, setSelectedTable] = useState(null);
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [cart, setCart] = useState([]);
  const [instructions, setInstructions] = useState('');
  const [ratingOrder, setRatingOrder] = useState(null);

  // Backend-driven config (fetched after login, cached)
  const [appConfig, setAppConfig] = useState(null);

  // Debug: last network error visible on screen in dev
  const [lastError, setLastError] = useState('');

  // Fetch remote config from backend (app name, features, version message, etc.)
  // This means you can change behavior without rebuilding the APK
  const fetchAppConfig = async (url, authToken) => {
    try {
      const res = await axios.get(`${url}/api/settings/app-config`, {
        headers: { Authorization: `Bearer ${authToken}` },
        timeout: 5000,
      });
      setAppConfig(res.data || {});
    } catch (err) {
      // Non-critical: app works without config
      console.log('[AppConfig] Could not fetch:', err.message);
    }
  };

  // Configure Axios instance
  const getApi = () => {
    const instance = axios.create({
      baseURL: `${serverUrl}/api`,
      timeout: 12000,
    });
    if (token) {
      instance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    // Intercept errors globally
    instance.interceptors.response.use(
      (response) => {
        setLastError(''); // clear on success
        return response;
      },
      (error) => {
        const msg = error.response?.data?.message || error.message || 'Network error';
        const status = error.response?.status;
        setLastError(`[${status || 'NET'}] ${msg}`);

        // Auto-logout on 401
        if (status === 401) {
          handleLogout();
        }
        return Promise.reject(error);
      }
    );
    return instance;
  };

  const handleLogin = (jwtToken, name, url) => {
    setToken(jwtToken);
    setStaffName(name);
    setServerUrl(url);
    setActiveScreen('table-select');
    fetchAppConfig(url, jwtToken);
  };

  const handleLogout = () => {
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
            onUpdateInstructions={setInstructions}
            onUpdateCart={setCart}
            onBack={() => setActiveScreen('menu')}
            onSubmitSuccess={resetOrder}
          />
        )}

        {activeScreen === 'host' && (
          <HostScreen api={getApi()} staffName={staffName} onBack={() => setActiveScreen('table-select')} />
        )}

        {activeScreen === 'rating' && ratingOrder && (
          <RatingScreen
            api={getApi()}
            order={ratingOrder}
            onDone={() => { setRatingOrder(null); setActiveScreen('table-select'); }}
            onSkip={() => { setRatingOrder(null); setActiveScreen('table-select'); }}
          />
        )}

        {/* Debug banner: shows last network error (auto-hides after 5s) */}
        {!!lastError && __DEV__ && (
          <View style={styles.debugBanner}>
            <Text style={styles.debugText}>{lastError}</Text>
            <TouchableOpacity onPress={() => setLastError('')}>
              <Text style={styles.debugClose}>X</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Backend config message (e.g. maintenance notice) */}
        {appConfig?.announcement && (
          <View style={styles.announceBanner}>
            <Text style={styles.announceText}>{appConfig.announcement}</Text>
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// Wrap in ErrorBoundary
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
  debugBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FEF3C7',
    paddingVertical: 6,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F59E0B',
  },
  debugText: { fontSize: 11, color: '#92400E', flex: 1, fontFamily: 'monospace' },
  debugClose: { fontSize: 14, fontWeight: '700', color: '#92400E', paddingLeft: 12 },
  announceBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#7C3AED',
    padding: 8,
    alignItems: 'center',
  },
  announceText: { color: '#FFF', fontSize: 12, fontWeight: '600', textAlign: 'center' },
});
