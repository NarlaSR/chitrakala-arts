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
          <div className="art-card-footer">
            {/* Show all sizes/prices */}
            {Array.isArray(artwork.sizes) && artwork.sizes.length > 0 ? (
              <div className="art-card-sizes">
                {artwork.sizes.map((sp, idx) => (
                  <div key={idx} className="art-card-size-price">
                    <span className="art-card-size">{sp.size_label}</span>
                    <span className="art-card-price">₹{Number(sp.price).toLocaleString()}</span>
                  </div>
                ))}
              </div>
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
