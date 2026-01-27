import React from 'react';
import { Link } from 'react-router-dom';
import { FiMapPin, FiPhone, FiMail, FiClock, FiInstagram, FiFacebook, FiTwitter } from 'react-icons/fi';
import './Footer.css';

const Footer = () => {
    return (
        <footer className="footer">
            <div className="footer-content">
                <div className="footer-section footer-brand">
                    <img src="/logo.png" alt="Chetta's Dosa" className="footer-logo" />
                    <p className="footer-tagline">
                        Authentic South Indian Cuisine since 2020.
                        Experience the taste of tradition.
                    </p>
                    <div className="footer-social">
                        <a href="#" className="social-link"><FiInstagram /></a>
                        <a href="#" className="social-link"><FiFacebook /></a>
                        <a href="#" className="social-link"><FiTwitter /></a>
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
                            <span>Near IIT Bhilai, Khamariya</span>
                        </li>
                        <li>
                            <FiPhone className="contact-icon" />
                            <span>+91 98765 43210</span>
                        </li>
                        <li>
                            <FiMail className="contact-icon" />
                            <span>hello@chettasdosa.com</span>
                        </li>
                    </ul>
                </div>

                <div className="footer-section">
                    <h4 className="footer-title">Hours</h4>
                    <ul className="footer-hours">
                        <li>
                            <FiClock className="contact-icon" />
                            <div>
                                <span>Mon - Sun</span>
                                <span>7:00 AM - 2:00 PM</span>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>

            <div className="footer-bottom">
                <p>© 2024 Chetta's Dosa. All rights reserved.</p>
            </div>
        </footer>
    );
};

export default Footer;
