import React, { useState, useEffect } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiUsers, FiGrid, FiMapPin, FiStar, FiSun, FiCoffee, FiHome, FiTag, FiX } from 'react-icons/fi';
import { getTables, createTable, createBulkTables, updateTable, deleteTable, getTableSections, createSection, renameSection, deleteSection } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import './AdminTables.css';

const AREA_TYPES = [
    { value: 'table', label: 'Table', Icon: FiGrid },
    { value: 'room', label: 'Room', Icon: FiHome },
    { value: 'outdoor', label: 'Outdoor', Icon: FiSun },
    { value: 'vip', label: 'VIP', Icon: FiStar },
    { value: 'bar', label: 'Bar', Icon: FiCoffee },
    { value: 'custom', label: 'Custom', Icon: FiTag },
];

const SHAPES = [
    { value: 'round', label: 'Round' },
    { value: 'square', label: 'Square' },
    { value: 'rectangle', label: 'Rectangle' },
];

const AdminTables = () => {
    const { socket } = useAuth();
    const [tables, setTables] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [formData, setFormData] = useState({
        tableNumber: '', name: '', capacity: 4, section: 'Main Hall', areaType: 'table', shape: 'square'
    });
    const [bulkData, setBulkData] = useState({
        startNumber: 1, endNumber: 10, capacity: 4, section: 'Main Hall', areaType: 'table', shape: 'square'
    });
    const [filterSection, setFilterSection] = useState('all');

    // Sections management
    const [sectionsList, setSectionsList] = useState([]);
    const [showSectionsModal, setShowSectionsModal] = useState(false);
    const [newSectionName, setNewSectionName] = useState('');
    const [savingSection, setSavingSection] = useState(false);

    useEffect(() => { fetchData(); fetchSections(); }, []);

    const fetchSections = async () => {
        try {
            const res = await getTableSections();
            setSectionsList(res.data || []);
        } catch (error) {
            console.error('Error fetching sections:', error);
        }
    };

    const handleAddSection = async (e) => {
        e.preventDefault();
        if (!newSectionName.trim()) return;
        setSavingSection(true);
        try {
            const res = await createSection(newSectionName.trim());
            setSectionsList(res.data || []);
            setNewSectionName('');
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to add section');
        } finally {
            setSavingSection(false);
        }
    };

    const handleDeleteSection = async (name) => {
        if (!window.confirm(`Remove section "${name}"? Tables already in it keep their section, but it won't appear as a preset.`)) return;
        try {
            const res = await deleteSection(name);
            setSectionsList(res.data || []);
        } catch (error) {
            alert('Failed to remove section');
        }
    };

    const handleRenameSection = async (oldName) => {
        const newName = window.prompt(`Rename section "${oldName}" to:`, oldName);
        if (!newName || !newName.trim() || newName.trim() === oldName) return;
        try {
            const res = await renameSection(oldName, newName.trim());
            if (res.data?.sections) {
                setSectionsList(res.data.sections);
            }
            fetchData();
            fetchSections();
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to rename section');
        }
    };

    useEffect(() => {
        if (socket) {
            socket.on('table-occupied', () => fetchData());
            socket.on('table-freed', () => fetchData());
            return () => {
                socket.off('table-occupied');
                socket.off('table-freed');
            };
        }
    }, [socket]);

    const fetchData = async () => {
        try {
            const res = await getTables();
            setTables(res.data);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editItem) {
                await updateTable(editItem._id, formData);
            } else {
                await createTable(formData);
            }
            setShowModal(false);
            resetForm();
            fetchData();
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to save');
        }
    };

    const handleBulkCreate = async (e) => {
        e.preventDefault();
        try {
            const res = await createBulkTables(bulkData);
            const created = res.data?.tables?.length || 0;
            if (created === 0) {
                alert('No new tables were created. Those table numbers may already exist.');
            }
            setShowBulkModal(false);
            setBulkData({ startNumber: 1, endNumber: 10, capacity: 4, section: 'Main Hall', areaType: 'table', shape: 'square' });
            fetchData();
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to create tables');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Delete this table?')) {
            try {
                await deleteTable(id);
                fetchData();
            } catch (error) {
                alert('Failed to delete');
            }
        }
    };

    const handleToggleStatus = async (table) => {
        try {
            const newStatus = table.status === 'available' ? 'occupied' : 'available';
            await updateTable(table._id, {
                ...table,
                status: newStatus,
                isOccupied: newStatus === 'occupied',
                currentOrder: newStatus === 'available' ? null : table.currentOrder
            });
            fetchData();
        } catch (error) {
            alert('Failed to update status');
        }
    };

    const openEdit = (item) => {
        setEditItem(item);
        setFormData({
            tableNumber: item.tableNumber,
            name: item.name || '',
            capacity: item.capacity,
            section: item.section || 'Main Hall',
            areaType: item.areaType || 'table',
            shape: item.shape || 'square'
        });
        setShowModal(true);
    };

    const resetForm = () => {
        setEditItem(null);
        setFormData({ tableNumber: '', name: '', capacity: 4, section: 'Main Hall', areaType: 'table', shape: 'square' });
    };

    if (loading) return <div className="admin-loading"><div className="spinner"></div></div>;

    const availableCount = tables.filter(t => t.status === 'available').length;
    const occupiedCount = tables.filter(t => t.status === 'occupied').length;

    // Get unique sections (merge custom sections list with table-derived)
    const sections = [...new Set([...(sectionsList || []), ...tables.map(t => t.section || 'Main Hall')])].filter(Boolean);

    // Filter tables
    const filteredTables = filterSection === 'all' ? tables : tables.filter(t => (t.section || 'Main Hall') === filterSection);

    // Group by section
    const grouped = filteredTables.reduce((acc, t) => {
        const sec = t.section || 'Main Hall';
        if (!acc[sec]) acc[sec] = [];
        acc[sec].push(t);
        return acc;
    }, {});

    // Sort tables naturally within each section
    Object.keys(grouped).forEach(sec => {
        grouped[sec].sort((a, b) =>
            (a.tableNumber || '').localeCompare(b.tableNumber || '', undefined, { numeric: true, sensitivity: 'base' })
        );
    });

    const getAreaIcon = (type) => {
        const found = AREA_TYPES.find(a => a.value === type);
        if (found) {
            const IconComp = found.Icon;
            return <IconComp size={14} />;
        }
        return <FiGrid size={14} />;
    };

    return (
        <div className="admin-tables">
            <div className="page-header">
                <div>
                    <h1>Tables & Sections Management</h1>
                    <div className="table-stats">
                        <span className="stat available">{availableCount} Available</span>
                        <span className="stat occupied">{occupiedCount} Occupied</span>
                        <span className="stat sections"><FiMapPin /> {sections.length} Sections</span>
                    </div>
                </div>
                <div className="header-actions">
                    <button className="btn btn-secondary" onClick={() => setShowSectionsModal(true)}>
                        <FiMapPin /> Manage Sections
                    </button>
                    <button className="btn btn-secondary" onClick={() => setShowBulkModal(true)}>
                        Add Multiple
                    </button>
                    <button className="btn btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
                        <FiPlus /> Add Table
                    </button>
                </div>
            </div>

            {/* Section Filter */}
            {sections.length > 1 && (
                <div className="section-filter">
                    <button
                        className={`section-filter-btn ${filterSection === 'all' ? 'active' : ''}`}
                        onClick={() => setFilterSection('all')}
                    >
                        All
                    </button>
                    {sections.map(sec => (
                        <button
                            key={sec}
                            className={`section-filter-btn ${filterSection === sec ? 'active' : ''}`}
                            onClick={() => setFilterSection(sec)}
                        >
                            {sec}
                        </button>
                    ))}
                </div>
            )}

            {/* Tables grouped by section */}
            {Object.entries(grouped).map(([sectionName, sectionTables]) => (
                <div key={sectionName} className="section-group">
                    <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FiGrid /> {sectionName}
                        <button
                            className="icon-btn edit"
                            title={`Rename section "${sectionName}"`}
                            onClick={() => handleRenameSection(sectionName)}
                            style={{ padding: '3px 8px', height: 'auto', fontSize: '0.8rem', opacity: 0.85, cursor: 'pointer', borderRadius: '4px' }}
                        >
                            <FiEdit2 size={13} /> Edit
                        </button>
                    </h2>
                    <div className="tables-grid">
                        {sectionTables.map(table => (
                            <div key={table._id} className={`table-card ${table.status} area-${table.areaType || 'table'}`}>
                                <div className="table-area-badge">{getAreaIcon(table.areaType)}</div>
                                <div className="table-number">
                                    {table.name || `Table ${table.tableNumber}`}
                                </div>
                                <div className="table-meta">
                                    <span className="table-capacity"><FiUsers /> {table.capacity} seats</span>
                                    <span className="table-shape">{table.shape || 'square'}</span>
                                </div>
                                <div className={`table-status ${table.status}`}>
                                    {table.status === 'available' ? '✓ Available' :
                                        table.status === 'occupied' ? '● Occupied' :
                                            table.status === 'reserved' ? '◐ Reserved' : '⚠ Maintenance'}
                                </div>
                                {table.currentOrder && (
                                    <div className="table-order">
                                        Order: #{table.currentOrder.orderNumber}
                                    </div>
                                )}
                                <div className="table-actions">
                                    <button
                                        onClick={() => handleToggleStatus(table)}
                                        className={`status-toggle-btn ${table.status}`}
                                        title={table.status === 'available' ? 'Mark as Occupied' : 'Mark as Available'}
                                    >
                                        {table.status === 'available' ? 'Mark Occupied' : 'Free Table'}
                                    </button>
                                    <button onClick={() => openEdit(table)} className="icon-btn edit"><FiEdit2 /></button>
                                    <button
                                        onClick={() => handleDelete(table._id)}
                                        className="icon-btn delete"
                                        disabled={table.status === 'occupied'}
                                    >
                                        <FiTrash2 />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            {tables.length === 0 && (
                <div className="no-tables">
                    <FiUsers size={48} />
                    <h3>No tables configured</h3>
                    <p>Add tables for your restaurant</p>
                </div>
            )}

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editItem ? 'Edit Table' : 'Add Table'}</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-row">
                                    <div className="input-group">
                                        <label>Table Number *</label>
                                        <input
                                            type="text"
                                            className="input"
                                            value={formData.tableNumber}
                                            onChange={e => setFormData({ ...formData, tableNumber: e.target.value })}
                                            required
                                            placeholder="e.g., 1, A1, VIP1"
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label>Display Name</label>
                                        <input
                                            type="text"
                                            className="input"
                                            value={formData.name}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="e.g., Poolside Booth"
                                        />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="input-group">
                                        <label>Seating Capacity</label>
                                        <input
                                            type="number"
                                            className="input"
                                            value={formData.capacity}
                                            onChange={e => setFormData({ ...formData, capacity: parseInt(e.target.value) || 4 })}
                                            min="1"
                                            max="50"
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label>Section</label>
                                        <select
                                            className="input"
                                            value={formData.section}
                                            onChange={e => setFormData({ ...formData, section: e.target.value })}
                                        >
                                            {sections.map(s => (
                                                <option key={s} value={s}>{s}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="input-group">
                                        <label>Area Type</label>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <select
                                                className="input"
                                                value={AREA_TYPES.find(a => a.value === formData.areaType) ? formData.areaType : '__custom__'}
                                                onChange={e => {
                                                    if (e.target.value === '__custom__') {
                                                        setFormData({ ...formData, areaType: '' });
                                                    } else {
                                                        setFormData({ ...formData, areaType: e.target.value });
                                                    }
                                                }}
                                                style={{ flex: 1 }}
                                            >
                                                {AREA_TYPES.map(a => (
                                                    <option key={a.value} value={a.value}>{a.label}</option>
                                                ))}
                                                <option value="__custom__">Custom...</option>
                                            </select>
                                            {!AREA_TYPES.find(a => a.value === formData.areaType) && (
                                                <input
                                                    type="text"
                                                    className="input"
                                                    value={formData.areaType}
                                                    onChange={e => setFormData({ ...formData, areaType: e.target.value })}
                                                    placeholder="e.g., lounge, gazebo"
                                                    style={{ flex: 1 }}
                                                />
                                            )}
                                        </div>
                                    </div>
                                    <div className="input-group">
                                        <label>Shape</label>
                                        <select
                                            className="input"
                                            value={formData.shape}
                                            onChange={e => setFormData({ ...formData, shape: e.target.value })}
                                        >
                                            {SHAPES.map(s => (
                                                <option key={s.value} value={s.value}>{s.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Bulk Create Modal */}
            {showBulkModal && (
                <div className="modal-overlay" onClick={() => setShowBulkModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Add Multiple Tables</h2>
                            <button className="modal-close" onClick={() => setShowBulkModal(false)}>×</button>
                        </div>
                        <form onSubmit={handleBulkCreate}>
                            <div className="modal-body">
                                <p className="bulk-info">Create numbered tables from start to end</p>
                                <div className="form-row">
                                    <div className="input-group">
                                        <label>Start Number</label>
                                        <input
                                            type="number"
                                            className="input"
                                            value={bulkData.startNumber}
                                            onChange={e => setBulkData({ ...bulkData, startNumber: parseInt(e.target.value) })}
                                            min="1"
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label>End Number</label>
                                        <input
                                            type="number"
                                            className="input"
                                            value={bulkData.endNumber}
                                            onChange={e => setBulkData({ ...bulkData, endNumber: parseInt(e.target.value) })}
                                            min="1"
                                        />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="input-group">
                                        <label>Seating Capacity (all)</label>
                                        <input
                                            type="number"
                                            className="input"
                                            value={bulkData.capacity}
                                            onChange={e => setBulkData({ ...bulkData, capacity: parseInt(e.target.value) })}
                                            min="1"
                                            max="50"
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label>Section</label>
                                        <select
                                            className="input"
                                            value={bulkData.section}
                                            onChange={e => setBulkData({ ...bulkData, section: e.target.value })}
                                        >
                                            {sections.map(s => (
                                                <option key={s} value={s}>{s}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="input-group">
                                        <label>Area Type</label>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <select
                                                className="input"
                                                value={AREA_TYPES.find(a => a.value === bulkData.areaType) ? bulkData.areaType : '__custom__'}
                                                onChange={e => {
                                                    if (e.target.value === '__custom__') {
                                                        setBulkData({ ...bulkData, areaType: '' });
                                                    } else {
                                                        setBulkData({ ...bulkData, areaType: e.target.value });
                                                    }
                                                }}
                                                style={{ flex: 1 }}
                                            >
                                                {AREA_TYPES.map(a => (
                                                    <option key={a.value} value={a.value}>{a.label}</option>
                                                ))}
                                                <option value="__custom__">Custom...</option>
                                            </select>
                                            {!AREA_TYPES.find(a => a.value === bulkData.areaType) && (
                                                <input
                                                    type="text"
                                                    className="input"
                                                    value={bulkData.areaType}
                                                    onChange={e => setBulkData({ ...bulkData, areaType: e.target.value })}
                                                    placeholder="e.g., lounge, gazebo"
                                                    style={{ flex: 1 }}
                                                />
                                            )}
                                        </div>
                                    </div>
                                    <div className="input-group">
                                        <label>Shape</label>
                                        <select
                                            className="input"
                                            value={bulkData.shape}
                                            onChange={e => setBulkData({ ...bulkData, shape: e.target.value })}
                                        >
                                            {SHAPES.map(s => (
                                                <option key={s.value} value={s.value}>{s.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <p className="bulk-preview">
                                    Will create {bulkData.endNumber - bulkData.startNumber + 1} tables
                                    (Table {bulkData.startNumber} to Table {bulkData.endNumber}) in <strong>{bulkData.section}</strong>
                                </p>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowBulkModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Create Tables</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Manage Sections Modal */}
            {showSectionsModal && (
                <div className="modal-overlay" onClick={() => setShowSectionsModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Manage Sections</h2>
                            <button className="modal-close" onClick={() => setShowSectionsModal(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            <p className="bulk-info">
                                Sections group your tables (e.g. Main Hall, Poolside, Rooftop). They appear as tabs in Create Order.
                            </p>
                            <form onSubmit={handleAddSection} className="section-add-row">
                                <input
                                    type="text"
                                    className="input"
                                    value={newSectionName}
                                    onChange={e => setNewSectionName(e.target.value)}
                                    placeholder="New section name e.g. Rooftop"
                                />
                                <button type="submit" className="btn btn-primary" disabled={savingSection}>
                                    {savingSection ? 'Adding...' : <><FiPlus /> Add</>}
                                </button>
                            </form>

                            <div className="sections-list">
                                {sections.length === 0 ? (
                                    <p className="no-sections">No sections yet. Add one above.</p>
                                ) : (
                                    sections.map(sec => {
                                        const tableCount = tables.filter(t => (t.section || 'Main Hall') === sec).length;
                                        return (
                                            <div key={sec} className="section-list-item">
                                                <span className="section-list-name">
                                                    <FiMapPin /> {sec}
                                                    <span className="section-table-count">{tableCount} table{tableCount !== 1 ? 's' : ''}</span>
                                                </span>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <button
                                                        className="icon-btn edit"
                                                        title="Rename section"
                                                        onClick={() => handleRenameSection(sec)}
                                                    >
                                                        <FiEdit2 size={14} />
                                                    </button>
                                                    <button
                                                        className="icon-btn delete"
                                                        title="Remove section preset"
                                                        onClick={() => handleDeleteSection(sec)}
                                                    >
                                                        <FiX size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-ghost" onClick={() => setShowSectionsModal(false)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminTables;
