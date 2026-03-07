/**
 * Pricing Utilities
 * Functions for currency conversion, psychological rounding, and price calculations
 */

/**
 * Apply psychological rounding to USD prices
 * Rounds to nearest 9, 49, or 99 ending
 * Examples:
 * - 132 → 149
 * - 181 → 199
 * - 725 → 749
 * - 1250 → 1299
 * 
 * @param {number} price - The price to round
 * @returns {number} - The psychologically rounded price
 */
function psychologicalRound(price) {
  if (price < 10) {
    // For very small prices, round to nearest .99
    return Math.ceil(price) - 0.01;
  }
  
  if (price < 50) {
    // Round to nearest x9 (e.g., 9, 19, 29, 39, 49)
    return Math.ceil(price / 10) * 10 - 1;
  }
  
  if (price < 100) {
    // Round to nearest x9.99 (e.g., 49.99, 59.99, 69.99, 79.99, 89.99, 99.99)
    return Math.ceil(price / 10) * 10 - 0.01;
  }
  
  if (price < 500) {
    // Round to nearest x49 or x99 in hundreds (e.g., 149, 199, 249, 299, etc.)
    const hundreds = Math.floor(price / 100);
    const remainder = price % 100;
    
    if (remainder < 50) {
      return hundreds * 100 + 49;
    } else {
      return hundreds * 100 + 99;
    }
  }
  
  // For larger prices, round to nearest x99 in hundreds
  const hundreds = Math.floor(price / 100);
  return hundreds * 100 + 99;
}

/**
 * Calculate USD price from INR price
 * Formula: USD = (INR / FX_RATE) * MULTIPLIER
 * Then apply psychological rounding
 * 
 * @param {number} priceInr - Price in INR
 * @param {number} fxRate - Exchange rate (INR to USD)
 * @param {number} multiplier - International multiplier
 * @returns {number} - Calculated USD price with psychological rounding
 */
function calculateUsdPrice(priceInr, fxRate, multiplier) {
  if (!priceInr || !fxRate || !multiplier) {
    return 0;
  }
  
  const rawUsd = (priceInr / fxRate) * multiplier;
  return psychologicalRound(rawUsd);
}

/**
 * Get price for a specific country
 * Returns price object with value, symbol, and currency code
 * 
 * @param {object} artwork - Artwork object with price_inr and price_usd
 * @param {string} countryCode - ISO country code (e.g., 'IN', 'US')
 * @param {number} markupMultiplier - Markup multiplier for non-IN/US countries (default: 1.15)
 * @returns {object} - { value, symbol, code }
 */
function getPriceForCountry(artwork, countryCode, markupMultiplier = 1.15) {
  if (countryCode === 'IN') {
    return {
      value: artwork.price_inr || artwork.price || 0,
      symbol: '₹',
      code: 'INR'
    };
  }
  
  if (countryCode === 'US') {
    return {
      value: artwork.price_usd || 0,
      symbol: '$',
      code: 'USD'
    };
  }
  
  // For other countries, apply markup to USD price
  const baseUsd = artwork.price_usd || 0;
  const markedUpPrice = psychologicalRound(baseUsd * markupMultiplier);
  
  return {
    value: markedUpPrice,
    symbol: '$',
    code: 'USD'
  };
}

/**
 * Format price with currency symbol
 * 
 * @param {number} price - Price value
 * @param {string} symbol - Currency symbol
 * @returns {string} - Formatted price string
 */
function formatPrice(price, symbol) {
  if (!price) return `${symbol}0`;
  return `${symbol}${price.toLocaleString()}`;
}

module.exports = {
  psychologicalRound,
  calculateUsdPrice,
  getPriceForCountry,
  formatPrice
};
