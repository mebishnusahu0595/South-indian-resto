import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiGrid, FiSearch } from 'react-icons/fi';
import Header from '../components/Header';
import CategoryCard from '../components/CategoryCard';
import MenuCard from '../components/MenuCard';
import { getCategories, getMenuItems } from '../utils/api';
import Loader from '../components/Loader';
import './Menu.css';

const Menu = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [categories, setCategories] = useState([]);
    const [menuItems, setMenuItems] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || '');
    const [menuSearch, setMenuSearch] = useState(searchParams.get('search') || '');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchCategories();
    }, []);

    useEffect(() => {
        fetchMenuItems();
    }, [selectedCategory, searchParams]);

    const fetchCategories = async () => {
        try {
            const res = await getCategories();
            setCategories(res.data);
        } catch (error) {
            console.error('Error fetching categories:', error);
        }
    };

    const fetchMenuItems = async () => {
        setLoading(true);
        try {
            const params = {};
            if (selectedCategory) params.category = selectedCategory;
            if (searchParams.get('bestseller')) params.bestseller = 'true';
            if (searchParams.get('isNew')) params.isNew = 'true';
            if (searchParams.get('search')) params.search = searchParams.get('search');

            const res = await getMenuItems(params);
            setMenuItems(res.data);
        } catch (error) {
            console.error('Error fetching menu items:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCategoryClick = (categoryId) => {
        if (selectedCategory === categoryId) {
            setSelectedCategory('');
            setSearchParams({});
        } else {
            setSelectedCategory(categoryId);
            setSearchParams({ category: categoryId });
        }
    };

    // Animated placeholder for search
    const placeholderTexts = [
        "Search for Masala Dosa...",
        "Try our famous Idli...",
        "Looking for Vada?",
        "Search Uttapam...",
        "Find your favorite dish...",
    ];
    const [placeholderIndex, setPlaceholderIndex] = React.useState(0);
    const [displayPlaceholder, setDisplayPlaceholder] = React.useState('');
    const [isTyping, setIsTyping] = React.useState(true);

    React.useEffect(() => {
        const currentText = placeholderTexts[placeholderIndex];
        const charIndex = displayPlaceholder.length;

        const timer = setTimeout(() => {
            if (isTyping) {
                if (charIndex < currentText.length) {
                    setDisplayPlaceholder(currentText.slice(0, charIndex + 1));
                } else {
                    setTimeout(() => setIsTyping(false), 2000);
                }
            } else {
                if (charIndex > 0) {
                    setDisplayPlaceholder(currentText.slice(0, charIndex - 1));
                } else {
                    setPlaceholderIndex((prev) => (prev + 1) % placeholderTexts.length);
                    setIsTyping(true);
                }
            }
        }, isTyping ? 100 : 50);

        return () => clearTimeout(timer);
    }, [displayPlaceholder, isTyping, placeholderIndex]);

    return (
        <div className="menu-page">
            <Header title="Menu" showBack />

            {/* Search Bar */}
            <div className="menu-search-container">
                <div className="menu-search-bar">
                    <FiSearch className="menu-search-icon" />
                    <input
                        type="text"
                        placeholder={displayPlaceholder}
                        value={menuSearch}
                        onChange={(e) => {
                            setMenuSearch(e.target.value);
                            if (e.target.value) {
                                setSearchParams({ search: e.target.value });
                            } else {
                                setSearchParams({});
                            }
                        }}
                        className="menu-search-input"
                    />
                </div>
            </div>

            {/* Categories Horizontal Scroll */}
            <div className="categories-container">
                <div
                    className={`category-card ${!selectedCategory ? 'active' : ''}`}
                    onClick={() => handleCategoryClick('')}
                    style={{ marginLeft: '16px' }}
                >
                    <div className="category-image-wrapper" style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'var(--bg-secondary)'
                    }}>
                        <FiGrid size={24} style={{ color: !selectedCategory ? 'var(--primary)' : 'var(--text-secondary)' }} />
                    </div>
                    <span className="category-name">All</span>
                </div>
                <div className="horizontal-scroll hide-scrollbar" style={{ marginLeft: 0, flex: 1 }}>
                    {categories.map(cat => (
                        <CategoryCard
                            key={cat._id}
                            category={cat}
                            isActive={selectedCategory === cat._id}
                            onClick={handleCategoryClick}
                        />
                    ))}
                </div>
            </div>

            {/* Menu Items Grid */}
            <div className="menu-items-container">
                {loading ? (
                    <Loader fullScreen={false} message="Fetching yummy items..." />
                ) : menuItems.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">🍽️</div>
                        <p className="empty-state-title">No items found</p>
                        <p className="empty-state-text">Try selecting a different category</p>
                    </div>
                ) : (
                    <div className="menu-grid">
                        {menuItems.map(item => (
                            <MenuCard key={item._id} item={item} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Menu;
