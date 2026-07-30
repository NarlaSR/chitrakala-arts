# ARCH-INV-02D — Order Request to Inventory Reservation/Decrement Rules

**Ticket:** ARCH-INV-02D — Define Order Request to Inventory Reservation/Decrement Rules  
**Branch:** `feature/ARCH-INV-02-planning`  
**Date:** 2026-07-29  
**Type:** Design/planning document — no code changes, no schema changes, no production data changes  
**Depends on:** ARCH-INV-02B (data model), ARCH-INV-02C (shipment/receiving lifecycle)  
**Reference docs:** ARCH-INV-02A, ARCH-INV-02B, ARCH-INV-02C, ORD-01, ORD-02, ORD-04

---

## 1. Purpose

This document defines how customer order requests should relate to physical inventory in the future. It answers:

1. What happens when a customer submits an order request — now and in the future.
2. Whether and when a request should reserve physical inventory.
3. When physical inventory should be decremented (SOLD).
4. How each order request status (NEW, REVIEWING, QUOTE_SENT, CONFIRMED, CANCELLED, FULFILLED) should interact with `physical_inventory`.
5. Rules for unique one-of-one artworks, MADE_TO_ORDER artworks, and multi-quantity items.
6. What inventory movement records are needed.
7. What admin UI actions support this workflow.
8. What remains unchanged for now.

This is a design document only. No code, migrations, application changes, or production data changes are made here.

---

## 2. Scope and Non-Scope

### In scope

- Future reservation and decrement rules for order requests and physical inventory
- Request status to inventory effect matrix
- One-of-one, MADE_TO_ORDER, and multi-quantity artwork rules
- Inventory movement / audit trail event types
- Admin UI actions for order + inventory
- Public site behavior
- Safety and data integrity rules
- What remains unchanged now

### Not in scope

- Payment processing, checkout, or cart — not part of this system
- Schema migration SQL — see ARCH-INV-02E
- Application code changes — see implementation tickets
- WEB-CAT-02, ISYNC-18-07, ISYNC-19, INV-PRICE-01 — separate tickets
- The inventory Apply/import pipeline — separate concern
- Shipping or fulfillment logistics to the customer — out of scope

---

## 3. Current Order Request Behavior

This section documents the current production behavior as implemented in ORD-01, ORD-02, and ORD-04. This is the authoritative baseline.

### Order request submission (POST /api/order-requests)

1. Maintenance mode check (returns 503 if enabled)
2. Rate limit check (5 requests/hour/IP in production)
3. Input validation: `name`, `email`, `phone`, `message`, `items` array
4. Per-item public validation — each artwork must pass the two-gate rule: `status IN ('IN_STOCK','MADE_TO_ORDER') AND show_on_website = true`
5. If any item fails validation, the entire request is rejected with HTTP 400
6. Snapshot captured for each item: `sku`, `title`, `category`, `size_label`, `price_inr`, `price_usd`, `image`, `availability`
7. Order request row written to `order_requests` (status = NEW)
8. Order request item rows written to `order_request_items`
9. Notification email sent to owner via Resend (best-effort; failure does not affect the 201 response)
10. HTTP 201 returned to customer

### What the submission does NOT do

- Does **not** write to `artworks`, `artwork_sizes`, or any other table
- Does **not** change `artworks.status`, `artworks.show_on_website`, or `artworks.sku`
- Does **not** reserve or decrement any inventory
- Does **not** generate a SKU
- Does **not** affect public visibility of any artwork
- Does **not** create a `physical_inventory` row or touch any physical inventory state

### Order request schema (from ORD-01)

**order_requests:**
```
id (SERIAL PK), customer_name, customer_email, customer_phone, customer_message,
status (NEW | REVIEWING | QUOTE_SENT | CONFIRMED | CANCELLED | FULFILLED),
created_at, updated_at
```

**order_request_items:**
```
id, order_request_id (FK → order_requests), artwork_id (FK → artworks, SET NULL),
artwork_size_id (FK → artwork_sizes, SET NULL), quantity,
snapshot_sku, snapshot_title, snapshot_category, snapshot_size_label,
snapshot_price_inr, snapshot_price_usd, snapshot_image, snapshot_availability,
created_at
```

### Admin capabilities (current)

- `GET /api/admin/order-requests` — list all requests with item count
- `GET /api/admin/order-requests/:id` — request detail with items
- `PATCH /api/admin/order-requests/:id/status` — update status
- No delete endpoint; cleanup requires direct psql

### Admin email notification (ORD-04)

Owner receives an email for each new request. Email includes: customer name, email, phone, message, and each requested artwork title, size, price, and image. The email was hardened in ORD-04 to handle missing/null fields.

---

## 4. Relationship to ARCH-INV-02B and ARCH-INV-02C

**From ARCH-INV-02B:**
- `physical_inventory` tracks actual physical units per artwork/size
- `physical_inventory.status` lifecycle: PENDING_SHIPMENT → IN_TRANSIT → RECEIVED → INSPECTION_REQUIRED → INSPECTED → AVAILABLE → RESERVED → SOLD
- `inventory_movements` is an append-only audit log (deferred from 02B/02C)
- `order_request_items` does NOT currently reference `physical_inventory`

**From ARCH-INV-02C:**
- `physical_inventory.status = AVAILABLE` means item received, inspected, and physically available internally
- `artworks.status = IN_STOCK + show_on_website = true` means owner has approved public visibility
- Physical availability precedes public publishing — publishing never auto-sets AVAILABLE
- Order requests are explicitly ruled as inquiry-only (Rule V6 in ARCH-INV-02C): do not interact with physical_inventory until ARCH-INV-02D defines the reservation model

**What this document adds:**
- The rules for when `physical_inventory.status` changes from `AVAILABLE` → `RESERVED` → `SOLD`
- How order request status transitions trigger (or do not trigger) those physical_inventory changes
- The data link from `order_request_items` to `physical_inventory`
- The `inventory_movements` event types for the order lifecycle

---

## 5. Design Principles

1. **Order requests are inquiry records, not purchase commitments.** A customer submitting a request is expressing interest and initiating a conversation, not completing a purchase. This is fundamental to Chitrakala Arts' business model and must not change without deliberate business decision.

2. **No automatic reservation on submission.** Speculative inquiries — from multiple customers, from test submissions, from incomplete requests — must not lock physical inventory. Only a deliberate admin action can reserve a unit.

3. **Admin controls the reservation gate.** The admin reviews the request, communicates with the customer, and makes a business decision to confirm. Reservation follows admin confirmation, not customer submission.

4. **Decrement happens at fulfillment, not at confirmation.** Confirming an order reserves the unit (signals intent). Marking it FULFILLED consumes the unit (final disposition). These are separate events.

5. **Physical inventory state changes require explicit admin action.** Nothing in the order request flow automatically moves `physical_inventory.status`. Every state change is an intentional admin decision.

6. **Multiple simultaneous requests for the same artwork are valid.** Two customers may inquire about the same one-of-one artwork. Both inquiries are accepted and visible to the admin. The admin decides which to confirm based on business judgment (first-to-respond, conversation, etc.).

7. **MADE_TO_ORDER artworks have no physical unit to reserve.** They are produced on commission. Confirmation of a MADE_TO_ORDER request is a production commitment, not a physical unit allocation.

8. **Simplicity over automation.** The Chitrakala Arts order volume is low. Manual admin decisions are appropriate and provide the owner with full control. Automated reservation rules should only be introduced when order volume justifies the complexity.

---

## 6. Reservation Options Considered

### Option A — No reservation at any point

Order requests remain inquiry records throughout their lifecycle. `physical_inventory` is never updated by order request state changes. The admin updates physical_inventory separately when an item is fulfilled.

**Advantages:** Simplest; no coupling between order requests and inventory; current behavior.  
**Disadvantages:** No formal link between a fulfilled order and the physical unit that was shipped. Admin must manually track which unit was sent for which order.  
**Assessment:** Acceptable for very low order volume. Loses auditability when order volume grows.

### Option B — Soft reservation on submission (NEW status)

When `POST /api/order-requests` succeeds, find a matching `physical_inventory` unit at AVAILABLE and mark it RESERVED.

**Advantages:** Prevents double-booking from the moment of inquiry.  
**Disadvantages:** Speculative, unverified customer submissions lock out other genuine buyers. A test submission or an inquiry that never converts locks inventory until admin intervenes. Creates operational burden for the admin to release stale reservations.  
**Assessment:** Not appropriate for this business model.

### Option C — Soft reservation on REVIEWING or QUOTE_SENT

When admin moves a request to REVIEWING or QUOTE_SENT, optionally trigger a soft reservation.

**Advantages:** More deliberate than Option B; admin has reviewed the request before reserving.  
**Disadvantages:** REVIEWING and QUOTE_SENT are still pre-commitment states. The customer has not agreed to anything. Reserving here still risks locking inventory against a customer who ultimately declines.  
**Assessment:** Better than Option B but still early. The quote conversation may take days. The owner may send quotes to multiple interested customers.

### Option D — Reservation only at CONFIRMED (explicit admin action)

When admin moves a request to CONFIRMED, a reservation action becomes available. The admin explicitly associates a `physical_inventory` unit with the confirmed order. This is an explicit admin action, not an automatic side effect of the status change.

**Advantages:** Reservation only after the customer has committed. Full admin control. No speculative locking. Clear audit trail.  
**Disadvantages:** Requires admin to perform two actions to confirm (status update + reservation). Slight operational overhead.  
**Assessment:** Correct for this business. The overhead is one extra click per confirmed order — a very low price for the clarity gained.

---

## 7. Recommended Reservation Rule

**Recommendation: Option D — reservation only at CONFIRMED, as an explicit admin action.**

### Full reservation rule

```
When:  order_requests.status moves to CONFIRMED
Then:  Admin may (but is not required to) associate a physical_inventory unit with the order

How:   Admin selects a physical_inventory unit (status = AVAILABLE) for the artwork
       physical_inventory.status: AVAILABLE → RESERVED
       order_request_items.physical_inventory_id: null → [selected unit id]
       inventory_movements row written: movement_type = RESERVED

Not automatic: status change to CONFIRMED alone does not trigger the reservation.
               Admin must perform a separate "Reserve" action.
```

### Why the reservation is optional at CONFIRMED

Some scenarios where admin confirms without reserving:
- MADE_TO_ORDER artwork: no physical unit to reserve; admin is committing to produce it
- Artwork with no physical_inventory rows (tables newly live): admin cannot reserve a row that doesn't exist
- Admin is aware of a replacement unit being shipped: confirms the order pending the incoming shipment

The reservation action should be surfaced prominently in the admin UI when a confirmed order has an AVAILABLE unit, but it must not be mandatory.

### Reservation scope per artwork in the order

An order request may contain multiple artwork items. Reservation is per item, not per order. The admin reserves a physical unit for each confirmed artwork independently.

### Handling multiple simultaneous requests for the same AVAILABLE unit

If two requests are both in CONFIRMED state and the same physical_inventory unit is AVAILABLE, the admin reserves it for one and handles the other with a separate conversation (waitlist, equivalent unit from next shipment, or polite decline).

The system must not allow the same physical_inventory unit to be reserved for two different order requests simultaneously. `physical_inventory.status = RESERVED` removes it from the AVAILABLE pool.

---

## 8. Recommended Inventory Decrement Rule

"Decrement" here means marking a physical unit as permanently consumed — `SOLD`. This is the final disposition of a unit that was requested, reserved, and fulfilled.

### Full decrement rule

```
When:  order_requests.status moves to FULFILLED
Then:  Admin marks the linked physical_inventory unit as SOLD

How:   Admin uses "Mark Fulfilled" action on the order
       physical_inventory.status: RESERVED → SOLD
       inventory_movements row written: movement_type = SOLD

Not automatic: status change to FULFILLED alone does not change physical_inventory.
               Admin must confirm the fulfillment action.
```

### Why decrement is not automatic on FULFILLED status

The FULFILLED status change is already a deliberate admin action. Having it auto-decrement physical_inventory makes two things happen from a single click. This is acceptable in principle, but during the initial implementation phase when physical_inventory tables are new and physical_inventory rows may not always be present, automatic decrement would fail silently. Making the decrement an explicit additional admin step — "Mark as Shipped" with a confirmation — ensures the admin consciously records the physical event.

Future implementation note: once physical_inventory is well-established and all active artworks have inventory records, the FULFILLED action and the SOLD decrement can be combined into a single confirmation flow.

### Decrement for MADE_TO_ORDER artworks

For MADE_TO_ORDER artworks, the admin creates a physical_inventory row when production is complete (or when the finished piece arrives at the destination). That row can then be linked to the order and marked SOLD at fulfillment time.

### Phased decrement rule (implementation phases)

**Phase 1 (initial implementation, ARCH-INV-02E):**
- Order request submission: no inventory interaction (current behavior unchanged)
- CONFIRMED: admin manually associates a physical_inventory unit via UI
- FULFILLED: admin manually marks physical_inventory SOLD via UI
- Both are explicit UI actions; neither is automatic

**Phase 2 (future, after Phase 1 is stable):**
- CONFIRMED status change can optionally prompt: "Do you want to reserve a physical unit now?"
- FULFILLED status change can optionally prompt: "Mark physical unit as SOLD?"
- Still admin-confirmed, but surfaced as a natural part of the status update flow

---

## 9. Request Status to Inventory Effect Matrix

| Request status | Transition from | physical_inventory effect | artworks effect | Notes |
|---|---|---|---|---|
| NEW | (submission) | None | None | Inquiry recorded; no reservation |
| REVIEWING | NEW | None | None | Admin is reviewing; no reservation |
| QUOTE_SENT | REVIEWING | None | None | Quote sent to customer; no reservation |
| CONFIRMED | QUOTE_SENT or REVIEWING | Optional: admin may reserve a unit (AVAILABLE → RESERVED) | None | Admin explicitly reserves; not automatic on status change |
| CANCELLED | NEW, REVIEWING, or QUOTE_SENT | None | None | No unit was reserved; nothing to release |
| CANCELLED | CONFIRMED (with reservation) | Release: RESERVED → AVAILABLE | None | Admin releases the reservation; inventory returns to AVAILABLE |
| CANCELLED | CONFIRMED (no reservation) | None | None | Nothing reserved; nothing to release |
| FULFILLED | CONFIRMED | Admin marks RESERVED → SOLD | None | Admin confirms physical shipment to customer |
| FULFILLED | CONFIRMED (no reservation) | Admin may mark AVAILABLE → SOLD directly | None | Allowed but less preferred; better to reserve first |

### Key invariants

- An order request changing status never automatically changes `artworks.status`, `show_on_website`, or `sku`
- An order request changing status never automatically changes `physical_inventory.status`
- All physical_inventory state changes are explicit admin actions, not automatic side effects
- Cancellation of a CONFIRMED order with a reservation always releases the inventory back to AVAILABLE

---

## 10. One-of-One Artwork Handling

A one-of-one artwork is an IN_STOCK artwork where only one physical unit exists (`physical_inventory` has exactly one row with `quantity = 1` in AVAILABLE state).

### Submission behavior

Multiple customers may submit requests for the same one-of-one artwork. All requests are accepted. No request is automatically rejected because another request exists. The admin sees all requests in the admin panel and processes them based on business judgment.

**Example:** Three customers each submit a request for the same 18" Round Warli Art painting. All three requests are created with status=NEW. The admin reviews all three, communicates with each customer, and ultimately confirms one. The other two are eventually cancelled.

### Confirmation behavior

When the admin confirms one request:
- Admin performs the "Reserve" action: physical_inventory.status → RESERVED
- The other two requests remain in their current state (REVIEWING or QUOTE_SENT)
- When the admin cancels the other two requests, physical_inventory is not affected (it was never reserved for them)

### Validation

Before the admin can reserve the physical unit:
- `physical_inventory.status` must be AVAILABLE
- The unit must not already be reserved for another order request

If the admin attempts to reserve a unit that is already RESERVED:
- Admin panel shows: "This unit is already reserved for Order Request #[N]. Release that reservation first, or contact the customer."

### After fulfillment

Once the order is FULFILLED and physical_inventory is SOLD:
- The artwork's `artworks.status` does not automatically change to `OUT_OF_STOCK` or `SOLD`
- The admin must update `artworks.status` and `show_on_website` separately
- Rule: after physical_inventory reaches SOLD, the admin panel should show a warning: "This artwork has no remaining AVAILABLE physical inventory. Consider updating its status or removing it from the public site."

The deliberate separation prevents automated status changes from making artworks disappear from the public catalog without the owner's knowledge.

---

## 11. Made-to-Order Artwork Handling

A MADE_TO_ORDER artwork is produced on commission. No physical unit exists until the owner produces or sources it after receiving a confirmed order.

### Submission behavior

MADE_TO_ORDER artworks pass the two-gate public visibility rule (`status = MADE_TO_ORDER AND show_on_website = true`). Customers may submit requests for them at any time. Multiple simultaneous requests for the same MADE_TO_ORDER artwork are accepted — the owner may be able to produce multiple units.

### Reservation behavior

Because no physical unit exists at request time, there is nothing to reserve. When the admin CONFIRMS a MADE_TO_ORDER order:
- No physical_inventory reservation occurs
- The admin communicates with the customer about production timeline
- The admin creates a physical_inventory row when production is complete or the item is ready to ship

### Physical inventory creation for MADE_TO_ORDER

When production of a commissioned MADE_TO_ORDER piece is complete:
1. Admin creates a `physical_inventory` row for the artwork: status = INSPECTED (or AVAILABLE)
2. Admin links this row to the confirmed order request (`order_request_items.physical_inventory_id`)
3. Admin marks the order FULFILLED
4. Physical inventory status: AVAILABLE → SOLD

Alternatively, if the item is shipped before the admin can record it:
1. Admin marks order FULFILLED
2. Admin creates physical_inventory row retroactively at SOLD status with notes referencing the order

### Validation

For MADE_TO_ORDER artworks, Rule V1 from ARCH-INV-02C (warning when publishing with no AVAILABLE physical inventory) should show: "This is a made-to-order item — no physical inventory on file. This is expected. Confirm to proceed." The admin is not blocked from keeping a MADE_TO_ORDER artwork public even if it has no physical inventory rows.

---

## 12. Multiple Quantity Handling

The current Chitrakala Arts production database has `artworks.quantity` informational only and most artworks are unique handmade pieces. Multiple-quantity cases arise when:
- A batch of similar items exists (e.g., a set of 4 coaster sets, each sold individually)
- A reproducible design is manufactured in multiples

### Request handling for multiple quantity

A customer may request `quantity = N` for a single artwork. This is valid per the ORD-01 schema (`quantity` is 1–999). The `snapshot_availability` captures the artwork's current status but does not capture available stock count.

**Current behavior:** No stock check occurs at request time. A customer may request quantity=10 even if only 1 physical unit exists.

**Recommended future behavior:**
- At request time: accept the request as-is (inquiry semantics — no auto-decrement)
- At CONFIRMED: admin checks `physical_inventory` for available units matching the requested quantity
- If insufficient stock: admin communicates with customer about adjusted quantity or wait time
- Admin reserves as many units as are available and the customer has agreed to

### physical_inventory with quantity > 1

The `physical_inventory.quantity` field (from ARCH-INV-02B) tracks how many units of an artwork/size combo are in a given batch. When reserving quantity=N from a batch row, the implementation must handle partial reservation:

**Option A (simple):** Treat each physical_inventory row as atomic. If quantity=4 is in one row and the order requests 2, reserve 2 by splitting the row into `quantity=2 RESERVED` and `quantity=2 AVAILABLE` — or by decrementing `quantity` on the RESERVED row.  
**Option B (simpler for MVP):** Only support quantity=1 per physical_inventory row in the initial implementation. Multiple units of the same artwork are tracked as multiple rows. Avoids row-splitting complexity.

**Recommendation:** Option B for the initial implementation (ARCH-INV-02E). Multiple identical units are multiple `physical_inventory` rows, each with quantity=1. Row-splitting can be added in a follow-up ticket if the business ever needs batch-quantity tracking.

---

## 13. Inventory Movement / Audit Trail Rules

The `inventory_movements` table (defined in ARCH-INV-02B, deferred from ARCH-INV-02C) should be implemented as part of the order + inventory integration in ARCH-INV-02E.

### Movement types related to order requests

| movement_type | When written | quantity_change | reference_type | reference_id |
|---|---|---|---|---|
| `REQUEST_CREATED` | When order request submission succeeds | 0 | order_request | order_request.id |
| `RESERVED` | When admin reserves a physical unit for a confirmed order | 0 (status change only) | order_request | order_request.id |
| `RESERVATION_RELEASED` | When a CONFIRMED order with reservation is cancelled | 0 (status change only) | order_request | order_request.id |
| `SOLD` | When order is FULFILLED and unit is marked sold | -1 (final consumption) | order_request | order_request.id |
| `RETURNED` | When a fulfilled order is returned | +1 (unit returns to stock) | order_request | order_request.id |

### Movement types already defined in ARCH-INV-02B (unchanged)

| movement_type | When written |
|---|---|
| `CREATED` | physical_inventory row first created |
| `SHIPPED` | shipment dispatched from India |
| `RECEIVED` | physically arrived at destination |
| `INSPECTED` | owner-inspected and confirmed |
| `PUBLISHED` | artwork set to IN_STOCK + show_on_website=true |
| `ADJUSTED` | manual quantity/status correction |
| `DAMAGED` | damage recorded |
| `ARCHIVED` | retired from tracking |

### Full movement_types enumeration

The complete set for the schema CHECK constraint:

```sql
CHECK (movement_type IN (
  'CREATED',
  'SHIPPED',
  'RECEIVED',
  'INSPECTED',
  'PUBLISHED',
  'REQUEST_CREATED',
  'RESERVED',
  'RESERVATION_RELEASED',
  'SOLD',
  'RETURNED',
  'ADJUSTED',
  'DAMAGED',
  'ARCHIVED'
))
```

### What REQUEST_CREATED records

`REQUEST_CREATED` is written to `inventory_movements` with `physical_inventory_id = null` (no unit has been reserved yet). It links the order request to the inventory audit log purely for audit purposes — so the admin can see "this artwork had 3 requests submitted before it was finally sold."

This movement type is informational only. It does not change `physical_inventory.status`.

### Should inventory_movements be implemented in ARCH-INV-02E?

Yes. The RESERVED → SOLD lifecycle of physical units directly triggered by confirmed order requests is the primary use case for `inventory_movements`. Implementing inventory_movements at the same time as the reservation feature avoids building the reservation logic without an audit trail.

---

## 14. Admin Workflow

This section defines the future admin actions for the order request + inventory workflow. These are requirements for ARCH-INV-02E, not design specifications.

### On order request detail page (future enhancements)

**New information displayed:**

| Section | Content |
|---|---|
| Physical inventory status per item | For each requested artwork: current physical_inventory status (AVAILABLE, RESERVED, SOLD, PENDING_SHIPMENT, etc.), or "No inventory on file" |
| Inventory link | Link from each order item to the physical_inventory record (if one is linked) |
| Reservation history | inventory_movements log for each item in the order |

**New action buttons (contextual — shown only when applicable):**

| Action | Visible when | Effect |
|---|---|---|
| Reserve physical unit | Order is CONFIRMED; artwork has AVAILABLE physical_inventory | Opens a picker to select the specific unit; sets RESERVED; links to order item; writes RESERVED movement |
| Release reservation | Order is CONFIRMED; unit is RESERVED for this order | Sets physical_inventory back to AVAILABLE; clears physical_inventory_id on order item; writes RESERVATION_RELEASED movement |
| Mark fulfilled | Order is CONFIRMED; unit is RESERVED (or AVAILABLE if no prior reservation) | Prompts confirmation; sets physical_inventory to SOLD; sets order status to FULFILLED; writes SOLD movement |
| Cancel order | Any status except FULFILLED | If unit is RESERVED, releases it first; sets order status to CANCELLED; writes RESERVATION_RELEASED movement if applicable |

### On artwork detail/edit page (future enhancements)

**New information displayed:**
- Physical inventory for this artwork: list of all physical_inventory rows (status, received_date, linked order request if RESERVED)
- Warning if artwork is IN_STOCK + public but no AVAILABLE physical_inventory exists

**New action:**
- "View linked order requests" — list of order requests that reference this artwork (any status)

### On artwork list / Review Queue (future enhancements)

- Badge per artwork showing physical inventory summary: "AVAILABLE (1)", "RESERVED (1)", "No inventory"
- Filter: artworks with AVAILABLE inventory; artworks with RESERVED inventory

---

## 15. Public Site Behavior

### Current behavior (unchanged for now)

- Customers browse public artwork catalog (`GET /api/artworks`)
- Artwork must be `IN_STOCK` or `MADE_TO_ORDER` and `show_on_website=true` to appear
- Customer adds artwork to cart (`RequestCartContext.addToRequest`)
- Customer submits inquiry via `POST /api/order-requests`
- At submission time, each artwork is validated against the public visibility rule
- If artwork passes validation: snapshot captured, order created, owner notified
- If artwork fails validation (not public, not orderable): request rejected with 400

### Future behavior (no change to public site at this time)

The public site behavior does not change as a result of ARCH-INV-02D. Customers continue to submit inquiries as before. The physical inventory reservation and decrement workflow is entirely admin-side.

**Specifically:**
- Customers do not see physical inventory status
- Customers do not see how many units are available
- Customers do not see if their requested artwork has already been reserved for another inquiry
- No "sold out" status is automatically shown even if physical_inventory.status = SOLD or = RESERVED

**Future consideration (not in this design phase):** Once physical inventory tracking is operational and reliable, the public site could display "Only 1 left!" or automatically hide artworks with no AVAILABLE inventory. This is a future UX enhancement and requires deliberate owner approval before implementation.

### What happens if a customer submits a request for an artwork with RESERVED inventory?

Currently: Nothing special. The artwork is still IN_STOCK + show_on_website=true. The submission succeeds. The admin sees two requests for the same artwork.

Future: Same behavior. The public site does not know about reservation status. The admin manages the conflict.

An automatically-rejected submission is not appropriate here — a RESERVED unit might be released if the first customer cancels, and the second customer's inquiry would have been valid. The admin needs to make this judgment, not the system.

---

## 16. Safety and Data Integrity Rules

### Rule D1 — No automatic reservation on order submission

`POST /api/order-requests` must not create, update, or read `physical_inventory` rows. This is unchanged from current behavior and must remain unchanged until an implementation ticket explicitly changes it with owner approval.

### Rule D2 — No automatic reservation on status transition

PATCH `/api/admin/order-requests/:id/status` must not automatically update `physical_inventory`. Status transitions are pure state changes on the order request. Physical inventory effects require a separate, explicit admin action.

### Rule D3 — A physical unit can only be reserved for one order at a time

When the admin reserves a physical_inventory unit for an order, the system must confirm the unit's status is AVAILABLE before marking it RESERVED. If another admin has concurrently reserved the same unit, the second reservation attempt must fail with a clear error: "This unit has already been reserved."

Database enforcement: a unique constraint or optimistic locking on physical_inventory.status transitions prevents concurrent double-reservation.

### Rule D4 — Cancelling a CONFIRMED order with a reservation must release the reservation

When `order_requests.status` is set to CANCELLED and `order_request_items.physical_inventory_id` is not null, the system must:
1. Set `physical_inventory.status` back to AVAILABLE
2. Clear `order_request_items.physical_inventory_id`
3. Write a RESERVATION_RELEASED inventory_movements record

This must happen in a single transaction. If either step fails, both are rolled back.

### Rule D5 — No inventory decrement without prior CONFIRMED status

An order request must be in CONFIRMED status before its physical inventory can be marked SOLD. The admin panel must not surface a "Mark Fulfilled / SOLD" action on any order with status other than CONFIRMED.

### Rule D6 — order_request_items snapshot fields are immutable

`snapshot_*` fields on `order_request_items` are captured at submission time and must never be updated. They represent the state of the artwork at the moment the customer placed their request. If artwork data changes after submission (price updated, description edited), the snapshot must not change.

### Rule D7 — No automatic artworks.status change from order lifecycle

No order request state change automatically changes `artworks.status`, `show_on_website`, or `sku`. After an artwork is SOLD:
- The admin manually decides whether to set `artworks.status = OUT_OF_STOCK` or `SOLD`
- The admin manually decides whether to set `show_on_website = false`
- The system may show a warning, but must not act automatically

### Rule D8 — physical_inventory_id on order_request_items must reference an AVAILABLE or RESERVED unit

When the admin sets `order_request_items.physical_inventory_id`, the referenced physical_inventory row must be either AVAILABLE (being reserved) or RESERVED (already reserved, checking the link). It must belong to the same `artwork_id` as the `order_request_items` row.

### Rule D9 — MADE_TO_ORDER orders do not require a physical_inventory reservation

MADE_TO_ORDER artworks may have no physical unit. The admin should not be blocked from confirming a MADE_TO_ORDER order by the absence of an AVAILABLE physical_inventory unit. The admin does not need to link a physical_inventory_id for MADE_TO_ORDER items until production is complete.

### Rule D10 — inventory_movements are append-only

`inventory_movements` rows are never updated or deleted. Corrections use the `ADJUSTED` movement type with an explanatory note.

---

## 17. What Remains Unchanged for Now

The following items are explicitly out of scope and remain as-is until separately approved:

| Item | Current behavior | Change? |
|---|---|---|
| `POST /api/order-requests` | No inventory interaction | Unchanged |
| `PATCH /api/admin/order-requests/:id/status` | No inventory interaction | Unchanged |
| `order_requests` table schema | As defined in ORD-01 | No change |
| `order_request_items` table schema | As defined in ORD-01; no physical_inventory_id column yet | physical_inventory_id to be added in ARCH-INV-02E |
| `inventory_movements` table | Not yet created (deferred from ARCH-INV-02B/C) | To be created in ARCH-INV-02E |
| `physical_inventory` table | Not yet created (defined in ARCH-INV-02B) | To be created in ARCH-INV-02E |
| Admin panel order request UI | Shows request list, detail, status update | No new inventory actions until ARCH-INV-02E is implemented |
| Public site cart and submission flow | No change | Unchanged |
| Owner email notification (ORD-04) | Best-effort per-request email | Unchanged |
| artworks.status | No automatic changes from order lifecycle | Unchanged |
| show_on_website | No automatic changes from order lifecycle | Unchanged |
| SKU generation | No changes | Unchanged |
| Two-gate public visibility rule | Unchanged | Unchanged |
| ISYNC-18 artworks | NEEDS_REVIEW + hidden | Unchanged |

---

## 18. Open Questions

**OQ-1 — Should the "Reserve" action be surfaced on the status PATCH endpoint or as a separate endpoint?**  
Option A: Extend `PATCH /api/admin/order-requests/:id/status` to optionally accept a `physical_inventory_id` when status = CONFIRMED.  
Option B: Separate endpoint: `POST /api/admin/order-requests/:id/reserve` with `{ physical_inventory_id }`.  
**Recommendation:** Option B — a separate endpoint keeps the status update and the inventory reservation as distinct, explicit operations. This also allows the admin to reserve inventory independently of when the status was set to CONFIRMED.

**OQ-2 — Should the admin be required to link a physical_inventory_id before marking FULFILLED?**  
If physical_inventory is available, should FULFILLED be blocked until a physical unit is linked?  
**Recommendation:** Warn but do not block. For MADE_TO_ORDER or transition-period artworks with no physical_inventory rows, blocking fulfillment is too strict. Show a warning: "No physical inventory linked to this order. Confirm fulfillment?" — but allow the admin to proceed.

**OQ-3 — How should RETURNED orders be handled?**  
If a customer returns an artwork after FULFILLED:
- physical_inventory.status: SOLD → RETURNED → AVAILABLE (if in good condition) or DAMAGED
- order_requests.status: would need a new RETURNED status, or handled via notes

**Recommendation:** Defer RETURNED status to a future ticket. For now, the admin handles returns by manually updating physical_inventory.status and notes. A new `RETURNED` value on order_requests.status requires a schema migration and is low priority given current order volume.

**OQ-4 — What happens to order requests when an artwork is deleted?**  
Current behavior: `order_request_items.artwork_id` is set to NULL (ON DELETE SET NULL). Snapshot fields preserve the display data.  
**Future behavior with physical_inventory:** `order_request_items.physical_inventory_id` would also need to be handled (set to NULL or CASCADE). Deleting an artwork with a RESERVED physical unit should first require releasing the reservation.  
**Recommendation:** Block artwork deletion if any physical_inventory row is RESERVED for an active order. Admin must cancel the order first.

**OQ-5 — Should CONFIRMED + reserved artwork be automatically hidden from the public site if it is the last available unit?**  
Once a physical unit is RESERVED, should the artwork's public visibility change?  
**Recommendation:** No automatic change. Public visibility is an owner decision. An artwork with a RESERVED unit may still be publicly orderable if the owner expects more stock to arrive. The admin panel warning (Rule D7 note) informs the owner; the decision is theirs.

**OQ-6 — How should the quantity field on order_request_items interact with physical_inventory reservations?**  
If a customer requests quantity=2 for an artwork, and only 1 physical unit is AVAILABLE, should the reservation:
- Reserve the 1 AVAILABLE unit and leave the order partially reserved?
- Block the reservation entirely until 2 units are available?
- Allow the admin to confirm a reduced quantity?

**Recommendation:** Allow partial reservation. Admin reserves what is available, communicates with customer about the remaining quantity, and confirms the final quantity via the quote/confirmation conversation. No system enforcement of quantity matching on reservation.

---

## 19. Recommended Next Subtask

**ARCH-INV-02E — Migration and Phased Implementation Plan**

ARCH-INV-02E should:
1. Define the SQL migration plan for creating `shipments`, `shipment_items`, `physical_inventory`, and `inventory_movements` tables
2. Define the order of migrations (dependencies: `shipments` before `shipment_items`; `physical_inventory` before `inventory_movements`)
3. Define the `physical_inventory_id` column addition to `order_request_items`
4. Define the phased rollout: which features go live first, which are deferred
5. Define rollback procedures for each migration
6. Define how production data is handled during the transition period (existing artworks, ISYNC-18 artworks with no physical_inventory rows)
7. Define which admin UI screens are part of Phase 1 vs. later phases
8. Define the testing plan for each new endpoint and UI action
9. Produce the full migration SQL (in review-only form — no production execution)
10. Address all ARCH-INV-02B/C/D open questions that have implementation implications

ARCH-INV-02E must not be started until ARCH-INV-02D is reviewed and accepted.

---

## 20. Safety Confirmation

| Item | Status |
|---|---|
| Code changes | None |
| SQL migrations | None |
| Schema changes | None |
| Production data changes | None |
| Inventory Apply run | No |
| Inventory Preview run | No |
| Production import run | No |
| Artworks published | No |
| SKUs generated | No |
| ISYNC-18 artworks modified | No |
| order_requests modified | No |
| artworks.status new values added | No |
| server/.env committed | No |
| Secrets, private workbooks, ZIPs, temp scripts committed | No |
| ORD-01 behavior changed | No |
| ORD-02 behavior changed | No |
| ORD-04 behavior changed | No |
| POST /api/order-requests modified | No |
| physical_inventory rows created or modified | No |
| ARCH-INV-02E started | No |
| WEB-CAT-02 started | No |
| ISYNC-18-07 started | No |
| ISYNC-19 started | No |
| INV-PRICE-01 started | No |
