import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import ArtCard from '../components/ArtCard';
import { artworksAPI, categoriesAPI } from '../services/api';
import '../styles/CategoryPage.css';

const CategoryPage = () => {
  const { categoryId } = useParams();
  const [category, setCategory] = useState(null);
  const [artworks, setArtworks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [categoryData, artworksData] = await Promise.all([
          categoriesAPI.getById(categoryId),
          artworksAPI.getAll()
        ]);
        if (!categoryData) {
          setNotFound(true);
        } else {
          setCategory(categoryData);
          setArtworks(artworksData.filter(art => art.category === categoryId));
        }
      } catch (error) {
        if (error.response?.status === 404) {
          setNotFound(true);
        } else {
          console.error('Failed to load category data:', error);
        }
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [categoryId]);

  if (loading) {
    return (
      <div className="category-page">
        <div className="container">
          <div className="loading">Loading...</div>
        </div>
      </div>
    );
  }

  if (notFound || !category) {
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
        <Link to="/" className="back-to-home-link">← Back to Home</Link>
        <div className="category-content">
          <div className="category-header">
            <h2>Collection</h2>
            <p>{artworks.length} artwork(s) available</p>
          </div>

          {artworks.length > 0 ? (
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
