import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getCategoryById } from '../data/artData';
import { artworksAPI } from '../services/api';
import '../styles/ArtDetails.css';

const ArtDetails = () => {
  const { artId } = useParams();
  const [artwork, setArtwork] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadArtwork = async () => {
      try {
        const data = await artworksAPI.getById(artId);
        setArtwork(data);
      } catch (error) {
        console.error('Failed to load artwork:', error);
      } finally {
        setLoading(false);
      }
    };
    loadArtwork();
  }, [artId]);

  if (loading) {
    return (
      <div className="art-details">
        <div className="container">
          <div className="loading">Loading artwork...</div>
        </div>
      </div>
    );
  }

  if (!artwork) {
    return (
      <div className="art-details">
        <div className="container">
          <h1>Artwork Not Found</h1>
          <p>The artwork you're looking for doesn't exist.</p>
          <Link to="/" className="back-link">← Back to Home</Link>
        </div>
      </div>
    );
  }

  const category = getCategoryById(artwork.category);
  // Add cache-busting query string to image URL
  const imageUrl = artwork.image
    ? `${artwork.image}?t=${artwork.updatedAt || Date.now()}`
    : '/assets/images/placeholder.jpg';

  return (
    <div className="art-details">
      <div className="container">
        <Link to={`/category/${artwork.category}`} className="back-link">
          ← Back to {category.name}
        </Link>

        <div className="art-details-content">
          <div className="art-details-image">
            <img
              src={imageUrl}
              alt={artwork.title}
              className="art-details-image"
              onContextMenu={e => e.preventDefault()}
              draggable={false}
              style={{ userSelect: 'none', pointerEvents: 'none' }}
            />
          </div>

          <div className="art-details-info">
            <div className="art-category-badge">{category.name}</div>
            <h1 className="art-title">{artwork.title}</h1>
            
            {/* Show all sizes/prices */}
            {Array.isArray(artwork.sizes) && artwork.sizes.length > 0 ? (
              <div className="art-sizes">
                <h3>Available Sizes & Prices</h3>
                <ul>
                  {artwork.sizes.map((sp, idx) => (
                    <li key={idx}>
                      <strong>{sp.size}:</strong> ₹{Number(sp.price).toLocaleString()}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="art-price">
                <span className="price-label">Price:</span>
                <span className="price-value">₹{artwork.price?.toLocaleString?.() || ''}</span>
              </div>
            )}

            <div className="art-description">
              <h3>Description</h3>
              <p>{artwork.description}</p>
            </div>

            <div className="art-specifications">
              <h3>Specifications</h3>
              <ul>
                {/* Show all sizes if available */}
                {Array.isArray(artwork.sizes) && artwork.sizes.length > 0 ? (
                  artwork.sizes.map((sp, idx) => (
                    <li key={idx}>
                      <strong>Size:</strong> {sp.size} | <strong>Price:</strong> ₹{Number(sp.price).toLocaleString()}
                    </li>
                  ))
                ) : (
                  <li>
                    <strong>Size:</strong> {artwork.dimensions}
                  </li>
                )}
                <li>
                  <strong>Materials:</strong> {artwork.materials}
                </li>
                <li>
                  <strong>Category:</strong> {category.name}
                </li>
              </ul>
            </div>

            <div className="art-actions">
              <button className="btn-primary">Contact for Purchase</button>
              <button className="btn-secondary">Add to Wishlist</button>
            </div>

            <div className="art-note">
              <p>
                <strong>Note:</strong> Each piece is handcrafted and unique. 
                Slight variations in color and design may occur, making your artwork truly one-of-a-kind.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArtDetails;
