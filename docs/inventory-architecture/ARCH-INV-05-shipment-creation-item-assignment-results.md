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

## 5. Local Validation Results (2026-07-31)

**Active DB host before validation:** `localhost:5433` (local) — confirmed not staging or production.

Backend restarted with new code (new route `GET /api/admin/physical-inventory/summary` confirmed
returning `{"error":"Access token required"}` before login, confirming new server code loaded).

**Fix applied during validation:** Carrier required-check in PATCH endpoint fired incorrectly on
same-status re-saves (e.g. `PATCH status=SHIPPED` on an already-SHIPPED shipment returned 400
because no carrier in body). Fixed: carrier is now required only on the actual transition INTO
SHIPPED (`current.status !== 'SHIPPED'`). Committed in this validation pass.

All 37 checks passed:

| Category | Checks | Result |
|---|---|---|
| Login + auth | 2 | ✅ |
| PI badge — empty state | 3 | ✅ |
| PI badge — with PI rows | 2 | ✅ |
| PI badge — missing artwork_id param | 1 | ✅ |
| Create shipment | 3 | ✅ |
| Add item (qty=2, 2 PI rows, 2 CREATED movements) | 5 | ✅ |
| PI badge — after item added | 2 | ✅ |
| Transition guard — backward blocked (DRAFT→IN_TRANSIT, CANCELLED→DRAFT, CANCELLED→SHIPPED) | 5 | ✅ |
| SHIPPED cascade (PI PENDING_SHIPMENT → IN_TRANSIT, 1 SHIPPED movement) | 5 | ✅ |
| Repeat PATCH status=SHIPPED — no duplicate movement | 2 | ✅ |
| SHIPPED→DRAFT blocked, IN_TRANSIT→DRAFT blocked | 3 | ✅ |
| DELETE item from IN_TRANSIT and CANCELLED blocked | 2 | ✅ |
| DELETE item from DRAFT — removes PI rows | 4 | ✅ |
| Admin shipments list, PI list | 2 | ✅ |
| Public gallery + categories + order-requests | 3 | ✅ |
| Cleanup — 3 test shipments removed, 0 remaining | 2 | ✅ |

**UI verification (browser):**
- Admin Shipments list loads, "+ Create Shipment" button present ✅
- Admin Create Shipment page loads with all fields ✅
- Admin Shipment Detail page loads with metadata, status dropdown, manifest table ✅
- PI badge (with rows): artwork `cks-2026-dm-lg-00003` → "2 IN TRANSIT" ✅
- PI badge (empty): artwork `cks-2026-dm-md-00001` → "No physical inventory records yet." ✅
- Public gallery homepage loads ✅
- WEB-CAT-02 / category files: `git diff HEAD~2 HEAD` shows no changes ✅

**Cleanup:** All 3 `LOCAL-INV05-TEST*` shipments and their PI/movement rows removed. Confirmed 0 rows remaining.

---

## 6. Staging Validation Results (2026-07-31)

**Target:** `shinkansen.proxy.rlwy.net:41009` (staging)
**Method:** Direct DB validation script (bypasses HTTP auth — staging admin credentials don't match; same pre-existing issue as ARCH-INV-04)
**Active host during staging:** confirmed `shinkansen` — crossover (production) not touched.

All 26 checks passed:

| Category | Checks | Result |
|---|---|---|
| Host safety (shinkansen confirmed, crossover absent) | 3 | ✅ |
| PI summary query on staging schema | 1 | ✅ |
| Create shipment (`ARCH-INV-05-STAGING-TEST`) | 1 | ✅ |
| Add item — shipment_items + physical_inventory PENDING_SHIPMENT + CREATED movement | 3 | ✅ |
| PI summary shows PENDING_SHIPMENT after add | 1 | ✅ |
| Transition map logic — DRAFT→SHIPPED allowed, bad transitions blocked | 5 | ✅ |
| SHIPPED cascade — PI → IN_TRANSIT, SHIPPED movement logged | 3 | ✅ |
| Duplicate prevention — same-status cascade guard, movement count=1 | 2 | ✅ |
| DELETE safety guard — canDelete=false for SHIPPED shipment | 2 | ✅ |
| Full row verify — shipment SHIPPED, PI IN_TRANSIT, 2 movements CREATED+SHIPPED | 5 | ✅ |
| Status CHECK constraint exists on staging shipments table | 1 | ✅ |
| Cleanup — all test rows removed, 0 remaining | 3 | ✅ |

**Test row:** `ARCH-INV-05-STAGING-TEST` (shipment id=2) — fully removed. Confirmed 0 rows remaining.

**Active DB host after staging validation:** restored to `localhost:5433` (local). Confirmed via `node -e` check.

---

## 8. Active Restrictions (carry forward)

The following restrictions remain in force and were not violated in this ticket:

- Do not implement receiving workflow
- Do not mark shipment as DELIVERED
- Do not move physical_inventory to RECEIVED, INSPECTED, AVAILABLE, RESERVED, or SOLD
- Do not implement reservation or fulfillment workflows
- Do not add publish safety warnings, generate SKUs, or change public visibility
- Production API: read-only GET only until owner-approved controlled action
