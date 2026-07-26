// CSV/Excel Export Utility

const REPORT_FOLDER_NAME = 'Sale Report';
const HANDLE_DB_NAME = 'kea-sale-report-storage';
const HANDLE_STORE_NAME = 'directory-handles';
const HANDLE_KEY = 'desktop-root';
const HANDLE_MARKER_KEY = 'kea_sale_report_folder_configured';

let cachedRootHandle = null;
let rootHandleLoaded = false;
let rootHandlePromise = null;

const openHandleDatabase = () => new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
        resolve(null);
        return;
    }

    const request = window.indexedDB.open(HANDLE_DB_NAME, 1);
    request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(HANDLE_STORE_NAME)) {
            db.createObjectStore(HANDLE_STORE_NAME);
        }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

const readStoredRootHandle = async () => {
    const db = await openHandleDatabase();
    if (!db) return null;

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(HANDLE_STORE_NAME, 'readonly');
        const request = transaction.objectStore(HANDLE_STORE_NAME).get(HANDLE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
    });
};

const storeRootHandle = async (handle) => {
    const db = await openHandleDatabase();
    if (!db) return;

    await new Promise((resolve, reject) => {
        const transaction = db.transaction(HANDLE_STORE_NAME, 'readwrite');
        transaction.objectStore(HANDLE_STORE_NAME).put(handle, HANDLE_KEY);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
    });
    db.close();
};

const loadRootHandle = () => {
    if (!rootHandlePromise) {
        rootHandlePromise = readStoredRootHandle()
            .then(handle => {
                cachedRootHandle = handle;
                rootHandleLoaded = true;
                return handle;
            })
            .catch(() => {
                rootHandleLoaded = true;
                return null;
            });
    }
    return rootHandlePromise;
};

// Start loading the persisted structured-clone handle while the screen renders,
// so a later export click retains its browser user activation for permissions.
if (typeof window !== 'undefined') loadRootHandle();

const hasWritePermission = async (handle, requestWhenNeeded = true) => {
    if (!handle) return false;
    if (typeof handle.queryPermission !== 'function') return true;

    const options = { mode: 'readwrite' };
    if (await handle.queryPermission(options) === 'granted') return true;
    if (!requestWhenNeeded || typeof handle.requestPermission !== 'function') return false;
    return (await handle.requestPermission(options)) === 'granted';
};

const chooseDesktopRoot = async () => {
    if (typeof window === 'undefined' || typeof window.showDirectoryPicker !== 'function') return null;

    const handle = await window.showDirectoryPicker({
        id: 'kea-sale-report-root',
        mode: 'readwrite',
        startIn: 'desktop'
    });
    cachedRootHandle = handle;
    rootHandleLoaded = true;
    rootHandlePromise = Promise.resolve(handle);
    await storeRootHandle(handle);
    window.localStorage.setItem(HANDLE_MARKER_KEY, 'true');
    return handle;
};

const getWritableRootHandle = async () => {
    // On the first-ever export, open the picker immediately from the click so
    // Chromium's transient user activation is not lost while IndexedDB loads.
    if (!rootHandleLoaded && window.localStorage.getItem(HANDLE_MARKER_KEY) !== 'true') {
        return chooseDesktopRoot();
    }

    const storedHandle = rootHandleLoaded ? cachedRootHandle : await loadRootHandle();
    if (storedHandle && await hasWritePermission(storedHandle)) return storedHandle;
    return chooseDesktopRoot();
};

const sanitizeFilename = (filename, extension) => {
    const cleanExtension = extension.replace(/^\./, '');
    let base = String(filename || 'Sale_Report')
        .replace(new RegExp(`\\.${cleanExtension}$`, 'i'), '')
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
        .trim();

    if (!/\d{4}-\d{2}-\d{2}/.test(base)) {
        const now = new Date();
        const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        base = `${base}_${date}`;
    }
    return `${base}.${cleanExtension}`;
};

const getUniqueFilename = async (directoryHandle, filename) => {
    try {
        await directoryHandle.getFileHandle(filename);
        const dotIndex = filename.lastIndexOf('.');
        const base = dotIndex >= 0 ? filename.slice(0, dotIndex) : filename;
        const extension = dotIndex >= 0 ? filename.slice(dotIndex) : '';
        const now = new Date();
        const time = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
        return `${base}_${time}${extension}`;
    } catch (error) {
        if (error?.name === 'NotFoundError') return filename;
        throw error;
    }
};

const triggerBrowserDownload = (blob, filename) => {
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const saveToSaleReportFolder = async (blob, filename) => {
    const safeFilename = sanitizeFilename(filename, 'csv');

    if (typeof window === 'undefined' || typeof window.showDirectoryPicker !== 'function') {
        triggerBrowserDownload(blob, safeFilename);
        return { savedToFolder: false, filename: safeFilename, fallback: true };
    }

    try {
        const desktopRoot = await getWritableRootHandle();
        if (!desktopRoot) {
            triggerBrowserDownload(blob, safeFilename);
            return { savedToFolder: false, filename: safeFilename, fallback: true };
        }

        // create:true also recreates the folder automatically if it was deleted.
        const reportFolder = await desktopRoot.getDirectoryHandle(REPORT_FOLDER_NAME, { create: true });
        const uniqueFilename = await getUniqueFilename(reportFolder, safeFilename);
        const fileHandle = await reportFolder.getFileHandle(uniqueFilename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return { savedToFolder: true, folder: REPORT_FOLDER_NAME, filename: uniqueFilename };
    } catch (error) {
        // Cancellation, denied permission, stale handles, and unsupported write
        // implementations all degrade to the browser's normal download flow.
        console.warn('Sale Report folder save unavailable; using browser download:', error);
        triggerBrowserDownload(blob, safeFilename);
        return { savedToFolder: false, filename: safeFilename, fallback: true, error: error?.message };
    }
};

/**
 * Convert data array to CSV string
 */
export const convertToCSV = (data, columns) => {
    if (!data || data.length === 0) return '';

    // Header row
    const header = columns.map(col => col.label).join(',');

    // Data rows
    const rows = data.map(row => {
        return columns.map(col => {
            let value = col.accessor(row);
            // Handle null/undefined
            if (value === null || value === undefined) value = '';
            // Escape quotes and wrap in quotes if contains comma
            if (typeof value === 'string') {
                value = value.replace(/"/g, '""');
                if (value.includes(',') || value.includes('\n') || value.includes('"')) {
                    value = `"${value}"`;
                }
            }
            return value;
        }).join(',');
    });

    return [header, ...rows].join('\n');
};

/**
 * Download CSV file
 */
export const downloadCSV = async (csvContent, filename, options = {}) => {
    const blob = new Blob(['\uFEFF', csvContent], { type: 'text/csv;charset=utf-8;' });
    const safeFilename = sanitizeFilename(filename, 'csv');
    if (options.saleReportFolder === true) {
        return saveToSaleReportFolder(blob, safeFilename);
    }

    triggerBrowserDownload(blob, safeFilename);
    return { savedToFolder: false, filename: safeFilename, fallback: true };
};

/**
 * Export data to CSV
 */
export const exportToCSV = (data, columns, filename, options = {}) => {
    const csv = convertToCSV(data, columns);
    return downloadCSV(csv, filename, options);
};

/**
 * Format date for filename
 */
export const getFilenameDate = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

/**
 * Format date to readable string
 */
export const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
};

/**
 * Customer export columns
 */
export const customerExportColumns = [
    { label: 'Name', accessor: (c) => c.name || 'No Name' },
    { label: 'Phone', accessor: (c) => c.phone || '-' },
    { label: 'Email', accessor: (c) => c.email || '-' },
    { label: 'Total Orders', accessor: (c) => c.paidOrders || 0 },
    { label: 'Total Spent (₹)', accessor: (c) => c.totalSpent || 0 },
    { label: 'Loyalty Points', accessor: (c) => c.loyaltyPoints || 0 },
    { label: 'Last Order Date', accessor: (c) => formatDate(c.lastOrderDate) },
    { label: 'Registration Date', accessor: (c) => formatDate(c.createdAt) }
];

/**
 * Order export columns
 */
export const orderExportColumns = [
    { label: 'Order ID', accessor: (o) => o.orderNumber || o._id?.slice(-8) || '-' },
    { label: 'Date', accessor: (o) => formatDate(o.createdAt) },
    { label: 'Customer Name', accessor: (o) => o.user?.name || 'Guest' },
    { label: 'Customer Phone', accessor: (o) => o.user?.phone || '-' },
    { label: 'Items', accessor: (o) => o.items?.map(i => `${i.name} x${i.quantity}`).join('; ') || '-' },
    { label: 'Subtotal (₹)', accessor: (o) => o.subtotal || 0 },
    { label: 'Discount (₹)', accessor: (o) => o.discount || 0 },
    { label: 'Tax (₹)', accessor: (o) => o.tax || 0 },
    { label: 'Total (₹)', accessor: (o) => o.total || 0 },
    { label: 'Payment Method', accessor: (o) => o.paymentMethod || '-' },
    { label: 'Status', accessor: (o) => o.status || '-' },
    { label: 'Table', accessor: (o) => o.table?.tableNumber ? `Table ${o.table.tableNumber}` : 'N/A' }
];

/**
 * Revenue export columns
 */
export const revenueExportColumns = [
    { label: 'Date', accessor: (r) => r.date || formatDate(r._id) },
    { label: 'Orders', accessor: (r) => r.orders || 0 },
    { label: 'Revenue (₹)', accessor: (r) => r.revenue?.toFixed(2) || 0 },
    { label: 'Profit (₹)', accessor: (r) => r.profit?.toFixed(2) || 0 }
];
