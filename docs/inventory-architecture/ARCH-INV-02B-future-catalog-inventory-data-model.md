# ARCH-INV-02B — Future Catalog vs Physical Inventory Data Model

**Ticket:** ARCH-INV-02B — Define Future Catalog vs Physical Inventory Data Model  
**Branch:** `feature/ARCH-INV-02-planning`  
**Date:** 2026-07-28  
**Type:** Design/planning document — no code changes, no schema changes, no production data changes  
**Depends on:** ARCH-INV-02A (current-state review, merged)  
**Input docs:** ARCH-INV-02A, ARCH-INV-01, ISYNC-18-04/05/06, ORD-01/02/04

---

## 1. Purpose

This document defines the future data model that separates the Chitrakala Arts system into clearly bounded entities: catalog/product information, size/price options, physical inventory/stock, shipment/receiving information, and inventory movement history. It also specifies how these entities relate to order requests, public visibility, and SKU generation.

This is a design document only. No code, migrations, or production changes are made here. The goal is a clear, owner-reviewable model that follow-up implementation tickets (ARCH-INV-02C through ARCH-INV-02E) can execute against.

---

## 2. Design Principles

1. **Separation of concerns.** The artwork catalog record describes what a product is. Physical inventory tracks whether a physical unit exists and where it is. These are different concerns and must not be conflated.

2. **Do not overload `artworks.status`.** `status` is a catalog/availability signal for the public site. Physical lifecycle states (TO_BE_SHIPPED, IN_TRANSIT, RECEIVED) must not be added to this column.

3. **Public visibility remains controlled by two explicit gates.** The rule `status IN ('IN_STOCK','MADE_TO_ORDER') AND show_on_website = true` stays on the `artworks` record. Physical inventory state informs but does not override this rule — a human admin decision must always be the final publish gate.

4. **Order requests remain inquiry records.** Creating an order request does not automatically reserve or decrement inventory. Future reservation rules must be defined explicitly in a separate design (ARCH-INV-02D) and implemented by a human-approved ticket.

5. **SKU stays at the catalog/product level.** One SKU per artwork. No SKU per physical piece, per size, or per order line.

6. **Prefer the simplest model that solves the real problem.** Chitrakala Arts is a small-volume handmade art business. Physical pieces are mostly unique (quantity=1 per artwork). The data model should reflect this reality and avoid over-engineering for hypothetical high-volume scenarios.

7. **No breaking changes to existing tables in this design phase.** `artworks`, `artwork_sizes`, `order_requests`, and `order_request_items` are in production. The future model adds new tables; it does not delete or rename existing columns in this design phase.

---

## 3. Current Model Summary (from ARCH-INV-02A)

| Entity | Current state | Key gap |
|---|---|---|
| `artworks` | Catalog + availability in one table | Mixed with availability/quantity; no physical inventory concept |
| `artwork_sizes` | Size/price variants | `price NOT NULL` blocks size-level Price on Request |
| Physical inventory | Not modeled | No table; `artworks.quantity` is informational only |
| Shipment/receiving | Not modeled | Workaround: `notes` field holds pending-shipment text |
| Movement/history | Not modeled | No audit trail for received / sold / reserved events |
| `order_requests` | Inquiry record only | No inventory reserve/decrement; correct design intent |
| `order_request_items` | Snapshot at submission | No link to physical piece; correct for current scope |

**Root cause of the ISYNC-18 workaround:** 4 artworks were imported as catalog records before their physical pieces shipped. The system had no formal way to say "catalog record exists, physical item not yet received." `status=NEEDS_REVIEW` + a `notes` field message was the only available mechanism.

---

## 4. Proposed Future Entity Overview

The future model separates concerns into six distinct entities:

```
┌─────────────────────────────────────────────────────────┐
│  artworks  (catalog/product record)                     │
│  — title, category, description, materials, images      │
│  — catalog status, show_on_website, SKU                 │
│  — base price (may be null for POR)                     │
└───────────────────┬─────────────────────────────────────┘
                    │ 1:many
                    ▼
┌─────────────────────────────────────────────────────────┐
│  artwork_sizes  (size/price variants)                   │
│  — size_label, price (future: nullable for POR)         │
└───────────────────┬─────────────────────────────────────┘
                    │
          ┌─────────┤
          │         │ 1:many (optional)
          ▼         ▼
┌────────────────────────────────────┐
│  physical_inventory                │
│  — quantity, condition, status     │
│  — received_date, source, notes    │
│  — FK: artwork_id, artwork_size_id │
│  — FK: shipment_id (optional)      │
└──────────────┬─────────────────────┘
               │ many:1
               ▼
┌─────────────────────────────────────────────────────────┐
│  shipments  (shipment/receiving batches)                │
│  — source, destination, carrier, tracking               │
│  — status, expected/shipped/received dates              │
└───────────────────┬─────────────────────────────────────┘
                    │ 1:many
                    ▼
┌─────────────────────────────────────────────────────────┐
│  shipment_items  (line items within a shipment)         │
│  — artwork_id, artwork_size_id, quantity, notes         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  inventory_movements  (audit trail)                     │
│  — movement_type, quantity_change                       │
│  — reference_type, reference_id                        │
│  — FK: artwork_id (denormalized for query convenience)  │
└─────────────────────────────────────────────────────────┘
```

**Unchanged entities (kept as-is for now):**
- `order_requests` — inquiry record; no change
- `order_request_items` — snapshot record; no change
- `categories` — no change

---

## 5. Proposed artworks / Catalog Record

### What stays on artworks

`artworks` remains the single source of truth for product/catalog data.

| Column | Keep/Change | Notes |
|---|---|---|
| `id` | Keep | Stable internal identifier |
| `title` | Keep | |
| `category` | Keep | FK to categories |
| `description` | Keep | Customer-facing product description |
| `materials` | Keep | Public-facing materials list |
| `dimensions` | Keep | Physical size string |
| `notes` | Keep | Admin-only internal notes. Replace pending-shipment content with proper shipment record (see Section 8). |
| `status` | Keep, no new values | Catalog status only: NEEDS_REVIEW, IN_STOCK, MADE_TO_ORDER, OUT_OF_STOCK, SOLD, ARCHIVED. Never add TO_BE_SHIPPED or IN_TRANSIT here. |
| `show_on_website` | Keep | Second public visibility gate |
| `sku` | Keep | Catalog/product-level SKU |
| `price_inr` | Keep | Nullable = Price on Request |
| `price_usd` | Keep | Computed at save time |
| `fx_rate_used` | Keep | Rate at time of last price calc |
| `multiplier_used` | Keep | Multiplier at time of last price calc |
| `image_data` | Keep | Binary image stored in DB |
| `image_mime_type` | Keep | |
| `image_filename` | Keep | Used during workbook import matching |
| `image` | Keep (for now) | URL field; kept for API compatibility |
| `featured` | Keep | |
| `quantity` | Deprecate later | Currently informational. Once `physical_inventory` is live and populated, `artworks.quantity` becomes redundant. Do not remove it yet — it may be needed for artworks not yet tracked in physical_inventory. Deprecate in a follow-up ticket after physical_inventory is populated. |
| `created_at`, `updatedAt` | Keep | |

### What does NOT move onto artworks

- Shipment status (PENDING_SHIPMENT, IN_TRANSIT, etc.) → moves to `physical_inventory.status` and `shipments.status`
- Physical unit count → moves to `physical_inventory`
- Received date → moves to `physical_inventory.received_date`
- Source location → moves to `shipments.source_location` or `physical_inventory.source`

### artworks.status remains catalog-only

`artworks.status` expresses catalog/availability intent from the admin's perspective:

| Status | Meaning | Public? |
|---|---|---|
| NEEDS_REVIEW | Imported or draft; not admin-reviewed | Never |
| IN_STOCK | Available and confirmed by admin | Yes (+ show_on_website=true) |
| MADE_TO_ORDER | Available by commission | Yes (+ show_on_website=true) |
| OUT_OF_STOCK | Unavailable | No |
| SOLD | Sold | No |
| ARCHIVED | Retired | Never |

These values are already in production. No new values are added in this design.

---

## 6. Proposed artwork_sizes / Variant Model

### What stays in artwork_sizes

`artwork_sizes` remains the correct home for size/price variants of the same design.

| Column | Keep/Change | Notes |
|---|---|---|
| `id` | Keep | |
| `artwork_id` | Keep | FK → artworks |
| `size_label` | Keep | e.g., `12" round`, `18" round` |
| `price` | Change: relax to nullable | Currently `NOT NULL`. Relaxing to nullable enables size-level Price on Request (INV-PRICE-01 scope). This requires a migration. |

### Future: rename to artwork_variants?

The current `artwork_sizes` table name is accurate for now. If in the future variants extend beyond size (e.g., color variants, framing options), the table could be renamed to `artwork_variants` with an additional `variant_type` column. This is not proposed for the current implementation phase — defer until a concrete variant-type requirement exists.

**Recommendation for now:** Keep `artwork_sizes` as-is except for relaxing `price NOT NULL` (INV-PRICE-01).

### artwork_sizes and physical_inventory

When a physical unit exists for a specific size variant, `physical_inventory.artwork_size_id` references the specific size row. This creates a clean link: catalog product → size variant → physical unit.

---

## 7. Proposed physical_inventory / Stock Model

### Purpose

`physical_inventory` tracks actual physical units of an artwork. This is where "does a physical piece exist, and what is its current state?" lives — separate from the catalog record.

### Proposed schema

```sql
physical_inventory (
  id                  SERIAL PRIMARY KEY,
  artwork_id          VARCHAR(50) NOT NULL
                        REFERENCES artworks(id) ON DELETE RESTRICT,
  artwork_size_id     INTEGER
                        REFERENCES artwork_sizes(id) ON DELETE SET NULL,
  quantity            INTEGER NOT NULL DEFAULT 1
                        CHECK (quantity > 0),
  status              VARCHAR(30) NOT NULL DEFAULT 'PENDING_SHIPMENT'
                        CHECK (status IN (
                          'PENDING_SHIPMENT',  -- catalog record exists; physical item not yet shipped
                          'IN_TRANSIT',        -- shipped; not yet received
                          'RECEIVED',          -- physically at destination; not yet inspected
                          'INSPECTED',         -- inspected; not yet published/available
                          'AVAILABLE',         -- admin has confirmed it is ready (corresponds to artwork IN_STOCK/MADE_TO_ORDER + show_on_website=true)
                          'RESERVED',          -- allocated to a confirmed order (future)
                          'SOLD',              -- fulfilled and delivered to customer
                          'DAMAGED',           -- received damaged or damaged after receipt
                          'ARCHIVED'           -- retired/removed from active tracking
                        )),
  source              VARCHAR(255),             -- e.g., "India - Artist Studio"
  shipment_id         INTEGER
                        REFERENCES shipments(id) ON DELETE SET NULL,
  received_date       TIMESTAMP,               -- when physically received at destination
  inspected_date      TIMESTAMP,               -- when owner-inspected
  condition_notes     TEXT,                    -- inspector notes on condition
  notes               TEXT,                    -- other admin notes
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP
)
```

### Design decisions

**Why `ON DELETE RESTRICT` on artwork_id?**  
A physical inventory record is a real-world artifact. If a catalog record is being deleted, there must be no physical units tracked against it. This forces an explicit cleanup rather than cascading deletes that could lose history.

**Why `quantity` instead of individual piece rows?**  
For unique handmade artworks (the typical Chitrakala case), quantity=1 is the norm. For reproducible items (coaster sets, sarees ordered in multiples), a quantity field avoids creating N identical rows. This is the right level of granularity for a small-volume art business. If piece-level serialization ever becomes needed (e.g., for insurance or provenance), a `serial_number` or `piece_identifier` column can be added later.

**Why `artwork_size_id` on physical_inventory?**  
When a physical piece arrives for a specific size variant (e.g., the 18" round mandala, not the 12"), the physical record needs to know which variant it represents. This is necessary to accurately update size-level availability.

**Relationship between physical_inventory.status and artworks.status:**  
These are independent. An admin must explicitly update both:
- `physical_inventory.status = 'AVAILABLE'` when the piece is inspected and ready
- `artworks.status = 'IN_STOCK'` + `show_on_website = true` when the admin decides to publish

Neither automatically updates the other. Human approval is always the final publish gate.

---

## 8. Proposed shipment / Receiving Model

### Purpose

`shipments` tracks a batch of artworks traveling from a source location to a destination. `shipment_items` lists which artwork units are included in the shipment.

### Proposed shipments schema

```sql
shipments (
  id                  SERIAL PRIMARY KEY,
  reference_number    VARCHAR(100) UNIQUE,      -- e.g., "SHIP-2026-001"
  source_location     VARCHAR(255),             -- e.g., "India - Sonu's Studio, Ahmedabad"
  destination_location VARCHAR(255),            -- e.g., "USA"
  carrier             VARCHAR(100),             -- e.g., "India Post", "FedEx International"
  tracking_number     VARCHAR(255),
  status              VARCHAR(30) NOT NULL DEFAULT 'PREPARING'
                        CHECK (status IN (
                          'PREPARING',          -- items being gathered before shipping
                          'SHIPPED',            -- handed to carrier
                          'IN_TRANSIT',         -- in transit to destination
                          'CUSTOMS',            -- held at customs
                          'DELIVERED',          -- arrived at destination
                          'CANCELLED'           -- shipment cancelled
                        )),
  expected_ship_date  DATE,
  shipped_date        DATE,
  delivered_date      DATE,
  notes               TEXT,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP
)
```

### Proposed shipment_items schema

```sql
shipment_items (
  id                  SERIAL PRIMARY KEY,
  shipment_id         INTEGER NOT NULL
                        REFERENCES shipments(id) ON DELETE CASCADE,
  artwork_id          VARCHAR(50) NOT NULL
                        REFERENCES artworks(id) ON DELETE RESTRICT,
  artwork_size_id     INTEGER
                        REFERENCES artwork_sizes(id) ON DELETE SET NULL,
  quantity            INTEGER NOT NULL DEFAULT 1
                        CHECK (quantity > 0),
  notes               TEXT,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)
```

### How shipment_items relates to physical_inventory

`shipment_items` describes what was included in a shipment at dispatch time. `physical_inventory` describes what actually arrived and its ongoing status. The link is `physical_inventory.shipment_id → shipments.id`.

When a shipment is created (PREPARING):
- Admin creates `shipments` row with status=PREPARING
- Admin creates `shipment_items` rows listing expected artworks
- `physical_inventory` rows are created with `status=PENDING_SHIPMENT`, `shipment_id` set

When shipped:
- `shipments.status` → SHIPPED; `shipped_date` set
- `physical_inventory.status` → IN_TRANSIT

When received:
- `shipments.status` → DELIVERED; `delivered_date` set
- `physical_inventory.status` → RECEIVED; `received_date` set

When inspected:
- `physical_inventory.status` → INSPECTED; `inspected_date` set
- Admin can now proceed to publish the artwork (ISYNC-18-07 workflow)

---

## 9. Proposed Inventory Movement / History Model

### Purpose

`inventory_movements` provides an auditable history of what happened to each physical inventory item. This is an append-only log — rows are never updated or deleted.

### Proposed schema

```sql
inventory_movements (
  id                  SERIAL PRIMARY KEY,
  physical_inventory_id INTEGER
                        REFERENCES physical_inventory(id) ON DELETE SET NULL,
  artwork_id          VARCHAR(50) NOT NULL,      -- denormalized for easy querying without joins
  movement_type       VARCHAR(30) NOT NULL
                        CHECK (movement_type IN (
                          'CREATED',            -- inventory record first created
                          'SHIPPED',            -- shipment departed source
                          'RECEIVED',           -- physically arrived at destination
                          'INSPECTED',          -- owner-inspected and confirmed
                          'PUBLISHED',          -- artwork set to public/orderable
                          'RESERVED',           -- allocated to a confirmed order (future)
                          'RELEASED',           -- reservation cancelled
                          'SOLD',               -- fulfilled and delivered
                          'RETURNED',           -- returned after sale
                          'DAMAGED',            -- damage recorded
                          'ADJUSTED',           -- manual quantity/status correction
                          'ARCHIVED'            -- retired from active tracking
                        )),
  quantity_change     INTEGER NOT NULL DEFAULT 0,  -- +N = added, -N = removed/allocated
  reference_type      VARCHAR(50),               -- 'shipment', 'order_request', 'manual'
  reference_id        VARCHAR(100),              -- ID of the shipment, order, etc.
  notes               TEXT,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by          VARCHAR(100)               -- admin username who recorded this
)
```

### Usage pattern

| Event | movement_type | quantity_change |
|---|---|---|
| Admin creates inventory record for ISYNC-18-style import | CREATED | +1 |
| Shipment dispatched from India | SHIPPED | 0 (status change) |
| Artwork received at destination | RECEIVED | 0 (status change) |
| Owner inspects and approves | INSPECTED | 0 (status change) |
| Admin publishes artwork | PUBLISHED | 0 (catalog gate change) |
| Customer order confirmed (future) | RESERVED | -1 |
| Order cancelled | RELEASED | +1 |
| Order fulfilled | SOLD | 0 (already reserved; final disposition) |

Movement rows are never updated. Corrections use ADJUSTED movement type with a note explaining the correction.

### Is inventory_movements required in the first implementation?

**Recommendation:** Defer to a follow-up ticket. For the ISYNC-18-07 publish workflow and near-term import operations, the combination of `physical_inventory.status` transitions and `shipments.status` is sufficient. `inventory_movements` is a quality-of-life audit feature that becomes valuable when:
- Multiple physical units of the same artwork exist
- Multiple admins are making status changes
- Customer-facing reservation/decrement is live

Implement `inventory_movements` as part of ARCH-INV-02D (order request inventory rules) or later.

---

## 10. Relationship to Order Requests

### Current behavior (correct and unchanged)

`POST /api/order-requests` only reads from `artworks` and `artwork_sizes`. It validates each item against the current two-gate public visibility rule, captures snapshots, and writes to `order_requests` + `order_request_items`. No physical inventory row is touched.

### Order request → catalog relationship

```
order_request_items
  artwork_id → artworks.id              (live reference)
  artwork_size_id → artwork_sizes.id    (live reference, nullable)
  snapshot_* columns                    (immutable at submission time)
```

`order_request_items` does NOT reference `physical_inventory`. The customer is requesting a catalog product, not a specific physical piece.

### Future: when physical_inventory reservation is introduced (ARCH-INV-02D)

When an admin confirms an order (`PATCH /api/admin/order-requests/:id/status` → CONFIRMED), a future implementation may:
1. Find matching `physical_inventory` rows (by artwork_id + artwork_size_id) with status=AVAILABLE
2. Set their status to RESERVED
3. Link them to the order via `physical_inventory.reference_type='order_request'` and `reference_id`
4. Record RESERVED movement in `inventory_movements`

This is not automatic on order creation — it is an explicit admin action at order confirmation. The design specifically avoids automatic decrement on submission because:
- Customers submit inquiries, not confirmed purchase orders
- Many submissions may be speculative or duplicate
- The admin must evaluate and confirm before any physical allocation

This decision must be explicitly approved in ARCH-INV-02D before implementation.

---

## 11. Relationship to Public Visibility

### Unchanged rule

The public visibility rule remains:

```sql
WHERE status IN ('IN_STOCK', 'MADE_TO_ORDER') AND show_on_website = true
```

This lives on `artworks` and is enforced by `dbQueries.js`. No change to this rule is proposed.

### How physical_inventory informs but does not control visibility

Physical inventory state is an input to the admin's decision to publish, not a direct trigger.

| physical_inventory.status | Admin decision | artworks result |
|---|---|---|
| PENDING_SHIPMENT | Do nothing | Keep NEEDS_REVIEW + hidden |
| IN_TRANSIT | Do nothing | Keep NEEDS_REVIEW + hidden |
| RECEIVED | Admin reviews | Owner can now edit fields |
| INSPECTED | Admin approves | Admin sets IN_STOCK + show_on_website=true |
| AVAILABLE | (derived from above) | Artwork is now public |

The admin must always take an explicit action to publish. The system never auto-publishes based on inventory status.

### Proposed admin workflow integration (for ARCH-INV-02C detail)

When physical inventory status reaches INSPECTED or AVAILABLE, the admin panel could surface a "Ready to Publish" indicator on the Review Queue entry. This is a UX enhancement — it does not bypass the two-gate rule.

---

## 12. Relationship to SKU Generation

### SKU stays at the catalog/product level

**Recommendation: no change to current SKU design.**

| Question | Answer |
|---|---|
| SKU belongs to `artworks`? | Yes — one SKU per catalog product |
| SKU per physical piece? | No — artworks are identified by artwork.id; SKU is a business/customer-facing code |
| SKU per size variant? | No — SKU is product-level; size is tracked in artwork_sizes |
| SKU per order request line? | No — order_request_items snapshots the artwork's SKU at submission time |

The current `INV-SKU-01` implementation is correct and does not need to change for the physical inventory model. When a physical piece is inspected and the admin publishes the artwork (setting IN_STOCK + show_on_website=true), the existing SKU auto-generation logic in `server/skuUtils.js` fires at that point — no new integration with `physical_inventory` is needed.

### When does SKU generation interact with physical_inventory?

The only indirect interaction: when the admin promotes an artwork to IN_STOCK + show_on_website=true (the trigger for SKU generation), that same admin action should also update `physical_inventory.status` from INSPECTED → AVAILABLE. These are two parallel state changes that happen together in the admin workflow but remain in separate tables.

### Tradeoff: catalog-level vs piece-level SKU

A piece-level SKU (serial number per physical unit) would provide provenance and insurance traceability. This is appropriate for galleries and high-value art sales. For the current Chitrakala Arts use case (direct-to-customer handmade art with order request inquiry flow), catalog-level SKU is the correct choice. Piece-level serial numbers could be added to `physical_inventory` as an optional `piece_identifier` column in a future ticket if provenance tracking becomes needed.

---

## 13. How the 4 ISYNC-18 Artworks Would Be Represented

In the current production model, the 4 ISYNC-18 artworks are modeled as:
- `artworks`: 4 rows, `status=NEEDS_REVIEW`, `show_on_website=false`, `sku=null`
- Physical state: communicated via `notes` field text (workaround)

In the future model, the same situation would be represented as:

### artworks (unchanged)

| Field | Value |
|---|---|
| status | NEEDS_REVIEW |
| show_on_website | false |
| sku | null |
| notes | Internal notes (clear of pending-shipment text once shipment record exists) |

### shipments (new)

| Field | Value |
|---|---|
| reference_number | SHIP-2026-001 (or similar) |
| source_location | India - Artist Studio |
| destination_location | USA |
| status | PREPARING → SHIPPED → IN_TRANSIT → DELIVERED (as real events happen) |
| shipped_date | (null until shipped) |
| delivered_date | (null until received) |

### shipment_items (new — 4 rows)

| artwork_id | quantity | notes |
|---|---|---|
| art-1785182575357-0 (18" Round Warli Art) | 1 | |
| art-1785182575357-1 (10" Round Warli Art) | 1 | |
| art-1785182575357-2 (Decorative Tray 11") | 1 | |
| art-1785182575357-3 (3 Partition Square Box) | 1 | |

### physical_inventory (new — 4 rows)

| Field | Value |
|---|---|
| artwork_id | (respective artwork IDs) |
| artwork_size_id | null (no size variants on these artworks) |
| quantity | 1 |
| status | PENDING_SHIPMENT → IN_TRANSIT → RECEIVED → INSPECTED |
| shipment_id | FK → the SHIP-2026-001 shipments row |
| received_date | null (until received) |
| source | India - Artist Studio |

### Benefits of this representation

1. `artworks.notes` no longer needs to carry pending-shipment information — the shipment record is the authoritative source
2. Admin can see "this artwork has a pending shipment record" in the UI without parsing free text
3. Admin can update shipment status (SHIPPED → IN_TRANSIT → DELIVERED) as real events happen
4. When the shipment is DELIVERED, the UI can prompt the admin to inspect and publish
5. The ISYNC-18-07 workflow (publish one received artwork) has a formal trigger: physical_inventory.status transitions to INSPECTED

---

## 14. Data Model Diagram in Text Form

```
artworks
├── id (PK)
├── title, category, description, materials, dimensions
├── status: NEEDS_REVIEW | IN_STOCK | MADE_TO_ORDER | OUT_OF_STOCK | SOLD | ARCHIVED
├── show_on_website: bool
├── sku: nullable
├── price_inr: nullable, price_usd, fx_rate_used, multiplier_used
├── image_data, image_mime_type, image_filename, image
├── notes, featured, quantity (informational, deprecated later)
├── created_at, updatedAt
│
├── artwork_sizes (0..n per artwork)
│   ├── id (PK)
│   ├── artwork_id (FK)
│   ├── size_label
│   └── price: nullable (after INV-PRICE-01)
│
├── physical_inventory (0..n per artwork)
│   ├── id (PK)
│   ├── artwork_id (FK)
│   ├── artwork_size_id (FK, nullable)
│   ├── quantity, status, source
│   ├── shipment_id (FK, nullable)
│   ├── received_date, inspected_date
│   ├── condition_notes, notes
│   └── created_at, updated_at
│
└── order_request_items (0..n per artwork — via order_requests)
    ├── id (PK)
    ├── order_request_id (FK)
    ├── artwork_id (FK, SET NULL on delete)
    ├── artwork_size_id (FK, nullable, SET NULL on delete)
    ├── quantity, snapshot_* columns
    └── created_at

shipments
├── id (PK)
├── reference_number (unique)
├── source_location, destination_location
├── carrier, tracking_number
├── status: PREPARING | SHIPPED | IN_TRANSIT | CUSTOMS | DELIVERED | CANCELLED
├── expected_ship_date, shipped_date, delivered_date
├── notes, created_at, updated_at
│
└── shipment_items (1..n per shipment)
    ├── id (PK)
    ├── shipment_id (FK)
    ├── artwork_id (FK)
    ├── artwork_size_id (FK, nullable)
    ├── quantity, notes
    └── created_at

inventory_movements (append-only audit log)
├── id (PK)
├── physical_inventory_id (FK, nullable)
├── artwork_id (denormalized)
├── movement_type: CREATED | SHIPPED | RECEIVED | INSPECTED | PUBLISHED | RESERVED | RELEASED | SOLD | RETURNED | DAMAGED | ADJUSTED | ARCHIVED
├── quantity_change, reference_type, reference_id
├── notes, created_at, created_by
```

---

## 15. Recommended Table / Entity List

### New tables (not yet in production)

| Table | Priority | Depends on | Notes |
|---|---|---|---|
| `shipments` | High | None | Required for ISYNC-18-07 |
| `shipment_items` | High | `shipments` | Required for ISYNC-18-07 |
| `physical_inventory` | High | `shipments` | Required for ISYNC-18-07 |
| `inventory_movements` | Medium | `physical_inventory` | Defer to ARCH-INV-02D; not required for initial ISYNC-18-07 |

### Existing tables with proposed changes

| Table | Change | Priority | Ticket |
|---|---|---|---|
| `artwork_sizes` | Relax `price NOT NULL` to nullable | Medium | INV-PRICE-01 (existing) |
| `artworks` | Deprecate `quantity` column long-term | Low | Follow-up after `physical_inventory` populated |
| `artworks` | Separate public/admin field exposure | Low | Follow-up (Gap 5 from ARCH-INV-02A) |

### Tables with no proposed changes

| Table | Notes |
|---|---|
| `artworks` | No structural changes in this phase |
| `categories` | No changes |
| `order_requests` | No changes |
| `order_request_items` | No changes |
| `artwork_sizes` | Only `price NOT NULL` relaxation (separate ticket) |

---

## 16. Open Questions

**OQ-1 — Should physical_inventory be created at import time or at shipment creation time?**  
Option A: Create `physical_inventory` rows when the `shipments` record is created (pre-shipment, status=PENDING_SHIPMENT). Keeps a clear record that a physical unit is expected.  
Option B: Create `physical_inventory` rows only when a shipment is marked DELIVERED (at receipt). Simpler, but loses pre-shipment tracking.  
**Recommendation: Option A** — it directly solves the ISYNC-18 problem by creating a formal PENDING_SHIPMENT record.

**OQ-2 — Who creates the shipment record — the import workflow or a separate admin UI?**  
The inventory Apply endpoint currently creates catalog records only. Should it also create `shipments` and `shipment_items` rows? Or should admin create the shipment record separately in the admin panel?  
**Recommendation: separate admin workflow.** Shipment tracking is an operations concept; the import workflow should remain a catalog-creation operation. The admin creates the shipment record in a dedicated admin UI panel. ARCH-INV-02C should define this admin workflow.

**OQ-3 — What is the migration path for the 4 existing ISYNC-18 artworks?**  
Once `shipments` and `physical_inventory` tables are created, the 4 ISYNC-18 artworks will initially have no `physical_inventory` rows (because the tables didn't exist at import time). A one-time admin action or migration script should create their `physical_inventory` records retroactively.  
**Recommendation:** Provide a simple admin UI or one-time script as part of ARCH-INV-02C/E implementation. Do not automate this in a migration — the admin should confirm the shipment details.

**OQ-4 — How does physical_inventory handle Made-to-Order artworks?**  
MADE_TO_ORDER artworks are produced on commission — there may be no physical unit until the order is confirmed. Should `physical_inventory` rows exist for MADE_TO_ORDER artworks?  
**Recommendation:** `physical_inventory` rows are optional for MADE_TO_ORDER artworks. They can be created when a commission order is accepted and production begins. The current visibility rule (MADE_TO_ORDER + show_on_website=true) remains unchanged.

**OQ-5 — Should `order_request_items` eventually reference `physical_inventory`?**  
When a customer submits an order request for a specific IN_STOCK artwork, there is a physical piece. Should the item row eventually link to `physical_inventory.id`?  
**Recommendation: not in the current phase.** Order requests reference catalog records. Physical allocation happens at order confirmation (CONFIRMED), not at submission. Link to physical_inventory may be added to order_request_items in ARCH-INV-02D when the reservation design is finalized.

---

## 17. Risks / Tradeoffs

| Risk | Severity | Mitigation |
|---|---|---|
| Migrating 4 existing ISYNC-18 artworks to physical_inventory retroactively | Low | One-time admin action; catalog records remain unchanged |
| Two independent status systems (artworks.status + physical_inventory.status) risk getting out of sync | Medium | Admin workflow must update both; admin panel should show both statuses side by side. ARCH-INV-02C should design the UI to make this clear |
| artworks.quantity and physical_inventory.quantity could diverge | Low | artworks.quantity is already informational. Plan its deprecation explicitly before communicating removal |
| physical_inventory adds operational burden (admin must maintain records) | Medium | Deferred until MVP admin UI is built; do not require physical_inventory records for artworks that predate the feature |
| inventory_movements could grow very large over time | Low | Append-only, indexed on artwork_id and created_at. Acceptable at Chitrakala Arts scale |
| order_requests currently have no link to physical_inventory; ARCH-INV-02D may require a design change | Low | Explicitly deferred; order_request_items.artwork_id is the current link |
| MADE_TO_ORDER artworks with no physical unit have no physical_inventory rows — queries assuming a row exists will fail | Medium | All queries on physical_inventory must handle the case where no rows exist for a given artwork |

---

## 18. What Remains Unchanged for Now

The following items are explicitly out of scope for this design phase and remain as-is until separately approved:

| Item | Reason |
|---|---|
| `artworks` table schema (no new columns) | Catalog record is stable; changes wait for ARCH-INV-02C/E implementation approval |
| `artwork_sizes` NOT NULL constraint on price | INV-PRICE-01 scope (existing ticket) |
| `order_requests` / `order_request_items` | Inquiry records; correct as-is; reservation rules deferred to ARCH-INV-02D |
| SKU auto-generation logic in `skuUtils.js` | Correct at catalog level; no change needed |
| Two-gate public visibility rule | Correct; no change |
| `artworks.quantity` column | Informational for now; deprecation planned after physical_inventory is live |
| `inventory_movements` table creation | Deferred to ARCH-INV-02D |
| Any code or migration | Not implemented in this ticket |
| Production data | Not modified |

---

## 19. Recommended Next Subtask

**ARCH-INV-02C — Define Shipment/Receiving Lifecycle and Admin Workflow**

ARCH-INV-02C should:
1. Define the admin workflow for creating and managing shipment records
2. Define the step-by-step process for marking a shipment as received and marking individual artworks as inspected
3. Define how the admin panel surfaces physical inventory status alongside catalog status (Review Queue integration)
4. Define what admin UI changes are needed (new admin screen vs extension of Review Queue)
5. Define how the ISYNC-18-07 workflow (controlled single-artwork publish) integrates with the new shipment/receiving model
6. Define the "Ready to Publish" trigger condition and what the admin must confirm before publishing
7. Address OQ-2 (who creates the shipment record) and OQ-3 (retroactive ISYNC-18 migration) from this document

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
| server/.env committed | No |
| Secrets, private workbooks, ZIPs, temp scripts committed | No |
| ARCH-INV-02C started | No |
| WEB-CAT-02 started | No |
| ISYNC-18-07 started | No |
| ISYNC-19 started | No |
