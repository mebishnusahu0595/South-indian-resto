const DEFAULT_TAX_CONFIG = [{ name: 'GST', rate: 5 }];

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const getMenuItemId = (item) => {
    const value = item?.menuItem?._id || item?.menuItem || item?.menuItemId;
    return value ? value.toString() : '';
};

const normalizeItems = (items = []) => {
    const itemMap = new Map();

    for (const item of items) {
        const menuItemId = getMenuItemId(item);
        const quantity = Math.floor(Number(item?.quantity));
        if (!menuItemId || !Number.isFinite(quantity) || quantity <= 0) continue;

        const price = Number(item?.price) || 0;
        const notes = String(item?.notes || item?.instruction || item?.specialInstructions || item?.note || '').trim();
        const existing = itemMap.get(menuItemId);

        if (existing) {
            existing.quantity += quantity;
            existing.total = roundMoney(existing.price * existing.quantity);
            if (notes && !existing.notes.split(' | ').includes(notes)) {
                existing.notes = existing.notes ? `${existing.notes} | ${notes}` : notes;
            }
        } else {
            itemMap.set(menuItemId, {
                menuItem: item?.menuItem?._id || item?.menuItem || item?.menuItemId,
                name: item?.name || item?.menuItem?.name || 'Item',
                price,
                quantity,
                total: roundMoney(price * quantity),
                notes
            });
        }
    }

    return Array.from(itemMap.values());
};

const buildItemQuantityMap = (items = []) => {
    const quantities = new Map();

    for (const item of normalizeItems(items)) {
        const menuItemId = getMenuItemId(item);
        if (menuItemId) quantities.set(menuItemId, item.quantity);
    }

    return quantities;
};

const isStalePartialAdditionPayload = (currentItems = [], submittedItems = [], kotHistory = []) => {
    const history = Array.from(kotHistory || []);
    const latestKot = history[history.length - 1];
    if (!latestKot || !Array.isArray(latestKot.items) || latestKot.items.length === 0) return false;

    const kotNumber = String(latestKot.kotNumber || '');
    const notes = String(latestKot.notes || '');
    const isAdditionKot = /^\[ADDITION\]/i.test(notes)
        || (history.length > 1 && /^KOT-/i.test(kotNumber) && !/^CANCEL-/i.test(kotNumber));
    if (!isAdditionKot) return false;

    const currentMap = buildItemQuantityMap(currentItems);
    const submittedMap = buildItemQuantityMap(submittedItems);
    const latestAdditionMap = buildItemQuantityMap(latestKot.items);
    if (currentMap.size === 0 || submittedMap.size === 0 || latestAdditionMap.size === 0) return false;

    const submittedContainsOnlyLatestAddition = Array.from(submittedMap.keys())
        .every(menuItemId => latestAdditionMap.has(menuItemId));
    if (!submittedContainsOnlyLatestAddition) return false;

    const omitsExistingItems = Array.from(currentMap.keys())
        .some(menuItemId => !submittedMap.has(menuItemId));
    const usesAdditionDeltaInsteadOfCurrentQuantity = Array.from(submittedMap.entries())
        .every(([menuItemId, quantity]) => quantity <= (latestAdditionMap.get(menuItemId) || 0))
        && Array.from(submittedMap.entries())
            .some(([menuItemId, quantity]) => (currentMap.get(menuItemId) || 0) > quantity);

    return omitsExistingItems || usesAdditionDeltaInsteadOfCurrentQuantity;
};

const sanitizeTaxConfig = (taxConfig, fallbackRate = 5) => {
    const parsedFallbackRate = Number(fallbackRate);
    const safeFallbackRate = Number.isFinite(parsedFallbackRate) && parsedFallbackRate >= 0 ? parsedFallbackRate : 5;
    const source = Array.isArray(taxConfig) && taxConfig.length > 0
        ? taxConfig
        : [{ name: 'GST', rate: safeFallbackRate }];

    const sanitized = source
        .map((tax, index) => ({
            name: String(tax?.name || `Tax ${index + 1}`).trim(),
            rate: Number.isFinite(Number(tax?.rate)) ? Number(tax.rate) : safeFallbackRate
        }))
        .filter(tax => tax.name && Number.isFinite(tax.rate) && tax.rate >= 0);

    return sanitized.length > 0 ? sanitized : [{ name: 'GST', rate: safeFallbackRate }];
};

const getConfiguredTax = async (Settings) => {
    const configuredGstRate = Number(await Settings.getSetting('gst_rate', 5));
    const gstRate = Number.isFinite(configuredGstRate) && configuredGstRate >= 0 ? configuredGstRate : 5;
    const taxConfig = await Settings.getSetting('tax_config', [{ name: 'GST', rate: gstRate }]);
    return sanitizeTaxConfig(taxConfig, gstRate);
};

const calculateTotals = (items, discount = 0, taxConfig = DEFAULT_TAX_CONFIG) => {
    const normalizedItems = normalizeItems(items);
    const subtotal = roundMoney(normalizedItems.reduce((sum, item) => sum + item.price * item.quantity, 0));
    const requestedDiscount = Number(discount) || 0;
    const discountAmount = roundMoney(Math.max(0, requestedDiscount));
    const taxableAmount = roundMoney(Math.max(0, subtotal - discountAmount));
    const taxes = sanitizeTaxConfig(taxConfig);
    const taxDetails = taxes.map(tax => ({
        name: tax.name,
        rate: tax.rate,
        amount: roundMoney(taxableAmount * tax.rate / 100)
    }));
    const tax = roundMoney(taxDetails.reduce((sum, detail) => sum + detail.amount, 0));
    const total = roundMoney(taxableAmount + tax);

    return { items: normalizedItems, subtotal, discount: discountAmount, taxableAmount, taxDetails, tax, total };
};

const allocateAmount = (amount, weights) => {
    const roundedAmount = roundMoney(amount);
    const totalWeight = weights.reduce((sum, weight) => sum + Math.max(0, Number(weight) || 0), 0);
    let allocated = 0;

    return weights.map((weight, index) => {
        if (index === weights.length - 1) return roundMoney(roundedAmount - allocated);
        const share = totalWeight > 0 ? roundMoney(roundedAmount * Math.max(0, Number(weight) || 0) / totalWeight) : 0;
        allocated = roundMoney(allocated + share);
        return share;
    });
};

const allocateBillTotals = (orders, totals) => {
    const weights = orders.map(order => roundMoney(normalizeItems(order.items).reduce((sum, item) => sum + item.price * item.quantity, 0)));
    const discounts = allocateAmount(totals.discount, weights);
    const taxes = allocateAmount(totals.tax, weights);
    const grandTotals = allocateAmount(totals.total, weights);
    const taxAllocations = totals.taxDetails.map(detail => allocateAmount(detail.amount, weights));

    return orders.map((order, index) => ({
        order,
        items: normalizeItems(order.items),
        subtotal: weights[index],
        discount: discounts[index],
        tax: taxes[index],
        total: grandTotals[index],
        taxDetails: totals.taxDetails.map((detail, taxIndex) => ({
            name: detail.name,
            rate: detail.rate,
            amount: taxAllocations[taxIndex][index]
        }))
    }));
};

const getBusinessDate = (date = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
};

const getBusinessDayRange = (dateString = getBusinessDate()) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        throw new Error('Invalid date. Expected YYYY-MM-DD.');
    }
    const start = new Date(`${dateString}T00:00:00.000+05:30`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
    return { start, end, businessDate: dateString };
};

module.exports = {
    roundMoney,
    getMenuItemId,
    normalizeItems,
    isStalePartialAdditionPayload,
    sanitizeTaxConfig,
    getConfiguredTax,
    calculateTotals,
    allocateBillTotals,
    getBusinessDate,
    getBusinessDayRange
};
