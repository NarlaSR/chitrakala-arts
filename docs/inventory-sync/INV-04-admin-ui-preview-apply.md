# INV-04: Admin UI — Inventory Preview + Apply

**Status:** Complete (local dev only — not deployed)  
**Date:** 2026-06-25  
**Depends on:** INV-01 through INV-03B-Cleanup

---

## Purpose

Adds a dedicated **Inventory Sync** admin page so the admin can:
1. Upload an inventory workbook
2. Preview which rows will create or update artworks
3. See errors/reviews/creates/updates clearly before committing
4. Apply the import when preview has no blocking errors
5. Confirm imported rows remain `NEEDS_REVIEW` (hidden from public)

---

## UI Location

**Route:** `/ckk-secure-admin/inventory-sync`  
**Nav button:** "Inventory Sync" — first button in the Admin Dashboard header

The page follows the same header/nav/layout pattern as all other admin pages (AdminAboutPage, AdminCategoriesPage, etc.).

---

## Files Changed

| File | Change |
|------|--------|
| `src/pages/AdminInventorySync.js` | **New** — full inventory sync page component |
| `src/styles/AdminInventorySync.css` | **New** — page styles |
| `src/services/api.js` | Added `inventorySyncAPI` with `preview()`, `apply()`, `getAdminArtworks()` |
| `src/App.js` | Added route `/ckk-secure-admin/inventory-sync` |
| `src/pages/AdminDashboard.js` | Added "Inventory Sync" nav button |

---

## API Service (`src/services/api.js`)

```js
export const inventorySyncAPI = {
  preview: async (file) => { /* POST /api/admin/inventory-sync/preview */ },
  apply:   async (file) => { /* POST /api/admin/inventory-sync/apply   */ },
  getAdminArtworks: async ()  => { /* GET /api/admin/artworks           */ },
};
```

Uses the existing Axios instance with automatic Bearer token injection.

---

## Page Workflow

### 1. Upload
- File picker (label + hidden `<input type="file" accept=".xlsx,.xls">`)
- Shows selected filename and file size
- Helper text reminds admin to use the corrected workbook
- Corrections note lists the two required fixes (row 3 SKU, row 13 Art Work)

### 2. Preview Inventory
- Disabled until a file is selected
- Calls `POST /api/admin/inventory-sync/preview`
- Shows loading state ("Previewing…")
- Displays:
  - **Summary cards:** Total Rows, Creates, Updates, Reviews, Errors
  - **Row table:** Row#, Action badge, SKU, Item Description, Art Work, Size, Qty, Price (INR), Planned Status, Issues
  - **Error summary list** if `errorCount > 0`
  - **Batch warnings** from server if any

### 3. Apply Inventory Import
- Disabled when `errorCount > 0` or no preview result
- Shows confirmation dialog before proceeding
- Re-sends the file to `POST /api/admin/inventory-sync/apply` (backend re-validates)
- Shows loading state ("Applying…")
- Displays apply result: created/updated counts, sample SKUs/IDs

### 4. Clear / Upload Another File
- Resets all state: file selection, preview result, apply result, error state

---

## Preview Result UI

### Classification badges (colour-coded)

| Badge | Colour | Meaning |
|-------|--------|---------|
| CREATE | Green | New artwork, SKU not in DB |
| UPDATE | Blue | Existing artwork by SKU |
| REVIEW | Orange | Valid row with warnings |
| ERROR | Red | Blocked — must fix before applying |
| NEEDS_REVIEW | Purple | Planned import status for valid rows |

### Row Issues column
- **Red ✕** — blocking errors (old SKU format, MW code, missing required field)
- **Orange ⚠** — warnings (unknown size code, etc.)

---

## Blocked/Error Behavior

If `errorCount > 0`:
- Red banner: "Fix workbook errors before applying."
- Apply button is disabled
- Error summary list shows each failing row with the specific error message

**Actionable messages for known issues:**
- Old SKU format → "Old SKU format detected (CKS-DM-SM-2026-0001). Expected format: CKS-YYYY-CODE-SIZE-00001."
- MW code → "Unknown Art Work code "MW" — business confirmation needed. If this was "MW", use "MA" for Mixed Art."
- Missing required field → "Missing Item description" / "Missing Quantity" / etc.

---

## Public Visibility Safety

The apply result section displays:  
> 🔒 **Public site only displays IN_STOCK artworks.** Imported NEEDS_REVIEW rows remain hidden until reviewed and approved by an admin.

---

## Local Test Results (2026-06-25)

All tests run from the browser via `preview_eval` + direct API calls using the logged-in session token.

### Admin login
✅ Login to `local-admin` succeeds, lands on Admin Dashboard  
✅ "Inventory Sync" nav button visible and navigates to `/ckk-secure-admin/inventory-sync`  
✅ Page renders: header, corrections note, file picker, disabled Preview button

### A. Bad workbook preview
```json
{ "totalRows": 24, "createCount": 22, "updateCount": 0, "reviewCount": 1, "errorCount": 1 }
```
- Row 3 error: old SKU format message ✅
- Row 13 review: MW code warning ✅

### B. Bad workbook apply
- HTTP 422 ✅
- "Batch blocked — fix all errors before applying." ✅
- 0 DB writes ✅

### C. Corrected workbook preview
```json
{ "totalRows": 24, "createCount": 24, "updateCount": 0, "reviewCount": 0, "errorCount": 0 }
```
- 0 batch warnings (sku column detected) ✅
- All 24 rows: `plannedStatus = "NEEDS_REVIEW"` ✅
- New-format SKUs: `CKS-2026-DM-SM-00001`, `CKS-2026-LA-LG-00001`, etc. ✅

### D. Corrected workbook apply
- HTTP 200 ✅
- `createdCount: 24` ✅
- Sample IDs: `cks-2026-dm-sm-00001`, `cks-2026-la-lg-00001`, `cks-2026-la-md-00001` ✅
- Admin count: 38 → 62 ✅
- Public count: still 38 (NEEDS_REVIEW hidden) ✅

### E. Re-upload corrected workbook (UPDATE scenario)
```json
{ "previewSummary": { "createCount": 0, "updateCount": 24, "errorCount": 0 }, "applySummary": { "createdCount": 0, "updatedCount": 24 } }
```
- No duplicates created ✅
- Admin count remains 62 ✅
- Existing statuses preserved ✅

### F. Cleanup
```sql
DELETE FROM artworks WHERE sku LIKE 'CKS-2026-%';
```
- 24 rows deleted ✅
- DB count: 62 → 38 ✅
- Public count: 38 ✅
- No test data left behind ✅

---

## Required Workbook Corrections

| Row | Problem | Fix |
|-----|---------|-----|
| 3 | SKU `CKS-DM-SM-2026-0001` (old format) | `CKS-2026-DM-SM-00001` |
| 13 | Art Work `MW` (retired) | `MA` (Mixed Art) |

Corrected local-only test copy: `__test_workbooks/shipmentDetails_20260624_corrected_inv03b.xlsx` (gitignored)

---

## Production Safety Confirmation

- ✅ `server/.env` → `localhost:5433/chitrakala_dev` only, not staged
- ✅ No production DB changes
- ✅ No deployment
- ✅ No invoice/shipment generation
- ✅ No image upload/matching
- ✅ No `artwork_sizes` writes
- ✅ No AI description generation
- ✅ No test data left behind

---

## Next Steps

1. **Update real workbook** — correct row 3 SKU and row 13 Art Work before production use
2. **Admin review/approval UI** — let admin review `NEEDS_REVIEW` items, add image/description, promote to `IN_STOCK`
3. **Update `artworksAPI.getAll()`** in api.js to use `/api/admin/artworks` on admin pages that need all statuses
4. **Production pricing** — confirm `usd_multiplier` should be updated to 2.25 in production
5. **Deploy** — push changes to Railway once production data and workbook are ready
