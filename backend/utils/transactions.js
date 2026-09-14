const mongoose = require('mongoose');

const isTransactionUnsupported = error => {
    const message = String(error?.message || '').toLowerCase();
    return error?.code === 20
        || error?.codeName === 'IllegalOperation'
        || message.includes('transaction numbers are only allowed')
        || message.includes('transaction support is not available')
        || message.includes('does not support retryable writes')
        || message.includes('replica set')
        || message.includes('replicaset');
};

// Try with transaction (replica set / Atlas). If MongoDB is standalone,
// fall back to non-transactional execution so the restaurant can still operate.
const runAtomic = async work => {
    try {
        return await mongoose.connection.transaction(async session => work(session));
    } catch (error) {
        if (!isTransactionUnsupported(error)) throw error;
        // Standalone MongoDB — run without session (no atomicity guarantee,
        // but acceptable for a single-server restaurant deployment).
        console.warn('[transactions] MongoDB standalone detected — running billing WITHOUT transaction session. Upgrade to a replica set for full atomicity.');
        return await work(null);
    }
};

const sessionOptions = session => (session ? { session } : {});

module.exports = { runAtomic, sessionOptions };
