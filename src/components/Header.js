import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/Header.css';

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

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
        </nav>
      </div>
    </header>
  );
};

export default Header;
