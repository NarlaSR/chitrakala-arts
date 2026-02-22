import React, { useState } from 'react';
import { useWishlist } from '../context/WishlistContext';
import WishlistModal from './WishlistModal';
import { Link } from 'react-router-dom';
import '../styles/Header.css';

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const { wishlist } = useWishlist();
  // Placeholder for modal open state (to be implemented)
  const [showWishlist, setShowWishlist] = useState(false);

  return (
    <header className="header">
      <div className="header-container">
        <Link to="/" className="logo">
          <h1>Chitra Kala Sanskriti</h1>
        </Link>

        <button className="mobile-menu-toggle" onClick={toggleMenu}>
          <span></span>
          <span></span>
          <span></span>
        </button>

        <nav className={`nav ${isMenuOpen ? 'active' : ''}`}>
          <Link to="/" onClick={() => setIsMenuOpen(false)}>Home</Link>
          <span className="nav-divider">|</span>
          <Link to="/category/dot-mandala" onClick={() => setIsMenuOpen(false)}>Dot Mandala</Link>
          <span className="nav-divider">|</span>
          <Link to="/category/lippan-art" onClick={() => setIsMenuOpen(false)}>Lippan Art</Link>
          <span className="nav-divider">|</span>
          <Link to="/category/textile-design" onClick={() => setIsMenuOpen(false)}>Textile Art</Link>
          <span className="nav-divider">|</span>
          <Link to="/about" onClick={() => setIsMenuOpen(false)}>About</Link>
          <span className="nav-divider">|</span>
          <Link to="/contact" onClick={() => setIsMenuOpen(false)}>Contact</Link>
          <span className="nav-divider">|</span>
          <button
            className="wishlist-btn"
            onClick={() => setShowWishlist(true)}
            aria-label="View Wishlist"
          >
            <span role="img" aria-label="wishlist">🛒</span>
            {wishlist.length > 0 && (
              <span className="wishlist-count">{wishlist.length}</span>
            )}
          </button>
        </nav>
        <WishlistModal open={showWishlist} onClose={() => setShowWishlist(false)} />
      </div>
    </header>
  );
};

export default Header;
