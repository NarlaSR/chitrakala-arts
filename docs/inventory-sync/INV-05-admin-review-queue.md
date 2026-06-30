# INV-05: Admin Review Queue for Imported Artworks

**Status:** Complete (local dev only — not deployed)  
**Date:** 2026-06-25  
**Depends on:** INV-01 through INV-04

---

## Purpose

Imported artworks land with `status = 'NEEDS_REVIEW'` and are hidden from the public website. This page lets an admin find those items, review their details, edit missing fields (description, materials, dimensions), and publish them to the public site by changing their status to `IN_STOCK`.

---

## Route / UI Location

**Route:** `/ckk-secure-admin/review-queue`  
**Nav button:** "Review Queue" — second button in the Admin Dashboard header (after "Inventory Sync")

---

## Status Model

| Status | Meaning | Publicly Visible |
|--------|---------|-----------------|
| `NEEDS_REVIEW` | Imported but not ready | No |
| `IN_STOCK` | Approved, available | Yes |
| `OUT_OF_STOCK` | Not currently available | No |
| `SOLD` | Sold or unavailable | No |
| `ARCHIVED` | Hidden from all views | No |

**Public API rule:** `GET /api/artworks` and `GET /api/artworks/:id` return only `status = 'IN_STOCK'` rows.  
**Admin API:** `GET /api/admin/artworks` returns all rows regardless of status.

---

## Backend Changes

### New endpoint: `PATCH /api/admin/artworks/:id/status`

Sets a single artwork's status. Admin auth required.

**Request:**
```json
{ "status": "IN_STOCK" }
```

**Allowed values:** `NEEDS_REVIEW`, `IN_STOCK`, `OUT_OF_STOCK`, `SOLD`, `ARCHIVED`

**Response:** full artwork row

### Updated: `PUT /api/admin/artworks/:id`

Now accepts additional optional fields (ignored if not sent, preserving existing values via `COALESCE`):

| New field | DB column |
|-----------|-----------|
| `status` | `artworks.status` |
| `quantity` | `artworks.quantity` |
| `sku` | `artworks.sku` |
| `image_filename` | `artworks.image_filename` |
| `notes` | `artworks.notes` |

### Updated: `db.updateArtwork()` (dbQueries.js)

Added `status`, `quantity`, `sku`, `image_filename`, `notes` to the UPDATE query using `COALESCE($n, column)` so missing fields preserve existing values.

### Added: `db.updateArtworkStatus(id, status)` (dbQueries.js)

Single-purpose function for status updates with allowed-values validation.

### CORS

Added `PATCH` to the allowed methods list in CORS config (required for browser `fetch()` with PATCH method).

---

## Frontend Files

| File | Change |
|------|--------|
| `src/pages/AdminReviewQueue.js` | **New** — review queue page |
| `src/styles/AdminReviewQueue.css` | **New** — page styles |
| `src/services/api.js` | Added `artworksAPI.getAllAdmin()`, `artworksAPI.updateStatus()` |
| `src/App.js` | Added route `/ckk-secure-admin/review-queue` |
| `src/pages/AdminDashboard.js` | Added "Review Queue" nav button |

---

## Page Features

### Summary count cards (top)
Clickable cards showing count for each status + All. Clicking a card filters the table.

### Filter tabs
All | Needs Review | In Stock | Out of Stock | Sold | Archived  
Default: **Needs Review**

### Artwork table columns
Title | SKU | Status | Category | Qty | Price (INR) | Price (USD) | Dimensions | Materials | Image File | Has Image | Created | Actions

### Actions per row
| Button | Behaviour |
|--------|-----------|
| **Edit** | Expands an inline edit panel below the row |
| **Publish** | Confirm dialog → sets status to `IN_STOCK` → item appears publicly |
| **OOS** | Sets status to `OUT_OF_STOCK` |
| **Archive** | Sets status to `ARCHIVED` |

Buttons that would set an artwork to its current status are hidden.

### Inline edit panel
Fields: Title, Status (dropdown), Quantity, Price (INR), Dimensions, Materials, Description, Notes (internal)  
Saves via `PUT /api/artworks/:id` with multipart form data.

---

## Publish Workflow

1. Admin opens Review Queue → default filter shows only `NEEDS_REVIEW` items.
2. Admin reviews item details (SKU, category, price, dimensions).
3. Admin optionally clicks **Edit** → fills description, materials, dimensions.
4. Admin clicks **Publish** → confirmation dialog:  
   *"This will make the artwork visible on the public website. Continue?"*
5. Status changes to `IN_STOCK`.
6. Item disappears from the Needs Review filter.
7. Item appears on the public website immediately.

---

## Local Test Results (2026-06-25)

**Test setup:** applied corrected workbook via Inventory Sync page → 24 NEEDS_REVIEW rows created (DB 38→62).

### C. Review Queue UI
| Check | Result |
|-------|--------|
| Page renders at `/ckk-secure-admin/review-queue` | ✅ |
| h1 = "Review Queue" | ✅ |
| Summary cards: All=62, NEEDS_REVIEW=24, IN_STOCK=38 | ✅ |
| Default filter: "Needs Review" active | ✅ |
| Table shows 24 rows, all with NEEDS_REVIEW badges | ✅ |
| First SKU: `CKS-2026-DM-LG-00001` | ✅ |

### D. Publish one item
| Check | Result |
|-------|--------|
| PATCH /api/admin/artworks/:id/status → 200 | ✅ |
| Updated status: `IN_STOCK` | ✅ |
| Public count: 38 → 39 | ✅ |
| Admin count: 62 (unchanged) | ✅ |
| NEEDS_REVIEW count: 24 → 23 | ✅ |
| Published artwork visible in public API | ✅ |

### E. Edit/review test
| Check | Result |
|-------|--------|
| PUT /api/artworks/:id → 200 | ✅ |
| description, materials, dimensions saved | ✅ |
| status remains NEEDS_REVIEW after edit | ✅ |
| Item still hidden from public API | ✅ |

### F. Status filter breakdown
```
ALL=62, NEEDS_REVIEW=23, IN_STOCK=39, OUT_OF_STOCK=0, SOLD=0, ARCHIVED=0
```

### G. Cleanup
```sql
DELETE FROM artworks WHERE sku LIKE 'CKS-2026-%';
```
- 24 rows deleted ✅
- DB count: 62 → 38 ✅
- No test data remaining ✅

---

## Production Safety Confirmation

- ✅ `server/.env` → `localhost:5433/chitrakala_dev` only, not staged
- ✅ No production DB changes
- ✅ No deployment
- ✅ No invoice/shipment generation
- ✅ No AI description generation
- ✅ No bulk image matching
- ✅ No `artwork_sizes` writes
- ✅ No test data left behind

---

## Next Steps

1. **Image upload in review queue** — the inline edit panel can be extended to include an image file input (the backend already supports it via `PUT /api/artworks/:id`)
2. **Bulk publish** — select multiple NEEDS_REVIEW items and publish all at once
3. **SKU backfill** — assign SKUs to the existing 38 production artworks that currently have no SKU
4. **Deploy** — push all inventory sync changes (INV-01 through INV-05) to Railway once production workbook is corrected
