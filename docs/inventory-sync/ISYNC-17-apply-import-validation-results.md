# ISYNC-17 — Inventory Apply / Import Validation Results

**Status:** COMPLETE — merged, deployed, production smoke passed  
**Date:** 2026-07-24  
**Branch:** `feature/ISYNC-17-apply-import-validation`  
**Restrictions:** No production Apply. No production DB writes. No production data changes.

---

## What Was Done

Aligned the `POST /api/admin/inventory-sync/apply` endpoint and `inventoryParser.js` with the ISYNC-16 parser contract, then validated the Apply flow end-to-end on local dev DB and Railway staging DB.

---

## Changes Made

### `server/inventoryParser.js`
- Added `isReview` boolean field to each parsed row
- Set `isReview = true` when `action === 'CREATE'` and the row has a prefilled SKU or a prefilled Existing Artwork ID — these rows need admin review before import, so Apply skips them
- All other warnings (unknown category slug, unknown ArtCode, etc.) remain informational and do not prevent Apply
- `isReview` is included in the `rows.push({...})` output so both Preview and Apply endpoints can use it

### `server/server.js` — Apply endpoint (`POST /api/admin/inventory-sync/apply`)
Full rewrite from pre-ISYNC-17 state. Key changes:

| Area | Change |
|---|---|
| Category resolution | `ARTWORK_CATEGORY_MAP[artWorkCode] \|\| row.category \|\| null` (step 2) |
| Duplicate-SKU batch check | Removed — not applicable for blank-SKU CREATE rows |
| Error blocking | Step 3: any row with parser errors → 422, batch rejected |
| REVIEW row filter | Step 4: `rows.filter(r => r.isReview)` — only CREATE rows with prefilled SKU/EID, not all-warnings |
| Action classification | CREATE → `art-${Date.now()}-${i}` ID; UPDATE → `existingArtworkId` |
| Status / visibility | Always `NEEDS_REVIEW` + `show_on_website=false` (Option A — conservative) |
| Field name fix | `row.longDescription` → `row.notes` |
| Image matching | By `rowNumber` not `sku` — fixes blank-SKU CREATE image matching |
| Response | `summary`, `created[]`, `updated[]`, `skipped[]` (REVIEW), `errors[]` |

### `server/dbQueries.js`
- Added `updateArtworkFromInventoryById(id, data, client)` — UPDATE by artwork `id` column (not SKU)
- Updates: `quantity`, `price`, `price_inr`, `price_usd`, `fx_rate_used`, `multiplier_used`, and optionally `description`, `dimensions`, `materials`, `image_filename`, `notes`
- Exported alongside existing `updateArtworkFromInventory`

---

## Bug Found and Fixed During Validation

**REVIEW row filter too broad** — original Apply code used `rows.filter(r => r.warnings.length > 0)` which skipped any row with any warning. This caused rows with informational-only warnings (e.g., unknown category slug "tanjore-art") to be incorrectly skipped as REVIEW rows.

**Fix:** Added `isReview` field to the parser, set only for the specific REVIEW scenarios (CREATE with prefilled SKU or EID). Apply now uses `r.isReview` as the filter.

---

## Test Workbooks

| File | Purpose |
|---|---|
| `__test_workbooks/ISYNC-17-apply-validation-workbook.xlsx` | Full workbook: all row types (CREATE, REVIEW, UPDATE placeholder, ERROR, NO_CHANGE). Used for Preview + ERROR-blocking test. |
| `__test_workbooks/ISYNC-17-apply-clean-workbook.xlsx` | Clean workbook: valid rows only (no ERROR rows). Used for successful Apply run — UPDATE row ID patched programmatically at test time. |

Both workbooks: `ReadMe_*` sheet + `Inventory_Import` sheet, row 1 = template note, row 2 = 19-column headers.

---

## Local Apply Validation Results

**DB:** `localhost:5433` (local dev) | **Baseline:** 62 artworks

### Test A — Preview on FULL workbook
- Status: **200 OK**
- Rows parsed: 13 (NO_CHANGE row excluded by parser)
- Classifications: 12 CREATE, 1 UPDATE

| Row | Action | Title | Errors | Warnings | isReview |
|---|---|---|---|---|---|
| 3 | CREATE | Dot Mandala Test Create A | — | — | false |
| 4 | CREATE | Lippan Art Test Create B | — | — | false |
| 5 | CREATE | Warli Art Test Create C | — | — | false |
| 6 | CREATE | Mirror Mosaic Test Create D | — | — | false |
| 7 | CREATE | Texture Art With Image | — | — | false |
| 8 | CREATE | Tanjore Art Missing Image | — | unknown category "tanjore-art" | false |
| 9 | CREATE | CREATE Row With Pre-filled SKU | — | SKU should be blank for CREATE | **true** |
| 10 | UPDATE | Updated Dot Mandala Test A | ID "REPLACE_WITH_LOCAL_ARTWORK_ID" not found | — | false |
| 11 | CREATE | Invalid Category Artwork | — | unknown category "bad-category-slug" | false |
| 12 | CREATE | Invalid Status Artwork | Invalid status "PENDING" | — | false |
| 13 | CREATE | (blank) | Missing Item Description | — | false |
| 14 | CREATE | Size-level PoR Artwork | Size-level PoR not supported | — | false |
| 15 | CREATE | Path Traversal Image Artwork | Unsafe image filename "../images/bad.jpg" | — | false |

### Test B — Apply on FULL workbook (ERROR blocking)
- Status: **422** (expected)
- Error rows: 4 (rows 12, 13, 14, 15)
- Batch rejected before any writes — **PASS**

### Test C — Preview on CLEAN workbook (placeholder UPDATE ID)
- Status: **200 OK**
- UPDATE row (row 10) shows ERROR: "ID not found" — correct, ID is a placeholder

### Test D — Preview on CLEAN workbook (real local ID `cks-2026-la-lg-00001`)
- Status: **200 OK**
- All 8 rows correct: 6 CREATE (clean), 1 CREATE [REVIEW], 1 UPDATE (no error)

### Test E — Apply on CLEAN workbook (real local ID)
- Status: **200 OK**
- **Created: 6** | **Updated: 1** | **Skipped (REVIEW): 1**
- All 6 CREATE rows written including "Tanjore Art Missing Image" (informational warning only — not blocked)
- REVIEW row (prefilled SKU) correctly skipped
- Update (`cks-2026-la-lg-00001`) written via `updateArtworkFromInventoryById`
- Artwork count: 62 → 68 (+6) ✓

### Cleanup
- All 6 test artworks deleted via `DELETE /api/artworks/:id`
- Final count: 62 (restored) ✓

---

## Staging Apply Validation Results

**DB:** `shinkansen.proxy.rlwy.net:41009` (Railway staging) | **Baseline:** 67 artworks

### Test A — Preview on FULL workbook
- Status: **200 OK** — identical classifications to local run ✓

### Test B — Apply on FULL workbook (ERROR blocking)
- Status: **422** (expected) — 4 error rows blocked batch ✓

### Test C — Preview on CLEAN workbook (staging ID `art-1783882549398`)
- Status: **200 OK** — UPDATE row resolved correctly (staging artwork found) ✓

### Test D — Apply on CLEAN workbook
- Status: **200 OK**
- **Created: 6** | **Updated: 1** | **Skipped (REVIEW): 1**
- Count: 67 → 73 (+6) ✓

### Cleanup
- All 6 staging test artworks deleted
- Final staging count: 67 (restored) ✓

---

## DB Counts (Before / After — Unchanged)

All counts verified before and after Apply + cleanup. No orphaned rows.

| DB | Baseline | After Apply | After Cleanup | Match |
|---|---|---|---|---|
| Local dev | 62 | 68 (+6) | 62 | ✓ |
| Staging | 67 | 73 (+6) | 67 | ✓ |

---

## What Apply Does NOT Do (by design)

- Does not generate SKUs (app generates on first admin save when public/orderable)
- Does not honour workbook `Inventory Status` — always creates as `NEEDS_REVIEW`
- Does not honour workbook `show_on_website` — always `false` (Option A)
- Does not write production DB (restriction in force)
- Does not process images in these tests (no ZIP uploaded)

---

## Production Merge and Deployment Smoke

**PR:** [#25](https://github.com/NarlaSR/chitrakala-arts/pull/25)  
**Merge commit:** `83f81e2`  
**ISYNC-17 commit:** `86d9aa6`  
**Merged to:** `main` on 2026-07-24

### Deployment Status

| Service | Status | URL |
|---|---|---|
| Railway backend | Deployed ✓ | `chitrakalaarts-production.up.railway.app` |
| Vercel frontend | Deployed ✓ | `www.chitrakala-arts.com` |

### Production Smoke Results

All checks read-only. Apply was not called.

| Check | Result |
|---|---|
| Railway backend reachable | 200 OK ✓ |
| Vercel frontend reachable | 200 OK ✓ |
| Admin login | OK ✓ |
| Preview endpoint registered | 404 on GET (expected — POST-only route in Express) ✓ |
| Apply endpoint registered | Exists — NOT executed ✓ |
| Public homepage | 200 OK ✓ |
| Public artworks API | 200 OK — 38 artworks ✓ |
| Public artwork detail | 200 OK ✓ |

### Production Counts Before / After Smoke

| Table | Before | After | Match |
|---|---|---|---|
| artworks | 38 | 38 | OK ✓ |
| artwork_sizes | 91 | 91 | OK ✓ |
| categories | 7 | 7 | OK ✓ |
| order_requests | 3 | 3 | OK ✓ |
| order_request_items | 0 | 0 | OK ✓ |

### Safety Confirmations

- Apply endpoint called: **NO**
- Production import run: **NO**
- Production DB writes: **NO**
- `server/.env` committed: **NO**
- Test workbooks committed: **NO**

---

## Stopped Here Per Ticket

Per ISYNC-17 ticket and production smoke approval: **production Apply has not been run**. The Apply endpoint is deployed but not executed. This document is the stopping point for ISYNC-17.

Next steps (separate ticket):
- Production Apply runbook — agree on scope, rollback plan, and ownership before executing
- Image ZIP upload testing (no ZIP was uploaded in any validation run)
- Admin Review Queue UI for `NEEDS_REVIEW` artwork management
- ARCH-INV-02 (out of scope for ISYNC-17)
