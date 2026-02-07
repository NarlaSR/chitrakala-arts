import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/ArtCard.css';

const ArtCard = ({ artwork }) => {
  const imageUrl = artwork.image ? `http://localhost:5000${artwork.image}` : '/assets/images/placeholder.jpg';
  
  return (
    <div className="art-card">
      <Link to={`/art/${artwork.id}`} className="art-card-link">
        <div className="art-card-image">
          <img src={imageUrl} alt={artwork.title} />
          <div className="art-card-overlay">
            <span>View Details</span>
          </div>
        </div>
        <div className="art-card-content">
          <h3 className="art-card-title">{artwork.title}</h3>
          <p className="art-card-description">{artwork.description}</p>
          <div className="art-card-footer">
            <span className="art-card-price">₹{artwork.price.toLocaleString()}</span>
            <span className="art-card-size">{artwork.size}</span>
          </div>
        </div>
      </Link>
    </div>
  );
};

export default ArtCard;
