const Category = require('../models/Category');
const MenuItem = require('../models/MenuItem');

let beverageCategoryIds = new Set();
let beverageMenuItemIds = new Set();
let lastCacheRefresh = 0;
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

const BEVERAGE_NAME_REGEX = /\b(beverage|drink|mocktail|shake|lassi|mojito|margarita|cooler|coke|sprite|thumsup|thums up|redbull|red bull|fanta|juice|soda|water bottle|cold drink|cold coffee|tea|ice tea|iced tea|milkshake)\b/i;

const refreshBeverageCache = async () => {
    try {
        const now = Date.now();
        if (now - lastCacheRefresh < CACHE_TTL_MS && beverageCategoryIds.size > 0) {
            return;
        }

        const categories = await Category.find({
            name: { $regex: /beverage|mocktail/i }
        }).select('_id name').lean();

        const catIds = categories.map(c => c._id.toString());
        beverageCategoryIds = new Set(catIds);

        const items = await MenuItem.find({
            $or: [
                { category: { $in: categories.map(c => c._id) } },
                { name: { $regex: BEVERAGE_NAME_REGEX } }
            ]
        }).select('_id name category').lean();

        beverageMenuItemIds = new Set(items.map(i => i._id.toString()));
        lastCacheRefresh = now;
    } catch (err) {
        // Safe fallback if database isn't ready or during script execution
        console.warn('[BeverageHelper] Could not refresh cache:', err.message);
    }
};

const isBeverageItem = (item) => {
    if (!item) return false;
    if (typeof item.isBeverage === 'boolean') return item.isBeverage;

    // Check populated category
    const catName = item.category?.name || item.menuItem?.category?.name;
    if (catName && /beverage|mocktail/i.test(catName)) return true;

    const catId = (item.category?._id || item.category || item.menuItem?.category?._id || item.menuItem?.category)?.toString();
    if (catId && beverageCategoryIds.has(catId)) return true;

    // Check menuItem ID
    const menuItemId = (item.menuItem?._id || item.menuItem || item.menuItemId || item._id)?.toString();
    if (menuItemId && beverageMenuItemIds.has(menuItemId)) return true;

    // Check item name
    const name = String(item.name || item.menuItem?.name || '').trim();
    if (name && BEVERAGE_NAME_REGEX.test(name)) return true;

    return false;
};

const splitItemsByBeverage = (items = []) => {
    const foodItems = [];
    const beverageItems = [];

    for (const item of items) {
        if (isBeverageItem(item)) {
            beverageItems.push({ ...item, isBeverage: true });
        } else {
            foodItems.push({ ...item, isBeverage: false });
        }
    }

    return { foodItems, beverageItems };
};

// Seed initial cache in background
refreshBeverageCache().catch(() => {});

module.exports = {
    isBeverageItem,
    splitItemsByBeverage,
    refreshBeverageCache
};
