// Central configuration for API URLs
const getApiUrl = () => {
    const envUrl = import.meta.env.VITE_API_URL;
    // If accessing via local network IP (e.g., 192.168.x.x), dynamically use host hostname for API
    if (typeof window !== 'undefined' && window.location && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        return `http://${window.location.hostname}:5000`;
    }
    return envUrl || 'http://localhost:5000';
};

const BASE_URL = getApiUrl();

export const API_URL = `${BASE_URL}/api`;
export const SOCKET_URL = BASE_URL;
export const IMAGE_URL = BASE_URL;

// Helper function to get full image URL
export const getImageUrl = (imagePath) => {
    if (!imagePath) return null;
    if (imagePath.startsWith('http')) return imagePath; // Already absolute URL (R2)
    return `${IMAGE_URL}${imagePath}`;
};

export default {
    BASE_URL,
    API_URL,
    SOCKET_URL,
    IMAGE_URL,
    getImageUrl
};
