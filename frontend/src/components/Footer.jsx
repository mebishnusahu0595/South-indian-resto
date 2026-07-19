import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiMapPin, FiPhone, FiMail, FiClock, FiInstagram, FiFacebook, FiTwitter } from 'react-icons/fi';
import { getSiteInfo } from '../utils/api';
import './Footer.css';

const Footer = () => {
    const [info, setInfo] = useState({
        instagram: '',
        facebook: '',
        twitter: '',
        address: 'Dhanora, Risali, Bhilai',
        phone: '+91 98765 43210',
        email: 'hello@keabythepool.com',
        hoursLabel: 'Mon - Sun',
        hoursTime: '11:00 AM - 11:00 PM'
    });

    useEffect(() => {
        getSiteInfo()
            .then(res => setInfo(prev => ({ ...prev, ...res.data })))
            .catch(() => {}); // Silently use defaults on failure
    }, []);

    return (
        <footer className="footer">
            <div className="footer-content">
                <div className="footer-section footer-brand">
                    <img src="/logo.jpg" alt="keabythepool" className="footer-logo" />
                    <p className="footer-tagline">
                        Eat • Chill • Repeat.
                        Your ultimate poolside foodie escape.
                    </p>
                    <div className="footer-social">
                        {info.instagram ? (
                            <a href={info.instagram} target="_blank" rel="noopener noreferrer" className="social-link"><FiInstagram /></a>
                        ) : (
                            <a href="#" className="social-link" onClick={e => e.preventDefault()}><FiInstagram /></a>
                        )}
                        {info.facebook ? (
                            <a href={info.facebook} target="_blank" rel="noopener noreferrer" className="social-link"><FiFacebook /></a>
                        ) : (
                            <a href="#" className="social-link" onClick={e => e.preventDefault()}><FiFacebook /></a>
                        )}
                        {info.twitter ? (
                            <a href={info.twitter} target="_blank" rel="noopener noreferrer" className="social-link"><FiTwitter /></a>
                        ) : (
                            <a href="#" className="social-link" onClick={e => e.preventDefault()}><FiTwitter /></a>
                        )}
                    </div>
                </div>

                <div className="footer-section">
                    <h4 className="footer-title">Quick Links</h4>
                    <ul className="footer-links">
                        <li><Link to="/">Home</Link></li>
                        <li><Link to="/menu">Menu</Link></li>
                        <li><Link to="/cart">Cart</Link></li>
                        <li><Link to="/profile">My Orders</Link></li>
                    </ul>
                </div>

                <div className="footer-section">
                    <h4 className="footer-title">Contact Us</h4>
                    <ul className="footer-contact">
                        <li>
                            <FiMapPin className="contact-icon" />
                            <span>{info.address}</span>
                        </li>
                        <li>
                            <FiPhone className="contact-icon" />
                            <span>{info.phone}</span>
                        </li>
                        <li>
                            <FiMail className="contact-icon" />
                            <span>{info.email}</span>
                        </li>
                    </ul>
                </div>

                <div className="footer-section">
                    <h4 className="footer-title">Hours</h4>
                    <ul className="footer-hours">
                        <li>
                            <FiClock className="contact-icon" />
                            <div>
                                <span>{info.hoursLabel}</span>
                                <span>{info.hoursTime}</span>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>

            <div className="footer-bottom">
                <p>© 2026 keabythepool. All rights reserved.</p>
            </div>
        </footer>
    );
};

export default Footer;
