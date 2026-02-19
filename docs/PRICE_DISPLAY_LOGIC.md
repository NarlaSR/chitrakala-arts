# Price Display Logic for Artworks

## Requirements
- Show prices in INR (₹) for users in India.
- Show prices in USD ($) for users in the USA.
- For all other countries, show prices in USD ($) with a markup (higher than US price).
- Price mapping from INR to USD is not just based on exchange rate, but a predefined calculation or markup.
- Use a geolocation API to detect user country.
- Store both INR and USD prices for each artwork.
- Use a utility function to select and format the price based on user location.

## Implementation Outline

### 1. Country Detection
- Use a geolocation API (e.g., ipapi.co) to get the user's country code.

### 2. Price Mapping Logic
```js
function getPriceForLocation(artwork, country) {
  if (country === 'IN') {
    return { value: artwork.price_inr, symbol: '₹', code: 'INR' };
  }
  if (country === 'US') {
    return { value: artwork.price_usd, symbol: '$', code: 'USD' };
  }
  // For other countries, apply markup or custom logic
  const markup = 1.15; // Example: 15% higher for non-US/IN
  return { value: Math.round(artwork.price_usd * markup), symbol: '$', code: 'USD' };
}
```

### 3. Usage in Components
- On page load, detect country and set currency/price accordingly.
- Use the utility function for price display.

### 4. Data Structure
- Add `price_inr` and `price_usd` fields to each artwork (or size/variant).

### 5. Advantages
- Easy to extend for more countries or currencies later.
- Centralized logic for price mapping and markup.
- No reliance on real-time exchange rates.

---

This file serves as a reference for implementing location-based price display logic in the art portfolio app.
