import React, { useState, useEffect } from 'react';
import { FiCalendar, FiChevronLeft, FiChevronRight, FiEdit2, FiTrash2, FiCheck, FiX, FiUsers, FiClock, FiMapPin, FiDollarSign, FiPlus, FiFilter } from 'react-icons/fi';
import { getBookings, updateBookingStatus, updateBooking, deleteBooking, createBooking, getTables, getTableSections } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import Loader from '../components/Loader';
import './AdminBookings.css';

const getLocalDateString = (date = new Date()) => {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
};

const STATUS_OPTIONS = ['upcoming', 'confirmed', 'seated', 'completed', 'cancelled', 'no-show'];

const AdminBookings = () => {
    const { user, socket } = useAuth();
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Date & Time Range Filters
    const [fromDateFilter, setFromDateFilter] = useState(getLocalDateString());
    const [toDateFilter, setToDateFilter] = useState(getLocalDateString());
    const [fromTimeFilter, setFromTimeFilter] = useState('');
    const [toTimeFilter, setToTimeFilter] = useState('');

    const [tables, setTables] = useState([]);
    const [sectionsList, setSectionsList] = useState([]);

    // Create modal
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [createForm, setCreateForm] = useState({
        guestName: '',
        guestPhone: '',
        guestCount: 2,
        fromDate: getLocalDateString(),
        toDate: getLocalDateString(),
        fromTime: '19:00',
        toTime: '21:00',
        paymentAmount: 0,
        totalAmount: 0,
        notes: '',
        tableIds: [],
        sections: []
    });
    const [creating, setCreating] = useState(false);

    // Edit modal
    const [editBooking, setEditBooking] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [saving, setSaving] = useState(false);

    // Complete modal (bill amount)
    const [completeBooking, setCompleteBooking] = useState(null);
    const [completeAmount, setCompleteAmount] = useState('');
    const [completing, setCompleting] = useState(false);

    useEffect(() => { fetchBookings(); fetchTables(); fetchSections(); }, [fromDateFilter, toDateFilter]);

    useEffect(() => {
        if (socket) {
            socket.on('new-booking', (b) => { setBookings(prev => [b, ...prev]); });
            socket.on('booking-updated', (b) => { setBookings(prev => prev.map(x => x._id === b._id ? b : x)); });
            socket.on('booking-deleted', (id) => { setBookings(prev => prev.filter(x => x._id !== id)); });
            return () => { socket.off('new-booking'); socket.off('booking-updated'); socket.off('booking-deleted'); };
        }
    }, [socket]);

    const fetchBookings = async () => {
        setLoading(true);
        try { 
            const res = await getBookings({ fromDate: fromDateFilter, toDate: toDateFilter }); 
            let data = res.data || [];
            if (fromTimeFilter) {
                data = data.filter(b => b.fromTime >= fromTimeFilter);
            }
            if (toTimeFilter) {
                data = data.filter(b => !b.toTime || b.toTime <= toTimeFilter);
            }
            setBookings(data); 
        }
        catch (err) { console.error(err); }
        finally { setLoading(false); }
    };
    const fetchTables = async () => { try { const res = await getTables(); setTables(res.data || []); } catch (e) {} };
    const fetchSections = async () => { try { const res = await getTableSections(); setSectionsList(res.data || []); } catch (e) {} };

    const handleCreateBooking = async (e) => {
        e.preventDefault();
        setCreating(true);
        try {
            await createBooking(createForm);
            setShowCreateModal(false);
            fetchBookings();
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to create booking');
        } finally {
            setCreating(false);
        }
    };

    const handleStatusChange = async (bookingId, status) => {
        try { await updateBookingStatus(bookingId, status); fetchBookings(); }
        catch (err) { alert('Failed to update status'); }
    };

    const handleDelete = async (bookingId) => {
        if (!window.confirm('Delete this booking permanently?')) return;
        try { await deleteBooking(bookingId); setBookings(prev => prev.filter(b => b._id !== bookingId)); }
        catch (err) { alert('Failed to delete booking'); }
    };

    // Complete with bill
    const openComplete = (booking) => {
        setCompleteBooking(booking);
        setCompleteAmount((booking.totalAmount || booking.paymentAmount || 0).toString());
    };

    const handleComplete = async () => {
        if (!completeBooking) return;
        setCompleting(true);
        try {
            // Update total amount first if changed
            const amt = parseFloat(completeAmount) || 0;
            if (user?.role === 'superadmin' && amt !== completeBooking.totalAmount) {
                await updateBooking(completeBooking._id, { totalAmount: amt });
            }
            // Then mark completed (triggers bill generation in backend)
            await updateBookingStatus(completeBooking._id, 'completed');
            setCompleteBooking(null);
            fetchBookings();
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to complete booking');
        } finally { setCompleting(false); }
    };

    const openEdit = (booking) => {
        setEditBooking(booking);
        setEditForm({
            guestName: booking.guestName,
            guestPhone: booking.guestPhone || '',
            guestCount: booking.guestCount,
            tableIds: booking.tables?.map(t => t._id || t) || [],
            sections: booking.sections || [],
            fromDate: booking.fromDate ? new Date(booking.fromDate).toISOString().split('T')[0] : '',
            toDate: booking.toDate ? new Date(booking.toDate).toISOString().split('T')[0] : '',
            fromTime: booking.fromTime || '',
            toTime: booking.toTime || '',
            paymentStatus: booking.paymentStatus,
            paymentAmount: booking.paymentAmount || 0,
            totalAmount: booking.totalAmount || 0,
            notes: booking.notes || '',
            status: booking.status
        });
    };

    const handleSaveEdit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try { await updateBooking(editBooking._id, editForm); setEditBooking(null); fetchBookings(); }
        catch (err) { alert(err.response?.data?.message || 'Failed to update booking'); }
        finally { setSaving(false); }
    };

    const toggleEditTable = (id) => {
        setEditForm(prev => ({
            ...prev,
            tableIds: prev.tableIds.includes(id) ? prev.tableIds.filter(x => x !== id) : [...prev.tableIds, id]
        }));
    };
    const toggleEditSection = (sec) => {
        setEditForm(prev => ({
            ...prev,
            sections: prev.sections.includes(sec) ? prev.sections.filter(x => x !== sec) : [...prev.sections, sec]
        }));
    };

    const getStatusColor = (status) => {
        const map = { upcoming: '#7C3AED', confirmed: '#10B981', seated: '#0EA5E9', completed: '#6B7280', cancelled: '#EF4444', 'no-show': '#F59E0B' };
        return map[status] || '#6B7280';
    };

    if (loading) return <Loader message="Loading bookings..." />;

    return (
        <div className="admin-bookings">
            <div className="bookings-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h1>Pre-Bookings</h1>
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={() => setShowCreateModal(true)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                        <FiPlus /> New Booking
                    </button>
                </div>

                {/* Filter Control Bar with Popup Calendar & Watch Clock Pickers */}
                <div className="booking-filters-bar" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', background: '#FFF', padding: '10px 14px', borderRadius: '10px', border: '2px solid #111', boxShadow: '3px 3px 0px #111' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 'bold' }}>From Date:</span>
                        <input
                            type="date"
                            className="input"
                            value={fromDateFilter}
                            onChange={e => setFromDateFilter(e.target.value)}
                            style={{ padding: '4px 8px', fontSize: '0.85rem', border: '1.5px solid #111' }}
                        />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 'bold' }}>To Date:</span>
                        <input
                            type="date"
                            className="input"
                            value={toDateFilter}
                            onChange={e => setToDateFilter(e.target.value)}
                            style={{ padding: '4px 8px', fontSize: '0.85rem', border: '1.5px solid #111' }}
                        />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 'bold' }}>From Time:</span>
                        <input
                            type="time"
                            className="input"
                            value={fromTimeFilter}
                            onChange={e => setFromTimeFilter(e.target.value)}
                            style={{ padding: '4px 8px', fontSize: '0.85rem', border: '1.5px solid #111' }}
                        />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 'bold' }}>To Time:</span>
                        <input
                            type="time"
                            className="input"
                            value={toTimeFilter}
                            onChange={e => setToTimeFilter(e.target.value)}
                            style={{ padding: '4px 8px', fontSize: '0.85rem', border: '1.5px solid #111' }}
                        />
                    </div>

                    {(fromTimeFilter || toTimeFilter || fromDateFilter !== getLocalDateString() || toDateFilter !== getLocalDateString()) && (
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                                setFromDateFilter(getLocalDateString());
                                setToDateFilter(getLocalDateString());
                                setFromTimeFilter('');
                                setToTimeFilter('');
                            }}
                        >
                            Reset
                        </button>
                    )}
                </div>
            </div>

            {bookings.length === 0 ? (
                <div className="no-bookings"><FiUsers size={48} /><h3>No bookings for selected range</h3><p>Create a booking using the button above or wait for staff entries.</p></div>
            ) : (
                <div className="bookings-grid">
                    {bookings.map(booking => (
                        <div key={booking._id} className="booking-card" style={{ borderLeftColor: getStatusColor(booking.status) }}>
                            <div className="booking-card-header">
                                <h3>{booking.guestName}</h3>
                                <span className="status-badge" style={{ backgroundColor: getStatusColor(booking.status) + '15', color: getStatusColor(booking.status), borderColor: getStatusColor(booking.status) }}>
                                    {booking.status}
                                </span>
                            </div>

                            <div className="booking-details">
                                <div className="detail-row"><FiUsers size={13} /> <span>{booking.guestCount} guests</span></div>
                                <div className="detail-row"><FiClock size={13} /> <span>{booking.fromTime}{booking.toTime ? ` - ${booking.toTime}` : ''}</span></div>
                                {booking.toDate && <div className="detail-row"><FiCalendar size={13} /> <span>{new Date(booking.fromDate).toLocaleDateString()} - {new Date(booking.toDate).toLocaleDateString()}</span></div>}
                                {booking.tableNumbers && <div className="detail-row"><FiMapPin size={13} /> <span>Tables: {booking.tableNumbers}</span></div>}
                                {booking.sections && booking.sections.length > 0 && <div className="detail-row"><FiMapPin size={13} /> <span>Sections: {booking.sections.join(', ')}</span></div>}
                                {booking.guestPhone && <div className="detail-row"><span>Ph: {booking.guestPhone}</span></div>}
                                {booking.paymentAmount > 0 && <div className="detail-row"><FiDollarSign size={13} /> <span style={{ color: '#10B981', fontWeight: 600 }}>Advance: Rs.{booking.paymentAmount}</span></div>}
                                {booking.totalAmount > 0 && <div className="detail-row"><FiDollarSign size={13} /> <span style={{ fontWeight: 700 }}>Total: Rs.{booking.totalAmount}</span></div>}
                                {booking.notes && <div className="detail-row" style={{ fontStyle: 'italic', color: '#6B7280' }}>{booking.notes}</div>}
                                {booking.billGenerated && <div className="detail-row" style={{ color: '#10B981', fontWeight: 600 }}>Bill Generated</div>}
                            </div>

                            <div className="booking-actions">
                                {booking.status === 'upcoming' && (
                                    <button className="btn btn-sm btn-success" onClick={() => handleStatusChange(booking._id, 'confirmed')}><FiCheck /> Confirm</button>
                                )}
                                {booking.status === 'confirmed' && (
                                    <button className="btn btn-sm btn-primary" onClick={() => handleStatusChange(booking._id, 'seated')}>Seat</button>
                                )}
                                {['upcoming', 'confirmed', 'seated'].includes(booking.status) && (
                                    <button className="btn btn-sm btn-complete" onClick={() => openComplete(booking)}>Complete</button>
                                )}
                                {(booking.status === 'upcoming' || booking.status === 'confirmed') && (
                                    <button className="btn btn-sm btn-danger" onClick={() => handleStatusChange(booking._id, 'cancelled')}><FiX /> Cancel</button>
                                )}
                                {user?.role === 'superadmin' && (
                                    <>
                                        <button className="btn btn-sm btn-secondary" onClick={() => openEdit(booking)}><FiEdit2 /> Edit</button>
                                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(booking._id)}><FiTrash2 /></button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Complete + Bill Modal */}
            {completeBooking && (
                <div className="modal-overlay" onClick={() => setCompleteBooking(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header"><h2>Complete Booking</h2><button className="modal-close" onClick={() => setCompleteBooking(null)}>x</button></div>
                        <div className="modal-body">
                            <p style={{ marginBottom: 12 }}>Completing this booking for <strong>{completeBooking.guestName}</strong> ({completeBooking.guestCount} guests).</p>
                            <div className="input-group">
                                <label>Bill Amount (Rs.)</label>
                                <input type="number" className="input" value={completeAmount} onChange={e => setCompleteAmount(e.target.value)} placeholder="Total amount" min="0" />
                                <span style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: 4 }}>A bill will be auto-generated with this amount + 5% GST</span>
                            </div>
                            {completeBooking.paymentAmount > 0 && (
                                <p style={{ fontSize: '0.85rem', color: '#10B981', marginTop: 8 }}>Advance already paid: Rs.{completeBooking.paymentAmount}</p>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-ghost" onClick={() => setCompleteBooking(null)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleComplete} disabled={completing}>{completing ? 'Processing...' : 'Complete & Generate Bill'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Pre-Booking Modal */}
            {showCreateModal && (
                <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
                        <div className="modal-header"><h2>Create New Pre-Booking</h2><button className="modal-close" onClick={() => setShowCreateModal(false)}>×</button></div>
                        <form onSubmit={handleCreateBooking}>
                            <div className="modal-body">
                                <div className="form-row">
                                    <div className="input-group"><label>Guest Name *</label><input className="input" value={createForm.guestName} onChange={e => setCreateForm({ ...createForm, guestName: e.target.value })} required /></div>
                                    <div className="input-group"><label>Phone Number</label><input className="input" value={createForm.guestPhone} onChange={e => setCreateForm({ ...createForm, guestPhone: e.target.value })} /></div>
                                </div>

                                <div className="form-row">
                                    <div className="input-group"><label>Guest Count *</label><input type="number" className="input" value={createForm.guestCount} onChange={e => setCreateForm({ ...createForm, guestCount: parseInt(e.target.value) || 1 })} min="1" required /></div>
                                    <div className="input-group"><label>Advance Paid (Rs.)</label><input type="number" className="input" value={createForm.paymentAmount} onChange={e => setCreateForm({ ...createForm, paymentAmount: parseFloat(e.target.value) || 0 })} /></div>
                                </div>

                                <div className="form-row">
                                    <div className="input-group"><label>From Date *</label><input type="date" className="input" value={createForm.fromDate} onChange={e => setCreateForm({ ...createForm, fromDate: e.target.value })} required /></div>
                                    <div className="input-group"><label>To Date</label><input type="date" className="input" value={createForm.toDate} onChange={e => setCreateForm({ ...createForm, toDate: e.target.value })} /></div>
                                </div>

                                <div className="form-row">
                                    <div className="input-group"><label>From Time *</label><input type="time" className="input" value={createForm.fromTime} onChange={e => setCreateForm({ ...createForm, fromTime: e.target.value })} required /></div>
                                    <div className="input-group"><label>To Time</label><input type="time" className="input" value={createForm.toTime} onChange={e => setCreateForm({ ...createForm, toTime: e.target.value })} /></div>
                                </div>

                                <div className="input-group"><label>Notes / Special Requests</label><textarea className="input" value={createForm.notes} onChange={e => setCreateForm({ ...createForm, notes: e.target.value })} rows={2} /></div>

                                <div className="input-group">
                                    <label>Select Sections</label>
                                    <div className="chips-wrap">
                                        {sectionsList.map(sec => (
                                            <button type="button" key={sec} className={`chip ${createForm.sections.includes(sec) ? 'active' : ''}`} onClick={() => setCreateForm(p => ({ ...p, sections: p.sections.includes(sec) ? p.sections.filter(x => x !== sec) : [...p.sections, sec] }))}>{sec}</button>
                                        ))}
                                    </div>
                                </div>

                                <div className="input-group">
                                    <label>Select Tables</label>
                                    <div className="chips-wrap">
                                        {(() => {
                                            const activeSecs = createForm.sections.length > 0
                                                ? createForm.sections
                                                : (sectionsList.length > 0 ? [sectionsList[0]] : []);
                                            const filtered = tables.filter(t => !t.section || activeSecs.includes(t.section));
                                            const displayList = filtered.length > 0 ? filtered : tables;
                                            return displayList.map(t => (
                                                <button type="button" key={t._id} className={`chip ${createForm.tableIds.includes(t._id) ? 'active' : ''}`} onClick={() => setCreateForm(p => ({ ...p, tableIds: p.tableIds.includes(t._id) ? p.tableIds.filter(x => x !== t._id) : [...p.tableIds, t._id] }))}>
                                                    {t.name || `Table ${t.tableNumber}`} {t.section ? `(${t.section})` : ''}
                                                </button>
                                            ));
                                        })()}
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowCreateModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? 'Creating...' : 'Create Booking'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Modal (Superadmin) */}
            {editBooking && (
                <div className="modal-overlay" onClick={() => setEditBooking(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
                        <div className="modal-header"><h2>Edit Booking</h2><button className="modal-close" onClick={() => setEditBooking(null)}>×</button></div>
                        <form onSubmit={handleSaveEdit}>
                            <div className="modal-body">
                                <div className="form-row">
                                    <div className="input-group"><label>Guest Name</label><input className="input" value={editForm.guestName} onChange={e => setEditForm({ ...editForm, guestName: e.target.value })} required /></div>
                                    <div className="input-group"><label>Phone</label><input className="input" value={editForm.guestPhone} onChange={e => setEditForm({ ...editForm, guestPhone: e.target.value })} /></div>
                                </div>
                                <div className="form-row">
                                    <div className="input-group"><label>Guest Count</label><input type="number" className="input" value={editForm.guestCount} onChange={e => setEditForm({ ...editForm, guestCount: parseInt(e.target.value) })} min="1" /></div>
                                    <div className="input-group"><label>Status</label>
                                        <select className="input" value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}>
                                            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="input-group"><label>From Date *</label><input type="date" className="input" value={editForm.fromDate} onChange={e => setEditForm({ ...editForm, fromDate: e.target.value })} required /></div>
                                    <div className="input-group"><label>To Date</label><input type="date" className="input" value={editForm.toDate} onChange={e => setEditForm({ ...editForm, toDate: e.target.value })} /></div>
                                </div>
                                <div className="form-row">
                                    <div className="input-group"><label>From Time *</label><input type="time" className="input" value={editForm.fromTime} onChange={e => setEditForm({ ...editForm, fromTime: e.target.value })} required /></div>
                                    <div className="input-group"><label>To Time</label><input type="time" className="input" value={editForm.toTime} onChange={e => setEditForm({ ...editForm, toTime: e.target.value })} /></div>
                                </div>
                                <div className="form-row">
                                    <div className="input-group"><label>Advance Payment</label><input type="number" className="input" value={editForm.paymentAmount} onChange={e => setEditForm({ ...editForm, paymentAmount: parseFloat(e.target.value) || 0 })} /></div>
                                    <div className="input-group"><label>Total Amount</label><input type="number" className="input" value={editForm.totalAmount} onChange={e => setEditForm({ ...editForm, totalAmount: parseFloat(e.target.value) || 0 })} /></div>
                                </div>
                                <div className="input-group"><label>Notes</label><textarea className="input" value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} rows={2} /></div>

                                <div className="input-group">
                                    <label>Sections</label>
                                    <div className="chips-wrap">
                                        {sectionsList.map(sec => (
                                            <button type="button" key={sec} className={`chip ${editForm.sections.includes(sec) ? 'active' : ''}`} onClick={() => toggleEditSection(sec)}>{sec}</button>
                                        ))}
                                    </div>
                                </div>
                                <div className="input-group">
                                    <label>Select Tables</label>
                                    <div className="chips-wrap">
                                        {(() => {
                                            const activeSecs = editForm.sections?.length > 0
                                                ? editForm.sections
                                                : (sectionsList.length > 0 ? [sectionsList[0]] : []);
                                            const filtered = tables.filter(t => !t.section || activeSecs.includes(t.section));
                                            const displayList = filtered.length > 0 ? filtered : tables;
                                            return displayList.map(t => (
                                                <button type="button" key={t._id} className={`chip ${editForm.tableIds.includes(t._id) ? 'active' : ''}`} onClick={() => toggleEditTable(t._id)}>
                                                    {t.name || `Table ${t.tableNumber}`} {t.section ? `(${t.section})` : ''}
                                                </button>
                                            ));
                                        })()}
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-ghost" onClick={() => setEditBooking(null)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminBookings;
