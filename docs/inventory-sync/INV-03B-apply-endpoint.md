# INV-03B: Apply/Import Endpoint

**Status:** Complete (local dev only — not deployed; ID format corrected in INV-03B-Cleanup)  
**Date:** 2026-06-25  
**Branch:** `main` (local changes, no production deployment)  
**Depends on:** INV-01, INV-02, INV-03 prereq, INV-03A

---

## Purpose

Implements `POST /api/admin/inventory-sync/apply` — the first endpoint that writes spreadsheet rows into the database. Newly imported rows land with `status = 'NEEDS_REVIEW'` and are hidden from the public website until an admin approves each item.

The apply endpoint is intentionally conservative for its first version:
- One all-or-nothing transaction
- Any error row blocks the entire batch
- No image upload or artwork_sizes writes
- No invoice/shipment generation

---

## Endpoint

```
POST /api/admin/inventory-sync/apply
```

- **Auth:** `Authorization: Bearer <token>` (same admin JWT as other admin routes)
- **Upload:** `multipart/form-data`, field name `file`
- **Accepted types:** `.xlsx`, `.xls`
- **Max file size:** 10 MB (shared with preview)

---

## Validation Rules (apply is stricter than preview)

| Rule | Preview | Apply |
|------|---------|-------|
| Missing required fields | ERROR | ERROR (blocks) |
| Old-format SKU | ERROR | ERROR (blocks) |
| Unknown Art Work code | WARNING → REVIEW | ERROR (blocks) |
| Unknown Size code | WARNING → REVIEW | REVIEW (allowed with NEEDS_REVIEW status) |
| Duplicate SKU within batch | — | ERROR (blocks) |
| Missing optional fields | Accepted | Accepted |
| Invalid Total column | Ignored | Ignored |

**Unknown Art Work codes are escalated to errors on apply** because `category` is NOT NULL in the database and no mapping exists for unknown codes.

---

## Batch Behavior

- A single PostgreSQL transaction covers the entire batch.
- If **any** row has errors → return HTTP 422, rollback, no writes.
- REVIEW rows (warnings, no errors) are imported with `status = 'NEEDS_REVIEW'`.
- On success → HTTP 200 with a full summary of created/updated rows.

---

## CREATE: New Artwork Field Mapping

| DB column | Source |
|-----------|--------|
| `id` | `buildInventoryArtworkId(sku)` → lowercase SKU (e.g. `cks-2026-dm-sm-00001`) |
| `title` | Item description |
| `category` | Art Work code → category slug via ARTWORK_CATEGORY_MAP |
| `price` | Price per unit (INR — legacy field) |
| `price_inr` | Price per unit (INR) |
| `price_usd` | `calculateUsdPrice(priceInr, fxRate, multiplier)` |
| `fx_rate_used` | From `pricing_settings.fx_rate` at apply time |
| `multiplier_used` | From `pricing_settings.usd_multiplier` at apply time |
| `description` | Long Description, or NULL |
| `dimensions` | Dimensions, or NULL |
| `materials` | Materials, or NULL |
| `image` | NULL (no image upload in this version) |
| `image_filename` | Image File Name, or NULL |
| `featured` | false |
| `sku` | SKU (explicit or auto-generated) |
| `quantity` | Quantity |
| `status` | `NEEDS_REVIEW` (always) |
| `notes` | Notes, or NULL |

### ID rule

The artwork `id` is the lowercase form of the SKU. Because the SKU already begins with `CKS-`, lowercasing it directly yields a clean ID:

| SKU (business identifier) | Artwork ID (DB / URL safe) |
|---------------------------|----------------------------|
| `CKS-2026-DM-SM-00001`    | `cks-2026-dm-sm-00001`     |
| `CKS-2026-LA-LG-00001`    | `cks-2026-la-lg-00001`     |

Implementation uses `buildInventoryArtworkId(sku)` (in `server.js`), which lowercases the SKU and keeps the existing `cks-` prefix rather than prepending a second one.

*Note:* An earlier iteration used `cks-${sku.toLowerCase()}`, which produced `cks-cks-2026-dm-sm-00001`. This was corrected in INV-03B-Cleanup before any production use.

---

## UPDATE: Patched Fields

Finds existing artwork by `sku`. Only these fields are changed:

| DB column | Behaviour |
|-----------|-----------|
| `quantity` | Always updated |
| `price` / `price_inr` | Always updated |
| `price_usd` | Recalculated at apply time |
| `fx_rate_used` | Updated from current pricing settings |
| `multiplier_used` | Updated from current pricing settings |
| `description` | Updated only if Long Description was provided in workbook |
| `dimensions` | Updated only if provided |
| `materials` | Updated only if provided |
| `image_filename` | Updated only if provided |
| `notes` | Updated only if provided |
| `updated_at` | Always set to CURRENT_TIMESTAMP |

Never updated: `id`, `sku`, `title`, `category`, `image`, `featured`, `status`.

---

## Art Work Code → Category Mapping

```js
DM → dot-mandala
LA → lippan-art
MM → mirror-mosaic
WA → warli-art
TA → texture-art
MA → mixed-art
```

`textile-design` is legacy-only. No new imports will use it.

---

## Pricing

The apply endpoint reads `fx_rate` and `usd_multiplier` from the `pricing_settings` table at the moment the endpoint runs. These values are stored per-row on `fx_rate_used` / `multiplier_used` for auditability.

```
price_usd = (price_inr / fx_rate) * usd_multiplier
```

**Local dev pricing settings used for testing:**  
`fx_rate = 92.4`, `usd_multiplier = 2.25`

Example: a ₹800 coaster set → `(800 / 92.4) * 2.25 = $19.48 → $22` (after rounding)

**Do not change production pricing settings.** Update local pricing before testing:
```sql
-- local only
UPDATE pricing_settings SET value = '2.25' WHERE key = 'usd_multiplier';
```

---

## SKU Counter Collision Fix (INV-03B parser bugfix)

During testing, a collision was found: row 3 had explicit SKU `CKS-2026-DM-SM-00001` and row 12's auto-generator independently produced the same value, causing a PRIMARY KEY violation.

**Root cause:** The auto-generator counter did not account for explicit SKUs already in the batch.

**Fix:** When the parser encounters a valid new-format explicit SKU, it reserves its counter slot — advancing the counter for that `Year+ArtWorkCode+SizeCode` key past the explicit SKU's number. In the corrected workbook, row 3's `CKS-2026-DM-SM-00001` causes the `2026-DM-SM` counter to start at 2, so row 12 gets `CKS-2026-DM-SM-00002`.

Additionally, the apply endpoint now detects duplicate SKUs within the batch before hitting the DB and returns a clear error message.

---

## Public Visibility Safety

Newly imported artworks have `status = 'NEEDS_REVIEW'`.  
The public API (`GET /api/artworks`, `GET /api/artworks/:id`) filters to `WHERE status = 'IN_STOCK'` only.  
Imported rows are invisible to the public website until an admin explicitly approves each item.

---

## Response Shape

### Success (HTTP 200)

```json
{
  "summary": {
    "totalRows": 24,
    "createdCount": 24,
    "updatedCount": 0,
    "skippedCount": 0,
    "errorCount": 0
  },
  "created": [
    { "rowNumber": 3, "sku": "CKS-2026-DM-SM-00001", "artworkId": "cks-2026-dm-sm-00001", "title": "4 piece coaster set" }
  ],
  "updated": [],
  "skipped": [],
  "errors": []
}
```

### Blocked (HTTP 422)

```json
{
  "error": "Batch blocked — fix all errors before applying.",
  "summary": { "totalRows": 24, "createdCount": 0, "updatedCount": 0, "skippedCount": 0, "errorCount": 2 },
  "errorRows": [
    { "rowNumber": 3, "errors": ["Old SKU format detected ..."] },
    { "rowNumber": 13, "errors": ["Unknown Art Work code \"MW\" ..."] }
  ]
}
```

---

## Known Workbook Issues (original `shipmentDetails_20260624.xlsx`)

| Row | Problem | Fix |
|-----|---------|-----|
| 3 | SKU `CKS-DM-SM-2026-0001` (old format) | Change to `CKS-2026-DM-SM-00001` |
| 13 | Art Work `MW` (retired code) | Change to `MA` (Mixed Art) |

A corrected test copy is at `__test_workbooks/shipmentDetails_20260624_corrected_inv03b.xlsx` (gitignored, local only).

---

## Local Test Results (2026-06-25)

### Test 1 — Bad workbook blocked
- Bad workbook → HTTP 422 ✅
- Error row 3 (old SKU), error row 13 (MW code) ✅
- Artwork count unchanged at 38 ✅
- No writes ✅

### Test 2 — Corrected workbook apply
- Preview: 24 rows, 0 errors, 0 reviews ✅
- Apply: HTTP 200, 24 created ✅
- DB artworks: 38 → 62 ✅
- All imported: status=NEEDS_REVIEW, featured=false, image=NULL ✅
- price_usd=22.00 for ₹800 row with multiplier 2.25 ✅
- fx_rate_used=92.4, multiplier_used=2.25 stored per-row ✅
- Public `GET /api/artworks` still returns 38 ✅
- Admin `GET /api/admin/artworks` returns 62 ✅

### Test 3 — Re-upload → UPDATE
- Re-apply same corrected workbook → HTTP 200, 24 updated, 0 created ✅
- No duplicate artworks created ✅
- DB count remains 62 ✅
- `status` preserved as NEEDS_REVIEW on update ✅

### Test 4 — Rollback cleanup
```sql
DELETE FROM artworks WHERE sku LIKE 'CKS-2026-%';
```
- 24 rows deleted ✅
- DB artworks: 62 → 38 ✅
- Public count: 38 ✅
- Admin count: 38 ✅
- No test data left behind ✅

---

## Rollback (if apply endpoint writes need to be undone)

```sql
-- Remove all inventory-imported artworks by SKU pattern
DELETE FROM artworks WHERE sku LIKE 'CKS-2026-%';
-- Or more precisely, by id pattern:
DELETE FROM artworks WHERE id LIKE 'cks-cks-%';
```

Verify count after:
```sql
SELECT COUNT(*) FROM artworks;  -- expect 38 (production-restored baseline)
```

---

## Out of Scope (this ticket)

- Image upload or image-to-artwork matching
- `artwork_sizes` writes
- Invoice/shipment table creation
- Admin UI upload flow
- Production database changes
- Deployment
- SKU backfill for existing 38 artworks
- `artwork_sizes` migration

---

## Production Safety Confirmation

- ✅ `server/.env` → `localhost:5433/chitrakala_dev` only
- ✅ `server/.env` absent from `git status`
- ✅ No production DB changes made
- ✅ No deployment
- ✅ No UI changes
- ✅ No `artwork_sizes` writes
- ✅ No invoice/shipment generation
- ✅ No image upload/matching
- ✅ Test data cleaned up (DB restored to 38 artworks)

---

## Next Steps

1. **Update the real workbook** — correct row 3 SKU and row 13 Art Work before any production apply.
2. **Admin approval flow** — build UI to let admin review `NEEDS_REVIEW` rows, add description/image, and promote to `IN_STOCK`.
3. **Image matching** — use `image_filename` column to match uploaded images to artwork records.
4. **Pricing settings review** — confirm `usd_multiplier` should be updated to 2.25 in production.
