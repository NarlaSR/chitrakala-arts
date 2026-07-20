import React, { useState, useEffect } from 'react';
import { useHomeView } from '../context/HomeViewContext';
import { useRequestCart } from '../context/RequestCartContext';
import { useCurrency } from '../context/CurrencyContext';
import RequestCartModal from './RequestCartModal';
import { Link } from 'react-router-dom';
import { categoriesAPI } from '../services/api';
import '../styles/Header.css';

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const { setShowAllGrouped } = useHomeView();

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const { items: requestItems } = useRequestCart();
  const [showRequestCart, setShowRequestCart] = useState(false);
  const { countryCode } = useCurrency();

  const isIndia = countryCode === 'IN';
  const siteName = isIndia ? 'ChitraKala Sanskriti' : 'Sainar Chitrakala Ventures';
  const logoSrc = isIndia ? '/assets/images/logo.png' : '/assets/images/sainar-logo.png';
  const logoAlt = isIndia ? 'ChitraKala Sanskriti' : 'Sainar Chitrakala Ventures';

  useEffect(() => {
    categoriesAPI.getPublic()
      .then(setCategories)
      .catch(err => console.error('Failed to load categories:', err));
  }, []);

  return (
    <header className="header">
      <div className="header-container">
        <Link to="/" className="logo" onClick={() => setShowAllGrouped(false)}>
          <img
            src={logoSrc}
            alt={logoAlt}
            className="logo-image"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
          <div className="logo-placeholder" style={{ display: 'none' }}>
            {isIndia ? 'CKS' : 'SCV'}
          </div>
          <h1>{siteName}</h1>
        </Link>

        <button className="mobile-menu-toggle" onClick={toggleMenu}>
          <span></span>
          <span></span>
          <span></span>
        </button>

        <nav className={`nav ${isMenuOpen ? 'active' : ''}`}>
          <Link to="/" onClick={() => { setIsMenuOpen(false); setShowAllGrouped(false); }}>Home</Link>
          {categories.map((cat, idx) => (
            <React.Fragment key={cat.id}>
              <span className="nav-divider">|</span>
              <Link to={`/category/${cat.id}`} onClick={() => setIsMenuOpen(false)}>{cat.name}</Link>
            </React.Fragment>
          ))}
          <span className="nav-divider">|</span>
          <Link to="/about" onClick={() => setIsMenuOpen(false)}>About</Link>
          <span className="nav-divider">|</span>
          <Link to="/contact" onClick={() => setIsMenuOpen(false)}>Contact</Link>
          <span className="nav-divider">|</span>
          <button
            className="request-cart-btn"
            onClick={() => setShowRequestCart(true)}
            aria-label="View Artwork Request"
          >
            <span role="img" aria-label="artwork request">🛒</span>
            {requestItems.length > 0 && (
              <span className="request-cart-count">{requestItems.length}</span>
            )}
          </button>
        </nav>
        <RequestCartModal open={showRequestCart} onClose={() => setShowRequestCart(false)} />
      </div>
    </header>
  );
};

export default Header;
