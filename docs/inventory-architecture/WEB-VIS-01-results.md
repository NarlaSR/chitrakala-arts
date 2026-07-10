# WEB-VIS-01 — Implementation Results

**Ticket:** WEB-VIS-01 — Website Artwork Visibility and Availability Controls  
**Branch:** `feature/WEB-VIS-01-visibility-availability`  
**Date:** 2026-07-08  
**Status:** Validated locally — ready for staging migration + deploy

---

## What Was Done

### 1. Database Migration

**File:** `server/dbMigration/migrate_web_vis01.sql`

Adds `show_on_website BOOLEAN NOT NULL DEFAULT false` column to `artworks`.

**Idempotency design (DO block):** The entire migration is wrapped in a PL/pgSQL `DO $$` block that checks `information_schema.columns` first. If the column already exists, the block exits immediately — no ALTER, no UPDATE. The backfill only runs on the *first* execution, protecting any admin-set `show_on_website=false` values from being overwritten on re-run.

**Backfill scope:** Only artworks with `status = 'IN_STOCK'` at migration time receive `show_on_website = true`. MADE_TO_ORDER, NEEDS_REVIEW, OUT_OF_STOCK, SOLD, and ARCHIVED remain `false`.

**Run with:**
```
node runMigration.js migrate_web_vis01.sql
```

---

### 2. New Status: MADE_TO_ORDER

Added `MADE_TO_ORDER` to all status validation and display layers:

| Layer | Change |
|-------|--------|
| `server/dbQueries.js` `updateArtworkStatus` | Added to ALLOWED set |
| `server/server.js` `ALLOWED_ARTWORK_STATUSES` | Added |
| `src/pages/AdminReviewQueue.js` `STATUS_OPTIONS` | Added |
| `src/pages/AdminReviewQueue.js` `STATUS_COLORS` | Added amber `rq-status-mto` class |
| `src/pages/AdminReviewQueue.js` `FILTER_LABELS` | Added human-readable labels for all statuses |
| `src/pages/AdminDashboard.js` status dropdown | Added MADE_TO_ORDER option |

Inventory parser (`inventoryParser.js`) always assigns `NEEDS_REVIEW` to parsed rows — no status enumeration there to update.

---

### 3. Two-Gate Public Visibility

**Before (single gate):**
```sql
WHERE status = 'IN_STOCK'
```

**After (two gates — both must be true):**
```sql
WHERE status IN ('IN_STOCK', 'MADE_TO_ORDER') AND show_on_website = true
```

Applied in:
- `dbQueries.js` `getArtworks()` (public list)
- `dbQueries.js` `getArtworkById(id, publicOnly=true)` (public detail)

Admin routes (`getArtworksAdmin`, `getArtworkById(id, false)`) are unchanged — admins see all.

---

### 4. show_on_website in Admin UI

**AdminReviewQueue.js:**
- "On Site" column added to table — shows Yes (green) / No (grey) badge per artwork
- Edit panel has "Show on Website" checkbox with explanatory hint text
- Publish/OOS/Archive quick-action confirmations updated to clarify that status change alone does not make artwork public

**AdminDashboard.js:**
- Status dropdown added to create/edit form (defaulting to IN_STOCK)
- "Show on Website" checkbox added with explanatory hint
- `formData`, `handleEdit`, `resetForm`, `handleSubmit` all include `status` and `show_on_website`

---

### 5. Price on Request

**`artworks.price` column** — schema definition in `db.js` line 46: `price DECIMAL(10, 2)` with no NOT NULL constraint. The column has always been nullable. **No migration needed.**

**`artwork_sizes.price` column** — `NUMERIC(10,2) NOT NULL` (see `migrate_add_artwork_sizes.sql` line 5). Per-size prices cannot be null at the DB level.

**Current limitation:** "Price on request" applies only to artworks *without* sizes. Size-level "Price on request" is not supported in WEB-VIS-01 because `artwork_sizes.price` is currently NOT NULL. This is an accepted limitation for this ticket — WEB-VIS-01 does not change `artwork_sizes.price` nullability.

**Follow-up ticket:** INV-PRICE-01 — Support Price on Request for Artwork Size Options (relax the NOT NULL constraint on `artwork_sizes.price`, update size-level price display in ArtDetails and AdminDashboard, update admin form validation to allow blank size prices).

**Backend POST `/api/artworks`:** Price is now optional. Blank price → `price_inr = null`, `price_usd = null`.

**Frontend ArtCard.js:**
- If `price_inr` and `price` are both null, displays `"Price on request"` instead of `₹0`
- Multi-size artworks: `getStartingPriceForCountry` already returns null when no valid prices exist (unchanged)

**Frontend ArtDetails.js:**
- Per-size prices: null `sp.price` or `sp.price_usd` → `"Price on request"`
- Single-price artwork: null `displayPrice` → `"Price on request"`

---

### 6. Availability Labels (Public Site)

**ArtCard.js:** Artworks with `status = 'MADE_TO_ORDER'` show an amber "Made to Order" badge above the price in the card footer.

**ArtDetails.js:** Same artworks show an amber "Made to Order" label below the artwork title.

In-Stock artworks show no badge (default state, no label needed).

---

## Files Changed

| File | Change |
|------|--------|
| `server/dbMigration/migrate_web_vis01.sql` | New — adds `show_on_website` column (idempotent DO block) |
| `server/dbQueries.js` | Public filters, MADE_TO_ORDER in ALLOWED, `show_on_website` in create/update |
| `server/server.js` | ALLOWED_ARTWORK_STATUSES, POST + PUT handlers, stale comment fixed |
| `src/pages/AdminDashboard.js` | Status dropdown, show_on_website checkbox, price optional |
| `src/pages/AdminReviewQueue.js` | MADE_TO_ORDER, show_on_website column + edit checkbox |
| `src/components/ArtCard.js` | Price on request, Made to Order badge |
| `src/pages/ArtDetails.js` | Price on request, Made to Order label |
| `src/styles/ArtCard.css` | `.art-card-badge`, `.art-card-badge--mto` |
| `src/styles/ArtDetails.css` | `.art-availability-label`, `.art-availability--mto` |
| `src/styles/AdminReviewQueue.css` | `.rq-status-mto`, `.rq-onsite-badge`, checkbox styles |
| `src/styles/AdminDashboard.css` | `.dash-checkbox-label` |

---

## Local Validation Results (2026-07-08)

> No Inventory Preview, Apply, production import, or price recalculation was run.  
> No production DB was touched. All testing was against local `chitrakala_dev` on port 5433.

### Migration Safety

```
node runMigration.js migrate_web_vis01.sql   → ✅ Migration completed successfully
node runMigration.js migrate_web_vis01.sql   → ✅ No-op on second run (column already existed)
```

**DB state after migration:**
```
Column: show_on_website | boolean | default: false | NOT NULL ✅
IN_STOCK     | show_on_website: true  | n: 39   ✅ (backfilled)
NEEDS_REVIEW | show_on_website: false | n: 23   ✅ (stayed false)
Rows with NULL show_on_website: 0                ✅
```

**Idempotency:** Second run was a no-op — counts unchanged, no re-publish of any artwork.

### Price NULL Support

```sql
-- Verified via information_schema:
artworks.price  → DECIMAL(10,2), no NOT NULL → nullable ✅ (no migration needed)
artwork_sizes.price → NUMERIC(10,2) NOT NULL → requires price per size ✅ (scoping boundary)
```

### MADE_TO_ORDER Status Coverage

All layers updated to include MADE_TO_ORDER:
- `server/server.js ALLOWED_ARTWORK_STATUSES` ✅
- `server/dbQueries.js updateArtworkStatus ALLOWED` ✅
- `src/pages/AdminReviewQueue.js STATUS_OPTIONS` ✅
- `src/pages/AdminDashboard.js` status dropdown ✅
- `inventoryParser.js` — no change needed (parser always assigns NEEDS_REVIEW) ✅

### Public API Visibility (all 8 scenarios)

Tested against local backend (`http://localhost:5000`) after migration run and server restart.

| Status | show_on_website | Public list | Detail endpoint | Result |
|--------|----------------|-------------|-----------------|--------|
| IN_STOCK | true | 39 ✅ | 200 ✅ | ✅ visible |
| IN_STOCK | false | 38 ✅ | 404 ✅ | ✅ hidden |
| MADE_TO_ORDER | true | 39 ✅ | 200 ✅ | ✅ visible |
| MADE_TO_ORDER | false | 38 ✅ | 404 ✅ | ✅ hidden |
| NEEDS_REVIEW | false | 38 ✅ | 404 ✅ | ✅ hidden |
| OUT_OF_STOCK | false | 38 ✅ | 404 ✅ | ✅ hidden |
| SOLD | false | 38 ✅ | 404 ✅ | ✅ hidden |
| ARCHIVED | false | 38 ✅ | 404 ✅ | ✅ hidden |

All 8 scenarios passed. Test artwork restored to IN_STOCK + show_on_website=true after testing.

### Existing Artwork Visibility Preservation

Local DB baseline before migration: 39 IN_STOCK artworks.  
After migration + backfill: all 39 remain publicly visible. Count unchanged. ✅

### Admin Behavior

```
New artwork row DB defaults:
  status          → IN_STOCK  ✅
  show_on_website → false     ✅ (hidden until admin enables)

Hide without status change:
  IN_STOCK + show_on_website=false → 404 on public detail ✅

Admin UI:
  Status dropdown includes MADE_TO_ORDER ✅
  show_on_website checkbox present in Dashboard form ✅
  show_on_website checkbox present in Review Queue edit panel ✅
```

### Production Artwork Count Clarification

The screenshot showing "19 artwork(s) available" was the **Dot Mandala Art category page** — not the full catalog. The local API returns **39 total** public artworks across all categories. The "38" figure in prior documents referred to the inventory workbook row count (approximate, and one artwork has since been added). Current local DB baseline: **39 IN_STOCK artworks**.

Production (Railway) baseline count was not queried during this validation pass — production DB was not touched.

---

## Migration Run Checklist (Staging)

- [ ] Run `node runMigration.js migrate_web_vis01.sql` against staging DB
- [ ] Verify: `SELECT column_name FROM information_schema.columns WHERE table_name='artworks' AND column_name='show_on_website';` → 1 row
- [ ] Verify: `SELECT COUNT(*) FROM artworks WHERE status='IN_STOCK' AND show_on_website=false;` → 0
- [ ] Run migration a second time → verify no count changes
- [ ] Deploy backend and frontend
- [ ] Smoke test: existing IN_STOCK artworks still appear on public site
- [ ] Smoke test: toggle `show_on_website=false` on one artwork → disappears from public list
- [ ] Smoke test: MADE_TO_ORDER + show_on_website=true → appears on public site with "Made to Order" badge

---

## Remaining Risks / Known Boundaries

| Item | Notes |
|------|-------|
| `artwork_sizes.price NOT NULL` | Size-level "Price on request" is not yet supported — `artwork_sizes.price` is currently NOT NULL. Accepted limitation for WEB-VIS-01. Follow-up: **INV-PRICE-01**. |
| Production baseline count | Not verified against Railway. Run verification queries before and after migration on staging first. |
| MADE_TO_ORDER no "Publish" quick-action | Review Queue only has "Publish" → IN_STOCK. Admin must use Edit to set MADE_TO_ORDER + show_on_website=true. Acceptable for now. |
| Price clear via PUT | Sending `price=''` in the PUT body now clears price to null (price on request). Existing artworks cannot accidentally lose their price unless admin explicitly blanks the field. |

---

## Out of Scope (Not Done Here)

- Order request table (`order_requests`, `order_request_items`) — future ticket
- SKU format change (no size code) — INV-SKU-01
- Inventory Apply — ISYNC tickets
- Maintenance mode
- SKU/status/quantity business backfill
- MADE_TO_ORDER "Publish" quick-action button in Review Queue
