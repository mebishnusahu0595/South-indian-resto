import React from 'react';
import { FiPlus, FiMinus } from 'react-icons/fi';
import { useCart } from '../context/CartContext';
import { getImageUrl } from '../utils/config';
import './MenuCard.css';

const MenuCard = ({ item }) => {
    const { items, addItem, incrementQuantity, decrementQuantity } = useCart();
    const cartItem = items.find(i => i._id === item._id);
    const quantity = cartItem?.quantity || 0;

    const imageUrl = getImageUrl(item.image) || '/placeholder-food.svg';

    return (
        <div className="menu-card sketch-border-subtle sketch-shadow">
            <div className="menu-card-image-container">
                <img
                    src={imageUrl}
                    alt={item.name}
                    className="menu-card-image"
                    onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.parentElement.style.background = '#EDE9FE';
                        e.target.parentElement.style.display = 'flex';
                        e.target.parentElement.style.alignItems = 'center';
                        e.target.parentElement.style.justifyContent = 'center';
                        e.target.parentElement.innerHTML += `<span style="font-size:2.5rem;opacity:0.4">🍽️</span>`;
                    }}
                />
                {item.isBestSeller && <span className="menu-badge bestseller">Bestseller</span>}
                {item.isNewItem && <span className="menu-badge new">New</span>}
                {!item.isAvailable && <div className="out-of-stock-overlay">Out of Stock</div>}
            </div>

            <div className="menu-card-content">
                <div className="menu-card-header">
                    <span className={`veg-badge ${item.isVeg ? 'badge-veg' : 'badge-non-veg'}`}></span>
                    <h3 className="menu-card-name">{item.name}</h3>
                </div>

                {item.description && (
                    <p className="menu-card-description">{item.description}</p>
                )}

                <div className="menu-card-footer">
                    <span className="menu-card-price">₹{item.price}</span>

                    {!item.isAvailable && (
                        <span style={{ fontSize: '0.85rem', color: '#DC2626', fontWeight: 'bold' }}>SOLD OUT</span>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MenuCard;
