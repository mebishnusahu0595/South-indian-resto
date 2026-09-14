const bcrypt = require('bcryptjs');
const Settings = require('../models/Settings');

const CODE_KEY = 'order_reduce_code_hash';
const MAX_FAILURES = 5;
const LOCK_MS = 10 * 60 * 1000;
// ponytail: in-memory lockout per user, resets on restart; fine for one PM2 instance.
const failures = new Map();

const isValidOrderEditCode = code => /^\d{4,8}$/.test(String(code || ''));

const setOrderEditCode = async code => Settings.setSetting(
    CODE_KEY,
    await bcrypt.hash(String(code), 10),
    'Hashed security code staff must enter to reduce or remove order items'
);

const isOrderEditCodeSet = async () => Boolean(await Settings.getSetting(CODE_KEY, ''));

// Resolves to null when the reduction is allowed, otherwise { status, message }.
// Until Superadmin sets a code, reductions work exactly as before (no code needed).
const checkOrderEditCode = async (user, code) => {
    const hash = await Settings.getSetting(CODE_KEY, '');
    if (!hash) return null;

    const userKey = String(user?._id || 'unknown');
    const entry = failures.get(userKey) || { count: 0, lockedUntil: 0 };
    if (entry.lockedUntil > Date.now()) {
        const minutes = Math.ceil((entry.lockedUntil - Date.now()) / 60000);
        return { status: 429, message: `Too many wrong security codes. Try again in ${minutes} minute(s).` };
    }
    if (!code) {
        return { status: 403, message: 'Security code is required to reduce or remove items.' };
    }
    if (await bcrypt.compare(String(code), hash)) {
        failures.delete(userKey);
        return null;
    }

    const count = (entry.lockedUntil ? 0 : entry.count) + 1;
    failures.set(userKey, count >= MAX_FAILURES
        ? { count: 0, lockedUntil: Date.now() + LOCK_MS }
        : { count, lockedUntil: 0 });
    return { status: 403, message: 'Wrong security code.' };
};

module.exports = {
    CODE_KEY,
    isValidOrderEditCode,
    setOrderEditCode,
    isOrderEditCodeSet,
    checkOrderEditCode
};
