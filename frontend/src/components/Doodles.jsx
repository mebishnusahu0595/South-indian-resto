import React from 'react';
import './Doodles.css';

// SVG Doodle paths drawn in hand-drawn style
const CocktailDoodle = () => (
  <svg viewBox="0 0 100 100" className="doodle-svg color-pink">
    {/* Outline */}
    <path d="M20,20 L80,20 L53,60 L53,85 L70,85 L70,90 L30,90 L30,85 L47,85 L47,60 Z" fill="none" stroke="#111111" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    {/* Liquid */}
    <path d="M25,25 L75,25 L55,55 L45,55 Z" fill="#F87171" stroke="#111111" strokeWidth="2" />
    {/* Straw */}
    <path d="M45,10 L50,35" fill="none" stroke="#111111" strokeWidth="3" strokeLinecap="round" />
    {/* Straw bend */}
    <path d="M45,10 L35,12" fill="none" stroke="#111111" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

const PizzaDoodle = () => (
  <svg viewBox="0 0 100 100" className="doodle-svg color-yellow">
    {/* Slice body */}
    <path d="M20,25 L80,35 L40,85 Z" fill="#FBBF24" stroke="#111111" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    {/* Crust */}
    <path d="M20,25 Q50,15 80,35" fill="none" stroke="#111111" strokeWidth="5" strokeLinecap="round" />
    {/* Toppings (Pepperoni circles) */}
    <circle cx="45" cy="45" r="6" fill="#EF4444" stroke="#111111" strokeWidth="2" />
    <circle cx="60" cy="55" r="5" fill="#EF4444" stroke="#111111" strokeWidth="2" />
    <circle cx="38" cy="65" r="6" fill="#EF4444" stroke="#111111" strokeWidth="2" />
  </svg>
);

const BurgerDoodle = () => (
  <svg viewBox="0 0 100 100" className="doodle-svg color-orange">
    {/* Top Bun */}
    <path d="M15,45 Q50,15 85,45 Z" fill="#F59E0B" stroke="#111111" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    {/* Cheese */}
    <path d="M10,50 L90,50 L80,57 L70,50 L60,57 L50,50 L40,57 L30,50 L20,57 Z" fill="#FBBF24" stroke="#111111" strokeWidth="2" strokeLinejoin="round" />
    {/* Patty */}
    <path d="M18,58 L82,58 C86,58 86,68 82,68 L18,68 C14,68 14,58 18,58 Z" fill="#78350F" stroke="#111111" strokeWidth="3" strokeLinecap="round" />
    {/* Bottom Bun */}
    <path d="M20,72 L80,72 C80,82 20,82 20,72 Z" fill="#F59E0B" stroke="#111111" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

const IceCreamDoodle = () => (
  <svg viewBox="0 0 100 100" className="doodle-svg color-purple">
    {/* Cone */}
    <path d="M30,50 L70,50 L50,90 Z" fill="#D97706" stroke="#111111" strokeWidth="3" strokeLinejoin="round" />
    {/* Cone grid line */}
    <path d="M35,50 L55,90 M45,50 L50,90 M55,50 L45,90" fill="none" stroke="#111111" strokeWidth="1.5" />
    {/* Scoop */}
    <path d="M25,50 C20,30 80,30 75,50 C80,55 20,55 25,50 Z" fill="#EC4899" stroke="#111111" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    {/* Cherry */}
    <circle cx="50" cy="22" r="7" fill="#EF4444" stroke="#111111" strokeWidth="2" />
    <path d="M52,15 Q60,5 57,0" fill="none" stroke="#111111" strokeWidth="2" />
  </svg>
);

const SparkleDoodle = () => (
  <svg viewBox="0 0 100 100" className="doodle-svg color-blue">
    <path d="M50,10 Q50,50 90,50 Q50,50 50,90 Q50,50 10,50 Q50,50 50,10 Z" fill="#60A5FA" stroke="#111111" strokeWidth="3" strokeLinejoin="round" />
  </svg>
);

const SpiralDoodle = () => (
  <svg viewBox="0 0 100 100" className="doodle-svg color-green">
    <path d="M50,50 Q60,40 50,30 Q35,35 40,55 Q55,65 70,50 Q80,25 50,15 Q15,25 25,70 Q45,90 85,75" fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

const Doodles = ({ excludeOnMobile = false }) => {
  return (
    <div className={`doodles-container ${excludeOnMobile ? 'exclude-mobile' : ''}`}>
      <div className="doodle doodle-1"><CocktailDoodle /></div>
      <div className="doodle doodle-2"><PizzaDoodle /></div>
      <div className="doodle doodle-3"><BurgerDoodle /></div>
      <div className="doodle doodle-4"><IceCreamDoodle /></div>
      <div className="doodle doodle-5"><SparkleDoodle /></div>
      <div className="doodle doodle-6"><SpiralDoodle /></div>
      <div className="doodle doodle-7"><SparkleDoodle /></div>
      <div className="doodle doodle-8"><SpiralDoodle /></div>
    </div>
  );
};

export default Doodles;
