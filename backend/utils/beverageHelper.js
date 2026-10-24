const mongoose = require('mongoose');
const Category = require('../models/Category');
const MenuItem = require('../models/MenuItem');

// Pre-seed known beverage & mocktail category IDs so detection never fails on startup
const STATIC_BEVERAGE_CATEGORY_IDS = [
    '6a5e47ce99c0d046ccf2b637', // Beverages
    '6a5e47cf99c0d046ccf2b658'  // Mocktails
];

let beverageCategoryIds = new Set(STATIC_BEVERAGE_CATEGORY_IDS);
let beverageMenuItemIds = new Set();
let lastCacheRefresh = 0;
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

// Non-beverage service items that might share categories
const SERVICE_ITEM_REGEX = /^(room|swimming\s*pool|pool\s*\d*)/i;

// Regex matching all beverage names, mocktails, shakes, sodas, and drinks
// Handles volumes without word boundary issues (e.g. thumsup200, sprite750ml, soda750ml)
const BEVERAGE_NAME_REGEX = /(thums\s*up|sprite|fanta|\bcoke|pepsi|limca|maaza|frooti|sting|red\s*bull|redbull|monster|water\s*bottle|mineral\s*water|kinley|aquafina|bisleri|soda|beverage|mocktail|shake|lassi|butter\s*milk|buttermilk|mojito|margarita|cooler|juice|cold\s*drink|\bcoffee\b|\btea\b|\bchai\b|ice\s*tea|iced\s*tea|milkshake|frappe|smoothie|crush|syrup|lemonade|nimbu|jaljeera|kala\s*khatta|blue\s*hawaii|citrus\s*infused|spicy\s*guava|orange\s*paradise)/i;

const refreshBeverageCache = async () => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return;
        }

        const now = Date.now();
        if (now - lastCacheRefresh < CACHE_TTL_MS && beverageMenuItemIds.size > 0) {
            return;
        }

        const categories = await Category.find({
            name: { $regex: /beverage|mocktail|drink/i }
        }).select('_id name').lean();

        const catIds = categories.map(c => c._id.toString());
        catIds.forEach(id => beverageCategoryIds.add(id));

        const items = await MenuItem.find({
            $or: [
                { category: { $in: Array.from(beverageCategoryIds).map(id => new mongoose.Types.ObjectId(id)) } },
                { name: { $regex: BEVERAGE_NAME_REGEX } }
            ]
        }).select('_id name category').lean();

        // Only add items that are not room/pool service items
        const bevItemIds = items
            .filter(i => !SERVICE_ITEM_REGEX.test(i.name))
            .map(i => i._id.toString());

        beverageMenuItemIds = new Set(bevItemIds);
        lastCacheRefresh = now;
    } catch (err) {
        // Fallback silently if database is busy
    }
};

const isBeverageItem = (item) => {
    if (!item) return false;
    if (typeof item.isBeverage === 'boolean') return item.isBeverage;

    const name = String(item.name || item.menuItem?.name || '').trim();
    if (name && SERVICE_ITEM_REGEX.test(name)) return false;

    // Check item name via regex
    if (name && BEVERAGE_NAME_REGEX.test(name)) return true;

    // Check populated category
    const catName = item.category?.name || item.menuItem?.category?.name;
    if (catName && /beverage|mocktail|drink/i.test(catName)) return true;

    const catId = (item.category?._id || item.category || item.menuItem?.category?._id || item.menuItem?.category)?.toString();
    if (catId && beverageCategoryIds.has(catId)) return true;

    // Check menuItem ID
    const menuItemId = (item.menuItem?._id || item.menuItem || item.menuItemId || item._id)?.toString();
    if (menuItemId && beverageMenuItemIds.has(menuItemId)) return true;

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

// Seed initial cache once DB connects
if (mongoose.connection.readyState === 1) {
    refreshBeverageCache().catch(() => {});
} else {
    mongoose.connection.once('connected', () => {
        refreshBeverageCache().catch(() => {});
    });
}

module.exports = {
    isBeverageItem,
    splitItemsByBeverage,
    refreshBeverageCache,
    BEVERAGE_NAME_REGEX
};
