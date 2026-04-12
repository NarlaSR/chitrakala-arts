import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useHomeView } from '../context/HomeViewContext';
import { useCurrency } from '../context/CurrencyContext';
import CategoryCard from '../components/CategoryCard';
import ArtCard from '../components/ArtCard';
import { artworksAPI, categoriesAPI } from '../services/api';
import '../styles/Home.css';

const Home = () => {
  const [featuredArtworks, setFeaturedArtworks] = useState([]);
  const [allArtworks, setAllArtworks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const { showAllGrouped, setShowAllGrouped } = useHomeView();
  const { countryCode } = useCurrency();

  const isIndia = countryCode === 'IN';

  const heroTitle = isIndia
    ? 'Welcome to ChitraKala Sanskriti'
    : 'Authentic Indian Art, Curated for You';

  const heroSubtitle = isIndia
    ? 'Discover exquisite handcrafted artworks that blend tradition with contemporary design'
    : 'Discover exquisite handcrafted artworks brought to you by Sainar Chitrakala Ventures (USA) in collaboration with Chitrakala Sanskriti (India)—where timeless traditions meet contemporary design.';
  // Reset showAllGrouped if route is "/"
  useEffect(() => {
    if (location.pathname === "/") {
      setShowAllGrouped(false);
    }
  }, [location.pathname, setShowAllGrouped]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [artworksData, categoriesData] = await Promise.all([
          artworksAPI.getAll(),
          categoriesAPI.getAll()
        ]);
        setAllArtworks(artworksData);
        setFeaturedArtworks(artworksData.filter(art => art.featured));
        setCategories(categoriesData);
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  return (
    <div className="home">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <div className="hero-logo-container">
            <img 
              src={isIndia ? '/assets/images/logo.png' : '/assets/images/sainar-logo.png'}
              alt={isIndia ? "ChitraKala Sanskriti" : "Sainar Chitrakala Ventures"}
              className="hero-logo"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
            <div className="hero-logo-placeholder" style={{display: 'none'}}>{isIndia ? 'CKS' : 'SCV'}</div>
          </div>
          <div className="hero-text">
            <h1 className="hero-title">{heroTitle}</h1>
            <p className="hero-subtitle">
              {heroSubtitle}
            </p>
            <button className="hero-cta" onClick={() => setShowAllGrouped(true)}>
              Explore Collection
            </button>
          </div>
        </div>
      </section>


      {/* Explore All Artworks Grouped by Category - SN*/}
      {showAllGrouped ? (
        <section className="explore-all-section">
          <div className="section-header sticky-header">
            <h2>Explore All Artworks</h2>
            <button className="hero-cta back-to-home-btn" onClick={() => setShowAllGrouped(false)}>
              Back to Home
            </button>
          </div>
          {categories.map(category => {
            const catArtworks = allArtworks.filter(a => a.category === category.id);
            if (catArtworks.length === 0) return null;
            return (
              <div key={category.id} className="category-group">
                <h3 className="category-group-heading highlighted-category">{category.name}</h3>
                <div className="artworks-grid">
                  {catArtworks.map(artwork => (
                    <ArtCard key={artwork.id} artwork={artwork} />
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      ) : (
        <>
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
        </>
      )}

      {/* About Preview Section */}
      <section className="about-preview">
        <div className="about-preview-content">
          {isIndia ? (
            <>
              <h2>About Our Craft</h2>
              <p>
                At Chitrakala Arts, we celebrate the beauty of traditional Indian art forms
                through contemporary expression. Each piece is meticulously handcrafted with
                passion, precision, and a deep respect for artistic heritage.
              </p>
              <Link to="/about" className="about-cta">
                Learn More About Us
              </Link>
            </>
          ) : (
            <>
              <h2>Meet the Artists Behind the Work</h2>
              <p>
                The artworks you see here are handcrafted by <strong>Chitrakala Sanskriti</strong>,
                a studio based in India dedicated to preserving traditional art forms — from
                intricate Dot Mandala to Lippan and textile design. Sainar Chitrakala Ventures
                brings their creations to you in the USA.
              </p>
              <Link to="/about" className="about-cta">
                Discover Chitrakala Sanskriti →
              </Link>
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default Home;
