import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import CategoryCard from '../components/CategoryCard';
import ArtCard from '../components/ArtCard';
import { categories } from '../data/artData';
import { artworksAPI } from '../services/api';
import '../styles/Home.css';

const Home = () => {
  const [featuredArtworks, setFeaturedArtworks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadArtworks = async () => {
      try {
        const data = await artworksAPI.getAll();
        const featured = data.filter(art => art.featured);
        setFeaturedArtworks(featured);
      } catch (error) {
        console.error('Failed to load artworks:', error);
      } finally {
        setLoading(false);
      }
    };
    loadArtworks();
  }, []);

  return (
    <div className="home">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <div className="hero-logo-container">
            <img 
              src="/assets/images/logo.png" 
              alt="Chitra's Kala Sanskriti" 
              className="hero-logo"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
            <div className="hero-logo-placeholder" style={{display: 'none'}}>CKK</div>
          </div>
          <div className="hero-text">
            <h1 className="hero-title">Welcome to Chitra Kala Sanskriti</h1>
            <p className="hero-subtitle">
              Discover exquisite handcrafted artworks that blend tradition with contemporary design
            </p>
            <Link to="/category/dot-mandala" className="hero-cta">
              Explore Collection
            </Link>
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="categories-section">
        <div className="section-header">
          <h2>Our Art Categories</h2>
          <p>Explore our diverse collection of handcrafted art pieces</p>
        </div>
        <div className="categories-grid">
          {categories.map(category => (
            <CategoryCard key={category.id} category={category} />
          ))}
        </div>
      </section>

      {/* Featured Artworks Section */}
      <section className="featured-section">
        <div className="section-header">
          <h2>Featured Artworks</h2>
          <p>Handpicked collection of our finest creations</p>
        </div>
        {loading ? (
          <div className="loading">Loading artworks...</div>
        ) : featuredArtworks.length > 0 ? (
          <div className="artworks-grid">
            {featuredArtworks.map(artwork => (
              <ArtCard key={artwork.id} artwork={artwork} />
            ))}
          </div>
        ) : (
          <div className="no-artworks">
            <p>No featured artworks available yet.</p>
          </div>
        )}
      </section>

      {/* About Preview Section */}
      <section className="about-preview">
        <div className="about-preview-content">
          <h2>About Our Craft</h2>
          <p>
            At Chitrakala Arts, we celebrate the beauty of traditional Indian art forms 
            through contemporary expression. Each piece is meticulously handcrafted with 
            passion, precision, and a deep respect for artistic heritage.
          </p>
          <Link to="/about" className="about-cta">
            Learn More About Us
          </Link>
        </div>
      </section>
    </div>
  );
};

export default Home;
