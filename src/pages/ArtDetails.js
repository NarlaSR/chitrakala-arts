import React, { useState, useEffect } from 'react';
import { useWishlist } from '../context/WishlistContext';
import { useCurrency } from '../context/CurrencyContext';
import { useParams, Link } from 'react-router-dom';
import { artworksAPI, categoriesAPI } from '../services/api';
import { getPriceForCountry, formatPrice } from '../utils/priceUtils';
import '../styles/ArtDetails.css';

const ArtDetails = () => {
  const { artId } = useParams();
  const [artwork, setArtwork] = useState(null);
  const [category, setCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const { addToWishlist, wishlist } = useWishlist();
  const { countryCode } = useCurrency();
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    const loadArtwork = async () => {
      try {
        const data = await artworksAPI.getById(artId);
        setArtwork(data);

        if (data?.category) {
          // Category value may be stored as ID (recommended) or display name in older records.
          try {
            const categoryById = await categoriesAPI.getById(data.category);
            setCategory(categoryById || null);
          } catch {
            const allCategories = await categoriesAPI.getAll();
            const categoryValue = String(data.category).trim().toLowerCase();
            const matched = allCategories.find(
              (cat) =>
                String(cat.id).trim().toLowerCase() === categoryValue ||
                String(cat.name).trim().toLowerCase() === categoryValue
            );
            setCategory(matched || null);
          }
        }
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

  const categoryLabel = category?.name || artwork.category || 'Gallery';
  const categoryPath = category?.id || artwork.category;
  // Add cache-busting query string to image URL
  const imageUrl = artwork.image
    ? `${artwork.image}?t=${artwork.updatedAt || Date.now()}`
    : '/assets/images/placeholder.jpg';

  return (
    <div className="art-details">
      <div className="container">
        <Link to={`/category/${categoryPath}`} className="back-link">
          ← Back to {categoryLabel}
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
            <div className="art-category-badge">{categoryLabel}</div>
            <h1 className="art-title">{artwork.title}</h1>
            {artwork.status === 'MADE_TO_ORDER' && (
              <div className="art-availability-label art-availability--mto">Made to Order</div>
            )}

            {/* Show all sizes/prices */}
            <div className="art-description">
              <h3>Description</h3>
              <p>{artwork.description}</p>
            </div>

            <div className="art-specifications">
              <h3>Available Sizes & Prices</h3>
                <div style={{
                  background: '#fffbe6',
                  border: '1px solid #ffe58f',
                  borderRadius: '6px',
                  padding: '0.5rem 1rem',
                  fontWeight: 500,
                  fontSize: '0.75rem',
                  color: '#b36b00',
                  margin: '0.5rem 0 1rem 0'
                }}>
                  <span role="img" aria-label="info" style={{marginRight: '0.5rem'}}>ℹ️</span>
                  Price excludes shipping and applicable taxes. Please contact us for a detailed quote.
                </div>
              <ul>
                {/* Show sizes with their prices */}
                {Array.isArray(artwork.sizes) && artwork.sizes.length > 0 ? (
                  <>
                    {artwork.sizes.map((sp, idx) => {
                      let sizePrice;
                      if (countryCode === 'IN') {
                        sizePrice = sp.price != null ? formatPrice(sp.price, 'INR') : 'Price on request';
                      } else if (countryCode === 'US') {
                        sizePrice = sp.price_usd != null ? formatPrice(sp.price_usd, 'USD') : 'Price on request';
                      } else {
                        sizePrice = sp.price_usd != null ? formatPrice(sp.price_usd * 1.15, 'USD') : 'Price on request';
                      }
                      
                      return (
                        <li key={idx}>
                          <strong>Size:</strong> {sp.size_label} | <strong>Price:</strong> {sizePrice}
                        </li>
                      );
                    })}
                    {countryCode !== 'IN' && countryCode !== 'US' && (
                      <li style={{fontSize: '0.85rem', color: '#666', fontStyle: 'italic'}}>
                        * Prices include 15% international markup
                      </li>
                    )}
                  </>
                ) : (
                  <>
                    <li>
                      <strong>Size:</strong> {artwork.dimensions}
                    </li>
                    <li>
                      <strong>Price:</strong> {(() => {
                        const { price: displayPrice, currency: displayCurrency } = getPriceForCountry(artwork, countryCode);
                        return displayPrice != null ? formatPrice(displayPrice, displayCurrency) : 'Price on request';
                      })()}
                      {countryCode !== 'IN' && countryCode !== 'US' && (
                        <span style={{fontSize: '0.85rem', color: '#666', marginLeft: '0.5rem'}}>
                          (includes 15% international markup)
                        </span>
                      )}
                    </li>
                  </>
                )}
                <li>
                  <strong>Materials:</strong> {artwork.materials}
                </li>
                <li>
                  <strong>Category:</strong> {categoryLabel}
                </li>
              </ul>
            </div>

            <div className="art-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  addToWishlist(artwork);
                  setShowToast(true);
                  setTimeout(() => setShowToast(false), 2000);
                }}
                disabled={wishlist.some(item => item.id === artwork.id)}
              >
                {wishlist.some(item => item.id === artwork.id) ? 'Added to Wishlist' : 'Add to Wishlist'}
              </button>
            </div>
            {showToast && (
              <div className="wishlist-toast">Added to Wishlist!</div>
            )}

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
