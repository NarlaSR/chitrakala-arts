# ARCH-INV-02F — Final Architecture Recommendation and Implementation Ticket Breakdown

**Ticket:** ARCH-INV-02F — Final Architecture Recommendation and Implementation Ticket Breakdown  
**Branch:** `feature/ARCH-INV-02-planning`  
**Date:** 2026-07-29  
**Type:** Planning/documentation — consolidation of ARCH-INV-02A through 02E  
**Status:** Ready for owner review  
**Audience:** Owner + developer

---

## 1. Executive Summary

The Chitrakala Arts system currently tracks artworks as a single combined record that holds both catalog information (title, description, category, images, price, SKU) and rough stock intent (the `artworks.status` field and the integer `artworks.quantity` field). This works for a small catalog but does not allow the business to track when a painting has left India, when it arrives in the US, whether it has been inspected, how many physical copies are available, or which specific physical piece has been reserved for a customer order.

The ARCH-INV-02 planning package defines an architecture that:

1. **Keeps `artworks` as the authoritative catalog record.** No catalog fields change.
2. **Adds four new database tables** — `shipments`, `shipment_items`, `physical_inventory`, and `inventory_movements` — to track physical pieces separately from the catalog.
3. **Preserves all existing public-facing and admin-facing behavior** until each future implementation ticket is explicitly approved and deployed.
4. **Adds clear lifecycle stages** for the physical journey of each artwork from India to a customer, without conflating those stages with the public-facing status of the catalog entry.
5. **Protects the four ISYNC-18 imported artworks** which are currently hidden and pending physical shipment — they stay hidden until received, inspected, and owner-approved for publication.

The recommendation is that the ARCH-INV-02 planning package is complete and ready for owner review. Upon owner acceptance, implementation can proceed through separate, approved tickets (ARCH-INV-03 through ARCH-INV-10) one phase at a time, each preceded by owner approval.

---

## 2. Problem Being Solved

### 2.1 The current model does too much with one field

`artworks.status` currently has values: `IN_STOCK`, `MADE_TO_ORDER`, `NEEDS_REVIEW`, and `OUT_OF_STOCK`. This field drives:

- Whether an artwork is publicly visible (must be `IN_STOCK` or `MADE_TO_ORDER` + `show_on_website=true`)
- Whether a customer can request to order it
- Whether it appears in the public catalog

The system has no field to express that a physical piece has left India, is in transit, is stuck in customs, has arrived but not been inspected, or has been sold.

### 2.2 The current `artworks.quantity` field is insufficient

`artworks.quantity` is a simple integer that does not distinguish between:
- How many physical pieces are in India ready to ship
- How many are in transit to the US
- How many have arrived and been inspected
- How many are reserved for a customer order
- How many have been sold and delivered

### 2.3 The risk of overloading `artworks.status`

A natural but incorrect solution would be to add new status values like `TO_BE_SHIPPED` or `IN_TRANSIT` to `artworks.status`. This approach was considered and rejected (ARCH-INV-02B, Section 5) because:

- It conflates the physical journey of a painting with its public catalog status
- It would require hiding artworks that are already publicly listed
- It would prevent the owner from keeping an artwork listed as `IN_STOCK` (for website display) while one specific physical unit is in transit to a customer
- It makes the status field do two unrelated jobs, which creates confusion and bugs

### 2.4 The current order request system is inquiry-only

When a customer submits an order request, it is an inquiry — not a confirmed sale. No inventory is decremented, no artwork is reserved. The system does not know which specific physical painting a confirmed order will deliver. This is by design for the inquiry-based business model, but it means there is currently no way to track "artwork unit A-004 has been reserved for the customer in order request #12."

### 2.5 What this architecture solves

The four new tables allow the system to:

| Need | Solved by |
|---|---|
| Track when a batch of artworks is shipped from India | `shipments` table |
| Track which specific artworks are in each shipment | `shipment_items` table |
| Track the physical state of each painting on arrival | `physical_inventory` table |
| Link a reserved physical unit to a customer order | `order_request_items.physical_inventory_id` |
| Keep a tamper-proof history of what happened to each unit | `inventory_movements` table |

---

## 3. Final Recommended Architecture

### 3.1 Entity summary

| Entity | Role | Status |
|---|---|---|
| `artworks` | Master catalog record: title, description, category, images, price band, public status | Existing — no schema changes in this plan |
| `artwork_sizes` | Size/price options per artwork (small/medium/large) | Existing — no schema changes in this plan |
| `shipments` | A batch shipment of artworks from India to the US | New — added in Phase 1 |
| `shipment_items` | Line items within a shipment (one per artwork per shipment) | New — added in Phase 1 |
| `physical_inventory` | One row per physical piece of artwork, tracking its physical state | New — added in Phase 1 |
| `inventory_movements` | Append-only audit log of every status change to a physical_inventory row | New — added in Phase 1 |
| `order_requests` | Customer inquiry/order request (inquiry-only, no reservation at submission) | Existing — one new nullable FK column added in Phase 1 |
| `order_request_items` | Line items within an order request; gains `physical_inventory_id` in Phase 1 | Existing — one new nullable FK column added in Phase 1 |

### 3.2 Entity relationship overview

```
artworks
  ├── artwork_sizes (1:many — size/price options)
  ├── physical_inventory (1:many — physical pieces of this artwork)
  │     └── inventory_movements (1:many — audit trail per piece)
  └── shipment_items (via physical_inventory — links artwork to its shipment)

shipments
  └── shipment_items (1:many — artworks included in this shipment)
        └── physical_inventory (1:1 per item — the physical piece created at arrival)

order_requests
  └── order_request_items (1:many)
        └── physical_inventory (optional FK — set when admin reserves a unit)
```

### 3.3 Separation of concerns

| Concept | Where it lives | Meaning |
|---|---|---|
| Is this artwork in our catalog? | `artworks` (exists = yes) | Catalog presence |
| Is this artwork publicly orderable? | `artworks.status IN ('IN_STOCK','MADE_TO_ORDER') AND show_on_website=true` | Public visibility |
| Is a physical piece in transit? | `physical_inventory.status = 'IN_TRANSIT'` | Physical journey |
| Has a physical piece been received and inspected? | `physical_inventory.status = 'AVAILABLE'` | Physically ready internally |
| Has a specific piece been reserved for an order? | `physical_inventory.status = 'RESERVED'` | Linked to CONFIRMED order |
| Has a specific piece been delivered to a customer? | `physical_inventory.status = 'SOLD'` | Linked to FULFILLED order |

### 3.4 Two-gate public visibility rule — unchanged

The existing rule is preserved throughout all phases:

```
An artwork is publicly visible and orderable if and only if:
  artworks.status IN ('IN_STOCK', 'MADE_TO_ORDER')
  AND artworks.show_on_website = true
```

Physical inventory status has no automatic effect on this rule. The owner explicitly controls public visibility.

### 3.5 Key constraint: physical availability precedes publishing

Before an owner publishes an artwork as publicly orderable, the physical piece should be:
1. Received (IN_TRANSIT → RECEIVED)
2. Inspected (RECEIVED → INSPECTION_REQUIRED → INSPECTED)
3. Marked available internally (INSPECTED → AVAILABLE)

Only then should the owner publish (set `artworks.status = IN_STOCK` + `show_on_website = true`).

This is a soft constraint enforced via a warning prompt (Phase 5 / ARCH-INV-07), not a hard block. The owner can override it with explicit confirmation. This allows the transition period — existing artworks that were published before physical inventory tracking existed remain published without interruption.

---

## 4. Current Behavior to Preserve

The following behavior must remain exactly as-is until each corresponding future implementation ticket is explicitly approved and deployed. No migration, code deployment, or data change should alter these behaviors before then.

| Behavior | Preserved until |
|---|---|
| Public visibility rule: `status IN ('IN_STOCK','MADE_TO_ORDER') AND show_on_website=true` | Forever (rule does not change) |
| 38 public artworks remain publicly visible | Any future artwork status change requires explicit owner action |
| 4 ISYNC-18 artworks remain NEEDS_REVIEW + hidden + sku=null | ISYNC-18-07 (after Phase 4 + owner approval) |
| SKU generation: `maybeGenerateSku()` fires only when `(IN_STOCK or MADE_TO_ORDER) AND show_on_website=true AND sku IS NULL` | No change to this rule |
| All 42 artworks have `sku = null` | Owner explicitly approves SKU generation when ready |
| `POST /api/order-requests` is inquiry-only — no reservation, no inventory decrement | Until ARCH-INV-08 is approved and deployed |
| `PATCH /api/admin/order-requests/:id/status` does not touch inventory | Until ARCH-INV-08/09 are approved and deployed |
| `artworks.quantity` remains in the schema | Deprecated in UI in Phase 8; column removal is a separate future ticket |
| No auto-publishing from physical inventory status | Never (by design) |
| No automatic inventory decrement on order submission | Never (by design) |
| No bulk SKU backfill | Requires separate owner approval and a separate ticket |
| No automatic physical_inventory rows for existing 38 public artworks | Requires owner verification per artwork |
| Pricing settings: fx_rate=92.4, usd_multiplier=2.25 | Unchanged |
| Maintenance mode: false | Unchanged |
| Email notification on order request (ORD-04) | Unchanged |

---

## 5. Key Architecture Decisions

| # | Decision | Recommendation | Reason | Phase / Ticket |
|---|---|---|---|---|
| **A1** | Should shipment states be added to `artworks.status`? | No — keep `artworks.status` as a catalog/visibility field only | Adding TO_BE_SHIPPED or IN_TRANSIT to artworks.status conflates catalog state with physical journey; causes confusion about what published means | Foundational — applies to all phases |
| **A2** | Where should physical stock be tracked? | New `physical_inventory` table — separate from `artworks` | Enables tracking multiple units per artwork, per-unit lifecycle, reservation, and audit trail | Phase 1 / ARCH-INV-03 |
| **A3** | What does `physical_inventory.status = AVAILABLE` mean? | Physically received, inspected, and available internally — NOT published | Prevents confusion between physical availability and public visibility | Phase 1 foundational |
| **A4** | What does `artworks.status = IN_STOCK + show_on_website=true` mean? | Owner has approved public visibility and orderable status | Physical possession is a prerequisite, but the owner's explicit decision is the gate | Foundational — applies to all phases |
| **A5** | Should publishing an artwork automatically set physical_inventory.status to AVAILABLE? | No — never | Physical availability must precede publishing; publishing is an owner decision, not a system trigger | Phase 5 / ARCH-INV-07 |
| **A6** | Should `physical_inventory.status = AVAILABLE` automatically publish an artwork? | No — never | Purely physical state; the owner decides when to publish | Foundational |
| **A7** | When should inventory be reserved for an order? | Only at CONFIRMED — explicit admin action, not automatic | Inquiry-based model; most orders do not reach CONFIRMED; auto-reservation would incorrectly lock up stock | Phase 6 / ARCH-INV-08 |
| **A8** | Should the system auto-reserve at NEW or REVIEWING? | No | Premature; most inquiries do not convert; incorrect to lock physical stock on an unconfirmed inquiry | Foundational |
| **A9** | When should physical inventory move from RESERVED to SOLD? | Only at FULFILLED — explicit admin action | SOLD represents a real-world delivery event, not a system status change | Phase 7 / ARCH-INV-09 |
| **A10** | Does MADE_TO_ORDER require physical inventory at submission? | No | MADE_TO_ORDER items are produced on demand; physical piece does not exist at order time | Phase 6/7 — override mechanism |
| **A11** | Should the 38 existing public artworks receive automatic physical_inventory rows? | No — owner verification required per artwork | System cannot verify physical stock without owner confirmation; incorrect assumption of AVAILABLE would produce bad data | Phase 3–8 transition |
| **A12** | How should the 4 ISYNC-18 artworks be represented? | Via admin UI: create SHIP-2026-001 shipment + 4 physical_inventory rows at PENDING_SHIPMENT | Retroactive setup via the same admin UI used for all future shipments; no special migration | Phase 3 / ARCH-INV-05 |
| **A13** | Should `artwork_sizes.price NOT NULL` be relaxed? | Deferred to INV-PRICE-01 (separate ticket) | Requires separate design and customer UX consideration | Not in ARCH-INV-02 scope |
| **A14** | Should `artworks.quantity` be removed? | Deprecated in Phase 8 (UI only); column removal is a separate future ticket | Safer to retire the field gradually after physical_inventory is populated | Phase 8 / ARCH-INV-10 |
| **A15** | Where should reservation decisions be recorded? | `inventory_movements` append-only table; `order_request_items.physical_inventory_id` FK | Audit trail is non-negotiable for business and dispute resolution | Phase 1 schema, Phase 6 write |

---

## 6. Lifecycle Summary

### 6.1 Shipment lifecycle

```
DRAFT
  ↓  (admin fills in details, adds artworks)
READY_TO_SHIP
  ↓  (admin records dispatch: carrier, shipped_date)
SHIPPED
  ↓  (in transit — physical_inventory items → IN_TRANSIT)
IN_TRANSIT
  ↓  (optional customs hold)
CUSTOMS
  ↓  (clears customs)
DELIVERED
  ↓  (admin records receipt, delivered_date)
CLOSED

At any point before DELIVERED:
→ CANCELLED (if no items are RESERVED or SOLD)
```

### 6.2 Physical inventory lifecycle (per physical piece)

```
PENDING_SHIPMENT  ← created when artwork is added to shipment
  ↓  (shipment is marked SHIPPED)
IN_TRANSIT
  ↓  (shipment is marked DELIVERED)
RECEIVED
  ↓  (admin finds issue)
INSPECTION_REQUIRED
  ↓  (admin inspects)
INSPECTED
  ↓  (admin confirms physically available)
AVAILABLE   ← this is the "internally ready" gate

From AVAILABLE:
  ↓  (admin reserves for CONFIRMED order)
RESERVED
  ↓  (admin marks order FULFILLED)
SOLD   ← real-world delivery to customer

From INSPECTED or RECEIVED or AVAILABLE:
  → DAMAGED   (requires condition notes)
  → ARCHIVED  (admin decision)

From DAMAGED:
  → AVAILABLE  (repaired; requires owner confirmation)
  → ARCHIVED
```

### 6.3 Public publishing lifecycle

```
1. Physical piece arrives and is inspected
   → physical_inventory.status = AVAILABLE

2. Owner reviews the artwork in the admin panel
   (sees that physical inventory is available)

3. Owner edits the artwork:
   - Sets artworks.status = IN_STOCK (or MADE_TO_ORDER)
   - Sets artworks.show_on_website = true

4. If Phase 5 (ARCH-INV-07) is live and no AVAILABLE inventory exists:
   - System returns a warning
   - Owner confirms with override_no_inventory: true to proceed

5. System auto-generates SKU (maybeGenerateSku):
   - artwork is IN_STOCK or MADE_TO_ORDER
   - show_on_website = true
   - sku is null
   → SKU generated on save

6. Artwork is now publicly visible at /artworks
   and customers can submit order requests
```

Publishing never automatically happens. No physical inventory transition triggers a publish. The owner's explicit save action is the only publishing gate.

### 6.4 Order request lifecycle (current + future reservation)

```
Customer submits inquiry → order_request created: status = NEW
  → No inventory change. No reservation. No decrement.

Admin reviews → status = REVIEWING
  → No inventory change.

Admin sends quote → status = QUOTE_SENT
  → No inventory change.

Admin confirms with customer → status = CONFIRMED
  → Admin may explicitly reserve: POST /api/admin/order-requests/:id/reserve
    physical_inventory: AVAILABLE → RESERVED
    order_request_items.physical_inventory_id = physical_inventory.id
    inventory_movements: RESERVED

Admin fulfills order → status = FULFILLED
  → Admin marks: physical_inventory: RESERVED → SOLD
    inventory_movements: SOLD
    System warns if artwork now has no AVAILABLE units

Order cancelled (with reservation) → status = CANCELLED
  → System auto-releases: RESERVED → AVAILABLE
    physical_inventory_id cleared
    inventory_movements: RESERVATION_RELEASED

MADE_TO_ORDER orders → CONFIRMED without physical reservation
  → Reservation skipped (no physical piece exists yet)
  → FULFILLED with override_no_inventory: true
```

---

## 7. The 4 ISYNC-18 Imported Artworks Example

The four artworks imported in ISYNC-18 (IDs: `art-1785182575357-0` through `art-1785182575357-3`) are the first concrete test case for the future inventory model. They are currently in production as:
- `artworks.status = NEEDS_REVIEW`
- `show_on_website = false`
- `sku = null`
- Notes include: "Pending shipment from India"

Here is how they will be represented after each implementation phase:

### After Phase 1 (schema only — ARCH-INV-03)

No change to these artworks. The new tables exist but are empty.

### After Phase 3 (shipment creation — ARCH-INV-05)

Admin performs one-time retroactive setup:

| Table | New rows |
|---|---|
| `shipments` | 1 row: SHIP-2026-001, India → USA, status=DRAFT |
| `shipment_items` | 4 rows: one per artwork, linked to SHIP-2026-001 |
| `physical_inventory` | 4 rows: one per artwork, status=PENDING_SHIPMENT |

Artwork records unchanged. All 4 still NEEDS_REVIEW + hidden.

When the owner physically dispatches the shipment from India, admin updates SHIP-2026-001 to SHIPPED → all 4 physical_inventory rows → IN_TRANSIT.

### After Phase 4 (receiving/inspection — ARCH-INV-06)

When the shipment physically arrives in the US:
- Admin marks SHIP-2026-001 as DELIVERED
- 4 physical_inventory rows → RECEIVED
- Admin inspects each artwork:
  - 3 artworks in good condition → INSPECTION_REQUIRED → INSPECTED → AVAILABLE
  - 1 artwork with condition issue → INSPECTION_REQUIRED → INSPECTED (or DAMAGED if severe)
- Admin notes condition for any issues in `physical_inventory.condition_notes`

At this point, the ISYNC-18-07 publish workflow becomes executable.

### ISYNC-18-07 publish sequence (after Phase 4, owner decision)

For each of the 3–4 artworks the owner wishes to publish:
```
physical_inventory.status = AVAILABLE  ← gate: must be set before publishing

Owner completes the artwork record in admin panel:
  - Fills in any missing fields (materials, dimensions for Row 4)
  - Sets artworks.status = IN_STOCK
  - Sets artworks.show_on_website = true

System auto-generates SKU on save.

Artwork is now publicly visible.
```

For any artwork the owner does not wish to publish yet:
- physical_inventory.status = AVAILABLE (internally ready)
- artworks.status = NEEDS_REVIEW (still hidden)
- No action required

---

## 8. Owner Decisions Needed

These decisions should be answered before implementation begins. Decisions D1–D3 affect the Phase 1 schema migration directly.

### Required before Phase 1 (ARCH-INV-03) begins

| # | Decision | Question | Options | Recommendation |
|---|---|---|---|---|
| **D1** | inventory_movements in Phase 1 or Phase 8? | Should the `inventory_movements` table be created in the Phase 1 schema migration, or added later in Phase 8? | (A) Phase 1 — all tables at once; (B) Phase 8 — add separately later | **A** — create it in Phase 1 to avoid a second schema migration and ensure audit trail is present from the start |
| **D2** | physical_inventory_id column timing | Should `order_request_items.physical_inventory_id` be added in Phase 1, or deferred to Phase 6 when it's first used? | (A) Phase 1 — additive, null, low risk; (B) Phase 6 — add when needed | **A** — add in Phase 1; nullable and has no impact until Phase 6 |
| **D3** | Unit tracking: individual rows or batch buckets? | Should each physical painting be tracked as its own row (quantity=1) or should one row represent a batch (quantity=N)? | (A) Individual rows — one row per physical piece; (B) Batch buckets — one row per artwork/shipment batch | **A** — individual rows for MVP; simplest model; enables per-piece reservation and tracking |

### Required before Phase 3 (ARCH-INV-05) begins

| # | Decision | Question | Options | Recommendation |
|---|---|---|---|---|
| **D4** | Shipment access control | Who may operate shipment creation and receiving — owner only, or any logged-in admin? | Owner only / Any admin | Currently one admin user only — likely owner only; to be confirmed |
| **D5** | Required shipment fields | Which shipment fields are required vs. optional at each stage? | reference_number required? carrier required at SHIPPED? tracking_number required? | reference_number required; carrier required at SHIPPED; tracking_number optional |

### Required before Phase 4 (ARCH-INV-06) begins

| # | Decision | Question | Options | Recommendation |
|---|---|---|---|---|
| **D6** | ISYNC-18-07 timing | Should ISYNC-18-07 (publish of first received artwork) wait for Phase 4 admin UI, or proceed manually via psql if Phase 4 is delayed? | (A) Wait for Phase 4 admin UI; (B) Manual psql if Phase 4 is delayed | **A** — wait for Phase 4; the admin UI is the safest and most auditable path |

### Required before Phase 5 (ARCH-INV-07) begins

| # | Decision | Question | Options | Recommendation |
|---|---|---|---|---|
| **D7** | Warning scope for existing artworks | Should the publish warning fire when re-saving an already-published artwork (if no inventory on file), or only on first publish transitions? | (A) Fire on any save if IN_STOCK + show_on_website=true + no AVAILABLE inventory; (B) Fire only on transitions to orderable | **B** — only on transitions; avoids constant override prompts for 38 existing artworks during the transition period |
| **D8** | MADE_TO_ORDER warning | Should MADE_TO_ORDER artworks require the override flag when publishing (with a different message)? | (A) Yes — same override, different message; (B) No — skip inventory check for MADE_TO_ORDER entirely | **A** — require override with a clear "made-to-order, no inventory needed" message; keeps the pattern consistent |

### Required before Phase 6 (ARCH-INV-08) begins

| # | Decision | Question | Options | Recommendation |
|---|---|---|---|---|
| **D9** | Reservation at FULFILLED: required or optional? | Should FULFILLED be blocked if no physical unit is reserved (no physical_inventory_id set), or should FULFILLED proceed with an override? | (A) Required — cannot FULFILL without linked physical inventory; (B) Optional — can FULFILL with override_no_inventory flag | **B** — optional with override; keeps MADE_TO_ORDER and transition-period artworks unblocked |

### Informational (can be decided later)

| # | Question | Why it matters |
|---|---|---|
| **D10** | How should the 38 existing public artworks be handled for physical_inventory backfill? | Owner must physically verify stock before creating inventory rows; this cannot be automated |
| **D11** | Priority order for Phases 5, 6, 7, 8 | These are independent; owner may choose to prioritize Phase 6/7 (reservation/fulfillment) over Phase 5 (warnings) |
| **D12** | SKU backfill timing | All 42 artworks currently have sku=null; INV-SKU-01 ticket needed when owner decides to generate SKUs |

---

## 9. Recommended Implementation Ticket Breakdown

### ARCH-INV-03 — Add Shipment and Physical Inventory Schema

| Field | Detail |
|---|---|
| **Goal** | Create the four new database tables and one new column that form the foundation of the physical inventory model |
| **Phase** | 1 — Additive Schema Foundation |
| **Scope** | `CREATE TABLE shipments`; `CREATE TABLE shipment_items`; `CREATE TABLE physical_inventory`; `CREATE TABLE inventory_movements`; `ALTER TABLE order_request_items ADD COLUMN physical_inventory_id INTEGER REFERENCES physical_inventory(id) ON DELETE SET NULL`; supporting indexes |
| **Non-scope** | No data backfill; no application code; no UI changes; no existing table modifications (except the single column addition to order_request_items) |
| **Dependencies** | Phase 0 (owner decisions D1–D3 confirmed) |
| **Rollback** | `DROP TABLE inventory_movements; DROP TABLE physical_inventory; DROP TABLE shipment_items; DROP TABLE shipments; ALTER TABLE order_request_items DROP COLUMN physical_inventory_id` — safe, no data loss |
| **Rough estimate** | Low — SQL migration only; no app code |
| **Validation** | All 4 tables exist; order_request_items.physical_inventory_id exists; all new tables empty; existing row counts unchanged (42 artworks, 91 artwork_sizes, 3 order_requests, 4 order_request_items); public artwork count = 38; FK constraint tests pass |

---

### ARCH-INV-04 — Admin Inventory Read-Only Views

| Field | Detail |
|---|---|
| **Goal** | Give the admin visibility into physical_inventory and shipment status in the admin panel, even before any data exists |
| **Phase** | 2 — Admin Read-Only Views |
| **Scope** | New GET endpoints: `GET /api/admin/physical-inventory`, `GET /api/admin/physical-inventory/:id`, `GET /api/admin/shipments`, `GET /api/admin/shipments/:id`; enhancement to `GET /api/admin/artworks` (additive `physical_inventory_summary` field per artwork); admin panel UI: physical inventory badge per artwork, Shipment List screen, Physical Inventory List screen, physical inventory section on artwork detail |
| **Non-scope** | No write operations; no changes to existing artwork, order, or public APIs |
| **Dependencies** | ARCH-INV-03 (Phase 1 schema) |
| **Rollback** | Redeploy previous application version; no data changes |
| **Rough estimate** | Medium — multiple new GET endpoints + frontend badges and screens |
| **Validation** | New GET endpoints return 200 with empty arrays; artwork list shows "No inventory" badge for all 42; existing API responses unchanged; public count = 38 |

---

### ARCH-INV-05 — Shipment Creation and Item Assignment

| Field | Detail |
|---|---|
| **Goal** | Allow the admin to create shipments, add artworks to shipments, and manage the pre-shipment/in-transit lifecycle. Enables the ISYNC-18 retroactive setup (SHIP-2026-001). |
| **Phase** | 3 — Shipment Creation and Assignment |
| **Scope** | New endpoints: `POST /api/admin/shipments`, `PATCH /api/admin/shipments/:id` (status transitions including DRAFT → SHIPPED), `POST /api/admin/shipments/:id/items` (creates shipment_items + physical_inventory at PENDING_SHIPMENT), `DELETE /api/admin/shipments/:id/items/:item_id` (DRAFT only); admin UI: Create Shipment form, Shipment Detail with "Add Artwork" and "Mark Shipped" actions; physical inventory badge updates on artwork detail |
| **Non-scope** | No receiving/inspection (Phase 4); no reservation (Phase 6); no changes to public APIs; no artwork status or show_on_website changes |
| **Dependencies** | ARCH-INV-04; owner decisions D4–D5 |
| **Rollback** | Redeploy previous application version; any physical_inventory or shipment rows already created can be cleaned up via manual psql if needed (consult owner before deleting any data) |
| **Rough estimate** | High — write endpoints + Shipment UI screens + physical_inventory creation logic |
| **Validation** | Create shipment succeeds; add artwork creates physical_inventory at PENDING_SHIPMENT; mark SHIPPED → physical_inventory → IN_TRANSIT; cannot add artwork to SHIPPED shipment; public count = 38; ISYNC-18 artworks unchanged |
| **Post-deploy action** | Retroactive ISYNC-18 setup: admin creates SHIP-2026-001 and adds 4 ISYNC-18 artworks via admin UI |

---

### ARCH-INV-06 — Receiving and Inspection Workflow

| Field | Detail |
|---|---|
| **Goal** | Allow the admin to receive a delivered shipment, inspect each artwork, and mark it AVAILABLE internally. Completing this phase unblocks ISYNC-18-07. |
| **Phase** | 4 — Receiving, Inspection, and AVAILABLE |
| **Scope** | New endpoint: `POST /api/admin/shipments/:id/receive` (marks DELIVERED; all IN_TRANSIT physical_inventory → RECEIVED; sets delivered_date); new endpoint: `PATCH /api/admin/physical-inventory/:id/status` (allowed transitions: RECEIVED → INSPECTION_REQUIRED → INSPECTED → AVAILABLE; INSPECTED → DAMAGED; AVAILABLE → DAMAGED; DAMAGED → AVAILABLE with owner confirmation; Any → ARCHIVED); admin UI: "Mark Received" button on Shipment Detail; per-item action buttons (inspect, available, damaged); artwork detail updates |
| **Non-scope** | No reservation (Phase 6); no auto-publishing; no artwork status changes |
| **Dependencies** | ARCH-INV-05; at least one shipment in SHIPPED status |
| **Rollback** | Redeploy previous application version; status transitions are reversible via admin PATCH (subject to transition rules) |
| **Rough estimate** | Medium — status transition endpoints + validation logic + action buttons |
| **Validation** | Receive shipment: physical_inventory → RECEIVED; inspect: inspected_date set; AVAILABLE: status confirmed; cannot skip RECEIVED → AVAILABLE without INSPECTED; DAMAGED without condition_notes rejected; public count = 38 |
| **Unblocks** | ISYNC-18-07 (controlled publish of first received ISYNC-18 artwork, after physical_inventory = AVAILABLE and owner approval) |

---

### ARCH-INV-07 — Publish Safety Warnings Based on Inventory

| Field | Detail |
|---|---|
| **Goal** | Warn the admin when publishing an artwork with no inspected or available physical inventory on record; require explicit override |
| **Phase** | 5 — Publish Safety Warnings |
| **Scope** | Modification to `PATCH /api/admin/artworks/:id`: when setting status = IN_STOCK/MADE_TO_ORDER + show_on_website = true (on transition, per decision D7), check physical_inventory for INSPECTED or AVAILABLE units; if none and no `override_no_inventory: true` in request body, return HTTP 200 with a `warning` field (no save); if override present, save and note the override; frontend: modal prompt on warning response |
| **Non-scope** | Does not block publication; no changes to SKU generation; no changes to public APIs; does not affect already-published artworks |
| **Dependencies** | ARCH-INV-03 (Phase 1 schema sufficient); owner decisions D7–D8 |
| **Rollback** | Redeploy previous application version; no data changes |
| **Rough estimate** | Low–Medium — warning logic in existing endpoint + frontend modal |
| **Validation** | Publish without inventory + no override: warning returned, no save; with override: saves; with AVAILABLE inventory: saves without warning; existing published artworks unaffected; MADE_TO_ORDER message is correct |

---

### ARCH-INV-08 — Order Request Reservation Workflow

| Field | Detail |
|---|---|
| **Goal** | Allow the admin to explicitly reserve a specific physical inventory unit for a CONFIRMED customer order |
| **Phase** | 6 — Order Request Reservation |
| **Scope** | New endpoints: `POST /api/admin/order-requests/:id/reserve` (body: `{item_id, physical_inventory_id}`; transitions physical_inventory AVAILABLE → RESERVED; sets order_request_items.physical_inventory_id; writes RESERVED inventory_movement), `POST /api/admin/order-requests/:id/release` (reverses reservation; writes RESERVATION_RELEASED movement); enhancement to `PATCH /api/admin/order-requests/:id/status` (auto-releases reservations when order is CANCELLED); admin UI: "Reserve" and "Release" buttons on order request detail |
| **Non-scope** | No auto-reservation on order submission; no auto-reservation on status change before CONFIRMED; no change to public order request endpoint |
| **Dependencies** | ARCH-INV-06 (AVAILABLE units must exist); owner decision D9 |
| **Rollback** | Redeploy previous application version; RESERVED → AVAILABLE reversal possible via admin (if not yet SOLD) |
| **Rough estimate** | High — reservation endpoints + transactional logic + cancel auto-release + frontend integration |
| **Validation** | Reserve: physical_inventory → RESERVED, FK set, movement written; double-reserve same unit: 409; reserve for non-CONFIRMED order: 400; cancel with reservation: auto-releases; RESERVATION_RELEASED movement written; public count = 38 |

---

### ARCH-INV-09 — Fulfillment and SOLD Inventory Movement

| Field | Detail |
|---|---|
| **Goal** | Allow the admin to mark an order FULFILLED and simultaneously record the physical unit as SOLD |
| **Phase** | 7 — Fulfillment and SOLD |
| **Scope** | Enhancement to `PATCH /api/admin/order-requests/:id/status` (when setting FULFILLED: if physical_inventory_id set and status = RESERVED → mark SOLD + write SOLD movement; if not RESERVED → return 400; if physical_inventory_id null + override_no_inventory = true → proceed; if null + no override → return warning); post-fulfillment warning: list artworks with no remaining AVAILABLE units; admin UI: FULFILLED action with override prompt |
| **Non-scope** | No automatic artwork status change after SOLD; no auto-hiding of sold artwork; no checkout/payment/shipping |
| **Dependencies** | ARCH-INV-08 |
| **Rollback** | Redeploy previous application version; SOLD status represents a real-world event and should not be reversed unless the physical item was actually returned |
| **Rough estimate** | Medium — fulfillment action + SOLD movement + post-warning |
| **Validation** | FULFILLED with RESERVED unit: physical_inventory → SOLD, SOLD movement written; FULFILLED without RESERVED unit (no override): warning; with override: proceeds; post-fulfillment warning returned when no AVAILABLE units remain; artworks.status NOT auto-changed |

---

### ARCH-INV-10 — Inventory Movement Audit Trail and Cleanup

| Field | Detail |
|---|---|
| **Goal** | Provide the admin with a full audit trail of physical inventory history; begin deprecating artworks.quantity |
| **Phase** | 8 — Audit Trail and Cleanup |
| **Scope** | New endpoints: `GET /api/admin/inventory-movements` (list with filters), `GET /api/admin/inventory-movements?artwork_id=X`; ensure all prior phases write movements correctly; `artworks.quantity` UI deprecation (hidden/read-only in admin edit form); optional historical PUBLISHED movement backfill for existing 38 artworks (owner approval required before running) |
| **Non-scope** | `artworks.quantity` column removal (separate future migration); payment, checkout, report export |
| **Dependencies** | ARCH-INV-09 (all prior write phases should be writing movements before Phase 8 audits them) |
| **Rollback** | Redeploy previous application version; no data changes except optional backfill (which is append-only) |
| **Rough estimate** | Medium — movements log view + deprecation + optional backfill |
| **Validation** | GET /api/admin/inventory-movements returns all movements; ISYNC-18 artwork history correct; artworks.quantity hidden in admin UI; artworks.quantity still present in DB; public count = 38 |

---

## 10. Recommended Order of Execution

```
Phase 0 — Owner reviews and accepts ARCH-INV-02 planning package
  ↓  (owner answers D1–D3)
Phase 1 — ARCH-INV-03: Additive Schema
  ↓  (staging validated → owner approves → production deployed)
Phase 2 — ARCH-INV-04: Admin Read-Only Views
  ↓  (staging validated → owner approves → production deployed)
Phase 3 — ARCH-INV-05: Shipment Creation
  ↓  (staging validated → owner approves → production deployed)
  ↓  (retroactive ISYNC-18 setup performed: SHIP-2026-001 + 4 physical_inventory rows)
  ↓  (real shipment dispatched → status updated to SHIPPED)
Phase 4 — ARCH-INV-06: Receiving and Inspection
  ↓  (staging validated → owner approves → production deployed)
  ↓  (ISYNC-18-07 becomes executable: receive → inspect → AVAILABLE → owner may publish)

  From Phase 4, the following phases are independent and can be prioritized by owner:

Phase 5 — ARCH-INV-07: Publish Safety Warnings
  (Can run in parallel with 6/7/8 — applies to any new publish action)

Phase 6 — ARCH-INV-08: Order Request Reservation
  ↓
Phase 7 — ARCH-INV-09: Fulfillment and SOLD
  ↓
Phase 8 — ARCH-INV-10: Audit Trail and Cleanup
```

### Why this order

| Constraint | Reason |
|---|---|
| Phase 1 before everything else | Schema must exist before any code writes data to it |
| Phase 2 before Phase 3 | Admin should be able to see inventory before creating it |
| Phase 3 before Phase 4 | Physical inventory rows must exist before they can be received/inspected |
| Phase 4 before ISYNC-18-07 | AVAILABLE status must be supported before owner can publish ISYNC-18 artworks safely |
| Phase 4 before Phase 6 | AVAILABLE units must exist before they can be reserved |
| Phase 6 before Phase 7 | Reservation must exist before fulfillment can decrement |
| Phase 5 is independent | The warning system only needs Phase 1 schema; can be deployed at any point from Phase 2 onward |
| Phase 8 is last | Audit trail review and cleanup makes most sense after write phases are stable |

---

## 11. Deferred / Explicitly Out-of-Scope Items

These items are not included in ARCH-INV-02 or in tickets ARCH-INV-03 through ARCH-INV-10. Each would require a separate approved ticket and owner decision.

| Item | Why deferred |
|---|---|
| Full checkout, payment, tax, shipping to customer | Not part of the current inquiry-based business model |
| Automatic inventory decrement on order submission | Rejected by design (ARCH-INV-02D); changes customer-facing inquiry semantics |
| Automatic artwork publish from physical inventory status | Rejected by design (ARCH-INV-02C); the owner's publish decision is the gate |
| Automatic SKU backfill for all 42 artworks | Requires separate ticket (INV-SKU-01); owner must confirm timing and SKU format per artwork |
| `artwork_sizes.price NOT NULL` relaxation (Price on Request) | Separate ticket (INV-PRICE-01); requires UX design for how price-on-request is displayed |
| `artworks.quantity` column removal from schema | Deferred until physical_inventory is fully populated; requires destructive migration |
| `artwork_sizes` rename to `artwork_variants` | No concrete requirement at this time |
| Multi-location inventory tracking | No multi-location use case currently |
| Automated artwork hide when physical inventory = SOLD | Not approved; owner makes status decisions |
| Public site display of inventory counts ("1 left!") | Future UX enhancement; requires owner approval |
| Bulk physical inventory inspection action | Phase 8 stretch goal |
| Inventory movement report export | Phase 8 stretch goal |
| `WEB-CAT-02` — server-side category filter fix | Separate pre-existing ticket |
| `ISYNC-18-07` — controlled publish of first received artwork | Operational workflow, not implementation; executable after Phase 4 |
| `ISYNC-19` — next import batch | Separate import ticket; not started |
| `INV-PRICE-01` — size-level Price on Request | Separate ticket; not started |
| Automated `RETURNED` order status and inventory reversal | Low priority; deferred to future ticket |
| Importing artworks directly into physical inventory | All physical inventory creation is manual via admin UI |

---

## 12. Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Schema migration fails mid-run on production | High | Use `IF NOT EXISTS` throughout; staging-first policy; `pg_dump` backup before every production migration; verify backup before applying |
| Phase 1 migration corrupts existing artworks or order data | High | Phase 1 is additive only; no existing tables are modified except one nullable column addition to order_request_items; rollback SQL is tested on staging first |
| ISYNC-18 artworks accidentally published during Phase 3–4 setup | Medium | artworks.status and show_on_website are untouched by all Phase 1–4 operations; validation checks confirm public count = 38 after every deployment |
| Wrong artwork_id assigned to physical_inventory row | Medium | FK constraint enforced at DB level; admin UI uses an artwork picker dropdown, not free-text ID entry; cannot create orphan rows |
| Double reservation: two admins race to reserve the same physical unit | Low | Database-level atomic status check prevents double-reservation; second attempt returns 409 |
| SOLD recorded in system but artwork remains publicly orderable | Low | Phase 7 returns a post-fulfillment warning; owner manually updates artwork status; no auto-hide by design |
| Phase 8 historical movement backfill uses wrong dates | Low | Backfill is optional, append-only, and tagged with a notes field ("Backfilled — approximate date"); does not affect any functional behavior |
| ISYNC-18-07 blocked because Phase 4 is delayed | Medium | ISYNC-18-07 requires Phase 4 (AVAILABLE state in production). If Phase 4 is delayed, ISYNC-18-07 must wait. Owner should prioritize ARCH-INV-05 + ARCH-INV-06 to unblock it. |
| Owner decisions not answered before Phase 1 | Medium | Phase 0 gate: D1–D3 must be explicitly confirmed before ARCH-INV-03 begins |
| artworks.quantity removal attempted before deprecation | Low | This document explicitly defers column removal; Phase 8 only deprecates the UI and API exposure |
| Phase transition skipped to work around a failing validation | High | Every phase has explicit validation gates; failed validation is a stop condition; do not skip phases |
| Staging → production environment mismatch | Medium | Run identical validation checklist on both environments; treat any deviation as a stop condition |
| Private/secret data accidentally committed | High | server/.env is gitignored; _private/ is gitignored; temp scripts are gitignored; backup files are gitignored; confirm git status before every commit |

---

## 13. Final Recommendation

**The ARCH-INV-02 planning package is complete.**

ARCH-INV-02A through 02F have established:

1. A clear, stable understanding of the current production model (02A).
2. A future data model that separates catalog from physical inventory without disrupting existing behavior (02B).
3. Defined lifecycles for shipments, physical inventory, and the publish workflow, with explicit protection against auto-publishing (02C).
4. A reservation model that keeps order requests as inquiries and reserves physical inventory only by explicit admin action at CONFIRMED (02D).
5. An eight-phase migration plan with independent deployable phases, validation gates, rollback procedures, and owner decision gates (02E).
6. A consolidated owner-readable recommendation and ticket breakdown (this document, 02F).

**The recommendation is:**

- Accept the ARCH-INV-02 planning package and merge the planning branch to main as a documentation commit.
- Answer owner decisions D1–D3 (Section 8 above).
- Create and approve ARCH-INV-03 as the first implementation ticket.
- Execute each phase in order, with staging validation and owner approval before each production deployment.
- Do not skip phases or validation gates.
- Do not attempt to implement INV-PRICE-01, INV-SKU-01, WEB-CAT-02, ISYNC-18-07, or ISYNC-19 until the corresponding phases are live.

The architecture is designed to be conservative: every new table is additive, every new capability is gated behind an explicit admin action, and existing public catalog behavior is preserved at every phase. The 38 public artworks and 4 ISYNC-18 artworks are protected throughout.

---

## 14. Safety Confirmation

| Item | Status |
|---|---|
| Code changes | None |
| SQL migrations written | None |
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
| ARCH-INV-03 started | No |
| WEB-CAT-02 started | No |
| ISYNC-18-07 started | No |
| ISYNC-19 started | No |
| INV-PRICE-01 started | No |
| Planning branch merged to main | No — awaiting owner review and explicit approval |
| Planning branch pushed to origin | No — on hold until owner explicitly requests |
