import React, { useState, useEffect } from 'react';
import { FiSettings, FiSave, FiPlus, FiTrash2, FiInfo, FiEye, FiEyeOff, FiPercent, FiInstagram, FiFacebook, FiTwitter, FiPhone, FiMail, FiMapPin, FiClock, FiPrinter, FiToggleLeft, FiToggleRight } from 'react-icons/fi';
import { getAllSettings, updateSetting, changeAdminPassword, getMaxDiscount, updateMaxDiscount, getSiteInfo, updateSiteInfo, getPrinterSettings, updatePrinterSettings } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import Loader from '../components/Loader';
import './AdminSettings.css';

const AdminSettings = () => {
    const { user } = useAuth();
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
        receptionIp: '',
        printerPort: 9100,
        printerEnabled: true
    });
    const [savingPrinters, setSavingPrinters] = useState(false);

    useEffect(() => {
        fetchSettings();
        fetchMaxDiscount();
        fetchSiteInfo();
        fetchPrinterSettings();
    }, []);

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
            setPrinterSettings(prev => ({ ...prev, ...res.data }));
        } catch (err) {
            console.error('Error fetching printer settings:', err);
        }
    };

    const handleSavePrinterSettings = async () => {
        setSavingPrinters(true);
        try {
            await updatePrinterSettings(printerSettings);
            showNotice('success', 'Printer settings saved! Staff app will reflect on next login.');
        } catch (err) {
            showNotice('error', err.response?.data?.message || 'Failed to save printer settings');
        } finally {
            setSavingPrinters(false);
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

                        {/* Thermal Printer Configuration */}
                        <div className="settings-card" style={{ borderLeft: '4px solid #7C3AED' }}>
                            <div className="card-header-flex">
                                <h2><FiPrinter /> Thermal Printer Config</h2>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleSavePrinterSettings}
                                    disabled={savingPrinters}
                                    style={{ padding: '8px 18px', fontSize: '0.85rem' }}
                                >
                                    {savingPrinters ? 'Saving...' : <><FiSave /> Save Printers</>}
                                </button>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', background: '#F5F3FF', padding: '10px 14px', borderRadius: '8px' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Auto-Print KOT on Order:</span>
                                <button
                                    type="button"
                                    onClick={() => setPrinterSettings(p => ({ ...p, printerEnabled: !p.printerEnabled }))}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: printerSettings.printerEnabled ? '#059669' : '#9CA3AF', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '1rem' }}
                                >
                                    {printerSettings.printerEnabled ? <><FiToggleRight size={22} /> Enabled</> : <><FiToggleLeft size={22} /> Disabled</>}
                                </button>
                            </div>

                            <div className="form-group">
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FiPrinter /> Kitchen Printer IP Address</label>
                                <input
                                    type="text"
                                    value={printerSettings.kitchenIp}
                                    onChange={(e) => setPrinterSettings(p => ({ ...p, kitchenIp: e.target.value }))}
                                    placeholder="e.g. 192.168.1.100"
                                />
                                <span className="hint">IP address of kitchen thermal printer on local network (port 9100)</span>
                            </div>

                            <div className="form-group">
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FiPrinter /> Reception Printer IP Address</label>
                                <input
                                    type="text"
                                    value={printerSettings.receptionIp}
                                    onChange={(e) => setPrinterSettings(p => ({ ...p, receptionIp: e.target.value }))}
                                    placeholder="e.g. 192.168.1.101"
                                />
                                <span className="hint">IP address of reception/billing thermal printer on local network</span>
                            </div>

                            <div className="form-group">
                                <label>Printer TCP Port</label>
                                <input
                                    type="number"
                                    value={printerSettings.printerPort}
                                    onChange={(e) => setPrinterSettings(p => ({ ...p, printerPort: parseInt(e.target.value) || 9100 }))}
                                    placeholder="9100"
                                    style={{ width: '140px' }}
                                />
                                <span className="hint">Default is 9100 for most thermal printers (ESC/POS)</span>
                            </div>

                            <div className="info-box">
                                <FiInfo />
                                <p>Both printers must be connected to the same WiFi/LAN as the server. Kitchen IP is used for KOT slips, Reception IP is used for customer bills. Staff app will show these printers as Online/Offline.</p>
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
