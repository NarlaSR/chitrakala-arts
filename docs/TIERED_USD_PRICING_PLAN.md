# Tiered USD Pricing Strategy — Implementation Plan

## Overview

Replace the current single-multiplier USD price formula with a tiered multiplier system based on the INR price of each artwork. Lower-priced pieces carry a higher markup to cover fixed costs (shipping, packaging, payment processing); premium pieces use a leaner margin.

---

## Current Formula

```js
usdPrice = (priceInr / fxRate) * multiplier;
```

- `fxRate` and `multiplier` are both admin-configurable via the Settings page.
- `multiplier` is a single value applied to all artworks regardless of INR price.

---

## New Formula

```js
// Step 1: Select multiplier based on INR price tier
if (priceINR < 4000)       multiplier = 2.8;
else if (priceINR < 12000) multiplier = 2.4;
else                        multiplier = 2.1;

// Step 2: Calculate raw USD
usdPrice = (priceInr / fxRate) * multiplier;

// Step 3: Apply cliff-smoothing floor rule
// Prevents a higher-INR item from being priced LOWER in USD than a lower-INR item
// at the previous tier boundary.
//   Tier 1→2 boundary: ₹4,000 at 2.8× → floor for tier 2
//   Tier 2→3 boundary: ₹12,000 at 2.4× → floor for tier 3
const tier1FloorUsd = (3999 / fxRate) * 2.8;   // ~$133 at 84 INR/USD
const tier2FloorUsd = (11999 / fxRate) * 2.4;  // ~$343 at 84 INR/USD

if (priceInr >= 12000) usdPrice = Math.max(usdPrice, tier2FloorUsd);
else if (priceInr >= 4000) usdPrice = Math.max(usdPrice, tier1FloorUsd);

// Step 4: Apply psychological rounding (existing function — no change needed)
usdPrice = psychologicalRound(usdPrice);
```

### Price Examples (at ₹84/USD exchange rate)

| INR Price | Tier | Raw USD | After Floor | Notes |
|-----------|------|---------|-------------|-------|
| ₹2,000 | 2.8× | $66.67 | $66.67 | No floor needed |
| ₹3,999 | 2.8× | $133.30 | $133.30 | Tier 1 ceiling |
| ₹4,000 | 2.4× | $114.29 | $133.30 | ⬆ Floor applied — prevented cliff |
| ₹5,000 | 2.4× | $142.86 | $142.86 | Above floor naturally |
| ₹11,999 | 2.4× | $342.83 | $342.83 | Tier 2 ceiling |
| ₹12,000 | 2.1× | $300.00 | $342.83 | ⬆ Floor applied — prevented cliff |
| ₹14,000 | 2.1× | $350.00 | $350.00 | Above floor naturally |
| ₹25,000 | 2.1× | $625.00 | $625.00 | No floor needed |

---

## Files to Change

### 1. `server/priceUtils.js` — Core logic (backend)

**Function:** `calculateUsdPrice(priceInr, fxRate, multiplier)`

- Replace the single `multiplier` parameter usage with tiered selection based on `priceInr`.
- Add the cliff-smoothing floor rule (Step 3 above).
- The `multiplier` parameter can be kept in the function signature but will be **ignored** — the tier logic overrides it.
- `psychologicalRound()` stays unchanged.

### 2. `src/pages/AdminDashboard.js` — Inline duplicate (frontend)

**Function:** `calculateUsdPrice(inrPrice, fxRate, multiplier)` (inline, around line 149)

- Mirror the exact same tiered + floor logic as `server/priceUtils.js`.
- Used for live USD preview when admin creates/edits an artwork.

### 3. `src/pages/AdminSettingsPage.js` — USD Multiplier field

- Locate the USD Multiplier input field.
- Add `disabled` attribute and a grey/muted style.
- Add a helper note beneath it, e.g.:
  > "USD Multiplier is not used when tiered pricing is active. Prices are calculated automatically based on INR tier brackets."

---

## Files NOT Changing

| File | Reason |
|------|--------|
| `server/server.js` | Calls `calculateUsdPrice` — picks up new logic automatically |
| `server/dbQueries.js` | Calls `calculateUsdPrice` — picks up new logic automatically |
| `src/utils/priceUtils.js` | Frontend display utility — does not calculate, only formats |
| Database schema | `price_usd` column stays; values are recalculated on save |
| `CurrencyContext.js` | Detection logic unchanged |

---

## Admin Workflow After Implementation

1. FX rate remains admin-configurable (no change).
2. When saving a new artwork, USD price is auto-calculated using tiered formula.
3. "Recalculate All USD Prices" button (existing feature) will apply new tiers to all artworks in bulk.
4. USD Multiplier field in Settings is visible but **disabled** — retained for reference/future use.

---

## Testing Checklist

- [ ] ₹3,999 artwork → USD higher than ₹4,000 artwork? Should be equal (floor applied)
- [ ] ₹11,999 artwork → USD higher than ₹12,000 artwork? Should be equal (floor applied)
- [ ] ₹5,000 artwork → USD naturally above tier 1 floor without floor being applied
- [ ] Admin live preview in artwork form shows correct tiered USD
- [ ] "Recalculate All" correctly reprices existing artworks
- [ ] USD Multiplier field is visibly disabled in Settings page
- [ ] INR prices and display unaffected
- [ ] Non-US visitors (15% markup on USD) still work correctly

---

## Branch / Ticket

Create as: `feature/CKA-19-tiered-usd-pricing`
