import React from 'react';
import { Link } from 'react-router-dom';
import { useCurrency } from '../context/CurrencyContext';
import { getFormattedPriceForCountry, getStartingPriceForCountry, formatPrice } from '../utils/priceUtils';
import '../styles/ArtCard.css';

// Fixed: Use full URLs from backend directly
const ArtCard = ({ artwork }) => {
  const { countryCode } = useCurrency();
  
  // Add cache-busting query string to image URL
  const imageUrl = artwork.image
    ? `${artwork.image}?t=${artwork.updatedAt || Date.now()}`
    : '/assets/images/placeholder.jpg';
  
  // For multi-size artworks show "Prices from X", otherwise show single price
  const startingPrice = getStartingPriceForCountry(artwork, countryCode);
  const formattedPrice = startingPrice
    ? `Prices from ${formatPrice(startingPrice.price, startingPrice.currency)}`
    : getFormattedPriceForCountry(artwork, countryCode);
  
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
          {/* Show price based on user's detected country */}
          <div className="art-card-footer">
            <span className="art-card-price">{formattedPrice}</span>
          </div>
        </div>
      </Link>
    </div>
  );
};

export default ArtCard;
