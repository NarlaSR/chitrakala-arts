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
    // Round to nearest psychological price point (x5 and x9 endings)
    // Price points: 15, 19, 25, 29, 35, 39, 45, 49
    // Example: 22.69 → 25 (closer to 25 than to 19 or 29)
    const points = [15, 19, 25, 29, 35, 39, 45, 49];
    return points.reduce((nearest, point) =>
      Math.abs(point - price) < Math.abs(nearest - price) ? point : nearest
    );
  }
  
  if (price < 100) {
    // Round to nearest x9 whole number (e.g., 59, 69, 79, 89, 99)
    const points = [55, 59, 65, 69, 75, 79, 85, 89, 95, 99];
    return points.reduce((nearest, point) =>
      Math.abs(point - price) < Math.abs(nearest - price) ? point : nearest
    );
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
