# Dynamic Currency Display – Implementation Context (Updated)

- INR is the master price, entered by admin.
- USD is auto-calculated on save/update: USD = (INR / FX_RATE) \* USD_MULTIPLIER, then rounded to 9/49/99.
- Store both INR and USD prices, plus FX and multiplier used, in the database.
- FX rate and multiplier are configurable (env or admin setting) and can be updated through the admin UI.
- Admin UI allows fetching the latest FX rate dynamically from an external API (e.g., exchangerate-api.com), with admin review and approval before applying. However, do NOT update FX rate in real time for every new artwork—perform periodic (e.g., monthly) updates to keep pricing stable.
- Admin can trigger a recalculation of all USD prices for existing artworks using the current FX rate and multiplier.
- On page load, detect user country via IP (server-side preferred).
- If country is India, show ₹ price; if US, show $ price; else, show $ price with a markup (e.g., 15% higher than US price).
- Use a utility function to select and format the price based on user location:

```js
function getPriceForLocation(artwork, country) {
  if (country === "IN") {
    return { value: artwork.price_inr, symbol: "₹", code: "INR" };
  }
  if (country === "US") {
    return { value: artwork.price_usd, symbol: "$", code: "USD" };
  }
  // For other countries, apply markup or custom logic
  const markup = 1.15; // Example: 15% higher for non-US/IN
  return {
    value: Math.round(artwork.price_usd * markup),
    symbol: "$",
    code: "USD",
  };
}
```

- Cache country per session; do not recalculate on every page load.
- No real-time FX API for every user; conversion only on admin save/update or explicit recalculation.
- Admin never enters USD directly.
- Historical USD prices do not change unless admin triggers recalculation.
- FX rate and USD multiplier can be updated by admin through the UI, and changes only affect new or manually recalculated artworks.
- Easy to extend for more countries or currencies later.
- Centralized logic for price mapping and markup.
- No reliance on real-time exchange rates for end users.
- Pricing stability is maintained by updating FX rate and multiplier only periodically (e.g., monthly), not in real time.

---

This file serves as a reference for implementing location-based price display logic in the art portfolio app.
