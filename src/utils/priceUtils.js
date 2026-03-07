/**
 * Frontend price utility functions for displaying currency prices
 * Matches backend pricing logic for consistency
 */

/**
 * Format price with appropriate currency symbol
 * @param {number} price - The price amount
 * @param {string} currency - 'INR' or 'USD'
 * @returns {string} Formatted price string
 */
export const formatPrice = (price, currency = 'INR') => {
  if (!price || isNaN(price)) return currency === 'INR' ? '₹0' : '$0';
  
  const amount = Number(price).toFixed(2);
  
  if (currency === 'INR') {
    return `₹${Number(amount).toLocaleString('en-IN')}`;
  } else {
    return `$${amount}`;
  }
};

/**
 * Get the appropriate price and currency for a given country code
 * @param {object} artwork - Artwork object with price_inr and price_usd
 * @param {string} countryCode - Two-letter country code (e.g., 'IN', 'US')
 * @returns {object} { price, currency } object
 */
export const getPriceForCountry = (artwork, countryCode) => {
  if (!artwork) {
    return { price: 0, currency: 'INR' };
  }
  
  // Prioritize price_inr and price_usd from database (post-migration)
  const priceInr = artwork.price_inr || artwork.price;
  const priceUsd = artwork.price_usd;
  
  // India: Show INR
  if (countryCode === 'IN') {
    return {
      price: priceInr,
      currency: 'INR'
    };
  }
  
  // USA: Show USD
  if (countryCode === 'US') {
    return {
      price: priceUsd || priceInr, // Fallback shouldn't be needed now, but keep it safe
      currency: 'USD'
    };
  }
  
  // Other countries: Show USD with 15% markup
  if (priceUsd) {
    return {
      price: priceUsd * 1.15,
      currency: 'USD'
    };
  }
  
  // Fallback to INR if no USD price available
  return {
    price: priceInr,
    currency: 'INR'
  };
};

/**
 * Get formatted price display for a country
 * @param {object} artwork - Artwork object
 * @param {string} countryCode - Two-letter country code
 * @returns {string} Formatted price string
 */
export const getFormattedPriceForCountry = (artwork, countryCode) => {
  const { price, currency } = getPriceForCountry(artwork, countryCode);
  return formatPrice(price, currency);
};

/**
 * Get price range for artworks with multiple sizes
 * @param {array} sizes - Array of size/price objects
 * @param {string} currency - 'INR' or 'USD'
 * @returns {string} Formatted price range string
 */
export const getPriceRange = (sizes, currency = 'INR') => {
  if (!sizes || !Array.isArray(sizes) || sizes.length === 0) {
    return formatPrice(0, currency);
  }
  
  if (sizes.length === 1) {
    return formatPrice(sizes[0].price, currency);
  }
  
  const prices = sizes.map(s => Number(s.price)).filter(p => !isNaN(p));
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  
  if (minPrice === maxPrice) {
    return formatPrice(minPrice, currency);
  }
  
  return `${formatPrice(minPrice, currency)} - ${formatPrice(maxPrice, currency)}`;
};
