import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiArrowRight } from 'react-icons/fi';
import Header from '../components/Header';
import Footer from '../components/Footer';
import CategoryCard from '../components/CategoryCard';
import MenuCard from '../components/MenuCard';
import { getCategories, getCollections } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import Loader from '../components/Loader';
import FloatingCartBtn from '../components/FloatingCartBtn';
import Doodles from '../components/Doodles';
import './Home.css';

const Home = () => {
    const { user, isAuthenticated } = useAuth();
    const { itemCount } = useCart();
    const navigate = useNavigate();
    const [categories, setCategories] = useState([]);
    const [collections, setCustomCollections] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [catRes, colRes] = await Promise.all([
                getCategories(),
                getCollections(true)
            ]);
            setCategories(catRes.data);
            setCustomCollections(colRes.data);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <Loader message="Setting up your poolside escape..." />;
    }

    return (
        <div className="home-page" style={{ position: 'relative' }}>
            <Doodles />
            <Header />

            {/* Hero Section */}
            <section className="hero-section">
                <div className="hero-content">
                    <div className="hero-text">
                        <span className="hero-badge sketch-border-subtle font-sketch">🍹 Eat • Chill • Repeat</span>
                        <h1 className="hero-title">
                            Welcome to <span className="highlight">keabythepool</span>
                        </h1>
                        <p className="hero-description">
                            Sip on refreshing mocktails, enjoy our signature Multani Paneer Tikka, or dive into hot pizzas and burgers. Your perfect poolside foodie escape is here!
                        </p>
                        <div className="hero-stats">
                            <div className="stat-item">
                                <span className="stat-number">30+</span>
                                <span className="stat-label">Mocktails & Bites</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-number">4.9</span>
                                <span className="stat-label">Rating</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-number">10k+</span>
                                <span className="stat-label">Escapes</span>
                            </div>
                        </div>
                        <Link to="/menu" className="hero-cta sketch-border sketch-shadow">
                            Explore Menu <FiArrowRight />
                        </Link>
                    </div>
                    <div className="hero-image-container" id="hero-img-wrap">
                        <img
                            src="/logo.jpg"
                            alt="Kea By The Pool"
                            className="hero-image sketch-border sketch-shadow"
                            onError={(e) => {
                                const wrap = document.getElementById('hero-img-wrap');
                                if (wrap) wrap.style.display = 'none';
                            }}
                        />
                        <div className="hero-image-decoration"></div>
                    </div>
                </div>
            </section>

            {/* Categories Section */}
            {categories.length > 0 && (
                <section className="section">
                    <div className="section-header">
                        <h3 className="section-title">Categories</h3>
                        <Link to="/categories" className="see-all">
                            See All <FiArrowRight />
                        </Link>
                    </div>
                    <div className="horizontal-scroll hide-scrollbar">
                        {categories.map(cat => (
                            <CategoryCard
                                key={cat._id}
                                category={cat}
                                onClick={() => navigate(`/menu?category=${cat._id}`)}
                            />
                        ))}
                    </div>
                </section>
            )}

            {/* Dynamic Collections from CMS */}
            {collections.map(collection => (
                collection.products?.length > 0 && (
                    <section key={collection._id} className={`section collection-${collection.type}`}>
                        <div className="section-header">
                            <h3 className="section-title">{collection.icon} {collection.name}</h3>
                            <Link to={`/menu?collection=${collection.slug}`} className="see-all">
                                See All <FiArrowRight />
                            </Link>
                        </div>
                        {collection.type === 'recommended' ? (
                            <div className="recommended-grid">
                                {collection.products.map(item => (
                                    <MenuCard key={item._id} item={item} />
                                ))}
                            </div>
                        ) : (
                            <div className="horizontal-scroll hide-scrollbar menu-scroll">
                                {collection.products.map(item => (
                                    <div key={item._id} className="menu-scroll-item">
                                        <MenuCard item={item} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                )
            ))}


            {/* Footer */}
            <Footer />
        </div>
    );
};

export default Home;


