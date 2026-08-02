const mongoose = require('mongoose');

const isTransactionUnsupported = error => {
    const message = String(error?.message || '').toLowerCase();
    return error?.code === 20
        || error?.codeName === 'IllegalOperation'
        || message.includes('transaction numbers are only allowed')
        || message.includes('transaction support is not available')
        || message.includes('does not support retryable writes');
};

// Billing touches Bills, Orders, and Tables together. Fail closed when MongoDB
// is a standalone server, because retrying without a transaction can produce
// disappearing or partially settled bills. Production must use Atlas or a replica set.
const runAtomic = async work => {
    try {
        return await mongoose.connection.transaction(async session => work(session));
    } catch (error) {
        if (!isTransactionUnsupported(error)) throw error;
        const transactionError = new Error('Atomic billing requires MongoDB transaction support. Configure MongoDB as a replica set or use MongoDB Atlas. No billing changes were saved.');
        transactionError.statusCode = 503;
        transactionError.cause = error;
        throw transactionError;
    }
};

const sessionOptions = session => (session ? { session } : {});

module.exports = { runAtomic, sessionOptions };
