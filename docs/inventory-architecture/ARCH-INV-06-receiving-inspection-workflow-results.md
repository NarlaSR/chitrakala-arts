# ARCH-INV-06 — Receiving and Inspection Workflow: Results

**Branch:** `main` (implemented directly on main)
**Date:** 2026-08-01
**Status:** Implementation complete; local + staging validation passed; production read-only smoke passed

---

## 1. Scope

Implements the full receiving and inspection lifecycle for physical inventory items after a shipment arrives. Covers:

- `DELIVERED` cascade — when a shipment is marked DELIVERED, all `IN_TRANSIT` `physical_inventory` rows automatically transition to `RECEIVED` with `received_date = CURRENT_TIMESTAMP` and a `RECEIVED` movement log per row
- `CUSTOMS → DELIVERED` and `DELIVERED → CLOSED` shipment state transitions added to `SHIPMENT_TRANSITION_MAP`
- `PI_TRANSITION_MAP` — new forward-only state machine for per-item `physical_inventory` status
- `PATCH /api/admin/physical-inventory/:id/status` — new endpoint for per-item status transitions with full movement logging
- `GET /api/admin/physical-inventory?shipment_id=X` — existing endpoint extended with optional `shipment_id` filter for the detail panel
- Admin UI: Physical Inventory card on `AdminShipmentDetail` with per-row action buttons, inline condition notes input for `DAMAGED`, `delivered_date` field, and `delivered_date` in metadata

**Out of scope (not implemented):** reservation workflow, `RESERVED` → transitions, fulfillment, publish safety warnings, SKU generation, public visibility changes.

---

## 2. Pre-Merge Decisions Applied

### Decision 1 — Extended shipment transition map

Updated `SHIPMENT_TRANSITION_MAP` in `server/server.js`:

```
DRAFT          → READY_TO_SHIP, SHIPPED, CANCELLED
READY_TO_SHIP  → SHIPPED, CANCELLED
SHIPPED        → IN_TRANSIT
IN_TRANSIT     → CUSTOMS
CUSTOMS        → DELIVERED          ← new
DELIVERED      → CLOSED             ← new
CLOSED         → (terminal)
CANCELLED      → (terminal)
```

### Decision 2 — Forward-only PI transition map

Added `PI_TRANSITION_MAP` constant in `server/dbQueries.js`:

```
IN_TRANSIT          → RECEIVED
RECEIVED            → INSPECTION_REQUIRED, INSPECTED, DAMAGED, ARCHIVED
INSPECTION_REQUIRED → INSPECTED, DAMAGED, ARCHIVED
INSPECTED           → AVAILABLE, DAMAGED, ARCHIVED
AVAILABLE           → DAMAGED, ARCHIVED
DAMAGED             → AVAILABLE, ARCHIVED
ARCHIVED            → (terminal — no recovery by design)
PENDING_SHIPMENT    → (handled by SHIPPED cascade only)
RESERVED            → (managed by reservation workflow — not in scope)
SOLD                → (terminal)
```

### Decision 3 — Movement type mapping for PI transitions

The `inventory_movements.movement_type` CHECK constraint has 13 valid values; `AVAILABLE` and `INSPECTION_REQUIRED` are not among them. Approved mapping:

| Transition | movement_type | notes |
|---|---|---|
| IN_TRANSIT → RECEIVED | `RECEIVED` | — |
| RECEIVED → INSPECTED | `INSPECTED` | — |
| INSPECTION_REQUIRED → INSPECTED | `INSPECTED` | — |
| RECEIVED → INSPECTION_REQUIRED | `ADJUSTED` | "Status changed from RECEIVED to INSPECTION_REQUIRED" |
| INSPECTED → AVAILABLE | `ADJUSTED` | "Status changed from INSPECTED to AVAILABLE" |
| DAMAGED → AVAILABLE | `ADJUSTED` | "Status changed from DAMAGED to AVAILABLE" |
| * → DAMAGED | `DAMAGED` | condition_notes passed through |
| * → ARCHIVED | `ARCHIVED` | — |

No migration needed — `ADJUSTED`, `RECEIVED`, `INSPECTED`, `DAMAGED`, `ARCHIVED` are all existing valid movement types.

### Decision 4 — DELIVERED cascade fires once only

The DELIVERED cascade (IN_TRANSIT → RECEIVED) guard mirrors the SHIPPED cascade: fires only when `status === 'DELIVERED' && currentStatus !== 'DELIVERED'`. Repeating `PATCH status=DELIVERED` does not duplicate movement rows or overwrite `received_date`.

### Decision 5 — ARCHIVED is terminal

By design — no transition out of `ARCHIVED`. If an archived item needs re-entry into inventory, a new PI row is created in a new shipment. The UI renders "Archived" with no action buttons.

---

## 3. Files Changed

### Backend

| File | Change |
|------|--------|
| `server/dbQueries.js` | `ALLOWED_SHIPMENT_STATUSES_UPDATE` now includes `DELIVERED` and `CLOSED`; `updateShipmentAdmin` DELIVERED cascade added (updates IN_TRANSIT PI rows to RECEIVED with `received_date`, logs RECEIVED movement per row); `getPhysicalInventoryAdmin` now accepts optional `shipmentId` filter; new `PI_TRANSITION_MAP` constant; new `_piMovementType(toStatus)` helper; new `_piMovementNotes(fromStatus, toStatus)` helper; new `updatePhysicalInventoryStatusAdmin(piId, newStatus, username, conditionNotes)` — transactional, FOR UPDATE lock, transition validation, conditional date fields, movement log insert. All new exports added. |
| `server/server.js` | `SHIPMENT_TRANSITION_MAP` updated (CUSTOMS → DELIVERED, DELIVERED → CLOSED); `GET /api/admin/physical-inventory` now reads `req.query.shipment_id` and passes to `getPhysicalInventoryAdmin`; new `PATCH /api/admin/physical-inventory/:id/status` endpoint with piId validation, status requirement, condition_notes requirement for DAMAGED, `INVALID_PI_TRANSITION` error code → 400. |

### Frontend

| File | Change |
|------|--------|
| `src/services/api.js` | Added `getPhysicalInventoryByShipment(shipmentId)` and `updatePhysicalInventoryStatus(piId, status, conditionNotes)` to `inventoryAPI`. |
| `src/pages/AdminShipmentDetail.js` | `UPDATABLE_STATUSES` now includes `DELIVERED`; added `PI_STATUS_LABELS`, `PI_STATUS_COLORS`, `PI_TRANSITIONS` constants; `statusForm` state includes `delivered_date`; `loadShipment` uses `Promise.all` to load shipment + PI in parallel; `loadPhysicalItems` callback for independent PI refresh; `handleStatusSubmit` passes `delivered_date` on DELIVERED transition and calls `loadPhysicalItems` after success; `handlePiAction(piId, toStatus, conditionNotes)` calls API and reloads PI items; `piActions` state `{[piId]: {damagedInput, conditionNotes, submitting, error}}`; metadata shows `delivered_date`; status form shows date input when status=DELIVERED; full Physical Inventory card with table (PI ID, Artwork, Status badge, Received date, Inspected date, Condition Notes, Actions). DAMAGED transitions show inline notes input + Confirm/Cancel; all others are direct buttons. |
| `src/styles/AdminShipmentDetail.css` | Added PI panel styles: `.asd-td-date`, `.asd-td-notes`, `.asd-pi-action-cell`, `.asd-pi-actions`, `.asd-pi-no-actions`, `.asd-btn-pi-action` (base + color variants: received/green, inspection/yellow, inspected/blue, available/bright-green, damaged/red, archive/slate, cancel/slate), `.asd-pi-notes-inline`, `.asd-pi-notes-input`, `.asd-pi-notes-btns`, `.pi-status-badge` and all `.pi-status-*` color classes. |

---

## 4. Schema Alignment

Verified against `server/dbMigration/migrate_arch_inv03_shipment_physical_inventory.sql`:

| Check | Result |
|-------|--------|
| `inventory_movements.movement_type` CHECK allows `RECEIVED` | ✅ |
| `inventory_movements.movement_type` CHECK allows `INSPECTED` | ✅ |
| `inventory_movements.movement_type` CHECK allows `DAMAGED` | ✅ |
| `inventory_movements.movement_type` CHECK allows `ARCHIVED` | ✅ |
| `inventory_movements.movement_type` CHECK allows `ADJUSTED` | ✅ |
| `physical_inventory.status` CHECK allows all 10 statuses in `PI_TRANSITION_MAP` | ✅ |
| `physical_inventory.received_date` column exists | ✅ |
| `physical_inventory.inspected_date` column exists | ✅ |
| `physical_inventory.condition_notes` column exists | ✅ |
| `shipments.status` CHECK allows `DELIVERED` and `CLOSED` | ✅ |
| `shipments.delivered_date` column exists | ✅ |

---

## 5. Local Validation Results (2026-08-01)

**Active DB host:** `localhost:5433` (local) — confirmed not staging or production.

Backend restarted with new code. New `PATCH /api/admin/physical-inventory/:id/status` confirmed live (returned 401 before login, not 404).

All checks passed:

| Category | Checks | Result |
|---|---|---|
| Login + auth | 2 | ✅ |
| Shipment detail loads — PI panel shows 2 IN_TRANSIT rows | 1 | ✅ |
| Status dropdown shows DELIVERED option | 1 | ✅ |
| DELIVERED cascade — date input appears, Mark Received button visible | 2 | ✅ |
| DELIVERED cascade — PI rows auto-transition to RECEIVED, new action buttons appear | 2 | ✅ |
| RECEIVED → INSPECTED | 1 | ✅ |
| RECEIVED → INSPECTION_REQUIRED | 1 | ✅ |
| INSPECTION_REQUIRED → INSPECTED | 1 | ✅ |
| INSPECTED → AVAILABLE | 1 | ✅ |
| INSPECTED → DAMAGED (inline notes input renders) | 1 | ✅ |
| DAMAGED transition — condition_notes required, confirm/cancel flow | 2 | ✅ |
| DAMAGED → AVAILABLE | 1 | ✅ |
| * → ARCHIVED (terminal — no action buttons after) | 1 | ✅ |
| Public gallery regression | 1 | ✅ |

**UI verification (browser):**
- Physical Inventory card renders in shipment detail ✅
- Action buttons match allowed transitions per status ✅
- Inline DAMAGED notes input with Confirm/Cancel flow ✅
- ARCHIVED shows "Archived" label with no action buttons ✅
- `delivered_date` input appears in status form when DELIVERED selected ✅
- `delivered_date` shows in metadata after DELIVERED transition ✅
- Public gallery homepage loads without regression ✅

---

## 6. Staging Validation Results (2026-08-01)

**Target:** `shinkansen.proxy.rlwy.net:41009` (staging)
**Method:** Full UI validation — staging admin login confirmed, browser-based testing
**Active host during staging:** confirmed `shinkansen` — crossover (production) not touched.

Staging test shipment `STAG-TEST-001` created via UI with artwork `art-1783882549398` (IN_STOCK). Advanced through states to DELIVERED to test the full cascade.

All checks passed:

| Category | Checks | Result |
|---|---|---|
| Staging admin login | 1 | ✅ |
| Create test shipment STAG-TEST-001, add artwork | 2 | ✅ |
| Advance to SHIPPED → IN_TRANSIT → CUSTOMS → DELIVERED | 4 | ✅ |
| DELIVERED cascade — PI row auto-transitions to RECEIVED | 1 | ✅ |
| RECEIVED → INSPECTED | 1 | ✅ |
| INSPECTED → AVAILABLE | 1 | ✅ |
| AVAILABLE → DAMAGED (inline condition notes) | 1 | ✅ |
| Movement log rows correct for all transitions | 1 | ✅ |
| Production DB (crossover) not touched during staging session | 1 | ✅ |

**Test row:** `STAG-TEST-001` — fully tested; left on staging (staging DB is ephemeral test environment).

**Active DB host after staging validation:** restored to `localhost:5433` (local).

---

## 7. Production Read-Only Smoke (2026-08-01)

ARCH-INV-06 has not been deployed to production at time of this smoke check. Production admin UI does not yet have the Physical Inventory panel (pre-deployment). Smoke confirms production data was not accidentally touched during staging testing.

**Verification method:** Owner (Sanjay Narla) logged into production admin — manual read-only review.

| Check | Result |
|-------|--------|
| SHIP-2026-001 status = DRAFT | ✅ confirmed in production admin UI |
| Manifest Items = 4 (all items present, untouched) | ✅ confirmed in production admin UI |
| No operational actions taken on production shipment | ✅ |
| No PI transitions on production (code not deployed) | ✅ |

---

## 8. Active Restrictions (carry forward)

The following restrictions remain in force and were not violated in this ticket:

- Do not mark SHIP-2026-001 as SHIPPED
- Do not mark SHIP-2026-001 as DELIVERED
- Do not change production `physical_inventory` rows from `PENDING_SHIPMENT`
- Do not mark any production item RECEIVED, INSPECTION_REQUIRED, INSPECTED, AVAILABLE, DAMAGED, RESERVED, SOLD, or ARCHIVED
- Do not publish artwork
- Do not generate SKUs
- Do not change public visibility
- Do not run Inventory Preview or Apply
- Do not touch WEB-CAT-02
- Stop before any production operational action

---

## 9. Done Recommendation

**ARCH-INV-06 can be marked Done.**

The full receiving and inspection lifecycle is implemented and validated on local and staging. All PI status transitions, movement logging, DELIVERED cascade, and inline DAMAGED notes work as specified. Production data is confirmed untouched. ARCHIVED is terminal by design. Restrictions honoured.

Next: deploy ARCH-INV-06 to production (Railway auto-deploy on push to main), then owner-approved Phase 3 — advance SHIP-2026-001 through SHIPPED → DELIVERED when the physical shipment arrives.
