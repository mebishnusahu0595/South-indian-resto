import React from 'react';
import './Loader.css';

const Loader = ({ fullScreen = true, message = "Loading poolside goodies..." }) => {
    return (
        <div className={`loader-overlay ${fullScreen ? 'full-screen' : 'inline'}`}>
            <div className="loader-container">
                <div className="pool-wrapper">
                    {/* Water waves loader */}
                    <div className="wave wave-1"></div>
                    <div className="wave wave-2"></div>
                    <div className="wave wave-3"></div>
                    <div className="float-ring"></div>
                </div>

                <div className="loader-text">
                    <h3>{message}</h3>
                    <div className="loading-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Loader;
