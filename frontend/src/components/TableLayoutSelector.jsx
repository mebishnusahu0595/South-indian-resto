import React, { useState, useRef, useEffect } from 'react';
import { FiUsers, FiMapPin, FiGrid, FiStar, FiSun, FiCoffee, FiHome, FiTag, FiCheck, FiMove } from 'react-icons/fi';
import './TableLayoutSelector.css';

const UNIT_W = 180;
const UNIT_H = 170;
const GAP_X = 50;
const GAP_Y = 56;
const PER_ROW = 4;

const AreaIcon = ({ type, size = 14 }) => {
    switch (type) {
        case 'room': return <FiHome size={size} />;
        case 'outdoor': return <FiSun size={size} />;
        case 'vip': return <FiStar size={size} />;
        case 'bar': return <FiCoffee size={size} />;
        case 'custom': return <FiTag size={size} />;
        default: return <FiGrid size={size} />;
    }
};

const defaultPos = (index) => ({
    x: 16 + (index % PER_ROW) * (UNIT_W + GAP_X),
    y: 12 + Math.floor(index / PER_ROW) * (UNIT_H + GAP_Y),
});

// Compute chair placement (percent) and rotation (deg) around a table.
const getChairs = (capacity, shape) => {
    const count = Math.min(Math.max(capacity || 1, 1), 14);
    const chairs = [];

    if (shape === 'round') {
        for (let i = 0; i < count; i++) {
            const deg = (360 / count) * i;
            const rad = (deg * Math.PI) / 180;
            const R = 46;
            chairs.push({ left: 50 + R * Math.sin(rad), top: 50 - R * Math.cos(rad), angle: deg });
        }
        return chairs;
    }

    const isRect = shape === 'rectangle';
    let top, bottom, left, right;
    if (isRect) {
        top = Math.ceil(count / 2);
        bottom = count - top;
        left = 0;
        right = 0;
    } else {
        const per = Math.ceil(count / 4);
        top = Math.min(per, count);
        bottom = Math.min(per, count - top);
        right = Math.min(per, count - top - bottom);
        left = count - top - bottom - right;
    }

    const push = (n, side) => {
        for (let i = 0; i < n; i++) {
            const frac = (i + 1) / (n + 1);
            if (side === 'top') chairs.push({ left: frac * 100, top: -7, angle: 0 });
            if (side === 'bottom') chairs.push({ left: frac * 100, top: 107, angle: 180 });
            if (side === 'left') chairs.push({ left: -7, top: frac * 100, angle: 270 });
            if (side === 'right') chairs.push({ left: 107, top: frac * 100, angle: 90 });
        }
    };
    push(top, 'top');
    push(bottom, 'bottom');
    push(left, 'left');
    push(right, 'right');
    return chairs;
};

const TableLayoutSelector = ({ tables, selectedTableIds = [], onToggleTable, sections: sectionList = [], onMoveChair, onMoveTable }) => {
    const [activeSection, setActiveSection] = useState('all');
    const [dragOverTableId, setDragOverTableId] = useState(null);
    const [livePos, setLivePos] = useState(null); // { id, x, y } while dragging a table
    const dragRef = useRef(null);
    const suppressClickRef = useRef(false);

    // Table repositioning via pointer drag
    useEffect(() => {
        const onMove = (e) => {
            const d = dragRef.current;
            if (!d) return;
            const dx = e.clientX - d.startX;
            const dy = e.clientY - d.startY;
            if (Math.abs(dx) > 4 || Math.abs(dy) > 4) d.moved = true;
            if (d.moved) {
                d.curX = Math.max(0, d.origX + dx);
                d.curY = Math.max(0, d.origY + dy);
                setLivePos({ id: d.id, x: d.curX, y: d.curY });
            }
        };
        const onUp = () => {
            const d = dragRef.current;
            if (d && d.moved) {
                suppressClickRef.current = true;
                if (onMoveTable) onMoveTable(d.id, Math.round(d.curX), Math.round(d.curY));
            }
            dragRef.current = null;
            setLivePos(null);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [onMoveTable]);

    const startTableDrag = (e, tableId, pos) => {
        if (!onMoveTable) return;
        if (e.button !== 0) return;
        if (e.target.closest('.tls-chair')) return; // chairs have their own drag
        e.preventDefault();
        dragRef.current = { id: tableId, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, moved: false, curX: pos.x, curY: pos.y };
    };

    const handleTableClick = (table) => {
        if (suppressClickRef.current) { suppressClickRef.current = false; return; }
        if (table.status !== 'occupied') onToggleTable(table);
    };

    const handleChairDragStart = (e, tableId) => {
        if (!onMoveChair) return;
        e.stopPropagation();
        e.dataTransfer.setData('fromTableId', tableId);
        e.dataTransfer.effectAllowed = 'move';
    };
    const handleTableDragOver = (e, tableId) => {
        if (!onMoveChair) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOverTableId !== tableId) setDragOverTableId(tableId);
    };
    const handleTableDragLeave = () => setDragOverTableId(null);
    const handleTableDrop = (e, toTableId) => {
        if (!onMoveChair) return;
        e.preventDefault();
        e.stopPropagation();
        const fromTableId = e.dataTransfer.getData('fromTableId');
        setDragOverTableId(null);
        if (fromTableId && fromTableId !== toTableId) onMoveChair(fromTableId, toTableId);
    };

    const derived = [...new Set(tables.map(t => t.section || 'Main Hall'))];
    const sections = [...new Set([...(sectionList || []), ...derived])];
    const filtered = activeSection === 'all' ? tables : tables.filter(t => (t.section || 'Main Hall') === activeSection);
    const grouped = filtered.reduce((acc, t) => {
        const sec = t.section || 'Main Hall';
        (acc[sec] = acc[sec] || []).push(t);
        return acc;
    }, {});

    const getPos = (t, i) => (t.posX != null && t.posY != null) ? { x: t.posX, y: t.posY } : defaultPos(i);

    return (
        <div className="table-layout-selector">
            <div className="tls-section-tabs">
                <button className={`tls-tab ${activeSection === 'all' ? 'active' : ''}`} onClick={() => setActiveSection('all')}>All</button>
                {sections.map(sec => (
                    <button key={sec} className={`tls-tab ${activeSection === sec ? 'active' : ''}`} onClick={() => setActiveSection(sec)}>
                        <FiMapPin size={12} /> {sec}
                    </button>
                ))}
            </div>

            <div className="tls-layout-area">

                {Object.entries(grouped).map(([sectionName, sectionTables]) => {
                    const positions = sectionTables.map((t, i) => getPos(t, i));
                    const floorHeight = Math.max(220, ...positions.map(p => p.y + UNIT_H + 24));
                    const floorWidth = Math.max(PER_ROW * (UNIT_W + GAP_X), ...positions.map(p => p.x + UNIT_W + 24));
                    return (
                        <div key={sectionName} className="tls-section-group">
                            <div className="tls-section-label">{sectionName}</div>
                            <div className="tls-tables-floor" style={{ height: floorHeight, minWidth: floorWidth }}>
                                {sectionTables.map((table, i) => {
                                    const isSelected = selectedTableIds.includes(table._id);
                                    const isOccupied = table.status === 'occupied';
                                    const isReserved = table.status === 'reserved';
                                    const chairs = getChairs(table.capacity, table.shape || 'square');
                                    const basePos = positions[i];
                                    const pos = (livePos && livePos.id === table._id) ? livePos : basePos;
                                    return (
                                        <div
                                            key={table._id}
                                            className={`tls-table-unit ${isSelected ? 'selected' : ''} ${isOccupied ? 'occupied' : ''} ${isReserved ? 'reserved' : ''} ${dragOverTableId === table._id ? 'drag-over' : ''} ${livePos && livePos.id === table._id ? 'dragging' : ''} shape-${table.shape || 'square'} area-${table.areaType || 'table'}`}
                                            style={{ left: pos.x, top: pos.y }}
                                            onMouseDown={(e) => startTableDrag(e, table._id, basePos)}
                                            onClick={() => handleTableClick(table)}
                                            onDragOver={(e) => handleTableDragOver(e, table._id)}
                                            onDragLeave={handleTableDragLeave}
                                            onDrop={(e) => handleTableDrop(e, table._id)}
                                            title={`${table.name || 'Table ' + table.tableNumber} | ${table.capacity} seats | ${table.status}`}
                                        >
                                            {chairs.map((c, idx) => (
                                                <div
                                                    key={idx}
                                                    className="tls-chair"
                                                    draggable={!!onMoveChair}
                                                    onDragStart={(e) => handleChairDragStart(e, table._id)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    style={{ left: `${c.left}%`, top: `${c.top}%`, transform: `translate(-50%, -50%) rotate(${c.angle}deg)` }}
                                                >
                                                    <span className="chair-back" />
                                                    <span className="chair-seat" />
                                                </div>
                                            ))}
                                            <div className={`tls-table-surface shape-${table.shape || 'square'}`}>
                                                <span className="tls-table-number">{table.name || table.tableNumber}</span>
                                                <span className="tls-table-capacity"><FiUsers size={12} /> {table.capacity}</span>
                                            </div>
                                            <div className="tls-area-icon"><AreaIcon type={table.areaType} size={13} /></div>
                                            {onMoveTable && <div className="tls-move-handle"><FiMove size={12} /></div>}
                                            {isSelected && <div className="tls-check"><FiCheck size={15} /></div>}
                                            {isOccupied && <div className="tls-status-dot occupied" />}
                                            {isReserved && <div className="tls-status-dot reserved" />}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}

                {filtered.length === 0 && (
                    <div className="tls-empty">
                        <FiMapPin size={32} />
                        <p>No tables in this section</p>
                    </div>
                )}
            </div>

            <div className="tls-legend">
                <span className="tls-legend-item"><span className="dot available" /> Available</span>
                <span className="tls-legend-item"><span className="dot occupied" /> Occupied</span>
                <span className="tls-legend-item"><span className="dot reserved" /> Reserved</span>
                <span className="tls-legend-item"><span className="dot selected-dot" /> Selected</span>
                {onMoveTable && <span className="tls-legend-item"><FiMove size={11} /> Drag to move tables</span>}
            </div>
        </div>
    );
};

export default TableLayoutSelector;
