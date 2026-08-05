import React, { useEffect, useState } from 'react';
import './Loader.css';

// Fast-loading behaviour: the loader stays invisible for a short grace period.
// Most API calls resolve within this window, so pages feel instant instead of
// flashing a full-screen spinner on every navigation. The spinner only appears
// when a request is genuinely slow.
const Loader = ({ fullScreen = true, message = "Loading poolside goodies...", delay = 220 }) => {
    const [visible, setVisible] = useState(delay === 0);

    useEffect(() => {
        if (delay === 0) return undefined;
        const timer = setTimeout(() => setVisible(true), delay);
        return () => clearTimeout(timer);
    }, [delay]);

    if (!visible) return null;

    return (
        <div className={`loader-overlay ${fullScreen ? 'full-screen' : 'inline'}`}>
            <div className="loader-container">
                <div className="kea-spinner" aria-hidden="true"></div>
                <div className="loader-text">
                    <h3>{message}</h3>
                </div>
            </div>
        </div>
    );
};

export default Loader;
