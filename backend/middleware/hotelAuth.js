const Settings = require('../models/Settings');

/**
 * Middleware to secure hotel PMS integration API endpoints.
 * Accepts API key via:
 * 1. Header: 'x-api-key: YOUR_KEY'
 * 2. Header: 'Authorization: Bearer YOUR_KEY'
 * 3. Query Param: '?apiKey=YOUR_KEY' (ideal for Server-Sent Events / EventSource)
 */
const hotelAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const headerKey = req.headers['x-api-key'];
        const queryKey = req.query.apiKey;

        let providedKey = headerKey || queryKey;
        if (!providedKey && authHeader && authHeader.startsWith('Bearer ')) {
            providedKey = authHeader.slice(7).trim();
        }

        if (!providedKey) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized: Hotel API key is required in x-api-key header or ?apiKey query param'
            });
        }

        // Fetch configured API key from DB Settings or environment variable
        const configuredKey = await Settings.getSetting(
            'hotel_pms_api_key',
            process.env.HOTEL_PMS_API_KEY || 'kea_pms_live_key_9021'
        );

        if (providedKey !== configuredKey) {
            return res.status(403).json({
                success: false,
                message: 'Forbidden: Invalid Hotel API key'
            });
        }

        req.isHotelPmsClient = true;
        next();
    } catch (err) {
        console.error('[HotelAuth] Error validating API key:', err);
        return res.status(500).json({
            success: false,
            message: 'Server error validating API key'
        });
    }
};

module.exports = hotelAuth;
