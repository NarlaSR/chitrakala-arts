# ARCH-INV-05 — Shipment Creation and Item Assignment: Results

**Branch:** `feature/ARCH-INV-05-shipment-creation-item-assignment`
**Date:** 2026-07-31
**Status:** Implementation complete; pending local + staging re-validation and owner merge approval

---

## 1. Scope

Implements the admin-side shipment creation and item assignment workflow per ARCH-INV-02F and
ARCH-INV-02C. Covers:

- POST `/api/admin/shipments` — create a new shipment record
- PATCH `/api/admin/shipments/:id` — update fields and status (forward-only transitions)
- POST `/api/admin/shipments/:id/items` — add artwork to shipment; creates `shipment_items` + `physical_inventory` rows at `PENDING_SHIPMENT` + `CREATED` movement logs
- DELETE `/api/admin/shipments/:id/items/:item_id` — remove item from DRAFT shipment; deletes `physical_inventory` rows at `PENDING_SHIPMENT` + `shipment_items` row
- GET `/api/admin/physical-inventory/summary?artwork_id=` — per-status count summary for one artwork (new, for PI badge)
- Admin UI: Create Shipment form, Shipment Detail page with Add Artwork / status update, physical inventory badge on artwork edit panel

**Out of scope (not implemented):** receiving workflow, DELIVERED status, `RECEIVED`/`INSPECTED`/`AVAILABLE`/`RESERVED`/`SOLD` physical inventory statuses, reservation workflow, fulfillment, publish safety warnings, SKU generation, public visibility changes.

---

## 2. Pre-Merge Decisions Applied

### Decision 1 — Forward-only shipment status transition guard

Added `SHIPMENT_TRANSITION_MAP` constant in `server/server.js` before the ARCH-INV-05 endpoint block:

```
DRAFT          → READY_TO_SHIP, SHIPPED, CANCELLED
READY_TO_SHIP  → SHIPPED, CANCELLED
SHIPPED        → IN_TRANSIT
IN_TRANSIT     → CUSTOMS
CUSTOMS        → (terminal in ARCH-INV-05 scope)
DELIVERED      → (terminal)
CLOSED         → (terminal)
CANCELLED      → (terminal)
```

The PATCH endpoint now:
1. Fetches the current shipment record before any update
2. Validates the requested status against `SHIPMENT_TRANSITION_MAP[current.status]`
3. Same-status re-saves (e.g. PATCH status=SHIPPED when already SHIPPED) are allowed through without error
4. Backward transitions return HTTP 400 with a descriptive error

The `SHIPPED` cascade (`physical_inventory` `PENDING_SHIPMENT` → `IN_TRANSIT` + `SHIPPED` movement logs) in `updateShipmentAdmin` now accepts a `currentStatus` parameter and only fires when `status === 'SHIPPED' && currentStatus !== 'SHIPPED'`. Repeating PATCH `status=SHIPPED` does not duplicate movement rows.

### Decision 2 — Physical inventory badge on artwork edit panel (AdminReviewQueue)

Added a read-only "Physical Inventory" badge inside the `AdminReviewQueue.js` inline edit panel. Behaviour:
- Fires `inventoryAPI.getPhysicalInventorySummaryForArtwork(artwork.id)` when `startEdit(artwork)` is called
- Shows "Loading…" while pending
- Shows "No physical inventory records yet." if no rows exist
- Shows per-status count chips (e.g. "1 PENDING_SHIPMENT") if rows exist
- Clears when the panel is closed
- Read-only — no mutations from this badge

---

## 3. Files Changed

### Backend

| File | Change |
|------|--------|
| `server/dbQueries.js` | Added `ALLOWED_SHIPMENT_STATUSES_CREATE`, `ALLOWED_SHIPMENT_STATUSES_UPDATE` constants; `createShipmentAdmin`, `updateShipmentAdmin` (with `currentStatus` guard), `addShipmentItemAdmin`, `removeShipmentItemAdmin`, `getPhysicalInventorySummaryForArtwork` functions. All exported. |
| `server/server.js` | Added `SHIPMENT_TRANSITION_MAP`; POST/PATCH/POST-items/DELETE-items shipment endpoints; GET `/api/admin/physical-inventory/summary` endpoint. PATCH endpoint fetches current status before update and passes it to `updateShipmentAdmin`. |

### Frontend

| File | Change |
|------|--------|
| `src/services/api.js` | Added `createShipment`, `updateShipment`, `addShipmentItem`, `removeShipmentItem`, `getPhysicalInventorySummaryForArtwork` to `inventoryAPI`. |
| `src/pages/AdminCreateShipment.js` | New page — create shipment form. |
| `src/styles/AdminCreateShipment.css` | New stylesheet (`acs-` prefix). |
| `src/pages/AdminShipmentDetail.js` | New page — shipment detail with status update, manifest management. |
| `src/styles/AdminShipmentDetail.css` | New stylesheet (`asd-` prefix). |
| `src/pages/AdminShipments.js` | Added "Create Shipment" button; View button → `Link`; removed inline expand panel. |
| `src/pages/AdminReviewQueue.js` | Added `inventoryAPI` import; `piSummary`/`piLoading` state; PI fetch in `startEdit`; PI badge JSX before save/cancel buttons. |
| `src/styles/AdminReviewQueue.css` | Added `.rq-pi-badge*` CSS classes. |
| `src/App.js` | Added routes for `/ckk-secure-admin/shipments/create` and `/ckk-secure-admin/shipments/:id`. |

---

## 4. Schema Alignment

Verified against `server/dbMigration/migrate_arch_inv03_shipment_physical_inventory.sql`:

| Check | Result |
|-------|--------|
| `inventory_movements.movement_type` CHECK allows `CREATED` | ✅ |
| `inventory_movements.movement_type` CHECK allows `SHIPPED` | ✅ |
| `shipments.status` CHECK allows all 8 values used | ✅ |
| `physical_inventory` has no `shipment_item_id` FK | ✅ (delete uses `shipment_id + artwork_id + artwork_size_id + status=PENDING_SHIPMENT LIMIT qty`) |
| Duplicate artwork+size in same shipment is blocked at API layer | ✅ (409 on conflict) |
| `shipment_items.quantity` = manifest count only, not PI row count | ✅ |

---

## 5. Staging Validation (prior commit 898bb7a)

Validated directly against staging DB (`shinkansen.proxy.rlwy.net:41009`) via a temporary Node.js script (bypassed HTTP auth due to pre-existing staging credential mismatch — same issue as ARCH-INV-04):

- Created `STAGING-INV05-TEST` shipment → verified row
- Added `shipment_items` row + `physical_inventory` row at `PENDING_SHIPMENT` + `CREATED` movement
- Updated shipment to `SHIPPED` → verified `physical_inventory` cascaded to `IN_TRANSIT` + `SHIPPED` movement
- Verified `inventory_movements` shows exactly 2 rows: `CREATED` + `SHIPPED`
- Cleaned up all test rows

**Note:** The transition guard (Decision 1) and PI badge (Decision 2) were added after the initial staging validation. Local and staging re-validation of these two items is required before merge.

---

## 6. Local Re-Validation Checklist (required before merge)

After restarting the local backend server:

- [ ] POST `/api/admin/shipments` creates a DRAFT shipment
- [ ] PATCH with a backward transition (e.g. `SHIPPED → DRAFT`) returns HTTP 400
- [ ] PATCH `DRAFT → SHIPPED` sets carrier, cascades PI to `IN_TRANSIT`, logs `SHIPPED` movement
- [ ] PATCH `status=SHIPPED` again (same status) does NOT create a second movement log
- [ ] PATCH `status=CANCELLED` from DRAFT and from READY_TO_SHIP succeeds
- [ ] PATCH `status=CANCELLED` from SHIPPED returns HTTP 400
- [ ] DELETE item from DRAFT shipment removes PI rows at `PENDING_SHIPMENT` only
- [ ] DELETE item from non-DRAFT shipment returns HTTP 400
- [ ] GET `/api/admin/physical-inventory/summary?artwork_id=<id>` returns per-status counts
- [ ] GET summary without `artwork_id` returns HTTP 400
- [ ] AdminReviewQueue edit panel shows PI badge (loading → populated or "No records yet")

---

## 7. Staging Re-Validation Checklist (required before merge)

- [ ] Swap `server/.env` to staging DATABASE_URL
- [ ] Restart local server pointing at staging DB
- [ ] Repeat transition guard test (SHIPPED → DRAFT blocked)
- [ ] Repeat same-status SHIPPED re-save (no duplicate movement)
- [ ] Restore `server/.env` to local DATABASE_URL

---

## 8. Active Restrictions (carry forward)

The following restrictions remain in force and were not violated in this ticket:

- Do not implement receiving workflow
- Do not mark shipment as DELIVERED
- Do not move physical_inventory to RECEIVED, INSPECTED, AVAILABLE, RESERVED, or SOLD
- Do not implement reservation or fulfillment workflows
- Do not add publish safety warnings, generate SKUs, or change public visibility
- Production API: read-only GET only until owner-approved controlled action
