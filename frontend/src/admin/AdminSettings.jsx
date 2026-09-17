import React, { useState, useEffect, useRef } from 'react';
import { FiSettings, FiSave, FiPlus, FiTrash2, FiInfo, FiEye, FiEyeOff, FiPercent, FiInstagram, FiFacebook, FiTwitter, FiPhone, FiMail, FiMapPin, FiClock, FiPrinter, FiToggleLeft, FiToggleRight, FiRefreshCw, FiMonitor, FiSmartphone, FiLock, FiDownload } from 'react-icons/fi';
import { getAllSettings, updateSetting, changeAdminPassword, getMaxDiscount, updateMaxDiscount, getSiteInfo, updateSiteInfo, getPrinterSettings, updatePrinterSettings, getPrinterDevices, scanPrinterDevices, testPrinter, getOrderEditCodeStatus, updateOrderEditCode } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import Loader from '../components/Loader';
import './AdminSettings.css';

const CONNECTION_LABELS = {
    usb: 'USB cable (PC)',
    wired: 'Serial/parallel cable (PC)',
    network: 'LAN / WiFi',
    other: 'Installed on PC'
};

// Same identity the backend uses: LAN printers by IP:port, installed printers by PC + queue name.
const printerKey = (printer) => (printer.type === 'system'
    ? `system:${printer.agentId}:${printer.systemName}`
    : `tcp:${printer.host}:${printer.port || 9100}`);

const AdminSettings = () => {
    const { user, socket } = useAuth();
    const isSuperadmin = user?.role === 'superadmin';
    const canViewPrinters = isSuperadmin || user?.role === 'admin';
    const [settings, setSettings] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [taxConfig, setTaxConfig] = useState([]);
    const [message, setMessage] = useState({ type: '', text: '' });

    // Password change states
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [updatingPassword, setUpdatingPassword] = useState(false);

    // Max discount state
    const [maxDiscountPercent, setMaxDiscountPercent] = useState(20);
    const [savingDiscount, setSavingDiscount] = useState(false);

    // Site info state (social links, contact, hours)
    const [siteInfo, setSiteInfo] = useState({
        instagram: '', facebook: '', twitter: '',
        address: 'Dhanora, Risali, Bhilai',
        phone: '+91 98765 43210',
        email: 'hello@keabythepool.com',
        hoursLabel: 'Mon - Sun',
        hoursTime: '11:00 AM - 11:00 PM'
    });
    const [savingSiteInfo, setSavingSiteInfo] = useState(false);

    // Printer settings
    const [printerSettings, setPrinterSettings] = useState({
        kitchenIp: '',
        barIp: '',
        receptionIp: '',
        printerPort: 9100,
        printerEnabled: true,
        autoSelectPrinters: true,
        printers: []
    });
    const [savingPrinters, setSavingPrinters] = useState(false);
    // Devices (PC print agents + staff phones) and the printers each one detected
    const [printerDevices, setPrinterDevices] = useState([]);
    const [scanningPrinters, setScanningPrinters] = useState(false);
    // Unsaved local ticks must not be overwritten when the server auto-adds printers meanwhile.
    const printersDirtyRef = useRef(false);

    // Staff order-edit security code
    const [editCodeSet, setEditCodeSet] = useState(false);
    const [newEditCode, setNewEditCode] = useState('');
    const [savingEditCode, setSavingEditCode] = useState(false);

    useEffect(() => {
        fetchSettings();
        fetchMaxDiscount();
        fetchSiteInfo();
        fetchPrinterSettings();
    }, []);

    useEffect(() => {
        if (!canViewPrinters) return undefined;
        fetchPrinterDevices();
        if (isSuperadmin) {
            getOrderEditCodeStatus()
                .then(res => setEditCodeSet(Boolean(res.data.isSet)))
                .catch(err => console.error('Error fetching security code status:', err));
        }
        if (!socket) return undefined;

        // Live over the websocket: agents (re)connect or finish a scan, printers get auto-added, test results.
        const handleDevicesUpdated = () => {
            setScanningPrinters(false);
            fetchPrinterDevices();
        };
        const handleRegistryUpdated = () => {
            if (!printersDirtyRef.current) fetchPrinterSettings();
        };
        const handleTestResult = (result) => showNotice(
            result.ok ? 'success' : 'error',
            result.ok ? `Test slip sent to ${result.printerName}` : `Test print failed on ${result.printerName}: ${result.error}`
        );
        socket.on('printer-devices-updated', handleDevicesUpdated);
        socket.on('printer-settings-updated', handleRegistryUpdated);
        socket.on('printer-test-result', handleTestResult);
        return () => {
            socket.off('printer-devices-updated', handleDevicesUpdated);
            socket.off('printer-settings-updated', handleRegistryUpdated);
            socket.off('printer-test-result', handleTestResult);
        };
    }, [canViewPrinters, isSuperadmin, socket]);

    const fetchMaxDiscount = async () => {
        try {
            const res = await getMaxDiscount();
            setMaxDiscountPercent(res.data.maxDiscountPercent);
        } catch (err) {
            console.error('Error fetching max discount:', err);
        }
    };

    const fetchSiteInfo = async () => {
        try {
            const res = await getSiteInfo();
            setSiteInfo(prev => ({ ...prev, ...res.data }));
        } catch (err) {
            console.error('Error fetching site info:', err);
        }
    };

    const fetchPrinterSettings = async () => {
        try {
            const res = await getPrinterSettings();
            printersDirtyRef.current = false;
            setPrinterSettings(prev => ({ ...prev, ...res.data }));
        } catch (err) {
            console.error('Error fetching printer settings:', err);
        }
    };

    const fetchPrinterDevices = async () => {
        try {
            const res = await getPrinterDevices();
            setPrinterDevices(res.data.devices || []);
        } catch (err) {
            console.error('Error fetching printer devices:', err);
        }
    };

    const handleSavePrinterSettings = async () => {
        setSavingPrinters(true);
        try {
            await updatePrinterSettings(printerSettings);
            printersDirtyRef.current = false;
            showNotice('success', 'Printer selection saved. The restaurant PC print agent and staff app refresh automatically.');
        } catch (err) {
            showNotice('error', err.response?.data?.message || 'Failed to save printer settings');
        } finally {
            setSavingPrinters(false);
        }
    };

    const handleScanPrinters = async () => {
        setScanningPrinters(true);
        try {
            const res = await scanPrinterDevices();
            if (!res.data.agentsOnline) {
                setScanningPrinters(false);
                showNotice('error', 'No restaurant PC print agent is online. Start the print agent on the counter PC, or scan from Staff App → Printer Setup.');
                return;
            }
            // Results arrive over the websocket; stop the spinner anyway if the agent never answers.
            setTimeout(() => setScanningPrinters(false), 30000);
        } catch (err) {
            setScanningPrinters(false);
            showNotice('error', err.response?.data?.message || 'Could not start the printer scan');
        }
    };

    const handleTestPrinter = async (printer) => {
        try {
            await testPrinter(printer);
            showNotice('success', `Test print requested on ${printer.name || printer.systemName || printer.host}`);
        } catch (err) {
            showNotice('error', err.response?.data?.message || 'Could not request a test print');
        }
    };

    const editPrinters = (updater) => {
        printersDirtyRef.current = true;
        setPrinterSettings(updater);
    };

    const updatePrinterAt = (index, changes) => editPrinters(current => ({
        ...current,
        printers: current.printers.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item)
    }));

    // Tick/untick KOT or Bill on a detected printer.
    const togglePrinterJob = (device, found, job) => editPrinters(current => {
        const candidate = found.type === 'system'
            ? { type: 'system', agentId: device.id, systemName: found.systemName }
            : { type: 'tcp', host: found.host, port: found.port || 9100 };
        const key = printerKey(candidate);
        const printers = current.printers || [];
        const existing = printers.find(printer => printerKey(printer) === key);
        if (existing) {
            // Unticked printers stay saved (both off) so auto-select never ticks them again.
            return { ...current, printers: printers.map(printer => (printer === existing ? { ...existing, [job]: !existing[job] } : printer)) };
        }
        return {
            ...current,
            printers: [...printers, {
                id: `printer-${Date.now()}`,
                name: found.type === 'system' ? `${found.name || found.systemName} (${device.name})` : `Network printer ${found.host}`,
                role: 'all',
                connection: found.connection,
                copies: 1,
                enabled: true,
                kot: job === 'kot',
                bill: job === 'bill',
                ...candidate
            }]
        };
    });

    const handleSaveEditCode = async () => {
        setSavingEditCode(true);
        try {
            await updateOrderEditCode(newEditCode);
            setEditCodeSet(true);
            setNewEditCode('');
            showNotice('success', 'Security code saved. Staff must enter it to reduce or remove order items.');
        } catch (err) {
            showNotice('error', err.response?.data?.message || 'Failed to save security code');
        } finally {
            setSavingEditCode(false);
        }
    };

    const handleSaveSiteInfo = async () => {
        setSavingSiteInfo(true);
        try {
            await updateSiteInfo(siteInfo);
            showNotice('success', 'Site info updated successfully!');
        } catch (err) {
            showNotice('error', err.response?.data?.message || 'Failed to update site info');
        } finally {
            setSavingSiteInfo(false);
        }
    };

    const handleSaveMaxDiscount = async () => {
        setSavingDiscount(true);
        try {
            await updateMaxDiscount(maxDiscountPercent);
            showNotice('success', `Max discount updated to ${maxDiscountPercent}%`);
        } catch (err) {
            showNotice('error', err.response?.data?.message || 'Failed to update max discount');
        } finally {
            setSavingDiscount(false);
        }
    };

    const fetchSettings = async () => {
        try {
            const res = await getAllSettings();
            setSettings(res.data);

            // Handle tax_config specially as it's an array
            if (res.data.tax_config) {
                setTaxConfig(res.data.tax_config);
            } else {
                // Default if not set
                setTaxConfig([{ name: 'GST', rate: res.data.gst_rate || 5 }]);
            }
        } catch (error) {
            console.error('Error fetching settings:', error);
            showNotice('error', 'Failed to load settings');
        } finally {
            setLoading(false);
        }
    };

    const showNotice = (type, text) => {
        setMessage({ type, text });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    };

    const handleBasicChange = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const handleTaxChange = (index, field, value) => {
        const newTaxConfig = [...taxConfig];
        newTaxConfig[index][field] = field === 'rate' ? parseFloat(value) || 0 : value;
        setTaxConfig(newTaxConfig);
    };

    const addTax = () => {
        setTaxConfig([...taxConfig, { name: 'New Tax', rate: 0 }]);
    };

    const removeTax = (index) => {
        if (taxConfig.length <= 1) {
            showNotice('error', 'At least one tax entry is required');
            return;
        }
        setTaxConfig(taxConfig.filter((_, i) => i !== index));
    };

    const saveSettings = async () => {
        setSaving(true);
        try {
            // Save basic settings
            const basicKeys = ['restaurant_name', 'restaurant_address', 'restaurant_phone', 'gst_number', 'gst_rate'];
            for (const key of basicKeys) {
                if (settings[key] !== undefined) {
                    await updateSetting(key, settings[key]);
                }
            }

            // Save tax config
            await updateSetting('tax_config', taxConfig);

            showNotice('success', 'Settings updated successfully!');
        } catch (error) {
            console.error('Error saving settings:', error);
            showNotice('error', 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        if (newPassword.length < 6) {
            showNotice('error', 'Password must be at least 6 characters long');
            return;
        }
        if (newPassword !== confirmPassword) {
            showNotice('error', 'Passwords do not match');
            return;
        }

        setUpdatingPassword(true);
        try {
            await changeAdminPassword(newPassword);
            showNotice('success', 'Admin password changed successfully!');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error) {
            console.error('Password change error:', error);
            showNotice('error', error.response?.data?.message || 'Failed to change password');
        } finally {
            setUpdatingPassword(false);
        }
    };

    if (loading) return <Loader message="Fetching your settings..." />;

    const onlineAgents = printerDevices.filter(device => device.kind === 'agent' && device.online).length;
    const checkboxLabelStyle = { display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, cursor: isSuperadmin ? 'pointer' : 'default', margin: 0 };

    return (
        <div className="admin-settings">
            <div className="settings-header">
                <h1><FiSettings /> Store Settings</h1>
                {user && user.role === 'superadmin' && (
                    <button
                        className="btn btn-primary btn-save"
                        onClick={saveSettings}
                        disabled={saving}
                    >
                        {saving ? 'Saving...' : <><FiSave /> Save Changes</>}
                    </button>
                )}
            </div>

            {message.text && (
                <div className={`notice-banner ${message.type}`}>
                    {message.text}
                </div>
            )}

            <div className="store-settings-container">
                {user && user.role === 'superadmin' && (
                    <>
                        {/* Restaurant Profile */}
                        <div className="settings-card">
                            <h2>Restaurant Profile</h2>
                            <div className="form-group">
                                <label>Restaurant Name</label>
                                <input
                                    type="text"
                                    value={settings.restaurant_name || ''}
                                    onChange={(e) => handleBasicChange('restaurant_name', e.target.value)}
                                    placeholder="e.g. Kea By The Pool"
                                />
                            </div>
                            <div className="form-group">
                                <label>Store Address</label>
                                <textarea
                                    value={settings.restaurant_address || ''}
                                    onChange={(e) => handleBasicChange('restaurant_address', e.target.value)}
                                    placeholder="Full address for bills"
                                />
                            </div>
                            <div className="form-group">
                                <label>Contact Phone</label>
                                <input
                                    type="text"
                                    value={settings.restaurant_phone || '+91 '}
                                    onChange={(e) => handleBasicChange('restaurant_phone', e.target.value)}
                                    placeholder="+91 XXXXX XXXXX"
                                />
                            </div>
                        </div>

                        {/* Tax Configuration */}
                        <div className="settings-card">
                            <div className="card-header-flex">
                                <h2>Tax Configuration</h2>
                                <button className="btn-add-tax" onClick={addTax}>
                                    <FiPlus /> Add Tax
                                </button>
                            </div>

                            <div className="form-group">
                                <label>GST Registration Number (GSTIN)</label>
                                <input
                                    type="text"
                                    value={settings.gst_number || ''}
                                    onChange={(e) => handleBasicChange('gst_number', e.target.value)}
                                    placeholder="Enter GSTIN"
                                />
                            </div>

                            <div className="tax-list">
                                <div className="tax-item-header">
                                    <span>Tax Name</span>
                                    <span>Rate (%)</span>
                                    <span>Action</span>
                                </div>
                                {taxConfig.map((tax, index) => (
                                    <div key={index} className="tax-item">
                                        <input
                                            type="text"
                                            value={tax.name}
                                            onChange={(e) => handleTaxChange(index, 'name', e.target.value)}
                                        />
                                        <input
                                            type="number"
                                            value={tax.rate}
                                            onChange={(e) => handleTaxChange(index, 'rate', e.target.value)}
                                            step="0.01"
                                        />
                                        <button className="btn-delete" onClick={() => removeTax(index)}>
                                            <FiTrash2 />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <div className="info-box">
                                <FiInfo />
                                <p>These taxes will be applied to all new orders. Changes will not affect existing orders.</p>
                            </div>
                        </div>

                        {/* Bill Settings */}
                        <div className="settings-card">
                            <h2>Bill & Print Settings</h2>
                            <div className="form-group">
                                <label>Default GST Rate (Legacy)</label>
                                <input
                                    type="number"
                                    value={settings.gst_rate || 5}
                                    onChange={(e) => handleBasicChange('gst_rate', e.target.value)}
                                    step="0.1"
                                />
                                <span className="hint">Used as fallback if tax configuration is empty</span>
                            </div>

                            <div className="preview-receipt">
                                <h3>Receipt Preview</h3>
                                <div className="receipt-mock">
                                    <div className="mock-line center"><strong>{settings.restaurant_name || "Kea By The Pool"}</strong></div>
                                    <div className="mock-line center">GSTIN: {settings.gst_number || 'XXXXXXXXXXXXX'}</div>
                                    <div className="mock-line dashed"></div>
                                    <div className="mock-line-flex"><span>Virgin Mojito x1</span><span>₹60.00</span></div>
                                    <div className="mock-line dashed"></div>
                                    {taxConfig.map((t, i) => (
                                        <div key={i} className="mock-line-flex"><span>{t.name} ({t.rate}%)</span><span>₹{(60 * t.rate / 100).toFixed(2)}</span></div>
                                    ))}
                                    <div className="mock-line-flex bold"><span>Total</span><span>₹{(60 * (1 + taxConfig.reduce((acc, t) => acc + t.rate, 0) / 100)).toFixed(2)}</span></div>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* Printers: detected devices + KOT/Bill selection (Superadmin edits, Admin views, scans and tests) */}
                {canViewPrinters && (
                    <div className="settings-card" style={{ borderLeft: '4px solid #7C3AED' }}>
                        <div className="card-header-flex">
                            <h2><FiPrinter /> Printers — KOT &amp; Bill</h2>
                            {isSuperadmin && (
                                <button
                                    className="btn btn-primary"
                                    onClick={handleSavePrinterSettings}
                                    disabled={savingPrinters}
                                    style={{ padding: '8px 18px', fontSize: '0.85rem' }}
                                >
                                    {savingPrinters ? 'Saving...' : <><FiSave /> Save Printers</>}
                                </button>
                            )}
                        </div>

                        <div className="info-box" style={{ marginBottom: '16px' }}>
                            <FiInfo />
                            <p>
                                The Kea print agent on the restaurant PC stays connected to this server over a websocket and reports every printer it can reach:
                                printers on a USB/serial cable or installed on that PC, and all LAN/WiFi printers. Staff App → Printer Setup also scans the WiFi from the phone.
                                Every newly detected printer is ticked for <strong>KOT</strong> and <strong>Bill</strong> automatically; untick and Save to change.
                                While the agent is online, KOTs and Bills print automatically only on the ticked printers (no browser popup). If no agent is online, the browser print popup and the Staff App print as before.
                                {!isSuperadmin && ' Only Superadmin can change the ticks.'}
                            </p>
                        </div>

                        {isSuperadmin && (
                            <div style={{ display: 'grid', gap: '6px', marginBottom: '16px', background: '#F5F3FF', padding: '10px 14px', borderRadius: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Auto-Print KOT &amp; Bill (PC print agent):</span>
                                    <button
                                        type="button"
                                        onClick={() => editPrinters(p => ({ ...p, printerEnabled: !p.printerEnabled }))}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: printerSettings.printerEnabled ? '#059669' : '#9CA3AF', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '1rem' }}
                                    >
                                        {printerSettings.printerEnabled ? <><FiToggleRight size={22} /> Enabled</> : <><FiToggleLeft size={22} /> Disabled</>}
                                    </button>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Auto-tick new printers for KOT + Bill:</span>
                                    <button
                                        type="button"
                                        onClick={() => editPrinters(p => ({ ...p, autoSelectPrinters: p.autoSelectPrinters === false }))}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: printerSettings.autoSelectPrinters !== false ? '#059669' : '#9CA3AF', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '1rem' }}
                                    >
                                        {printerSettings.autoSelectPrinters !== false ? <><FiToggleRight size={22} /> On</> : <><FiToggleLeft size={22} /> Off</>}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Detected devices and their printers */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
                            <div>
                                <strong>Detected Devices &amp; Printers</strong>
                                <div className="hint">
                                    {onlineAgents > 0 ? `🟢 ${onlineAgents} PC print agent(s) online` : '🔴 No PC print agent online'} · USB/cable printers on the PC + LAN/WiFi printers
                                </div>
                            </div>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={handleScanPrinters}
                                disabled={scanningPrinters}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                <FiRefreshCw /> {scanningPrinters ? 'Scanning…' : 'Scan Network'}
                            </button>
                        </div>

                        {printerDevices.length === 0 ? (
                            <div className="info-box" style={{ marginBottom: '16px' }}>
                                <FiInfo />
                                <div>
                                    <p style={{ margin: 0 }}>No device has reported printers yet. Start the print agent on the restaurant PC (it scans USB and WiFi printers automatically).</p>
                                    <div style={{ marginTop: '10px' }}>
                                        <a
                                            href="/kea-print-agent.zip"
                                            download="kea-print-agent.zip"
                                            className="btn btn-primary"
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none', padding: '8px 14px', fontSize: '13px', borderRadius: '6px', background: '#7C3AED', color: '#FFF' }}
                                        >
                                            <FiDownload /> Download PC Print Agent (Windows ZIP)
                                        </a>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gap: '10px', marginBottom: '20px' }}>
                                {printerDevices.map(device => (
                                    <div key={`${device.kind}-${device.id}`} style={{ border: '1.5px solid #D1D5DB', borderRadius: '8px', padding: '12px', background: '#FFFFFF' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                                            <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                {device.kind === 'agent' ? <FiMonitor /> : <FiSmartphone />} {device.name}
                                            </strong>
                                            <span className="hint">
                                                {device.kind === 'agent' ? (device.online ? '🟢 Online' : '🔴 Offline') : 'Staff App WiFi scan'}
                                                {' · '}{new Date(device.lastSeen).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        {(device.printers || []).length === 0 ? (
                                            <div className="hint">No printers found by this device.</div>
                                        ) : device.printers.map(found => {
                                            const identity = found.type === 'system' ? { ...found, agentId: device.id } : found;
                                            const foundKey = printerKey(identity);
                                            const selected = (printerSettings.printers || []).find(printer => printerKey(printer) === foundKey);
                                            return (
                                                <div key={foundKey} style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '8px 0', borderTop: '1px dashed #E5E7EB' }}>
                                                    <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                                                        <div style={{ fontWeight: 600, wordBreak: 'break-word' }}>{found.name || found.systemName || found.host}</div>
                                                        <div className="hint">
                                                            {CONNECTION_LABELS[found.connection] || found.connection}
                                                            {found.host ? ` · ${found.host}` : ''}
                                                            {found.status ? ` · ${found.status}` : ''}
                                                        </div>
                                                    </div>
                                                    <label style={checkboxLabelStyle}>
                                                        <input
                                                            type="checkbox"
                                                            style={{ width: 'auto' }}
                                                            checked={Boolean(selected?.kot)}
                                                            disabled={!isSuperadmin}
                                                            onChange={() => togglePrinterJob(device, found, 'kot')}
                                                        /> KOT
                                                    </label>
                                                    <label style={checkboxLabelStyle}>
                                                        <input
                                                            type="checkbox"
                                                            style={{ width: 'auto' }}
                                                            checked={Boolean(selected?.bill)}
                                                            disabled={!isSuperadmin}
                                                            onChange={() => togglePrinterJob(device, found, 'bill')}
                                                        /> Bill
                                                    </label>
                                                    {onlineAgents > 0 && (found.type !== 'system' || device.online) && (
                                                        <button
                                                            type="button"
                                                            className="btn btn-secondary"
                                                            onClick={() => handleTestPrinter(identity)}
                                                            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                                        >
                                                            Test
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Saved selection */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
                            <div>
                                <strong>Saved Printers</strong>
                                <div className="hint">KOT = CREATE, ADD and CANCEL kitchen tickets. Bill = customer receipt. Port is detected automatically.</div>
                            </div>
                            {isSuperadmin && (
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => editPrinters(current => ({
                                        ...current,
                                        printers: [
                                            ...(current.printers || []),
                                            {
                                                id: `printer-${Date.now()}`,
                                                name: `WiFi Printer ${(current.printers || []).length + 1}`,
                                                type: 'tcp',
                                                role: 'all',
                                                host: '',
                                                port: 9100,
                                                kot: true,
                                                bill: true,
                                                copies: 1,
                                                enabled: true
                                            }
                                        ]
                                    }))}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                    <FiPlus /> Add Printer IP
                                </button>
                            )}
                        </div>

                        {(printerSettings.printers || []).length === 0 ? (
                            <div className="info-box" style={{ marginBottom: '16px' }}>
                                <FiInfo />
                                <p>No printer saved yet. Printers appear here automatically once the PC print agent or the Staff App detects them.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gap: '12px', marginBottom: '16px' }}>
                                {(printerSettings.printers || []).map((printer, index) => (
                                    <div key={printer.id || index} style={{ border: '1.5px solid #D1D5DB', borderRadius: '8px', padding: '12px', background: printer.enabled === false ? '#F3F4F6' : '#FFFFFF' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', alignItems: 'end' }}>
                                            <div className="form-group" style={{ margin: 0 }}>
                                                <label>Name</label>
                                                <input
                                                    type="text"
                                                    value={printer.name || ''}
                                                    disabled={!isSuperadmin}
                                                    onChange={(e) => updatePrinterAt(index, { name: e.target.value })}
                                                    placeholder="Kitchen / Bar"
                                                />
                                            </div>
                                            <div className="form-group" style={{ margin: 0 }}>
                                                <label>Prints</label>
                                                <div style={{ display: 'flex', gap: '14px', padding: '8px 0' }}>
                                                    <label style={checkboxLabelStyle}>
                                                        <input
                                                            type="checkbox"
                                                            style={{ width: 'auto' }}
                                                            checked={Boolean(printer.kot)}
                                                            disabled={!isSuperadmin}
                                                            onChange={() => updatePrinterAt(index, { kot: !printer.kot })}
                                                        /> KOT
                                                    </label>
                                                    <label style={checkboxLabelStyle}>
                                                        <input
                                                            type="checkbox"
                                                            style={{ width: 'auto' }}
                                                            checked={Boolean(printer.bill)}
                                                            disabled={!isSuperadmin}
                                                            onChange={() => updatePrinterAt(index, { bill: !printer.bill })}
                                                        /> Bill
                                                    </label>
                                                </div>
                                            </div>
                                            {printer.type === 'system' ? (
                                                <div className="form-group" style={{ margin: 0 }}>
                                                    <label>Installed Printer</label>
                                                    <div style={{ padding: '8px 0', wordBreak: 'break-word' }}>
                                                        {printer.systemName}
                                                        <div className="hint">PC: {printer.agentId} · {CONNECTION_LABELS[printer.connection] || 'Installed on PC'}</div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="form-group" style={{ margin: 0 }}>
                                                    <label>Printer IP (LAN / WiFi)</label>
                                                    <input
                                                        type="text"
                                                        value={printer.host || ''}
                                                        disabled={!isSuperadmin}
                                                        onChange={(e) => updatePrinterAt(index, { host: e.target.value })}
                                                        placeholder="192.168.1.100"
                                                    />
                                                </div>
                                            )}
                                            <div className="form-group" style={{ margin: 0 }}>
                                                <label>Copies</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="5"
                                                    value={printer.copies || 1}
                                                    disabled={!isSuperadmin}
                                                    onChange={(e) => updatePrinterAt(index, { copies: Math.max(1, Math.min(5, parseInt(e.target.value) || 1)) })}
                                                />
                                            </div>
                                            {isSuperadmin && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingBottom: '2px' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => updatePrinterAt(index, { enabled: printer.enabled === false })}
                                                        title={printer.enabled === false ? 'Enable printer' : 'Disable printer'}
                                                        style={{ border: 'none', background: 'transparent', color: printer.enabled === false ? '#9CA3AF' : '#059669', cursor: 'pointer', padding: '6px' }}
                                                    >
                                                        {printer.enabled === false ? <FiToggleLeft size={24} /> : <FiToggleRight size={24} />}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => editPrinters(current => ({ ...current, printers: current.printers.filter((_, itemIndex) => itemIndex !== index) }))}
                                                        title="Remove printer (while auto-tick is On, a printer that is still detected comes back ticked; untick KOT and Bill instead)"
                                                        style={{ border: 'none', background: '#FEE2E2', color: '#DC2626', cursor: 'pointer', borderRadius: '5px', padding: '7px' }}
                                                    >
                                                        <FiTrash2 />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="info-box">
                            <FiInfo />
                            <p>LAN/WiFi printers must be on the same network as the restaurant PC running the print agent (or the phone using the Staff App). USB/cable printers print only from the PC they are plugged into, so that PC's print agent must be running.</p>
                        </div>
                    </div>
                )}

                {user && user.role === 'superadmin' && (
                    <>
                        {/* Staff order-edit security code */}
                        <div className="settings-card">
                            <h2><FiLock /> Staff Order Edit Security Code</h2>
                            <div className="form-group">
                                <label>{editCodeSet ? 'Change Security Code' : 'Set Security Code'} (4–8 digits)</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                    <input
                                        type="password"
                                        inputMode="numeric"
                                        autoComplete="new-password"
                                        value={newEditCode}
                                        onChange={(e) => setNewEditCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                                        placeholder="e.g. 4821"
                                        style={{ width: '160px' }}
                                    />
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleSaveEditCode}
                                        disabled={savingEditCode || newEditCode.length < 4}
                                        style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                                    >
                                        {savingEditCode ? 'Saving...' : 'Save Code'}
                                    </button>
                                </div>
                                <span className="hint">
                                    Status: {editCodeSet ? 'Set ✅ — staff must enter it to reduce or remove items' : 'Not set — staff can still reduce items without a code (as before)'}
                                </span>
                            </div>
                            <div className="info-box">
                                <FiInfo />
                                <p>Staff App → Today's History → Edit Order: pressing minus (−) or Remove on an already-ordered item asks for this code. The change then prints a CANCEL KOT like before.</p>
                            </div>
                        </div>

                        {/* Discount Control */}
                        <div className="settings-card">
                            <h2><FiPercent /> Discount Control</h2>
                            <div className="form-group">
                                <label>Maximum Discount Allowed (%)</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <input
                                        type="number"
                                        value={maxDiscountPercent}
                                        onChange={(e) => setMaxDiscountPercent(parseFloat(e.target.value) || 0)}
                                        min="0"
                                        max="100"
                                        step="1"
                                        style={{ width: '120px' }}
                                    />
                                    <span style={{ fontSize: '0.9rem', color: '#6B7280' }}>%</span>
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleSaveMaxDiscount}
                                        disabled={savingDiscount}
                                        style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                                    >
                                        {savingDiscount ? 'Saving...' : 'Save'}
                                    </button>
                                </div>
                                <span className="hint">Admin and staff cannot apply discounts exceeding this percentage. Only superadmin can override.</span>
                            </div>
                            <div className="info-box">
                                <FiInfo />
                                <p>Example: If set to 20%, admin can give max 20% discount on any bill. Attempting more will be blocked. Superadmin is not limited.</p>
                            </div>
                        </div>

                        {/* Site Info — Social, Contact, Hours */}
                        <div className="settings-card">
                            <div className="card-header-flex">
                                <h2>Website Info</h2>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleSaveSiteInfo}
                                    disabled={savingSiteInfo}
                                    style={{ padding: '8px 18px', fontSize: '0.85rem' }}
                                >
                                    {savingSiteInfo ? 'Saving...' : <><FiSave /> Save</>}
                                </button>
                            </div>

                            {/* Social Links */}
                            <div style={{ marginBottom: '20px' }}>
                                <p style={{ fontWeight: 700, marginBottom: '10px', color: '#374151', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Social Links</p>
                                <div className="form-group">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FiInstagram /> Instagram URL</label>
                                    <input
                                        type="url"
                                        value={siteInfo.instagram}
                                        onChange={(e) => setSiteInfo(p => ({ ...p, instagram: e.target.value }))}
                                        placeholder="https://instagram.com/keabythepool"
                                    />
                                </div>
                                <div className="form-group">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FiFacebook /> Facebook URL</label>
                                    <input
                                        type="url"
                                        value={siteInfo.facebook}
                                        onChange={(e) => setSiteInfo(p => ({ ...p, facebook: e.target.value }))}
                                        placeholder="https://facebook.com/keabythepool"
                                    />
                                </div>
                                <div className="form-group">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FiTwitter /> Twitter / X URL</label>
                                    <input
                                        type="url"
                                        value={siteInfo.twitter}
                                        onChange={(e) => setSiteInfo(p => ({ ...p, twitter: e.target.value }))}
                                        placeholder="https://twitter.com/keabythepool"
                                    />
                                </div>
                            </div>

                            {/* Contact Info */}
                            <div style={{ marginBottom: '20px' }}>
                                <p style={{ fontWeight: 700, marginBottom: '10px', color: '#374151', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Contact Info</p>
                                <div className="form-group">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FiMapPin /> Address</label>
                                    <input
                                        type="text"
                                        value={siteInfo.address}
                                        onChange={(e) => setSiteInfo(p => ({ ...p, address: e.target.value }))}
                                        placeholder="Dhanora, Risali, Bhilai"
                                    />
                                </div>
                                <div className="form-group">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FiPhone /> Phone</label>
                                    <input
                                        type="text"
                                        value={siteInfo.phone}
                                        onChange={(e) => setSiteInfo(p => ({ ...p, phone: e.target.value }))}
                                        placeholder="+91 98765 43210"
                                    />
                                </div>
                                <div className="form-group">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FiMail /> Email</label>
                                    <input
                                        type="email"
                                        value={siteInfo.email}
                                        onChange={(e) => setSiteInfo(p => ({ ...p, email: e.target.value }))}
                                        placeholder="hello@keabythepool.com"
                                    />
                                </div>
                            </div>

                            {/* Business Hours */}
                            <div>
                                <p style={{ fontWeight: 700, marginBottom: '10px', color: '#374151', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Business Hours</p>
                                <div className="form-group">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FiClock /> Days</label>
                                    <input
                                        type="text"
                                        value={siteInfo.hoursLabel}
                                        onChange={(e) => setSiteInfo(p => ({ ...p, hoursLabel: e.target.value }))}
                                        placeholder="Mon - Sun"
                                    />
                                </div>
                                <div className="form-group">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FiClock /> Timings</label>
                                    <input
                                        type="text"
                                        value={siteInfo.hoursTime}
                                        onChange={(e) => setSiteInfo(p => ({ ...p, hoursTime: e.target.value }))}
                                        placeholder="11:00 AM - 11:00 PM"
                                    />
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* Change Password Card */}
                <div className="settings-card">
                    <h2>Admin Security</h2>
                    <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div className="form-group">
                            <label>New Password</label>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                <input
                                    type={showNewPassword ? "text" : "password"}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Enter new password (min 6 chars)"
                                    style={{ width: '100%', paddingRight: '45px' }}
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNewPassword(!showNewPassword)}
                                    style={{
                                        position: 'absolute',
                                        right: '12px',
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        color: '#666',
                                        padding: 0
                                    }}
                                >
                                    {showNewPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                                </button>
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Confirm New Password</label>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                <input
                                    type={showConfirmPassword ? "text" : "password"}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Confirm new password"
                                    style={{ width: '100%', paddingRight: '45px' }}
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    style={{
                                        position: 'absolute',
                                        right: '12px',
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        color: '#666',
                                        padding: 0
                                    }}
                                >
                                    {showConfirmPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary btn-full sketch-border sketch-shadow"
                            disabled={updatingPassword}
                            style={{ marginTop: '8px', padding: '10px' }}
                        >
                            {updatingPassword ? 'Updating...' : 'Update Password'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default AdminSettings;
