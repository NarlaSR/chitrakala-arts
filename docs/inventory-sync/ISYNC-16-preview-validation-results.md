# ISYNC-16 — Inventory Sync Preview-only Validation

**Status:** COMPLETE — merged, deployed, production smoke passed
**Date:** 2026-07-23
**Branch:** `feature/ISYNC-16-preview-validation`
**Latest main commit at branch point:** `4c4c185`

---

## Changes made (parser/endpoint alignment)

### `server/inventoryParser.js` — complete rewrite

Aligned with the FINAL-CORRECTED workbook format (`INV-03-10-production-workbook-template-FINAL-CORRECTED.xlsx`):

| Change | Detail |
|---|---|
| Sheet selection | Reads `Inventory_Import` by name; falls back to first sheet for legacy uploads |
| Header auto-detection | Scans first 10 rows for ≥3 HEADER_MAP matches — handles template warning in row 1 |
| New HEADER_MAP | All 19 new column names mapped; legacy aliases preserved for backward compatibility |
| Action support | Reads `Action` column (`CREATE` / `UPDATE` / `NO_CHANGE`); NO_CHANGE rows silently skipped |
| Existing Artwork ID | Read and passed through; UPDATE rows require it; CREATE rows warn if present |
| SKU | Passed through as reference only — never generated or overwritten by parser |
| Required fields | Reduced to: `action`, `itemDescription`, `quantity`, `inventoryStatus` |
| Removed | `generateSku()`, `OLD_SKU_PATTERN`, `NEW_SKU_EXTRACT`, `skuCounters`, year/sizeCode required fields |
| Inventory Status | Validated against `ALLOWED_STATUSES`; read and passed through (not hardcoded to NEEDS_REVIEW) |
| show_on_website | Parsed as boolean; unrecognised values → warning |
| Price on Request | Artwork-level: accepted (blank Price INR allowed); size-level: ERROR (deferred to INV-PRICE-01) |
| Price INR | Required when Price on Request is not TRUE; must be non-negative number |
| Image filename | Path-traversal check (no `/`, `\`, `..`, `\0`) |
| publicOrderable | Computed informational flag via `isPublicOrderable()` — no DB write, no SKU generation |
| Return shape | `{ rows, detectedColumns, missingColumns, sheetUsed }` |

### `server/server.js` — preview endpoint updated

| Change | Detail |
|---|---|
| `sheetUsed` | Destructured from parser; batch warning added if non-`Inventory_Import` sheet was used |
| UPDATE verification | `SELECT id FROM artworks WHERE id = ANY($1)` on UPDATE row IDs — read-only |
| Classification | CREATE → `CREATE` (or `REVIEW`); UPDATE+found → `UPDATE` (or `REVIEW`); UPDATE+not found → `ERROR`; parser errors → `ERROR` |
| New summary fields | `createCount`, `updateCount`, `updateCandidates`, `reviewCount`, `errorCount` |
| Removed | `artworks.sku` column check, SKU-based UPDATE classification, `CREATE_CANDIDATE` classification |

---

## Test workbook

**File:** `__test_workbooks/ISYNC-16-preview-validation-workbook.xlsx`

### Sheet structure

| Sheet | Purpose |
|---|---|
| `ReadMe_ISYNC16` | First sheet — tests that parser selects `Inventory_Import` by name, not position |
| `Inventory_Import` | Data sheet — row 1 = template note, row 2 = headers, rows 3–20 = test data, row 21 = NO_CHANGE |

### Test rows (19 data rows; row 21 NO_CHANGE silently excluded → 18 parsed)

| Row | Scenario | Expected |
|---|---|---|
| 3 | CREATE, IN_STOCK, show_on_website=TRUE, numeric Price INR | CREATE |
| 4 | CREATE, MADE_TO_ORDER, show_on_website=TRUE | CREATE |
| 5 | CREATE, NEEDS_REVIEW, show_on_website=FALSE | CREATE |
| 6 | CREATE, OUT_OF_STOCK | CREATE |
| 7 | CREATE, SOLD | CREATE |
| 8 | CREATE, ARCHIVED | CREATE |
| 9 | CREATE, numeric Size Label with Price INR (not PoR) | CREATE |
| 10 | CREATE, Price on Request=TRUE with Size Label | ERROR (size-level PoR not supported) |
| 11 | CREATE, imageFilename set but no ZIP | CREATE (image will show as missing at endpoint) |
| 12 | CREATE, imageFilename with path traversal (`folder/traversal.jpg`) | ERROR |
| 13 | CREATE, invalid category slug | REVIEW (warning) |
| 14 | CREATE, invalid Inventory Status (`AVAILABLE`) | ERROR |
| 15 | CREATE, blank Item Description | ERROR |
| 16 | Invalid Action (`INVALID_ACTION`) | ERROR |
| 17 | CREATE with SKU pre-filled | REVIEW (warning — SKU should be blank for CREATE) |
| 18 | UPDATE, existingArtworkId=`art-1783882548608` (real staging artwork) | UPDATE |
| 19 | UPDATE, existingArtworkId=`art-nonexistent-9999` | ERROR (not found in DB) |
| 20 | UPDATE, no Existing Artwork ID | ERROR |
| 21 | NO_CHANGE | Silently skipped (not in output) |

---

## Local Preview validation results

**DB:** Railway staging (`shinkansen.proxy.rlwy.net:41009`) — read-only SELECT only
**Workbook:** `__test_workbooks/ISYNC-16-preview-validation-workbook.xlsx`

### Parser output

| Check | Result |
|---|---|
| Sheet used | `Inventory_Import` ✅ |
| Missing required columns | None ✅ |
| Rows parsed (excl. NO_CHANGE) | 18 ✅ |
| Detected columns | All 19 ✅ |

### Row classification results

| Row | Classification | Notes |
|---|---|---|
| 3 | CREATE ✅ | |
| 4 | CREATE ✅ | |
| 5 | CREATE ✅ | |
| 6 | CREATE ✅ | |
| 7 | CREATE ✅ | |
| 8 | CREATE ✅ | |
| 9 | CREATE ✅ | Numeric size price accepted |
| 10 | ERROR ✅ | Size-level Price on Request → ERROR as expected |
| 11 | CREATE ✅ | Image missing at endpoint level (not a parser error) |
| 12 | ERROR ✅ | Path-traversal filename blocked |
| 13 | REVIEW ✅ | Invalid category slug → warning |
| 14 | ERROR ✅ | Invalid status `AVAILABLE` → ERROR |
| 15 | ERROR ✅ | Blank Item Description → ERROR |
| 16 | ERROR ✅ | Invalid action `INVALID_ACTION` → ERROR |
| 17 | REVIEW ✅ | SKU pre-filled on CREATE → warning |
| 18 | UPDATE ✅ | `art-1783882548608` found in staging DB |
| 19 | ERROR ✅ | `art-nonexistent-9999` not found in DB |
| 20 | ERROR ✅ | UPDATE with no Existing Artwork ID |

### Summary

| Metric | Count |
|---|---|
| Total rows (parsed) | 18 |
| CREATE | 8 |
| UPDATE | 1 |
| REVIEW | 2 |
| ERROR | 7 |

All 18 rows matched their expected classification. ✅

### DB integrity (staging)

| Table | Before | After | Result |
|---|---|---|---|
| `artworks` | 67 | 67 | ✅ unchanged |
| `categories` | 7 | 7 | ✅ unchanged |
| `artwork_sizes` | 68 | 68 | ✅ unchanged |

No writes to any table. ✅

---

## Safety confirmations (local branch + staging DB validation)

- ✅ No production DB accessed during local validation (staging DB used for UPDATE verification — read-only SELECT only)
- ✅ No Apply endpoint invoked
- ✅ No production import run
- ✅ No artwork, category, pricing, or image data modified
- ✅ No price recalculation
- ✅ No SKU backfill
- ✅ No schema migration
- ✅ No images renamed
- ✅ No artworks archived or deleted
- ✅ `server/.env` not staged or committed

---

## Railway Staging Preview-only Validation

**Date:** 2026-07-23
**Branch:** `feature/ISYNC-16-preview-validation`
**Commit:** `1818715`
**Status:** ✅ All scenarios passed

### Staging target

| Item | Value |
|---|---|
| Railway staging DB host | `shinkansen.proxy.rlwy.net:41009` |
| Confirmed not production | ✅ (production host: `crossover.proxy.rlwy.net:54308`) |
| Code under test | Local server running `feature/ISYNC-16-preview-validation` against Railway staging DB |
| Admin auth | `cks-admin` / `CKSAdmin_Stg2026!` (staging password set during INV-SKU-01 validation) |
| Preview endpoint | `POST http://localhost:5000/api/admin/inventory-sync/preview` |

### Workbook used

**File:** `__test_workbooks/ISYNC-16-preview-validation-workbook.xlsx` (controlled validation workbook — gitignored)
**Type:** ISYNC-16 validation workbook with intentional test rows (not the INV-03-10 final template)
**Purpose:** Validates all parser/endpoint scenarios including CREATE, UPDATE, REVIEW, ERROR, NO_CHANGE

### Endpoint response

| Field | Value |
|---|---|
| HTTP status | 200 ✅ |
| `sheetUsed` | `Inventory_Import` ✅ |
| `detectedColumns` | All 19 columns ✅ |
| `missingColumns` | None ✅ |
| Batch warnings | None ✅ |

### Row classification results (via live HTTP endpoint)

| Row | Classification | Notes |
|---|---|---|
| 3 | CREATE ✅ | |
| 4 | CREATE ✅ | |
| 5 | CREATE ✅ | |
| 6 | CREATE ✅ | |
| 7 | CREATE ✅ | |
| 8 | CREATE ✅ | |
| 9 | CREATE ✅ | Numeric size price accepted |
| 10 | ERROR ✅ | Size-level Price on Request → ERROR (INV-PRICE-01 deferred) |
| 11 | CREATE ✅ | imageFilename set, no ZIP provided → `missing` (2 rows missing in imageSummary) |
| 12 | ERROR ✅ | Path-traversal filename `folder/traversal.jpg` blocked |
| 13 | REVIEW ✅ | Invalid category slug → warning |
| 14 | ERROR ✅ | Invalid status `AVAILABLE` |
| 15 | ERROR ✅ | Blank Item Description |
| 16 | ERROR ✅ | Invalid action `INVALID_ACTION` |
| 17 | REVIEW ✅ | SKU pre-filled on CREATE → warning |
| 18 | UPDATE ✅ | `art-1783882548608` found in staging DB |
| 19 | ERROR ✅ | `art-nonexistent-9999` not found in staging DB |
| 20 | ERROR ✅ | UPDATE with no Existing Artwork ID |
| 21 | (skipped) ✅ | NO_CHANGE silently excluded |

### Summary

| Metric | Count |
|---|---|
| Total rows parsed (NO_CHANGE excluded) | 18 |
| CREATE | 8 |
| UPDATE | 1 |
| UPDATE candidates (DB not configured) | 0 |
| REVIEW | 2 |
| ERROR | 7 |

All 18 rows matched expected classification. ✅

### Image summary

| Metric | Count |
|---|---|
| Rows with `imageFilename` | 2 |
| Matched (ZIP uploaded) | 0 |
| Missing (filename set, no ZIP) | 2 |
| Not provided | 16 |
| Unreferenced uploads | 0 |

No image ZIP was uploaded — expected. Missing images produce warnings, not errors. ✅

### Staging DB counts before/after

| Table | Before | After | Result |
|---|---|---|---|
| `artworks` | 67 | 67 | ✅ unchanged |
| `artwork_sizes` | 68 | 68 | ✅ unchanged |
| `categories` | 7 | 7 | ✅ unchanged |
| `order_requests` | 0 | 0 | ✅ unchanged |
| `order_request_items` | 0 | 0 | ✅ unchanged |

No writes to any table. Preview endpoint is confirmed read-only. ✅

### Safety confirmations

- ✅ Production DB not accessed (`crossover.proxy.rlwy.net:54308` not used)
- ✅ Staging DB host confirmed (`shinkansen.proxy.rlwy.net:41009`) before every script
- ✅ No Apply endpoint invoked
- ✅ No production import run
- ✅ No artworks, categories, pricing, or image data modified on staging
- ✅ No SKU generated during Preview (SKU passed through as reference only)
- ✅ No existing SKU overwritten
- ✅ No old size-based SKU generated
- ✅ No price recalculation
- ✅ No schema migration
- ✅ No images renamed
- ✅ No artworks archived or deleted
- ✅ `server/.env` not staged or committed
- ✅ Test workbook gitignored (not committed)

### Issues found

None. All 18 rows classified correctly on first run. ✅

---

## Production Preview Smoke

**Date:** 2026-07-23
**PR:** [#24](https://github.com/NarlaSR/chitrakala-arts/pull/24) — merged as `7a9360b`
**Status:** ✅ All scenarios passed

### Deployment confirmation

| Service | Status |
|---|---|
| Railway backend | ✅ Deployed — `chitrakalaarts-production.up.railway.app` responding (HTTP 200) |
| Vercel frontend | ✅ Deployed — `chitrakala-arts.vercel.app` responding (HTTP 200) |
| ISYNC-16 code confirmed | ✅ `sheetUsed` field present in Preview response (new field introduced by this ticket) |

### Production target

| Item | Value |
|---|---|
| Production backend | `chitrakalaarts-production.up.railway.app` |
| Production DB | `crossover.proxy.rlwy.net:54308` (via Railway backend — not accessed directly) |
| Confirmed not staging | ✅ |
| Auth | `cks-admin` (production credentials) |
| Preview endpoint | `POST https://chitrakalaarts-production.up.railway.app/api/admin/inventory-sync/preview` |

### Workbook used

**File:** `__test_workbooks/ISYNC-16-preview-validation-workbook.xlsx` (controlled validation workbook — gitignored)
**Type:** ISYNC-16 validation workbook with intentional test rows

### Endpoint response

| Field | Value |
|---|---|
| HTTP status | 200 ✅ |
| `sheetUsed` | `Inventory_Import` ✅ |
| `detectedColumns` | All 19 columns ✅ |
| `missingColumns` | None ✅ |
| Batch warnings | None ✅ |

### Row classification results (production)

| Row | Classification | Notes |
|---|---|---|
| 3 | CREATE ✅ | |
| 4 | CREATE ✅ | |
| 5 | CREATE ✅ | |
| 6 | CREATE ✅ | |
| 7 | CREATE ✅ | |
| 8 | CREATE ✅ | |
| 9 | CREATE ✅ | Numeric size price accepted |
| 10 | ERROR ✅ | Size-level Price on Request → ERROR (INV-PRICE-01 deferred) |
| 11 | CREATE ✅ | imageFilename set, no ZIP → `missing` in imageSummary |
| 12 | ERROR ✅ | Path-traversal filename blocked |
| 13 | REVIEW ✅ | Invalid category slug → warning |
| 14 | ERROR ✅ | Invalid status `AVAILABLE` |
| 15 | ERROR ✅ | Blank Item Description |
| 16 | ERROR ✅ | Invalid action `INVALID_ACTION` |
| 17 | REVIEW ✅ | SKU pre-filled on CREATE → warning |
| 18 | ERROR ✅ | `art-1783882548608` not found in production DB (this ID is staging-only; UPDATE verification works correctly — confirmed on staging, Row 18 → UPDATE) |
| 19 | ERROR ✅ | `art-nonexistent-9999` not found in production DB |
| 20 | ERROR ✅ | UPDATE with no Existing Artwork ID |
| 21 | (skipped) ✅ | NO_CHANGE silently excluded |

### Summary

| Metric | Count |
|---|---|
| Total rows parsed (NO_CHANGE excluded) | 18 |
| CREATE | 8 |
| UPDATE | 0 (expected — validation workbook uses staging artwork ID; UPDATE path confirmed on staging) |
| UPDATE candidates (DB not configured) | 0 |
| REVIEW | 2 |
| ERROR | 8 |

### Image summary

| Metric | Count |
|---|---|
| Rows with `imageFilename` | 2 |
| Matched (ZIP uploaded) | 0 |
| Missing (filename set, no ZIP) | 2 |
| Not provided | 16 |
| Unreferenced uploads | 0 |

### Production DB counts before/after

Counts captured via production admin API (`/api/admin/artworks`, `/api/admin/order-requests`, `/api/categories`). No direct DB connection used.

| Table | Before | After | Result |
|---|---|---|---|
| `artworks` | 38 | 38 | ✅ unchanged |
| `artwork_sizes` | 91 | 91 | ✅ unchanged |
| `categories` | 7 | 7 | ✅ unchanged |
| `order_requests` | 3 | 3 | ✅ unchanged |
| `order_request_items` | 0 | 0 | ✅ unchanged |

No writes to any table. Preview endpoint confirmed read-only on production. ✅

### Apply confirmation

- Apply endpoint was NOT invoked ✅
- No production import run ✅
- No production data modified ✅

### Safety confirmations

- ✅ Production DB not written to
- ✅ No Apply run
- ✅ No production import
- ✅ No artworks, categories, pricing, or inventory data modified
- ✅ No SKU generated during Preview (SKU passed through as reference only)
- ✅ No existing SKU overwritten
- ✅ No old size-based SKU generated
- ✅ No price recalculation
- ✅ No schema migration
- ✅ No images renamed
- ✅ No artworks archived or deleted
- ✅ `server/.env` not staged or committed
- ✅ Test workbook not committed

### Issues found

None. All scenarios behaved correctly on production. Row 18 classified as ERROR (not UPDATE) because `art-1783882548608` is a staging-only ID — this is correct endpoint behavior. The UPDATE classification path was confirmed on staging validation (Row 18 → UPDATE). ✅

---

## ISYNC-16 complete

| Item | Value |
|---|---|
| PR | [#24](https://github.com/NarlaSR/chitrakala-arts/pull/24) |
| Merge commit | `7a9360b` |
| Branch | `feature/ISYNC-16-preview-validation` |
| Commits | `1818715` (parser + local validation), `4a8520d` (staging results), `7a9360b` (merge) |
| Local validation | ✅ 18/18 rows — ISYNC-16 branch code + Railway staging DB |
| Staging HTTP validation | ✅ 18/18 rows — live Preview endpoint, Railway staging DB |
| Production smoke | ✅ 18/18 rows correct — live production Preview endpoint |
| All DB counts unchanged | ✅ (local, staging, and production) |
| Apply not run | ✅ |
| Production data not modified | ✅ |
| Follow-ups | INV-PRICE-01 (size-level Price on Request, deferred); ISYNC-17 (Apply/import endpoint, separate ticket) |
