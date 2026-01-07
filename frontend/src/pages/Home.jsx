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
        return <Loader message="Loading delicious items..." />;
    }

    return (
        <div className="home-page">
            <Header />

            {/* Hero Section */}
            <section className="hero-section">
                <div className="hero-content">
                    <div className="hero-text">
                        <span className="hero-badge">🍽️ Authentic South Indian</span>
                        <h1 className="hero-title">
                            Experience the <span className="highlight">Taste</span> of
                            <span className="animate-text"> Tradition</span>
                        </h1>
                        <p className="hero-description">
                            From crispy dosas to fluffy idlis, every dish is crafted with love
                            and authentic spices. Taste the flavors of South India!
                        </p>
                        <div className="hero-stats">
                            <div className="stat-item">
                                <span className="stat-number">50+</span>
                                <span className="stat-label">Dishes</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-number">4.8</span>
                                <span className="stat-label">Rating</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-number">15k+</span>
                                <span className="stat-label">Orders</span>
                            </div>
                        </div>
                        <Link to="/menu" className="hero-cta">
                            Explore Menu <FiArrowRight />
                        </Link>
                    </div>
                    <div className="hero-image-container">
                        <img src="/hero-image.png" alt="South Indian Cuisine" className="hero-image" />
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

            {/* Floating Cart Button */}
            {itemCount > 0 && (
                <Link to="/cart" className="floating-cart-btn">
                    <span>View Cart</span>
                    <span className="floating-cart-count">{itemCount} items</span>
                </Link>
            )}

            {/* Footer */}
            <Footer />
        </div>
    );
};

export default Home;


