# INV-03A: Visibility Fix + Parser Prep

**Status:** Complete  
**Date:** 2026-06-25  
**Branch:** `main` (local dev only — no production changes)  
**Depends on:** INV-01, INV-02, INV-03 prereq (prod snapshot local verify)

---

## Purpose

A planning audit (INV-03 plan) found a critical public visibility gap: the public artwork API returned all artwork rows, so any `NEEDS_REVIEW` rows imported by the future apply endpoint would immediately appear on the public website. INV-03A fixes this before the apply/import endpoint is built.

INV-03A is a safety and preparation ticket. It:
- Adds `warli-art` and `mixed-art` categories
- Adds `image_filename` and `notes` columns to `artworks`
- Normalises NULL statuses to `IN_STOCK` (idempotent)
- Updates the inventory parser for new business rules
- Fixes public API visibility filtering
- Adds an admin-only artwork endpoint

No rows are imported from the spreadsheet. No apply endpoint is built. No production database is changed.

---

## Why Visibility Fix Must Precede Apply

The previous `GET /api/artworks` (public) returned every row in the `artworks` table with no status filter. If the INV-03B apply endpoint inserted new rows with `status = 'NEEDS_REVIEW'`, those rows would have been immediately visible to website visitors. The fix must land first.

---

## Local Environment Safety

- `server/.env` → `DATABASE_URL=postgres://postgres:****@localhost:5433/chitrakala_dev`
- `server/.env` is gitignored and absent from `git status`
- No Railway or production URL in any local env file
- All changes are local-only

---

## Schema Migration

**File:** `server/dbMigration/migrate_inv03a_schema.sql`

```sql
-- Normalise any NULL statuses (idempotent — all rows were already IN_STOCK)
UPDATE artworks SET status = 'IN_STOCK' WHERE status IS NULL;

-- Add image filename hint column (used to match images later, not for upload)
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS image_filename VARCHAR(255);

-- Add internal notes column
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add missing categories
INSERT INTO categories (id, name, description, display_order)
VALUES ('warli-art', 'Warli Art', '...', 6)
ON CONFLICT (id) DO NOTHING;

INSERT INTO categories (id, name, description, display_order)
VALUES ('mixed-art', 'Mixed Art', '...', 7)
ON CONFLICT (id) DO NOTHING;
```

**Run:** `cd server && node runMigration.js migrate_inv03a_schema.sql`

### Post-migration verification

| Check | Result |
|-------|--------|
| `artworks` row count | 38 ✅ |
| `artwork_sizes` row count | 91 ✅ |
| Rows with NULL status | 0 ✅ |
| `warli-art` category | exists ✅ |
| `mixed-art` category | exists ✅ |
| `image_filename` column | exists ✅ |
| `notes` column | exists ✅ |

---

## Categories After Migration

| id | Name | Art Work Code |
|----|------|--------------|
| `dot-mandala` | Dot Mandala Art | DM |
| `lippan-art` | Lippan Art | LA |
| `mirror-mosaic` | Mirror Mosaic | MM |
| `texture-art` | Texture Art | TA |
| `textile-design` | Textile Art | *(legacy — no current code)* |
| `warli-art` | Warli Art | WA |
| `mixed-art` | Mixed Art | MA |

`textile-design` is a legacy category. Existing artworks assigned to it are untouched. No new imports will target it.

---

## Parser Changes (`server/inventoryParser.js`)

### MW → MA

`MW` removed from `KNOWN_ARTWORK_CODES`. `MA` (Mixed Art) added.

If a workbook row contains `Art Work = MW`, the parser adds a warning:
```
Unknown Art Work code "MW" — business confirmation needed. If this was "MW", use "MA" for Mixed Art.
```
The row classifies as `REVIEW`, not `ERROR`.

### Art Work Code → Category Map

```js
const ARTWORK_CATEGORY_MAP = {
  'DM': 'dot-mandala',
  'LA': 'lippan-art',
  'MM': 'mirror-mosaic',
  'WA': 'warli-art',
  'TA': 'texture-art',
  'MA': 'mixed-art',
};
```

### New SKU Format

**Old:** `CKS-DM-SM-2026-0001`  
**New:** `CKS-2026-DM-SM-00001`

Rule: `CKS-[Year]-[ArtWorkCode]-[SizeCode]-[NNNNN]`

Counter resets per `Year + ArtWorkCode + SizeCode`. Examples:
- `CKS-2026-DM-SM-00001`  
- `CKS-2026-DM-LG-00001` (separate counter from DM-SM)  
- `CKS-2026-LA-LG-00001`

### Old-Format SKU Detection

If a row carries an explicit SKU matching the old format (e.g. `CKS-DM-SM-2026-0001`), the parser adds an **error** (not a warning):
```
Old SKU format detected (CKS-DM-SM-2026-0001). Expected format: CKS-YYYY-CODE-SIZE-00001.
Please update the workbook to use the new SKU format before importing.
```
The row classifies as `ERROR`. The batch cannot be applied until the workbook is corrected.

### New Optional Columns

The parser now reads and maps these headers:

| Header | Parsed field |
|--------|-------------|
| Long Description | `longDescription` |
| Dimensions | `dimensions` |
| Materials | `materials` |
| Image File Name / Image Filename | `imageFilename` |
| Public Visibility / Review Status / Public Visibility / Review Status | `reviewStatus` |
| Notes | `notes` |

Missing optional columns produce no errors. They appear as `null` in row objects.

### `plannedStatus` Field

Every valid row (no errors) now includes:
```json
"plannedStatus": "NEEDS_REVIEW"
```
This is informational — it shows what status the row would receive on import. The apply endpoint has not been built yet.

---

## Public vs Admin Visibility (`server/dbQueries.js`, `server/server.js`)

### Public endpoints

| Endpoint | Behaviour |
|----------|-----------|
| `GET /api/artworks` | Returns only `status = 'IN_STOCK'` artworks |
| `GET /api/artworks/:id` | Returns the artwork only if `status = 'IN_STOCK'`; otherwise 404 |

### Admin endpoint

| Endpoint | Behaviour |
|----------|-----------|
| `GET /api/admin/artworks` | Requires `Authorization: Bearer <token>`. Returns all artworks regardless of status. |

### `recalculate-prices` fix

`POST /api/artworks/recalculate-prices` now uses `db.getArtworksAdmin()` internally so `NEEDS_REVIEW` artworks are included in bulk price recalculations after INV-03B imports rows.

### `dbQueries.js` function split

| Function | Query | Use |
|----------|-------|-----|
| `getArtworks()` | `WHERE status = 'IN_STOCK'` | Public API |
| `getArtworksAdmin()` | No filter | Admin API, recalculate-prices |
| `getArtworkById(id, publicOnly=false)` | Adds `AND status = 'IN_STOCK'` when `publicOnly=true` | Public: `true`, admin edit/delete: `false` |

---

## Test Results (2026-06-25)

### Section 1 — Migration
All 7 checks ✅

### Section 2 — Public API
- `GET /api/artworks` → 200, 38 artworks, no NEEDS_REVIEW items ✅

### Section 3 — NEEDS_REVIEW Hiding
- Public count drops from 38 → 37 when one artwork set to NEEDS_REVIEW ✅
- `GET /api/artworks/:id` returns 404 for NEEDS_REVIEW item ✅
- `GET /api/admin/artworks` still returns 38 ✅
- `GET /api/admin/artworks` without auth returns 401 ✅
- Artwork status restored to IN_STOCK ✅
- Public count returns to 38 ✅
- No test data left behind ✅

### Section 4 — Preview (shipmentDetails_20260624.xlsx)

```json
{
  "totalRows": 24,
  "createCount": 22,
  "updateCount": 0,
  "reviewCount": 1,
  "errorCount": 1
}
```

| Check | Result |
|-------|--------|
| Old-format SKU (row 3) → ERROR | ✅ |
| Row 3 error message mentions expected format | ✅ |
| MW code (row 13) → REVIEW | ✅ |
| Row 13 warning mentions MA suggestion | ✅ |
| All 23 generated SKUs use new format | ✅ |
| Sample generated SKU | `CKS-2026-LA-LG-00001` |
| All valid CREATE rows have `plannedStatus='NEEDS_REVIEW'` | ✅ |
| New optional fields present in row objects | ✅ |
| Total column not used for pricing | ✅ |
| Artwork count unchanged after preview (38) | ✅ |

### Known workbook issue

`shipmentDetails_20260624.xlsx` row 3 contains the old-format SKU `CKS-DM-SM-2026-0001`. This must be updated to `CKS-2026-DM-SM-00001` in the workbook before the apply endpoint can be used. Also, row 13 uses `MW` — update to `MA` for Mixed Art.

---

## Pricing Note for INV-03B

Local `pricing_settings.usd_multiplier` is currently `1.75` (from production backup). The intended website multiplier is `2.25`. Before testing the INV-03B apply endpoint, update locally:

```sql
-- Run locally only — do NOT run against production
UPDATE pricing_settings SET value = '2.25' WHERE key = 'usd_multiplier';
```

Do not update production pricing settings as part of this ticket.

---

## Production Safety Confirmation

- ✅ `server/.env` points to `localhost:5433/chitrakala_dev` only
- ✅ `server/.env` absent from `git status` — gitignored
- ✅ No production DB changes made
- ✅ No apply/import endpoint built
- ✅ No spreadsheet rows inserted or updated in DB
- ✅ No AdminDashboard UI changed
- ✅ No `artwork_sizes` written
- ✅ No invoice or shipment tables created
- ✅ No PDF generation
- ✅ No test data left behind

---

## Next Step: INV-03B Apply/Import Endpoint

With INV-03A complete, the system is ready to build:

`POST /api/admin/inventory-sync/apply`

Prerequisites confirmed:
- `NEEDS_REVIEW` items are hidden from public API ✅
- All required categories exist ✅
- `image_filename` and `notes` columns exist ✅
- SKU format is defined and parser generates correct values ✅
- Old-format SKUs in workbooks are flagged as errors before import ✅

Before building INV-03B, update the workbook to use new-format SKUs and replace `MW` with `MA`.
