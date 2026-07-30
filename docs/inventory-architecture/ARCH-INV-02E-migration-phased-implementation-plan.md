# ARCH-INV-02E — Migration and Phased Implementation Plan

**Ticket:** ARCH-INV-02E — Migration and Phased Implementation Plan  
**Branch:** `feature/ARCH-INV-02-planning`  
**Date:** 2026-07-29  
**Type:** Design/planning document — no code changes, no schema changes, no production data changes  
**Depends on:** ARCH-INV-02B, 02C, 02D (all committed on this branch)  
**Reference docs:** ARCH-INV-02A–02D, ARCH-INV-01, ISYNC-18-04/05/06, ORD-01/02/04

---

## 1. Purpose

This document converts the design decisions from ARCH-INV-02B, 02C, and 02D into a safe, phased implementation plan. It defines:

1. Eight implementation phases from schema foundation through audit trail enhancements.
2. The safe migration order for new database tables and column additions.
3. How existing production data (38 public artworks, 4 ISYNC-18 artworks) should be handled during the transition.
4. Future Jira tickets with names, scope, and dependencies.
5. Per-phase validation requirements.
6. Rollback strategy.
7. Owner decisions required before implementation begins.
8. What is explicitly deferred and why.

This is a planning document only. No migrations are written, no code is changed, no production data is modified.

---

## 2. Scope and Non-Scope

### In scope

- Phased implementation plan overview
- Migration order and principles
- Existing data backfill strategy
- Future ticket breakdown (ARCH-INV-03 through ARCH-INV-10)
- Per-phase validation and rollback guidance
- Owner decisions needed before build
- Deferred items

### Not in scope

- Schema migration SQL text (reserved for ARCH-INV-03)
- Application code (reserved for implementation tickets)
- Production execution of any migration or data change
- INV-PRICE-01, WEB-CAT-02, ISYNC-18-07, ISYNC-19, INV-SKU-01 — separate tracks
- Payment, checkout, shipping, or tax logic — out of scope for this system

---

## 3. Inputs from ARCH-INV-02A through 02D

| Document | Key outputs used here |
|---|---|
| **ARCH-INV-02A** | Current production counts: 42 artworks (38 public IN_STOCK, 4 NEEDS_REVIEW hidden), all sku=null, 91 artwork_sizes, 3 order_requests, 4 order_request_items. Fields, gap list, no current physical inventory model. |
| **ARCH-INV-02B** | Four new entities: `shipments`, `shipment_items`, `physical_inventory`, `inventory_movements`. Schema definitions. `physical_inventory_id` to be added to `order_request_items`. `artworks.quantity` to be deprecated later. `artwork_sizes.price` NOT NULL to be relaxed (INV-PRICE-01 scope). |
| **ARCH-INV-02C** | Shipment lifecycle (8 states). Physical inventory lifecycle (10 states). Admin workflow steps. AVAILABLE must precede public publishing. Physical availability never auto-publishes. ISYNC-18 retroactive setup via admin UI. |
| **ARCH-INV-02D** | Reservation only at CONFIRMED (explicit admin action). Decrement at FULFILLED (explicit admin action). No auto-reservation on submission. No auto-decrement on any status change. MADE_TO_ORDER skips reservation until production complete. `inventory_movements` event types defined. |

---

## 4. Implementation Principles

1. **Additive first.** All Phase 1 migrations add new tables and columns only. No existing tables are altered destructively. No existing columns removed.

2. **No automatic data changes.** No migration or code change automatically modifies existing artwork records, order request records, SKUs, prices, or public visibility. Every data change is an explicit admin action.

3. **Staging before production.** Every migration runs on Railway staging first. Staging must pass full validation before production deployment.

4. **Backup before every production migration.** A `pg_dump` backup is taken before any production schema change, using the ISYNC-18-03 runbook procedure.

5. **Phases are independently deployable.** Each phase can be deployed and validated without requiring the next phase to be complete. Later phases build on earlier ones but do not break them if delayed.

6. **Rollback is additive-safe.** Because early phases only add tables and columns, rollback is a `DROP TABLE` or `ALTER TABLE DROP COLUMN` with no data loss on existing tables. Later phases that write data require more careful rollback planning (documented per phase).

7. **No emergency phase skipping.** Phases must complete their validation gate before the next begins. If validation fails, stop, diagnose, fix, and revalidate. Do not skip to a later phase to work around a failing gate.

8. **Current public catalog is protected throughout.** The 38 public artworks must remain at public count = 38 after every migration and code deployment. Any deviation is a stop condition.

9. **The 4 ISYNC-18 artworks remain NEEDS_REVIEW + hidden throughout.** They must not be published as a side effect of any phase. Publishing is deferred to ISYNC-18-07 and follows after Phase 4 is complete.

10. **Owner approval gates each phase.** Before any phase goes to production, the owner reviews the staging results and explicitly approves production deployment.

---

## 5. Recommended Phase Overview

| Phase | Name | Key deliverable | Blocking? | Tickets |
|---|---|---|---|---|
| **0** | Owner Approval and No-Code Readiness | All owner decisions confirmed; ARCH-INV-02 planning package accepted | Yes — gates Phase 1 | None |
| **1** | Additive Schema Foundation | New tables created; no data yet | Yes — gates all later phases | ARCH-INV-03 |
| **2** | Admin Read-Only Inventory Views | Admin can see physical_inventory status in UI; no write operations | No — parallel with Phase 3 preparation | ARCH-INV-04 |
| **3** | Shipment Creation and Assignment | Admin can create shipments and attach artworks; physical_inventory rows created at PENDING_SHIPMENT | No — gates Phase 4 | ARCH-INV-05 |
| **4** | Receiving, Inspection, and AVAILABLE | Admin can receive shipments, inspect items, mark AVAILABLE | No — gates Phase 5/6; unblocks ISYNC-18-07 | ARCH-INV-06 |
| **5** | Publish Safety Warnings | Admin panel warns when publishing with no AVAILABLE inventory | No — optional safety layer | ARCH-INV-07 |
| **6** | Order Request Reservation | Admin can reserve physical unit for CONFIRMED orders | No — gates Phase 7 | ARCH-INV-08 |
| **7** | Fulfillment and SOLD | Admin can mark FULFILLED + SOLD in linked action | No — completes order lifecycle | ARCH-INV-09 |
| **8** | Audit Trail and Cleanup | inventory_movements log view; artworks.quantity deprecation; history backfill (optional) | No — enhancement | ARCH-INV-10 |

Phases 3 and 4 are sequentially dependent. Phases 5, 6, 7, 8 are independent additions on top of Phase 4 and can be prioritized separately by the owner.

---

## 6. Phase 0 — Owner Approval and No-Code Readiness

### Purpose

Ensure all design decisions are confirmed before any build work begins. Phase 0 is complete when the owner has reviewed and accepted ARCH-INV-02B through 02E and provided answers to all Phase 0 decisions listed in Section 19.

### Deliverables

- ARCH-INV-02 planning branch reviewed and accepted by owner
- All Phase 0 owner decisions in Section 19 answered
- Shared planning branch merged to main (the planning documents, not implementation)
- ARCH-INV-03 ticket created and prioritized

### Gate to Phase 1

Owner explicitly approves ARCH-INV-03 (the schema migration ticket).

### Timeline consideration

Phase 0 is not blocked by the ISYNC-18 shipment arriving. It can proceed immediately after owner review of this document.

---

## 7. Phase 1 — Additive Schema Foundation

**Ticket:** ARCH-INV-03 — Add Shipment and Physical Inventory Schema  
**Type:** Schema migration — additive only  
**Dependencies:** Phase 0 complete; owner decisions answered

### New tables to create

```
shipments
shipment_items
physical_inventory
inventory_movements
```

### New column to add

```
order_request_items.physical_inventory_id
  INTEGER, nullable, FK → physical_inventory(id) ON DELETE SET NULL
```

### Migration order (dependency-safe sequence)

```
Step 1: CREATE TABLE shipments
Step 2: CREATE TABLE shipment_items (FK → shipments, artworks, artwork_sizes)
Step 3: CREATE TABLE physical_inventory (FK → shipments, artworks, artwork_sizes)
Step 4: CREATE TABLE inventory_movements (FK → physical_inventory)
Step 5: ALTER TABLE order_request_items ADD COLUMN physical_inventory_id ...
Step 6: CREATE INDEX statements for all new tables
```

All five steps must be in a single transaction (or sequential idempotent `IF NOT EXISTS` statements). If any step fails, the entire migration is rolled back.

### What NOT to do in Phase 1

- Do not backfill any data into the new tables
- Do not create any shipment_items, physical_inventory, or inventory_movements rows
- Do not set any physical_inventory_id on existing order_request_items
- Do not alter `artworks`, `artwork_sizes`, `order_requests`, `categories`, or `artwork_sizes` beyond the single column addition noted above
- Do not relax `artwork_sizes.price NOT NULL` (that is INV-PRICE-01 scope)
- Do not deprecate or remove `artworks.quantity`

### Validation gates for Phase 1

**Staging (must pass before production):**

| Check | Expected |
|---|---|
| All 4 new tables exist with correct columns and constraints | ✓ |
| `order_request_items.physical_inventory_id` column exists, nullable, FK correct | ✓ |
| All new tables are empty (no data) | ✓ |
| `artworks` row count unchanged | 42 |
| `artworks` public count unchanged | 38 |
| `artwork_sizes` row count unchanged | 91 |
| `order_requests` row count unchanged | 3 |
| `order_request_items` row count unchanged | 4 |
| `order_request_items.physical_inventory_id` is null on all 4 existing rows | ✓ |
| Existing public artwork API response unchanged | ✓ |
| Existing admin artwork API response unchanged | ✓ |
| Existing order request API response unchanged | ✓ |
| FK constraint test: insert a test physical_inventory row; confirm FK to artwork | ✓ then rollback |
| FK constraint test: insert a test order_request_items.physical_inventory_id; confirm FK | ✓ then rollback |

**Production:**  
Same validation set. Plus: `pg_dump` backup taken before migration. Backup verified before applying.

### Rollback for Phase 1

Because Phase 1 is purely additive and no existing tables are modified (except one column addition on `order_request_items`):

```
DROP TABLE IF EXISTS inventory_movements;
DROP TABLE IF EXISTS physical_inventory;
DROP TABLE IF EXISTS shipment_items;
DROP TABLE IF EXISTS shipments;
ALTER TABLE order_request_items DROP COLUMN IF EXISTS physical_inventory_id;
```

Safe to execute if Phase 1 migration must be reversed. No data is lost from existing tables.

---

## 8. Phase 2 — Admin Read-Only Inventory Views

**Ticket:** ARCH-INV-04 — Admin Read-Only Inventory and Shipment Views  
**Type:** Backend API + frontend UI (read-only)  
**Dependencies:** Phase 1 complete

### Purpose

Give the admin visibility into physical inventory and shipment status in the UI, even before any shipments or inventory records exist. The admin can see "No inventory on file" for all artworks after Phase 1.

### Backend changes

| New endpoint | Purpose |
|---|---|
| `GET /api/admin/physical-inventory` | List all physical_inventory rows; filterable by status, artwork_id |
| `GET /api/admin/physical-inventory/:id` | Detail for one physical_inventory row |
| `GET /api/admin/shipments` | List all shipments; filterable by status |
| `GET /api/admin/shipments/:id` | Shipment detail including shipment_items and linked physical_inventory |

**Enhancement to existing endpoint:**

`GET /api/admin/artworks` — add `physical_inventory_summary` field per artwork:
```json
{
  "physical_inventory_summary": {
    "total": 0,
    "available": 0,
    "in_transit": 0,
    "pending_shipment": 0
  }
}
```
Returns all zeros initially. No breaking change — this is an additive field.

### Frontend changes

| Screen | Change |
|---|---|
| Artwork list / Review Queue | Physical inventory status badge per artwork ("No inventory", "Pending Shipment", "In Transit", "Available") |
| Artwork detail / Edit page | New section: "Physical Inventory" — shows list of physical_inventory rows for this artwork (status, received_date, shipment reference), or "No inventory on file" |
| New admin screen | Shipment List — shows all shipments (reference number, status, item count, dates) |
| New admin screen | Physical Inventory List — all physical_inventory rows with status filter |

### What NOT to do in Phase 2

- No write operations to physical_inventory or shipments
- No changes to existing artwork PATCH/POST endpoints
- No changes to order request endpoints
- No changes to public APIs

### Validation gates for Phase 2

| Check | Expected |
|---|---|
| New GET endpoints return 200 with empty arrays | ✓ |
| Artwork list shows "No inventory" badge for all 42 artworks | ✓ |
| Existing artwork API responses unchanged (GET /api/artworks) | ✓ |
| Public artwork count unchanged | 38 |
| Admin artwork count unchanged | 42 |
| No write operations possible via new endpoints (PUT/POST/DELETE return 404 or 405) | ✓ |

---

## 9. Phase 3 — Shipment Creation and Assignment Workflow

**Ticket:** ARCH-INV-05 — Shipment Creation and Item Assignment  
**Type:** Backend API + frontend UI (write operations begin)  
**Dependencies:** Phase 1 (schema), Phase 2 (views — recommended but not hard-required)

### Purpose

Allow the admin to create shipment records, add artworks to shipments, and manage the pre-shipment and in-transit lifecycle. This is the phase that enables the ISYNC-18 retroactive setup (creating SHIP-2026-001 and 4 physical_inventory rows at PENDING_SHIPMENT).

### Backend changes

| New endpoint | Purpose |
|---|---|
| `POST /api/admin/shipments` | Create a new shipment (DRAFT) |
| `PATCH /api/admin/shipments/:id` | Update shipment fields (status, carrier, dates, tracking, notes) |
| `POST /api/admin/shipments/:id/items` | Add an artwork to a shipment; creates shipment_items row + physical_inventory row at PENDING_SHIPMENT |
| `DELETE /api/admin/shipments/:id/items/:item_id` | Remove an artwork from a DRAFT shipment; removes shipment_items + associated physical_inventory row (if PENDING_SHIPMENT only) |

**Shipment status transitions allowed via PATCH:**
- DRAFT → READY_TO_SHIP
- READY_TO_SHIP → SHIPPED (requires carrier + shipped_date; all physical_inventory items → IN_TRANSIT)
- SHIPPED → IN_TRANSIT (optional; updates physical_inventory items if not already IN_TRANSIT)
- IN_TRANSIT → CUSTOMS (updates notes)
- Any → CANCELLED (if no items are RESERVED or SOLD; physical_inventory items → PENDING_SHIPMENT or ARCHIVED)

### Frontend changes

| Screen | Change |
|---|---|
| Shipment List | Becomes actionable: "Create Shipment" button |
| Create Shipment | Form: reference_number, source_location, destination_location, expected_ship_date |
| Shipment Detail | Shows items; "Add Artwork" action (dropdown from NEEDS_REVIEW artworks); "Mark Shipped" button (prompts carrier + date); status badge |
| Artwork Detail | Link to associated shipment; physical inventory badge updates to reflect PENDING_SHIPMENT or IN_TRANSIT |

### ISYNC-18 retroactive setup (happens in this phase)

After Phase 3 is live in production, the admin performs a one-time retroactive setup for the 4 ISYNC-18 artworks:

1. Admin creates `SHIP-2026-001` (source: India, destination: USA, status: DRAFT)
2. Admin adds the 4 artworks to the shipment via "Add Artwork" action
3. System creates 4 `shipment_items` rows and 4 `physical_inventory` rows at `PENDING_SHIPMENT`
4. Admin updates `artworks.notes` to replace the "Pending shipment from India" free-text with a clean note referencing SHIP-2026-001
5. Shipment status remains DRAFT until the owner physically ships

**What does NOT happen during this setup:**
- No artwork status changes
- No show_on_website changes
- No SKU generation
- No public visibility changes

### Validation gates for Phase 3

| Check | Expected |
|---|---|
| Create shipment: POST creates a DRAFT shipment with correct fields | ✓ |
| Add artwork to shipment: creates shipment_items + physical_inventory at PENDING_SHIPMENT | ✓ |
| Mark shipment SHIPPED: all physical_inventory items → IN_TRANSIT; shipped_date set | ✓ |
| Date validation: delivered_date must be ≥ shipped_date | ✓ |
| Cannot add artwork to a SHIPPED shipment | 400 |
| Cannot delete a non-DRAFT shipment's items | 400 |
| Public artwork count unchanged after all Phase 3 operations | 38 |
| Admin artwork count unchanged | 42 |
| Existing order_requests unchanged | 3 |

---

## 10. Phase 4 — Receiving, Inspection, and AVAILABLE Workflow

**Ticket:** ARCH-INV-06 — Receiving, Inspection, and Inventory AVAILABLE Workflow  
**Type:** Backend API + frontend UI  
**Dependencies:** Phase 3 complete; at least one shipment in SHIPPED status

### Purpose

Allow the admin to receive a shipment, inspect each item, and mark it AVAILABLE. This phase completes the physical inventory lifecycle from IN_TRANSIT to AVAILABLE. After Phase 4, the ISYNC-18-07 publish workflow becomes executable for any artwork that reaches AVAILABLE.

### Backend changes

**New shipment action endpoints:**

| Endpoint | Purpose |
|---|---|
| `POST /api/admin/shipments/:id/receive` | Mark shipment RECEIVED; all IN_TRANSIT physical_inventory items → RECEIVED; delivered_date set |

**New physical_inventory action endpoints:**

| Endpoint | Purpose |
|---|---|
| `PATCH /api/admin/physical-inventory/:id/status` | Update physical_inventory.status with validation (allowed transitions only) |
| `PATCH /api/admin/physical-inventory/:id` | Update condition_notes, inspected_date, notes |

**Allowed status transitions via PATCH (server-side enforced):**

| From | To | Rules |
|---|---|---|
| RECEIVED | INSPECTION_REQUIRED | Always allowed |
| INSPECTION_REQUIRED | INSPECTED | Always allowed; sets inspected_date |
| INSPECTED | AVAILABLE | Always allowed |
| INSPECTED | DAMAGED | Requires condition_notes non-empty |
| RECEIVED | DAMAGED | Requires condition_notes non-empty |
| AVAILABLE | DAMAGED | Requires condition_notes non-empty + owner confirmation |
| DAMAGED | AVAILABLE | Requires owner confirmation flag in request body |
| AVAILABLE | ARCHIVED | Always allowed |
| Any | ARCHIVED | Always allowed |

### Frontend changes

| Screen/action | Change |
|---|---|
| Shipment Detail | "Mark Received" button (prompts delivered_date confirmation) |
| Physical inventory item (per item on shipment detail) | "Mark INSPECTION_REQUIRED", "Mark Inspected", "Mark Available", "Mark Damaged" action buttons, shown contextually |
| Artwork detail | Physical inventory section shows current status, received_date, inspected_date; link to shipment |
| Review Queue | Badge updates dynamically: "In Transit" → "Received" → "Available" as status progresses |

### ISYNC-18-07 gate

After Phase 4 is live and the ISYNC-18 physical artworks are marked AVAILABLE (after real-world receipt and inspection), the owner may proceed with ISYNC-18-07. ISYNC-18-07 is not a separate implementation ticket — it is a controlled operational workflow using the Phase 4 admin tools.

### Validation gates for Phase 4

| Check | Expected |
|---|---|
| Mark shipment RECEIVED: physical_inventory items move to RECEIVED | ✓ |
| Mark item INSPECTED: inspected_date set | ✓ |
| Mark item AVAILABLE: status = AVAILABLE | ✓ |
| Mark item DAMAGED without condition_notes: rejected | 400 |
| Cannot skip RECEIVED → AVAILABLE (must pass through INSPECTED) | 400 |
| Artwork can still be published (status + show_on_website) even if no physical_inventory AVAILABLE yet (Phase 5 warning not yet live) | ✓ (no blocking yet) |
| Public artwork count unchanged | 38 |
| Admin artwork count unchanged | 42 |
| Existing order_requests unchanged | 3 |

---

## 11. Phase 5 — Publish Safety Warnings

**Ticket:** ARCH-INV-07 — Publish Safety Warnings Based on Physical Inventory  
**Type:** Backend API + frontend UI (warning layer, no blocking)  
**Dependencies:** Phase 1 (schema); Phase 4 recommended but not required

### Purpose

Add a soft safety check: when the admin saves an artwork as IN_STOCK (or MADE_TO_ORDER) with show_on_website=true, and no physical_inventory rows exist with status IN ('INSPECTED','AVAILABLE'), return a warning in the API response and prompt the admin for explicit override confirmation.

This phase does not block publication. It adds a guardrail.

### Backend change

**Modification to:** `PATCH /api/admin/artworks/:id` (the artwork edit/save endpoint)

When the new status is IN_STOCK or MADE_TO_ORDER AND show_on_website is being set to true:
1. Query `physical_inventory` for rows matching this artwork_id with status IN ('INSPECTED','AVAILABLE')
2. If count = 0 AND request does not include `{"override_no_inventory": true}`:
   - Return HTTP 200 with a `warning` field:
     ```json
     {
       "warning": "no_available_inventory",
       "message": "No inspected physical inventory found for this artwork. Include override_no_inventory: true to proceed.",
       "artwork": { ... }
     }
     ```
   - Do NOT save the artwork changes
3. If count = 0 AND request includes `{"override_no_inventory": true}`:
   - Save the artwork changes (status + show_on_website applied)
   - Log the override in `artworks.notes` (append: "Published without inventory verification [date]")
4. If count > 0: proceed normally; no warning

**Special case for MADE_TO_ORDER:**  
The warning message is modified: "This is a made-to-order item — no physical inventory required. Include override_no_inventory: true to confirm." The override is still required to prevent accidental publish, but the message does not imply a problem.

**Transition period handling:**  
During the transition when many artworks have no physical_inventory rows (because Phase 4 hasn't run for those artworks), the override mechanism covers all existing artworks. The owner is expected to use `override_no_inventory: true` for artworks that were published before physical inventory tracking existed.

### Frontend change

When the API returns `warning: "no_available_inventory"`:
- Admin panel shows a modal: "No inspected physical inventory on file for this artwork. Are you sure you want to publish it?"
- Owner clicks "Publish Anyway" (sends `override_no_inventory: true`) or "Cancel"

### What this phase does NOT do

- Does not block any artwork from being published
- Does not change the public visibility rule
- Does not affect any existing IN_STOCK artworks (they are already published; the warning is for new publications)

### Validation gates for Phase 5

| Check | Expected |
|---|---|
| Save IN_STOCK + show_on_website=true without inventory and without override: warning returned | ✓ (no save) |
| Save IN_STOCK + show_on_website=true with override_no_inventory=true: saves successfully | ✓ |
| Save IN_STOCK + show_on_website=true with AVAILABLE physical inventory: saves without warning | ✓ |
| Existing published artworks (status unchanged): no impact | ✓ |
| MADE_TO_ORDER warning message is correct | ✓ |
| Public artwork count unchanged | 38 |

---

## 12. Phase 6 — Order Request Reservation Workflow

**Ticket:** ARCH-INV-08 — Order Request Reservation Workflow  
**Type:** Backend API + frontend UI  
**Dependencies:** Phase 1 (schema), Phase 4 (AVAILABLE units must exist)

### Purpose

Allow the admin to reserve a specific physical_inventory unit for a CONFIRMED order request. Implements ARCH-INV-02D Option D.

### Backend changes

| New endpoint | Purpose |
|---|---|
| `POST /api/admin/order-requests/:id/reserve` | Reserve a physical unit for this order. Body: `{ item_id, physical_inventory_id }` |
| `POST /api/admin/order-requests/:id/release` | Release a reservation. Body: `{ item_id }` |

**Reserve action logic:**
1. Verify order_requests.status = CONFIRMED (400 if not)
2. Verify physical_inventory.status = AVAILABLE (409 if already RESERVED)
3. In a transaction:
   - `physical_inventory.status` → RESERVED
   - `order_request_items.physical_inventory_id` → physical_inventory.id
   - Write `inventory_movements` row: movement_type = RESERVED, reference_type = order_request, reference_id = order_request.id

**Release action logic:**
1. Verify order_requests.status = CONFIRMED or CANCELLED
2. Verify physical_inventory.status = RESERVED and physical_inventory_id matches
3. In a transaction:
   - `physical_inventory.status` → AVAILABLE
   - `order_request_items.physical_inventory_id` → null
   - Write `inventory_movements` row: movement_type = RESERVATION_RELEASED

**Cancel order with reservation (enhancement to existing PATCH status):**
When `PATCH /api/admin/order-requests/:id/status` sets status = CANCELLED and any items have a physical_inventory_id:
- Automatically release all linked physical_inventory rows (RESERVED → AVAILABLE)
- Write RESERVATION_RELEASED movements
- Clear physical_inventory_id on all items
- All in a transaction with the status update

### Frontend changes

| Screen | Change |
|---|---|
| Order request detail | Per-item: physical_inventory status display; "Reserve" button (CONFIRMED + AVAILABLE unit exists); "Release" button (RESERVED) |
| Physical inventory list | "Reserved for Order #N" label when status = RESERVED |
| Artwork detail physical inventory section | Shows if unit is RESERVED and for which order |

### Validation gates for Phase 6

| Check | Expected |
|---|---|
| Reserve: physical_inventory.status → RESERVED, order_request_items.physical_inventory_id set | ✓ |
| Double-reserve same unit: rejected | 409 |
| Reserve for non-CONFIRMED order: rejected | 400 |
| Release: physical_inventory → AVAILABLE, physical_inventory_id cleared | ✓ |
| Cancel CONFIRMED order with reservation: auto-releases; inventory returns to AVAILABLE | ✓ |
| RESERVATION_RELEASED inventory_movements row written | ✓ |
| Public artwork count unchanged | 38 |
| Existing order_requests unchanged | 3 |

---

## 13. Phase 7 — Fulfillment and SOLD Inventory Movement Workflow

**Ticket:** ARCH-INV-09 — Fulfillment and SOLD Inventory Status  
**Type:** Backend API + frontend UI  
**Dependencies:** Phase 6 (reservation must exist before fulfillment in typical flow)

### Purpose

Allow the admin to mark an order FULFILLED and simultaneously record the physical unit as SOLD. Implements the inventory decrement rule from ARCH-INV-02D.

### Backend changes

**Enhancement to existing PATCH status endpoint:**
When `PATCH /api/admin/order-requests/:id/status` sets status = FULFILLED:
1. For each order_request_items row:
   - If `physical_inventory_id` is set and physical_inventory.status = RESERVED:
     - `physical_inventory.status` → SOLD
     - Write SOLD inventory_movements row
   - If `physical_inventory_id` is set but physical_inventory.status ≠ RESERVED:
     - Return 400: "Physical inventory for item [N] is not in RESERVED state. Cannot fulfill."
   - If `physical_inventory_id` is null:
     - Check request body for `{ "override_no_inventory": true }`
     - If override present: proceed (MADE_TO_ORDER case or transition period)
     - If no override: return warning in response (same pattern as Phase 5)

**Post-fulfillment warning:**  
After FULFILLED, check if any `artworks` that were in the order now have zero AVAILABLE physical_inventory units. Return a warning in the API response: "Artwork [title] now has no available physical inventory. Consider updating its status."

This warning is informational — no automatic status change to artwork.

### Frontend changes

| Screen | Change |
|---|---|
| Order request detail | FULFILLED action: if linked inventory is RESERVED, marks SOLD in the same action; if no inventory, shows override prompt |
| After fulfillment | Warning panel: "The following artworks now have no remaining available inventory: [list]" |
| Physical inventory list | SOLD items visible with fulfilled date |

### Validation gates for Phase 7

| Check | Expected |
|---|---|
| FULFILLED with RESERVED unit: physical_inventory → SOLD, SOLD movement written | ✓ |
| FULFILLED without RESERVED unit (no override): warning returned | ✓ |
| FULFILLED without RESERVED unit (with override): proceeds | ✓ |
| Post-fulfillment warning returned when artwork has no AVAILABLE units | ✓ |
| artworks.status NOT automatically changed to OUT_OF_STOCK after fulfillment | ✓ |
| Public artwork count unchanged | 38 |

---

## 14. Phase 8 — Audit Trail and Cleanup Enhancements

**Ticket:** ARCH-INV-10 — Inventory Audit Trail and Cleanup  
**Type:** Backend API + frontend UI (enhancement)  
**Dependencies:** Phases 3–7 (all previous write phases should be writing movements)

### Purpose

Provide the admin with a full audit trail of physical inventory history. Begin deprecating `artworks.quantity`. Optionally backfill historical inventory movements for artworks that were handled before Phase 8.

### Backend changes

| Endpoint | Purpose |
|---|---|
| `GET /api/admin/inventory-movements` | List all inventory_movements; filterable by artwork_id, physical_inventory_id, movement_type |
| `GET /api/admin/inventory-movements?artwork_id=X` | Full history for a specific artwork |

**Ensure all Phase 3–7 endpoints write movements:**
- Phase 3: CREATED movement on physical_inventory creation; SHIPPED movement on shipment marked SHIPPED
- Phase 4: RECEIVED, INSPECTED, AVAILABLE, DAMAGED movements on status transitions
- Phase 5: PUBLISHED movement when artwork is saved as IN_STOCK + show_on_website=true (including overrides)
- Phase 6: RESERVED, RESERVATION_RELEASED movements
- Phase 7: SOLD movement
- If any earlier phase missed writing movements: add them in Phase 8

### artworks.quantity deprecation (Phase 8)

Once physical_inventory is live and provides accurate stock counts:
1. Admin panel updates: hide `artworks.quantity` from the edit form (read-only display only)
2. Backend: stop writing `artworks.quantity` in artwork PATCH responses (return null or omit)
3. Document the deprecation in a comment in the code
4. Schema removal of `artworks.quantity` is deferred to a future cleanup ticket (requires confirming no external system references the column)

**Note:** `artworks.quantity` removal requires a production migration and must not be done in Phase 8. Phase 8 only deprecates the UI/API exposure.

### Optional historical backfill

For artworks that were published before inventory_movements existed (all current 38 public artworks), a PUBLISHED movement can be written retroactively:
```
movement_type = 'PUBLISHED'
created_at = artworks.updatedAt (approximate)
notes = 'Backfilled — published before inventory tracking'
```

**This is optional and requires owner approval before running.** It is a data enrichment, not required for Phase 8 functionality.

### Validation gates for Phase 8

| Check | Expected |
|---|---|
| GET /api/admin/inventory-movements returns all movements | ✓ |
| Movements for ISYNC-18 artworks show correct history | ✓ |
| artworks.quantity hidden in admin UI | ✓ |
| artworks.quantity still present in DB (not removed) | ✓ |
| Public artwork count unchanged | 38 |

---

## 15. Existing Data Backfill Strategy

### 38 existing public IN_STOCK artworks

**Recommendation: Do not auto-create physical_inventory rows for the 38 existing public artworks.**

Rationale:
- The system cannot verify whether physical units are currently available without the owner inspecting each artwork
- Some artworks may have been sold or gifted without the system being updated
- Assuming all 38 are AVAILABLE without verification would produce inaccurate inventory data
- The Phase 5 override mechanism handles the transition period — existing artworks already published do not need inventory rows to remain published

**Recommended approach for the 38 existing artworks:**
- After Phase 3 is live, the admin creates physical_inventory rows for each artwork **only when its physical status is known and verified by the owner**
- This happens opportunistically: when a new shipment arrives or when the owner physically reviews inventory
- Artworks with no physical_inventory rows are covered by the override mechanism — they can remain public without a warning being triggered because Phase 5 only triggers on new publications (status/visibility changes), not on pre-existing published artworks

**If the owner wants to formally track all 38 existing artworks:**
A controlled per-artwork backfill tool could be provided (ARCH-INV-10 scope). Admin selects an artwork and fills in:
- `physical_inventory.quantity` = 1 (or actual count)
- `physical_inventory.status` = AVAILABLE (owner confirms it is physically on hand)
- `physical_inventory.source` = "Pre-existing production stock"
- `physical_inventory.received_date` = (approximate, owner provides)
- `physical_inventory.notes` = "Backfilled during ARCH-INV-10"

This is done per-artwork, with the owner confirming each one. Not a bulk automated process.

### 4 ISYNC-18 NEEDS_REVIEW artworks

**Recommendation: Create physical_inventory rows via the admin UI after Phase 3 is live.**

Procedure (one-time, performed by admin after Phase 3 deployment):
1. Create `shipments` record: SHIP-2026-001, India → USA, status=DRAFT
2. Add the 4 artworks to the shipment via "Add Artwork" action
3. System auto-creates 4 `physical_inventory` rows at PENDING_SHIPMENT
4. Admin updates `artworks.notes` on each to remove the "Pending shipment from India" free-text (the shipment record is now the authoritative source)
5. When the real shipment is dispatched: admin marks SHIP-2026-001 as SHIPPED → physical_inventory rows → IN_TRANSIT
6. When received: admin marks RECEIVED → inspection workflow → AVAILABLE
7. After AVAILABLE: owner may proceed with ISYNC-18-07 publish workflow

**No automated migration or script is needed for this.** The admin UI handles it.

**What does NOT change for the 4 artworks:**
- `artworks.status` stays NEEDS_REVIEW
- `show_on_website` stays false
- `sku` stays null
- All 4 remain hidden from public API

### existing order_request_items

No backfill needed. The 4 existing `order_request_items` rows have `physical_inventory_id = null` (set by the Phase 1 migration as the column default). This is correct — these rows predate physical inventory tracking. The snapshot fields preserve all customer-facing data.

### artworks.quantity

No backfill or migration required. `artworks.quantity` remains in the schema and is not touched until Phase 8 deprecation work.

---

## 16. Production Validation Strategy

### Per-phase validation pattern

Every phase follows this sequence before production:

```
1. Run migration/deploy on staging
2. Run automated validation checks (counts, API responses)
3. Manual smoke test (admin UI walkthrough)
4. Owner reviews staging results
5. Owner approves production deployment
6. pg_dump backup of production (pre-deployment)
7. Verify backup (backup size > threshold; restore test if warranted)
8. Deploy to production (migration + app code)
9. Run production validation checks immediately after
10. Manual smoke test of production
11. Monitor for 30 minutes (error logs, public site behavior)
12. Owner confirms production is healthy
```

### Non-change checks (run after every phase)

These checks must pass after every phase deployment:

| Check | Expected |
|---|---|
| `GET /api/artworks` public artwork count | 38 (unchanged until owner explicitly publishes more) |
| `GET /api/admin/artworks` admin count | 42 (unchanged until next import) |
| NEEDS_REVIEW count | 4 (the ISYNC-18 artworks) |
| `GET /api/admin/order-requests` count | 3 |
| `GET /api/admin/order-requests` item count | 4 |
| `GET /api/config/maintenance-mode` | false |
| `GET /api/pricing-settings` fx_rate | 92.4 |
| `GET /api/pricing-settings` usd_multiplier | 2.25 |
| All 4 ISYNC-18 artworks absent from public API | ✓ |
| All 4 ISYNC-18 artworks have sku=null | ✓ |

### Stop conditions

If any non-change check fails after a deployment:
1. Stop all further work immediately
2. Assess whether the change can be reversed without data loss
3. If Phase 1 (additive only): roll back with the Phase 1 rollback SQL
4. If later phases: assess per-phase rollback procedures
5. Do not proceed to the next phase until the current one passes all checks

---

## 17. Rollback and Safety Strategy

### Phase 1 (schema only — full rollback possible)

Rollback SQL:
```sql
DROP TABLE IF EXISTS inventory_movements;
DROP TABLE IF EXISTS physical_inventory;
DROP TABLE IF EXISTS shipment_items;
DROP TABLE IF EXISTS shipments;
ALTER TABLE order_request_items DROP COLUMN IF EXISTS physical_inventory_id;
```
This is safe because Phase 1 contains no data in existing tables. All new tables are empty. The `physical_inventory_id` column is null on all existing rows.

### Phase 2 (read-only API + UI — no data changes)

Rollback: deploy previous application version. No schema changes to reverse.

### Phase 3 (first write phase)

After Phase 3, `physical_inventory` rows exist. Rolling back Phase 3 application code:
- Removes the write endpoints
- Does not remove the data already written

If data must be cleaned up: manual psql `DELETE FROM physical_inventory WHERE ...` and `DELETE FROM shipments WHERE ...` after confirming which rows are safe to remove.

**Important:** Never delete `physical_inventory` rows that have status = RESERVED or SOLD without owner confirmation.

### Phase 4 (status transitions)

Rollback: redeploy previous application version. Data changes (status transitions on physical_inventory) are reversible by the admin via the status PATCH endpoint. No destructive data changes occur in Phase 4.

### Phases 5–7 (warning layer, reservation, fulfillment)

Rollback: redeploy previous application version.

For Phase 6/7 data (RESERVED, SOLD status): admin can manually reverse using PATCH endpoints if needed. SOLD status represents a real-world event (item shipped to customer) — reverting SOLD to AVAILABLE should only happen if the physical item was actually returned.

### General rollback principles

1. **Always use a pre-migration backup.** The backup is the ultimate safety net. If a migration causes unexpected issues, restore from backup as a last resort.
2. **Additive migrations are safe to roll back.** No existing data is affected.
3. **Data backfills are targeted and reviewed.** No bulk data operations without owner confirmation.
4. **Never delete order request data.** `order_requests` and `order_request_items` are customer records and historical data. They must never be bulk-deleted.
5. **Never auto-update `artworks.status` or `show_on_website` as part of any migration.** These are owner-controlled fields.

---

## 18. Deferred / Explicitly Out-of-Scope Items

These items are intentionally excluded from the ARCH-INV-02 implementation phases. Each would require a separate approved ticket.

| Item | Reason deferred |
|---|---|
| Automatic inventory decrement on order submission | ARCH-INV-02D explicitly rejects this; changes customer-facing semantics |
| Automatic publish from physical inventory status | ARCH-INV-02C/D explicitly prohibits this |
| Automatic SKU backfill for all 42 artworks | Requires INV-SKU-01 review; all 42 currently have sku=null; owner must decide timing |
| `artwork_sizes.price NOT NULL` relaxation | INV-PRICE-01 scope — separate ticket |
| `artworks.quantity` column removal | Phase 8 deprecates the UI; schema removal is a follow-up destructive migration |
| `artwork_sizes` rename to `artwork_variants` | Deferred until a concrete variant-type requirement exists |
| Multi-location inventory | No multi-location use case currently; out of scope |
| Checkout, payment, tax, shipping to customer | Not part of this system |
| Automated `RETURNED` order status | Low priority; ARCH-INV-02D defers this to future ticket |
| Automatic artwork hide when physical inventory = SOLD | Phase 7 returns a warning only; auto-hide requires separate approval |
| Full payment and cart checkout | Out of scope for current Chitrakala Arts system |
| `WEB-CAT-02` (server-side category filter fix) | Separate pre-existing ticket |
| `ISYNC-18-07` (controlled publish of first received artwork) | Operational workflow ticket, not implementation |
| `ISYNC-19` (next import batch) | Separate import ticket |
| `INV-PRICE-01` (size-level Price on Request) | Separate ticket |
| Public site display of inventory count ("1 left!") | Future UX enhancement; requires deliberate owner approval |
| Bulk physical inventory inspection action | Phase 8 stretch goal at most |
| inventory_movements log export/report | Phase 8 stretch goal |

---

## 19. Owner Decisions Needed

These decisions must be answered before Phase 1 implementation begins (ARCH-INV-03 ticket). Some affect Phase 1 schema design; others affect Phase 3–8 behavior.

### Required before Phase 1

| # | Decision | Options | Impact |
|---|---|---|---|
| D1 | Should `inventory_movements` be created in Phase 1 schema, or deferred to Phase 8? | (A) Phase 1 — all tables at once; (B) Phase 8 — add movements table later | Affects ARCH-INV-03 scope. Recommendation: Phase 1, to avoid a second schema migration later. |
| D2 | Should `order_request_items.physical_inventory_id` be added in Phase 1, or deferred to Phase 6? | (A) Phase 1 — additive, low risk, prepares for Phase 6; (B) Phase 6 — only add when needed | Recommendation: Phase 1. The column is nullable and has no impact until Phase 6. |
| D3 | For physical_inventory, should units be tracked per individual row (quantity=1) or as batch buckets (quantity=N)? | (A) Individual rows (one row per physical piece; quantity always 1); (B) Batch buckets (one row per artwork/shipment; quantity=N) | Impacts how Phase 3 creates physical_inventory rows and how Phase 6 handles partial reservations. Recommendation from ARCH-INV-02D: individual rows (Option A) for MVP. |

### Required before Phase 3

| # | Decision | Options | Impact |
|---|---|---|---|
| D4 | Who will operate the receiving and inspection workflow — the owner only, or any logged-in admin? | Owner only / Any admin | Affects access control on Phase 4 endpoints. Currently there is only one admin user, so this may not matter yet. |
| D5 | What shipment fields are required vs. optional? | `reference_number` required? `carrier` required at SHIPPED? `tracking_number` required at SHIPPED? | Affects Phase 3 validation rules. Recommendation: reference_number required; carrier required at SHIPPED; tracking_number optional. |

### Required before Phase 4

| # | Decision | Options | Impact |
|---|---|---|---|
| D6 | Should ISYNC-18-07 (publish of first received artwork) wait for Phase 4 to be live, or should it be a manual data operation run earlier? | (A) Wait for Phase 4 — use admin UI; (B) Proceed manually via psql if Phase 4 is delayed | Recommendation: wait for Phase 4. The admin UI is the safest path. |

### Required before Phase 5

| # | Decision | Options | Impact |
|---|---|---|---|
| D7 | Should the Phase 5 publish warning apply retroactively to existing 38 artworks if they are re-saved? | (A) Warning fires whenever IN_STOCK + show_on_website=true with no inventory (including re-saves of already-published artworks); (B) Warning fires only on first publish (status or show_on_website changing to orderable) | Recommendation: (B) — only on transitions to orderable, not on re-saves. Avoids constant override prompts for existing artworks. |
| D8 | Should MADE_TO_ORDER artworks require the override flag when publishing? | (A) Yes — same override as IN_STOCK, different warning message; (B) No — MADE_TO_ORDER bypasses the inventory check entirely | Recommendation: (A) — require override with a clear "this is made-to-order, no inventory needed" message. Keeps the pattern consistent. |

### Required before Phase 6

| # | Decision | Options | Impact |
|---|---|---|---|
| D9 | Should order reservation at CONFIRMED be required (blocking fulfillment without reservation) or optional (warning only)? | (A) Required — cannot mark FULFILLED without a linked physical_inventory_id; (B) Optional — can mark FULFILLED with override (MADE_TO_ORDER and transition cases) | Recommendation: (B) optional with override. Keeps MADE_TO_ORDER and transition-period artworks unblocked. |

### Informational (can be decided later)

| # | Decision | Why it matters |
|---|---|---|
| D10 | How should the 38 existing public artworks be handled for physical_inventory backfill? | Owner must verify physical stock before creating inventory rows. Affects Phase 8 backfill scope. |
| D11 | What is the priority order for phases 5, 6, 7, 8? | These are independent; the owner may choose to prioritize Phase 6/7 over Phase 5 if the reservation workflow is more urgent. |
| D12 | Should SKU backfill for all 42 artworks (currently all sku=null) be scheduled? | INV-SKU-01 scope, but timing affects whether Phase 5 or 7 warnings reference SKUs. |

---

## 20. Recommended Future Jira Ticket Breakdown

| Ticket | Name | Phase | Key scope | Depends on |
|---|---|---|---|---|
| **ARCH-INV-03** | Add Shipment and Physical Inventory Schema | 1 | Migrations: create `shipments`, `shipment_items`, `physical_inventory`, `inventory_movements` tables; add `physical_inventory_id` to `order_request_items`; all additive | Phase 0 / Owner decisions D1–D3 |
| **ARCH-INV-04** | Admin Read-Only Inventory and Shipment Views | 2 | GET endpoints for shipments + physical_inventory; artwork list badge; artwork detail inventory section | ARCH-INV-03 |
| **ARCH-INV-05** | Shipment Creation and Item Assignment | 3 | POST/PATCH shipments; add artwork to shipment (creates physical_inventory at PENDING_SHIPMENT); SHIPPED → IN_TRANSIT transition; Shipment List + Detail admin UI | ARCH-INV-03; ARCH-INV-04 recommended |
| **ARCH-INV-06** | Receiving, Inspection, and AVAILABLE Workflow | 4 | Receive shipment action; per-item PATCH status (INSPECTION_REQUIRED → INSPECTED → AVAILABLE / DAMAGED); admin UI inspect/available/damaged actions; unblocks ISYNC-18-07 | ARCH-INV-05 |
| **ARCH-INV-07** | Publish Safety Warnings | 5 | Warning in artwork PATCH when publishing with no AVAILABLE inventory; override mechanism; MADE_TO_ORDER modified message; admin override prompt | ARCH-INV-03 (Phase 1 sufficient) |
| **ARCH-INV-08** | Order Request Reservation | 6 | POST /api/admin/order-requests/:id/reserve; POST /api/admin/order-requests/:id/release; RESERVED inventory movement; cancel-with-reservation auto-release; admin order UI | ARCH-INV-06 |
| **ARCH-INV-09** | Fulfillment and SOLD Status | 7 | FULFILLED action marks linked physical_inventory SOLD; SOLD movement; post-fulfillment no-inventory warning; admin UI | ARCH-INV-08 |
| **ARCH-INV-10** | Inventory Audit Trail and Cleanup | 8 | GET /api/admin/inventory-movements; ensure all prior phases write movements; artworks.quantity deprecation (UI only); optional historical backfill | ARCH-INV-09 |

### Estimated phase effort (rough, not binding)

| Ticket | Estimated complexity | Notes |
|---|---|---|
| ARCH-INV-03 | Low | SQL migration only; no app code |
| ARCH-INV-04 | Medium | Multiple new GET endpoints + frontend badges |
| ARCH-INV-05 | High | Write endpoints + shipment UI screens + physical_inventory creation logic |
| ARCH-INV-06 | Medium | Status transition endpoints + action buttons |
| ARCH-INV-07 | Low–Medium | Warning logic in existing endpoint + frontend modal |
| ARCH-INV-08 | High | Reservation endpoints + transactional logic + frontend integration |
| ARCH-INV-09 | Medium | Fulfillment action + SOLD movement + post-warning |
| ARCH-INV-10 | Medium | Movements log view + deprecation + optional backfill |

---

## 21. Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Schema migration fails mid-run on production | High | Use `IF NOT EXISTS` throughout; transactions where possible; backup before every run; staging-first policy |
| Phase 3 creates physical_inventory rows with wrong artwork_id | Medium | FK constraint enforced; admin UI uses artwork picker; cannot create orphan rows |
| ISYNC-18 artworks are accidentally published during Phase 3–4 | Medium | artworks.status and show_on_website are untouched by Phase 3–4; validation checks confirm count = 38 after each deployment |
| Phase 5 warning fires on every re-save of existing 38 artworks | Medium | Use Decision D7 (B): warning fires only on transitions to orderable, not re-saves; transition-period override handles setup |
| Phase 6 reservation: two admins race to reserve the same unit | Low | Database-level atomic update with status check prevents double-reservation; 409 returned to second attempt |
| Phase 7 fulfillment: SOLD is recorded but artwork remains publicly orderable | Low | Phase 7 returns warning after fulfillment; owner manually updates artwork status; Rule D7 prevents auto-hide |
| Phase 8 backfill: historical movements written with wrong dates | Low | Backfill is optional and uses explicit notes field ("Backfilled — approximate date"); does not affect system behavior |
| Phases deferred too long: ISYNC-18-07 blocked | Medium | ISYNC-18-07 requires Phase 4 (AVAILABLE state). If Phase 4 is delayed, ISYNC-18-07 must wait. Owner should prioritize ARCH-INV-05 and ARCH-INV-06 to unblock ISYNC-18-07. |
| Owner decisions not answered before Phase 1: rework required | Medium | Phase 0 gate: all required decisions (D1–D3) must be answered before ARCH-INV-03 starts |
| artworks.quantity removal attempted before Phase 8 deprecation | Low | This document explicitly defers removal; Phase 8 only deprecates the UI exposure |

---

## 22. What Remains Unchanged Until Implementation

Until each phase is explicitly deployed and validated, the following remain exactly as in production today:

| Item | Current state |
|---|---|
| `artworks` table schema | Unchanged |
| `artwork_sizes` table schema | Unchanged (`price NOT NULL` relaxation deferred to INV-PRICE-01) |
| `order_requests` / `order_request_items` schema | Unchanged (except `physical_inventory_id` column added in Phase 1, null on all rows) |
| Public visibility rule | `status IN ('IN_STOCK','MADE_TO_ORDER') AND show_on_website=true` |
| `POST /api/order-requests` | Inquiry-only; no inventory interaction |
| `PATCH /api/admin/order-requests/:id/status` | No inventory interaction |
| SKU generation | `maybeGenerateSku()` unchanged |
| 38 public artworks | Public count = 38 |
| 4 ISYNC-18 artworks | NEEDS_REVIEW + hidden + sku=null |
| artworks.quantity | Informational only; not removed |
| Admin auth / JWT | Unchanged |
| Maintenance mode | Unchanged |
| Pricing settings (fx_rate=92.4, usd_multiplier=2.25) | Unchanged |
| Email notification (ORD-04) | Unchanged |

---

## 23. Recommended Next Subtask

**ARCH-INV-02F — Final Architecture Recommendation and Implementation Ticket Breakdown**

ARCH-INV-02F should:
1. Consolidate ARCH-INV-02B through 02E into a single authoritative decision summary
2. Confirm all owner decisions (Section 19 of this document) are answered
3. Formally close the ARCH-INV-02 planning package
4. Produce a one-page architecture decision record suitable for future reference (listing: what was decided, what was rejected, and why)
5. Confirm the priority order for ARCH-INV-03 through ARCH-INV-10
6. Confirm that the shared planning branch is ready to be merged to main as a documentation package
7. Produce the list of Jira tickets to be created, with descriptions

ARCH-INV-02F must not be started until this document (ARCH-INV-02E) is reviewed and accepted.

---

## 24. Safety Confirmation

| Item | Status |
|---|---|
| Code changes | None |
| SQL migrations | None |
| Production data changes | None |
| Inventory Apply run | No |
| Inventory Preview run | No |
| Production import run | No |
| Artworks published | No |
| SKUs generated | No |
| ISYNC-18 artworks modified | No |
| order_requests modified | No |
| artworks.status new values added | No |
| artwork_sizes.price NOT NULL relaxed | No |
| artworks.quantity removed | No |
| server/.env committed | No |
| Secrets, private workbooks, ZIPs, temp scripts committed | No |
| ORD-01/02/04 behavior changed | No |
| ARCH-INV-02F started | No |
| WEB-CAT-02 started | No |
| ISYNC-18-07 started | No |
| ISYNC-19 started | No |
| INV-PRICE-01 started | No |
| Planning branch merged to main | No — waiting for owner review of full 02B–02F package |
| Planning branch pushed to origin | No — on hold until owner explicitly requests |
