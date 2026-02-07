import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/Header.css';

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <header className="header">
      <div className="header-container">
        <Link to="/" className="logo">
          {!logoError ? (
            <img 
              src="/assets/images/logo.png" 
              alt="Logo" 
              className="logo-image"
              onError={() => setLogoError(true)}
            />
          ) : (
            <div className="logo-placeholder">CKK</div>
          )}
          <h1>Chitra's Kala Sanskriti</h1>
        </Link>
        
        <button className="mobile-menu-toggle" onClick={toggleMenu}>
          <span></span>
          <span></span>
          <span></span>
        </button>

        <nav className={`nav ${isMenuOpen ? 'active' : ''}`}>
          <Link to="/" onClick={() => setIsMenuOpen(false)}>Home</Link>
          <Link to="/category/dot-mandala" onClick={() => setIsMenuOpen(false)}>Dot Mandala</Link>
          <Link to="/category/lippan-art" onClick={() => setIsMenuOpen(false)}>Lippan Art</Link>
          <Link to="/category/textile-design" onClick={() => setIsMenuOpen(false)}>Textile Art</Link>
          <Link to="/about" onClick={() => setIsMenuOpen(false)}>About</Link>
          <Link to="/contact" onClick={() => setIsMenuOpen(false)}>Contact</Link>
        </nav>
      </div>
    </header>
  );
};

export default Header;
