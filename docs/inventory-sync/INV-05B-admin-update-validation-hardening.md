# INV-05B: Admin Artwork Update Validation Hardening

**Status:** Complete (local dev only — not deployed)  
**Date:** 2026-06-25  
**Depends on:** INV-05

---

## Purpose

INV-05 added inventory fields (`status`, `sku`, `quantity`, `image_filename`, `notes`) to the admin PUT endpoint without validation beyond the status check. This ticket hardens those fields with format validation, uniqueness enforcement, and quantity bounds checking.

---

## Validation Rules Implemented

### Status

Allowed values: `NEEDS_REVIEW`, `IN_STOCK`, `OUT_OF_STOCK`, `SOLD`, `ARCHIVED`

Enforced on both:
- `PATCH /api/admin/artworks/:id/status` (status-only endpoint)
- `PUT /api/artworks/:id` (general update endpoint)

Invalid status returns HTTP 400:
```json
{ "error": "Invalid status. Allowed values: NEEDS_REVIEW, IN_STOCK, OUT_OF_STOCK, SOLD, ARCHIVED" }
```

### SKU

**Valid format:** `CKS-YYYY-CODE-SIZE-NNNNN`

Pattern: `^CKS-\d{4}-(DM|LA|MM|WA|TA|MA)-(SM|MD|LG|XL)-\d{5}$`

Accepted Art Work codes: `DM`, `LA`, `MM`, `WA`, `TA`, `MA`  
Accepted size codes: `SM`, `MD`, `LG`, `XL`

**Rejected:**
- Old format `CKS-DM-SM-2026-0001` → HTTP 400
- Retired code `MW` in SKU → HTTP 400
- Unknown codes (e.g. `XX`) → HTTP 400

**Duplicate SKU** (same SKU on a different artwork) → HTTP 409:
```json
{ "error": "SKU already exists on another artwork." }
```

**Blank/empty SKU:** allowed — explicitly clears the existing SKU to null (supports un-assigning a SKU from an artwork).

**Missing SKU (field not in request):** preserves existing value.

### Quantity

- Must be a whole number
- Must be ≥ 0 (0 is allowed for out-of-stock artworks)
- Negative values rejected → HTTP 400
- Non-numeric values rejected → HTTP 400
- `quantity = 0` is stored as `0`, not `null` (bug fix from INV-05 where `parseInt(0) || null` evaluated to `null`)

### image_filename / notes

No format validation beyond string trimming. Blank value clears the field; missing field preserves existing value.

---

## Files Changed

| File | Change |
|------|--------|
| `server/server.js` | Added shared `ALLOWED_ARTWORK_STATUSES`, `isValidInventorySku()`, `validateQuantity()` helpers; hardened PUT endpoint with SKU format/uniqueness/quantity validation; refactored field resolution to server-side (replaces COALESCE pattern); updated PATCH to use shared constant |
| `server/dbQueries.js` | Removed COALESCE for `status`, `quantity`, `sku`, `image_filename`, `notes` in `updateArtwork()` — server now resolves final values before DB write |

### Key design change: server-side field resolution

Previously, `updateArtwork()` used `COALESCE($n, existing_column)` for the 5 new fields, which meant passing `null` preserved the existing value. This made it impossible to explicitly clear a field (e.g. remove a SKU) via the API.

Now the server resolves the final value for each field before passing it to the DB:
- Field **not in request** → pass existing value (read from `existingArtwork`)  
- Field **in request as blank** → pass `null` (explicitly clear)  
- Field **in request with value** → validate and pass the new value

---

## Test Results (all 26 checks pass)

### A: PATCH /status tests
| Test | Status | Result |
|------|--------|--------|
| A1: valid `NEEDS_REVIEW` | 200 | ✅ |
| A2: valid `IN_STOCK` | 200 | ✅ |
| A3: invalid `DRAFT` | 400 + clear error | ✅ |
| A4: no auth | 401 | ✅ |

### B: PUT status tests
| Test | Status | Result |
|------|--------|--------|
| B1: valid `OUT_OF_STOCK` in PUT | 200 | ✅ |
| B2: restore `IN_STOCK` via PUT | 200 | ✅ |
| B3: invalid `PUBLISHED` → 400 | 400 | ✅ |
| B3: status unchanged after failed PUT | `IN_STOCK` preserved | ✅ |

### C: PUT SKU tests
| Test | Status | Result |
|------|--------|--------|
| C1: valid `CKS-2026-DM-SM-99999` | 200, sku stored | ✅ |
| C2: old format `CKS-DM-SM-2026-0001` | 400 + clear error | ✅ |
| C3: `MW` code in SKU | 400 | ✅ |
| C4: duplicate SKU on another artwork | 409 + clear error | ✅ |
| C5: blank SKU clears to null | 200, sku=null | ✅ |

### D: Quantity tests
| Test | Status | Result |
|------|--------|--------|
| D1: quantity `5` | 200, stored as int `5` | ✅ |
| D2: quantity `0` | 200, stored as `0` (not null) | ✅ (bug fixed) |
| D3: quantity `-1` | 400 "cannot be negative" | ✅ |
| D4: quantity `abc` | 400 | ✅ |

### E: Regression tests
| Test | Result |
|------|--------|
| Preview parser: 24 clean rows, correct SKU format | ✅ |
| Public API returns only IN_STOCK | ✅ |
| Admin API returns all artworks | ✅ |
| PATCH /status still works | ✅ |

### F: Cleanup
| Check | Result |
|-------|--------|
| No imported test rows remaining | ✅ |
| Artwork count: 38 | ✅ |
| Test artwork SKU cleared to null | ✅ |
| Test artwork status: IN_STOCK | ✅ |

---

## Known Limitation / Future Validation

**Quantity ≥ 1 when IN_STOCK:** If `status = 'IN_STOCK'` and `quantity = 0`, this is technically inconsistent (in-stock with zero units). The validation intentionally allows this for the first version — the admin is responsible for setting appropriate quantity before publishing. A future enhancement could warn or block this combination.

---

## Incident: Test Cleanup Bug

During the first test run, the cleanup step used `DELETE FROM artworks WHERE sku LIKE 'CKS-2026-%'` which accidentally deleted the production artwork (`art-1782445237565`) that had been temporarily assigned a `CKS-2026-*` test SKU. The artwork was restored as a placeholder (`[Restored placeholder]`, category `dot-mandala`).

**Lesson:** Test cleanup for SKU-based filtering must only delete rows identified as newly imported (e.g. by ID prefix `cks-2026-*`), not by SKU pattern which can match temporarily modified existing rows. The test was corrected to revert SKU via UPDATE instead of DELETE.

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
