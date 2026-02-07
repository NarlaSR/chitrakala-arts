import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import ArtCard from '../components/ArtCard';
import { getCategoryById } from '../data/artData';
import { artworksAPI } from '../services/api';
import '../styles/CategoryPage.css';

const CategoryPage = () => {
  const { categoryId } = useParams();
  const category = getCategoryById(categoryId);
  const [artworks, setArtworks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadArtworks = async () => {
      try {
        const data = await artworksAPI.getAll();
        const filtered = data.filter(art => art.category === categoryId);
        setArtworks(filtered);
      } catch (error) {
        console.error('Failed to load artworks:', error);
      } finally {
        setLoading(false);
      }
    };
    loadArtworks();
  }, [categoryId]);

  if (!category) {
    return (
      <div className="category-page">
        <div className="container">
          <h1>Category Not Found</h1>
          <p>The category you're looking for doesn't exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="category-page">
      <div className="category-hero">
        <div className="category-hero-content">
          <h1>{category.name}</h1>
          <p>{category.description}</p>
        </div>
      </div>

      <div className="container">
        <div className="category-content">
          <div className="category-header">
            <h2>Collection</h2>
            <p>{artworks.length} artwork(s) available</p>
          </div>

          {loading ? (
            <div className="loading">Loading artworks...</div>
          ) : artworks.length > 0 ? (
            <div className="artworks-grid">
              {artworks.map(artwork => (
                <ArtCard key={artwork.id} artwork={artwork} />
              ))}
            </div>
          ) : (
            <div className="no-artworks">
              <p>No artworks available in this category at the moment.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CategoryPage;
