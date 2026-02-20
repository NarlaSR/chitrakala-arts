import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/ArtCard.css';

// Fixed: Use full URLs from backend directly
const ArtCard = ({ artwork }) => {
  // Add cache-busting query string to image URL
  const imageUrl = artwork.image
    ? `${artwork.image}?t=${artwork.updatedAt || Date.now()}`
    : '/assets/images/placeholder.jpg';
  
  return (
    <div className="art-card">
      <Link to={`/art/${artwork.id}`} className="art-card-link">
        <div className="art-card-image">
          <img
            src={imageUrl}
            alt={artwork.title}
            onContextMenu={e => e.preventDefault()}
            draggable={false}
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          />
          <div className="art-card-overlay">
            <span>View Details</span>
          </div>
        </div>
        <div className="art-card-content">
          <h3 className="art-card-title">{artwork.title}</h3>
          <p className="art-card-description">{artwork.description}</p>
             {/* Show just one price in the art card footer */}
            <div className="art-card-footer">
              {Array.isArray(artwork.sizes) && artwork.sizes.length > 1 ? (
                <span className="art-card-price">
                  Price starting from: ₹
                  {Math.min(...artwork.sizes.map(sp => Number(sp.price))).toLocaleString()}
                </span>
              ) : Array.isArray(artwork.sizes) && artwork.sizes.length === 1 ? (
                <span className="art-card-price">₹{Number(artwork.sizes[0].price).toLocaleString()}</span>
              ) : (
                <span className="art-card-price">₹{artwork.price?.toLocaleString?.() || ''}</span>
              )}
            </div>
        </div>
      </Link>
    </div>
  );
};

export default ArtCard;
