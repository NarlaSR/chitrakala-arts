# ARCH-INV-02C — Shipment/Receiving Lifecycle and Admin Workflow

**Ticket:** ARCH-INV-02C — Define Shipment/Receiving Lifecycle and Admin Workflow  
**Branch:** `feature/ARCH-INV-02-planning`  
**Date:** 2026-07-28  
**Type:** Design/planning document — no code changes, no schema changes, no production data changes  
**Depends on:** ARCH-INV-02B (future data model, committed `a31aa72`)  
**Reference docs:** ARCH-INV-02A, ARCH-INV-02B, ISYNC-18-04, ISYNC-18-05, ISYNC-18-06

---

## 1. Purpose

This document defines:

1. The full shipment lifecycle from artwork creation in India through public publishing in the US.
2. The physical inventory lifecycle — the states a physical unit passes through.
3. The step-by-step admin/owner workflow for each lifecycle phase.
4. The clear boundary between *physical availability* (the business has a unit) and *public visibility* (the owner has chosen to publish it).
5. How the 4 current ISYNC-18 imported artworks would move through this lifecycle once the new system is built.
6. The future admin UI screens and actions needed to support this workflow.
7. Validation rules and safety guards.

This is a workflow and lifecycle design document. No code, migrations, or production changes are made here. The goal is an owner-reviewable operational playbook that implementation tickets (ARCH-INV-02E and beyond) can execute against.

---

## 2. Scope and Non-Scope

### In scope

- Shipment lifecycle states and transitions
- Physical inventory item states and transitions
- Admin workflow steps for each lifecycle phase
- Distinction between physical availability and public visibility
- ISYNC-18 artwork example
- Future admin UI needs
- Validation and safety rules

### Not in scope

- Order request reservation or decrement rules — see ARCH-INV-02D
- Schema migration SQL — see ARCH-INV-02E
- Application code changes — see implementation tickets
- INV-PRICE-01 (size-level Price on Request) — existing separate ticket
- WEB-CAT-02 (public category filter fix) — existing separate ticket
- ISYNC-18-07 (controlled publish workflow validation) — blocked on physical receipt of artworks
- SKU strategy changes — current SKU behavior unchanged

---

## 3. Relationship to ARCH-INV-02B

ARCH-INV-02B defined the future data model: four new entities (`shipments`, `shipment_items`, `physical_inventory`, `inventory_movements`) and the principle that `artworks.status` must not be overloaded with physical lifecycle states.

This document defines the *operational layer* on top of that data model: who does what, when, and why. It also refines the lifecycle state lists proposed in ARCH-INV-02B based on practical workflow analysis.

**Key data model decisions from ARCH-INV-02B that this document builds on:**

- `artworks` = catalog/product record. Status = catalog intent. Unchanged except for INV-PRICE-01.
- `artwork_sizes` = size/price variants. Unchanged except for price nullable (INV-PRICE-01).
- `physical_inventory` = tracks actual physical units per artwork (optionally per size).
- `shipments` + `shipment_items` = tracks batches of artworks traveling from India to US.
- `inventory_movements` = append-only audit log (deferred to ARCH-INV-02D/E).
- Two-gate public visibility rule unchanged: `status IN ('IN_STOCK','MADE_TO_ORDER') AND show_on_website = true`.
- Human admin decision is always the final publish gate — no automatic publishing.

---

## 4. Shipment Lifecycle Overview

A shipment record represents a batch of physical artworks traveling from a source location (India) to a destination (US). One shipment may contain multiple artworks.

### Shipment states

| State | Meaning | Who sets it |
|---|---|---|
| `DRAFT` | Shipment record created; items being listed; not ready to dispatch | Admin (system) |
| `READY_TO_SHIP` | All items packed and confirmed; ready to hand to carrier | Admin/owner |
| `SHIPPED` | Handed to carrier; carrier receipt or tracking number available | Admin/owner |
| `IN_TRANSIT` | In transit (optional intermediate state; may be skipped and combined with SHIPPED) | Admin/owner |
| `CUSTOMS` | Held at customs; awaiting clearance | Admin/owner |
| `RECEIVED` | Delivered to destination address; admin confirmed physical arrival | Admin/owner |
| `CLOSED` | All items processed (inspected, archived, or accounted for); shipment record administratively closed | Admin |
| `CANCELLED` | Shipment cancelled — may be before or after dispatch | Admin/owner |

### Allowed state transitions

```
DRAFT → READY_TO_SHIP → SHIPPED → IN_TRANSIT → CUSTOMS → RECEIVED → CLOSED
         ↑                ↓ (skip IN_TRANSIT/CUSTOMS for direct delivery)
         └─── CANCELLED ←─────────────────────────────────────────────────
```

Simplified happy path for India-to-US:

```
DRAFT → READY_TO_SHIP → SHIPPED → RECEIVED → CLOSED
```

With optional intermediates:

```
DRAFT → READY_TO_SHIP → SHIPPED → IN_TRANSIT → CUSTOMS → RECEIVED → CLOSED
```

### Key shipment data fields

| Field | When set | Notes |
|---|---|---|
| `reference_number` | At creation | e.g., `SHIP-2026-001`; unique; used in admin UI and notes |
| `source_location` | At creation | e.g., "India - Artist Studio, Ahmedabad" |
| `destination_location` | At creation | e.g., "USA" |
| `carrier` | At SHIPPED | e.g., "India Post", "FedEx International" |
| `tracking_number` | At SHIPPED | Optional but recommended |
| `expected_ship_date` | At DRAFT/READY | Estimated dispatch date |
| `shipped_date` | At SHIPPED | Actual date handed to carrier |
| `delivered_date` | At RECEIVED | Actual date received at destination |
| `notes` | Any time | Free-text admin notes; e.g., customs reference, damage notes |

### Notes on shipment states

**DRAFT vs READY_TO_SHIP:** DRAFT is the working state while the admin is compiling the shipment list. READY_TO_SHIP means the admin has reviewed and confirmed all items in the package — a checkpoint before marking it shipped. For very small businesses, these two states may be collapsed in the admin UI into a single "preparing" state if the distinction adds overhead without value.

**IN_TRANSIT vs SHIPPED:** For many India Post or FedEx International shipments, SHIPPED (handed to carrier) and IN_TRANSIT (confirmed in courier network) are effectively simultaneous. The admin UI may present these as a single "Mark as Shipped" action that sets both. `IN_TRANSIT` is retained as a distinct state for cases where dispatch and tracking confirmation happen hours apart.

**CUSTOMS:** India-to-US shipments routinely pass through customs. This state allows the admin to note customs holds without marking the shipment as stuck or cancelled. It is optional — if not needed, transition directly from `IN_TRANSIT` (or `SHIPPED`) to `RECEIVED`.

**RECEIVED vs CLOSED:** RECEIVED means the package arrived. CLOSED means all items in the shipment have been processed (inspected and marked AVAILABLE, DAMAGED, or ARCHIVED). The admin closes the shipment record after all items are resolved, providing a clean audit boundary. A shipment stays RECEIVED until all its `physical_inventory` items are no longer in a pending state.

---

## 5. Physical Inventory Lifecycle Overview

A `physical_inventory` record represents an actual physical unit of a specific artwork (and optionally a specific size variant). One row per artwork per shipment batch (with `quantity` for batch tracking). For unique handmade artworks, quantity is typically 1.

### Physical inventory item states

| State | Meaning | Transition trigger |
|---|---|---|
| `PENDING_SHIPMENT` | Catalog record exists; physical unit not yet dispatched from source | Created when physical_inventory row is first added |
| `IN_TRANSIT` | Shipment dispatched from source; unit in carrier network | Admin marks shipment SHIPPED |
| `RECEIVED` | Physical unit arrived at destination address | Admin marks shipment RECEIVED |
| `INSPECTION_REQUIRED` | Received; needs owner physical inspection before it can be made available | Optional intermediate; set during receive action or by admin |
| `INSPECTED` | Owner has physically reviewed the piece; confirmed it matches catalog data | Admin/owner marks inspection complete |
| `AVAILABLE` | Confirmed physically present and ready; owner has decided it can be published | Admin sets when approving for publication |
| `RESERVED` | Allocated to a confirmed customer order (future — ARCH-INV-02D scope) | Order confirmation |
| `SOLD` | Fulfilled and delivered to customer | Order fulfillment |
| `DAMAGED` | Damage recorded — at receipt, during inspection, or later | Admin notes damage |
| `RETURNED` | Returned after sale | Order return |
| `ARCHIVED` | Retired; no longer in active tracking | Admin archives |

### Allowed state transitions (happy path)

```
PENDING_SHIPMENT → IN_TRANSIT → RECEIVED → INSPECTION_REQUIRED → INSPECTED → AVAILABLE → SOLD
                                                                                         → RESERVED → SOLD
```

### Alternate paths

```
RECEIVED → DAMAGED (if damage discovered on receipt)
INSPECTED → DAMAGED (if damage discovered during inspection)
AVAILABLE → DAMAGED (if damage occurs after inspection but before sale)
SOLD → RETURNED → AVAILABLE (if customer returns item in good condition)
SOLD → RETURNED → DAMAGED (if customer returns damaged item)
Any state → ARCHIVED (admin manually retires item)
```

### Relationship between physical_inventory.status and shipments.status

| shipments.status | Effect on physical_inventory items |
|---|---|
| DRAFT / READY_TO_SHIP | physical_inventory items remain PENDING_SHIPMENT |
| SHIPPED | physical_inventory items move to IN_TRANSIT |
| IN_TRANSIT | physical_inventory items remain IN_TRANSIT |
| CUSTOMS | physical_inventory items remain IN_TRANSIT (or CUSTOMS if tracked separately) |
| RECEIVED | physical_inventory items move to RECEIVED |
| CLOSED | physical_inventory items are each individually in their final state (INSPECTED, AVAILABLE, DAMAGED, etc.) |
| CANCELLED | physical_inventory items move back to PENDING_SHIPMENT (or ARCHIVED if cancelled mid-transit) |

**Important:** Status transitions on `physical_inventory` items are driven by admin actions on the shipment, but they remain independent rows. The admin can mark individual items as DAMAGED or INSPECTION_REQUIRED even while the rest of the shipment proceeds normally.

### Notes on physical inventory states

**RECEIVED vs INSPECTION_REQUIRED:** For most small shipments, the admin will immediately mark items for inspection upon receipt. These two states can be presented as a single "received — needs inspection" state in the UI. RECEIVED is the timestamp state (when did it arrive?) and INSPECTION_REQUIRED makes explicit that no item should move to AVAILABLE without a deliberate inspect action.

**INSPECTED vs AVAILABLE:** INSPECTED means the owner has physically checked the piece. AVAILABLE means the admin/owner has made a business decision that this item is ready for publishing and potential customer ordering. In many cases these happen together. The implementation may choose to treat them as a single state or as two steps. This document recommends keeping them separate so the audit record shows both events: when was it inspected, and when was it cleared for sale.

**AVAILABLE vs artworks.status = IN_STOCK:** These are parallel and independent. See Section 10 for the full treatment.

**RESERVED / SOLD:** These states are only relevant after ARCH-INV-02D defines the order reservation model. They are listed here for completeness but are not used in the current admin workflow.

---

## 6. Admin Workflow: Before Shipment

This phase covers everything that happens from the moment an artwork is identified in India through to the moment the physical package is handed to a carrier.

### Step B1 — Identify artworks for import

The owner or artist identifies artworks to be included in the next shipment. Photographs are taken. Dimensions, materials, and prices are determined.

**Who:** Owner / artist in India  
**Tools:** Workbook (Excel/Google Sheets), photographs  
**Output:** A source workbook row per artwork with title, category, price INR, dimensions, materials, description, image filename

### Step B2 — Import catalog records

Using the existing Inventory Import workflow (Preview + Apply), catalog records are created in the `artworks` table.

**State after import:**
- `artworks.status = NEEDS_REVIEW`
- `artworks.show_on_website = false`
- `artworks.sku = null`
- Artwork is hidden from all public APIs

**Important:** Catalog records are created before physical items arrive. This is intentional. The import pipeline produces a draft catalog record, not a published product.

**What does NOT happen at import time:**
- No `physical_inventory` row is created (if the system isn't live yet)
- No shipment record is created
- No SKU is generated
- No public visibility change

**Transition in future system:** Once `shipments` and `physical_inventory` tables are live, the Apply workflow or a post-Apply admin action would optionally create `physical_inventory` rows for the newly imported artworks with `status=PENDING_SHIPMENT`.

### Step B3 — Create shipment record

The admin creates a `shipments` record in the admin panel.

| Field | Action |
|---|---|
| reference_number | Enter a human-readable reference (e.g., `SHIP-2026-001`) |
| source_location | Enter source (e.g., "India - Artist Studio, Ahmedabad") |
| destination_location | Enter destination (e.g., "USA") |
| expected_ship_date | Estimate when package will be dispatched |
| status | Starts as `DRAFT` |
| carrier, tracking_number | Leave blank until shipment is dispatched |

### Step B4 — Attach artworks to shipment

The admin adds the relevant artworks to the shipment using the `shipment_items` table.

**Action:** On the shipment detail page, add items:
- Select artwork from list (filtered to NEEDS_REVIEW artworks)
- If the artwork has size variants, select which size is being shipped
- Enter quantity (typically 1 for unique handmade pieces)

**Effect:** Creates `shipment_items` rows. In the future system, this may also auto-create `physical_inventory` rows at `PENDING_SHIPMENT`.

### Step B5 — Review checklist before marking Ready to Ship

Before marking the shipment `READY_TO_SHIP`, the admin should verify:

| Check | Why |
|---|---|
| All artworks added to shipment | Prevents missing items |
| Catalog data (title, category, price, image) confirmed correct | Images and prices may need update before publication |
| No artwork is already IN_STOCK or show_on_website=true | Guards against accidental publish |
| All physical_inventory items at PENDING_SHIPMENT | Confirms no duplicate tracking |

### Step B6 — Mark shipment READY_TO_SHIP

Admin action on the shipment detail page. No artwork data changes.

**Effect:** `shipments.status = READY_TO_SHIP`. Signals that the package contents are confirmed and the shipment is pending dispatch.

---

## 7. Admin Workflow: During Shipment

This phase covers the period from when the physical package is handed to a carrier until it arrives at the US destination.

### Step S1 — Mark shipment SHIPPED

When the owner in India hands the package to the carrier:

| Field | Action |
|---|---|
| status | Set to `SHIPPED` |
| shipped_date | Set to actual dispatch date |
| carrier | Enter carrier name (e.g., "India Post", "FedEx International Priority") |
| tracking_number | Enter tracking number if available |

**Effect on physical_inventory:** All `physical_inventory` items in this shipment move from `PENDING_SHIPMENT` to `IN_TRANSIT`.

**Effect on artworks:** None. `artworks.status` and `show_on_website` are unchanged. No artwork becomes public.

### Step S2 — Update tracking notes (optional)

During transit the admin may update:
- `shipments.tracking_number` if obtained after dispatch
- `shipments.notes` with transit updates, customs reference numbers, or delays
- `shipments.status` to `IN_TRANSIT` or `CUSTOMS` if tracking shows meaningful state changes

**No artwork data changes occur during this phase.** The admin is only updating the shipment record.

### Step S3 — Handle customs hold (if applicable)

If the shipment enters a customs hold:

| Action | Field |
|---|---|
| Set shipments.status to CUSTOMS | `status = CUSTOMS` |
| Note customs reference number | `notes` field |
| Note expected clearance date | `notes` field |

Physical inventory items remain `IN_TRANSIT`. No artwork changes.

### Step S4 — While in transit: no artwork changes

**The following actions must NOT happen while a shipment is in transit:**

- Do not set any `artworks.status` to `IN_STOCK` or `MADE_TO_ORDER`
- Do not set `show_on_website = true` on any in-transit artwork
- Do not generate SKUs (SKU generation is gated by the visibility rule and does not apply to NEEDS_REVIEW artworks)
- Do not process order requests against in-transit inventory

The in-transit period is a waiting period. No catalog or visibility changes occur.

---

## 8. Admin Workflow: Receiving and Inspection

This phase begins when the physical package arrives at the US destination and ends when each item is either confirmed good (INSPECTED) or noted as damaged (DAMAGED).

### Step R1 — Mark shipment RECEIVED

When the package arrives at the destination:

| Field | Action |
|---|---|
| status | Set to `RECEIVED` |
| delivered_date | Set to actual arrival date |
| notes | Note any visible damage to package exterior before opening |

**Effect on physical_inventory:** All items in the shipment that are `IN_TRANSIT` move to `RECEIVED`. `received_date` is set on each row.

**No artwork data changes occur at this step.**

### Step R2 — Physical unboxing and initial check

Before editing any records, the owner/admin should physically:

1. Count items received — confirm count matches `shipment_items` quantity
2. Photograph received items for reference
3. Compare received items to catalog records (does each item visually match its artwork photo?)
4. Note any visible damage to individual items

If any item is damaged or missing:
- Set `physical_inventory.status = DAMAGED` for the damaged item
- Update `physical_inventory.condition_notes` with description of damage
- Do not proceed to INSPECTION_REQUIRED for damaged items
- Note in `shipments.notes`

### Step R3 — Mark items for inspection

For each received item that appears undamaged:

**Action:** On the physical inventory detail for that item, set status to `INSPECTION_REQUIRED`.

**Effect:** The item is flagged for formal owner review. No artwork changes.

### Step R4 — Owner inspection of each item

The owner physically inspects each artwork:

| Inspection check | Questions to answer |
|---|---|
| Visual match | Does the physical piece match the catalog photo? |
| Condition | Any defects, scratches, damage not visible at unboxing? |
| Materials | Do the actual materials match what should be in the `materials` field? |
| Dimensions | Do the actual dimensions match or refine what's in the `dimensions` field? |
| Description accuracy | Is the catalog description accurate and suitable for a customer? |
| Price confirmation | Is the price reasonable given the actual quality and size? |

**Admin actions during inspection:**

1. Update `artwork.materials` if blank or incorrect (Admin panel → Edit Artwork)
2. Update `artwork.dimensions` if needed (Admin panel → Edit Artwork)
3. Update `artwork.description` with accurate public-facing copy (Admin panel → Edit Artwork)
4. Update `artwork.notes` to reflect post-receipt status (clear the "Pending shipment from India" note once received)
5. Confirm or update `artwork.price_inr` (if price needs revision based on actual item)

**Constraint:** While doing these edits, `status` must remain `NEEDS_REVIEW` and `show_on_website` must remain `false`. The owner is editing catalog data, not publishing.

**After all checks pass:**

Admin sets `physical_inventory.status = INSPECTED`, with `inspected_date = today`.

### Step R5 — Resolution for each item

| Item condition after inspection | Action |
|---|---|
| Good condition, all fields verified | Set physical_inventory.status = INSPECTED |
| Minor cosmetic defects acceptable | Set physical_inventory.status = INSPECTED; note in condition_notes |
| Significant damage | Set physical_inventory.status = DAMAGED; do not proceed to AVAILABLE or publish |
| Image does not match physical item | Do not proceed; contact artist; do not publish until image is corrected |
| Price needs revision | Update artwork.price_inr via admin panel (recalculates price_usd); do not publish yet |

---

## 9. Admin Workflow: Ready for Publishing

This phase begins when an item is `INSPECTED` and ends when the artwork is live on the public website.

### Step P1 — Pre-publish checklist

Before setting any artwork to public, the owner should confirm:

| Check | Field | Requirement |
|---|---|---|
| Title is accurate and customer-ready | artworks.title | Clear, clean, no "import sourcing" text |
| Category is correct | artworks.category | Correct category; determines nav/filtering |
| Materials completed | artworks.materials | Must not be blank for public artworks |
| Dimensions completed | artworks.dimensions | Must not be blank; use standardized format |
| Description is public-facing copy | artworks.description | Replace import sourcing notes with customer-facing text |
| Price confirmed | artworks.price_inr / price_usd | Verify price is correct; recalculate if needed |
| Image matches physical item | artworks.image | Confirmed during Step R4 |
| Physical inventory inspected | physical_inventory.status | Must be INSPECTED or AVAILABLE |
| No damaged status | physical_inventory.status | Must not be DAMAGED |

If all checks pass: the owner is ready to publish.

### Step P2 — Mark physical inventory AVAILABLE

**Admin action:** Set `physical_inventory.status = AVAILABLE`.

This is a business decision: "the physical unit is confirmed good and we intend to offer it for sale." It does not publish the artwork. It gives the admin a clear checkpoint between "inspected" and "live."

Note: In the admin UI, INSPECTED and AVAILABLE may be combined into a single "Approve for Publishing" action if the distinction adds overhead. The important thing is that the admin makes an explicit decision before proceeding.

### Step P3 — Publish the artwork (owner decision)

**Admin action:**
1. Open artwork in admin panel
2. Set `artworks.status = IN_STOCK` (or `MADE_TO_ORDER` if appropriate)
3. Set `artworks.show_on_website = true`
4. Save

**System effect:**
- SKU is auto-generated by `server/skuUtils.js` `maybeGenerateSku()` (only fires when status is IN_STOCK or MADE_TO_ORDER AND show_on_website=true AND sku is null)
- Artwork appears in `GET /api/artworks` (public API) immediately
- Artwork becomes orderable via `POST /api/order-requests`

**No change to physical_inventory happens automatically on publish.** The admin may update physical_inventory.status to AVAILABLE (if not already done in Step P2) as a parallel action.

### Step P4 — Post-publish validation

After publishing, the admin should confirm:

| Check | Expected result |
|---|---|
| `GET /api/artworks` public count | Increased by 1 |
| New artwork appears in response | Present with correct title, price, image |
| SKU generated | artwork.sku is not null |
| Other hidden artworks unchanged | Public count increased by exactly 1 |
| Category appears publicly if new | If this is the first artwork in warli-art or mixed-art, the category now has public artworks |

**This step is the same as the ISYNC-18-07 publish workflow validation** — it should be formalized as a runbook when ISYNC-18-07 is executed.

---

## 10. Difference Between Physical Availability and Public Visibility

This is the most important conceptual distinction in this document. It must be clearly understood before implementation or operation.

### Two independent dimensions

| Dimension | What it means | Where it lives |
|---|---|---|
| Physical availability | The business physically has a unit of this artwork that can be fulfilled | `physical_inventory.status = AVAILABLE` |
| Public visibility | The owner has approved this catalog listing to appear on the website | `artworks.status IN ('IN_STOCK','MADE_TO_ORDER') AND artworks.show_on_website = true` |

### These are not the same thing

| Scenario | physical_inventory.status | artworks.status + show_on_website | Correct? |
|---|---|---|---|
| Artwork imported, not shipped | PENDING_SHIPMENT | NEEDS_REVIEW + false | ✓ Normal state for pending-shipment artworks |
| Artwork in transit | IN_TRANSIT | NEEDS_REVIEW + false | ✓ Not ready for any action |
| Artwork received, not yet inspected | RECEIVED | NEEDS_REVIEW + false | ✓ Awaiting owner review |
| Artwork inspected, not yet published | INSPECTED or AVAILABLE | NEEDS_REVIEW + false | ✓ Owner has not approved publishing yet |
| Artwork inspected and published | AVAILABLE | IN_STOCK + true | ✓ Normal published state |
| Artwork published but physically lost | AVAILABLE (stale) | IN_STOCK + true | ✗ Needs manual correction |
| Artwork not yet received but published | PENDING_SHIPMENT | IN_STOCK + true | ✗ Should be prevented by validation |

### The public visibility rule does not change

The two-gate public visibility rule from ARCH-INV-01 remains exactly as designed:

```sql
WHERE artworks.status IN ('IN_STOCK', 'MADE_TO_ORDER') AND artworks.show_on_website = true
```

**Physical inventory status never directly controls public visibility.** An artwork with `physical_inventory.status = AVAILABLE` but `artworks.show_on_website = false` is NOT public. An artwork with `physical_inventory.status = PENDING_SHIPMENT` but `artworks.status = IN_STOCK AND show_on_website = true` IS public — and this should be prevented by the validation rule (see Section 13).

### The owner makes the publish decision

Physical availability is a prerequisite for publishing, but not a trigger for it. The sequence must always be:

1. Physical unit received
2. Physical unit inspected and confirmed
3. **Owner decides** to publish → sets status + show_on_website
4. System applies SKU generation and public API exposure

The system does not auto-publish based on physical inventory status. The owner's explicit action (Step 3) is always required.

### Why this separation matters

- The owner may choose not to publish a received artwork immediately (waiting for better photography, seasonal timing, price review)
- The owner may choose to take a published artwork offline without it being returned or lost (temporary unlisting)
- A MADE_TO_ORDER artwork may have no physical unit yet — it doesn't need one to be orderable
- Future: multiple artworks may have physical units arriving simultaneously; the owner wants to control which ones go live and when

---

## 11. ISYNC-18 Four-Artwork Example

This section traces the 4 imported artworks from their current state through the full future lifecycle.

### Current production state (as of 2026-07-27)

| Artwork | ID | Status | show_on_website | SKU | Notes |
|---|---|---|---|---|---|
| 18" Round Warli Art | `art-1785182575357-0` | NEEDS_REVIEW | false | null | Import sourcing note; needs "Pending shipment" note |
| 10" Round Warli Art | `art-1785182575357-1` | NEEDS_REVIEW | false | null | Import sourcing note; needs "Pending shipment" note |
| Decorative Tray 11" | `art-1785182575357-2` | NEEDS_REVIEW | false | null | Import sourcing note; needs "Pending shipment" note |
| 3 Partition Square Box with Handle | `art-1785182575357-3` | NEEDS_REVIEW | false | null | Import sourcing note; needs "Pending shipment" note |

**Missing fields as documented in ISYNC-18-05:**
- Materials: blank on all 4
- Dimensions: blank on Row 4 (3 Partition Square Box)
- Description: verbose import sourcing notes; needs public-facing copy
- Notes: contains import sourcing notes; should say "Pending shipment from India..."

No `shipments`, `shipment_items`, or `physical_inventory` rows exist (tables don't exist yet).

### Future lifecycle: step-by-step

#### Phase 0 — After tables are created (ARCH-INV-02E implementation)

Once `shipments`, `shipment_items`, and `physical_inventory` tables exist in production:

**Admin action (one-time retroactive setup):**
1. Create `shipments` row: `SHIP-2026-001`, source=India, destination=USA, status=DRAFT
2. Add 4 `shipment_items` rows (one per artwork, quantity=1, no size variant)
3. Create 4 `physical_inventory` rows: status=PENDING_SHIPMENT, shipment_id=SHIP-2026-001

| physical_inventory row | artwork_id | status | notes |
|---|---|---|---|
| Row 1 | art-1785182575357-0 | PENDING_SHIPMENT | Source: India - Artist Studio |
| Row 2 | art-1785182575357-1 | PENDING_SHIPMENT | Source: India - Artist Studio |
| Row 3 | art-1785182575357-2 | PENDING_SHIPMENT | Source: India - Artist Studio |
| Row 4 | art-1785182575357-3 | PENDING_SHIPMENT | Source: India - Artist Studio |

**artworks records:** Unchanged. All 4 remain NEEDS_REVIEW + show_on_website=false.

**artworks.notes:** Owner should update to "Pending shipment from India. Do not publish until received, inspected, and all fields reviewed by owner." (This was recommended in ISYNC-18-05 and ISYNC-18-06.)

#### Phase 1 — Before shipment (PENDING_SHIPMENT)

Owner in India confirms all 4 items are packed and ready.

**Admin action:**
- Update `shipments.status = READY_TO_SHIP`
- Confirm `shipment_items` match the physical package contents

**artworks:** No changes.  
**physical_inventory:** All 4 rows remain PENDING_SHIPMENT.  
**Public visibility:** Unchanged — all 4 artworks hidden.

#### Phase 2 — Shipment dispatched (SHIPPED / IN_TRANSIT)

Owner hands the package to carrier (e.g., India Post or FedEx).

**Admin action:**
- `shipments.status = SHIPPED`
- `shipments.shipped_date = [actual dispatch date]`
- `shipments.carrier = "India Post"` (or relevant carrier)
- `shipments.tracking_number = [number if available]`

**physical_inventory effect:** All 4 rows → `IN_TRANSIT`.

**artworks:** No changes. All 4 remain NEEDS_REVIEW + show_on_website=false.  
**Public visibility:** Unchanged.

If the admin receives a CUSTOMS notification:
- `shipments.status = CUSTOMS`
- Note customs reference in `shipments.notes`

#### Phase 3 — Shipment received in US (RECEIVED)

Package arrives at US destination.

**Admin action:**
- `shipments.status = RECEIVED`
- `shipments.delivered_date = [actual arrival date]`
- Visually inspect the package before opening; note external damage if any in `shipments.notes`

**physical_inventory effect:** All 4 rows → `RECEIVED`. `received_date` set on each.

**artworks:** No changes.  
**Public visibility:** Unchanged.

#### Phase 4 — Individual item inspection (INSPECTION_REQUIRED → INSPECTED)

Owner physically inspects each of the 4 artworks.

**For each artwork:**

1. Set `physical_inventory.status = INSPECTION_REQUIRED`
2. Owner compares physical item to admin panel catalog record
3. Owner fills in missing/incorrect fields via admin panel:
   - Add `materials` on all 4 (currently blank)
   - Add/confirm `dimensions` on Row 4 (3 Partition Square Box) and standardize on Rows 1–3
   - Replace `description` with public-facing copy on all 4
   - Update `notes` to reflect post-receipt status on all 4
4. Owner confirms image matches the physical piece
5. Set `physical_inventory.status = INSPECTED`; set `inspected_date`

**artworks.status:** Still NEEDS_REVIEW on all 4.  
**show_on_website:** Still false on all 4.  
**Public visibility:** Unchanged.

**If any item is damaged:** Set `physical_inventory.status = DAMAGED`; record details in `condition_notes`. Do not proceed to INSPECTED or publishing for that item. Consult with artist.

#### Phase 5 — Owner approves for publishing (AVAILABLE → Publish)

This phase happens one artwork at a time, following the ISYNC-18-07 controlled publish workflow.

**For the first artwork to be published (owner chooses which one):**

1. Admin sets `physical_inventory.status = AVAILABLE`
2. Owner opens artwork in admin panel
3. Owner completes final pre-publish checklist (Section 9, Step P1)
4. Owner sets `artworks.status = IN_STOCK` and `show_on_website = true`
5. System auto-generates SKU
6. Admin validates: artwork appears in public API, SKU is set, no other hidden artworks became public

**For subsequent artworks:** Repeat for each one independently. The owner decides the order and timing.

#### Completed state (all 4 published)

| Artwork | physical_inventory.status | artworks.status | show_on_website | SKU |
|---|---|---|---|---|
| 18" Round Warli Art | AVAILABLE | IN_STOCK | true | CKS-2026-WA-NNNNN |
| 10" Round Warli Art | AVAILABLE | IN_STOCK | true | CKS-2026-WA-NNNNN |
| Decorative Tray 11" | AVAILABLE | MADE_TO_ORDER or IN_STOCK | true | CKS-2026-MA-NNNNN |
| 3 Partition Square Box | AVAILABLE | MADE_TO_ORDER or IN_STOCK | true | CKS-2026-TA-NNNNN |

warli-art category becomes publicly visible for the first time.

#### State if a shipment is delayed indefinitely

If the shipment never arrives or is cancelled:
- `shipments.status = CANCELLED`
- `physical_inventory.status = ARCHIVED` (for cancelled units that will not arrive)
- `artworks.status` remains NEEDS_REVIEW; `show_on_website` remains false
- Owner decides whether to keep catalog records for future import or request admin deletion

---

## 12. Future Admin UI Needs

This section documents the admin panel screens and actions required to support the shipment/receiving workflow. These are requirements for the ARCH-INV-02E implementation ticket, not design specifications.

### New admin screens

| Screen | Purpose |
|---|---|
| **Shipment List** | List all shipments with status, reference number, item count, shipped date, delivered date. Filter by status. |
| **Create Shipment** | Form to create a new shipment record (reference, source, destination, expected ship date). |
| **Shipment Detail** | View shipment header, status, tracking, items, and action buttons. |
| **Physical Inventory List** | Admin view of all physical_inventory rows, filterable by status (PENDING_SHIPMENT, IN_TRANSIT, RECEIVED, etc.) and artwork. |

### New admin actions (on existing screens or new screens)

| Action | Trigger | Effect |
|---|---|---|
| **Mark Shipment READY_TO_SHIP** | Button on shipment detail | shipments.status → READY_TO_SHIP |
| **Mark Shipment SHIPPED** | Button on shipment detail; prompts for carrier + tracking + date | shipments.status → SHIPPED; all items → IN_TRANSIT; shipped_date set |
| **Mark Shipment RECEIVED** | Button on shipment detail; prompts for delivered_date | shipments.status → RECEIVED; all items → RECEIVED; received_date set |
| **Mark Item Inspected** | Button per physical_inventory item on shipment detail or artwork detail | physical_inventory.status → INSPECTED; inspected_date set |
| **Mark Item Damaged** | Button per physical_inventory item | physical_inventory.status → DAMAGED; prompts for condition_notes |
| **Mark Item Available** | Button per physical_inventory item (after INSPECTED) | physical_inventory.status → AVAILABLE |
| **Close Shipment** | Button on shipment detail (only enabled when all items resolved) | shipments.status → CLOSED |
| **Add Artwork to Shipment** | On shipment detail, add an artwork + size to shipment_items | Creates shipment_item row |

### Enhancements to existing admin screens

| Existing screen | Enhancement |
|---|---|
| **Artwork list / Review Queue** | Add physical inventory status badge per artwork: "No inventory", "Pending Shipment", "In Transit", "Received", "Inspected", "Available" |
| **Artwork detail / Edit page** | Add section: "Physical Inventory" — list of physical_inventory rows for this artwork (status, received_date, shipment reference) |
| **Artwork detail / Edit page** | Add warning if attempting to set status=IN_STOCK or show_on_website=true when no physical_inventory row is INSPECTED or AVAILABLE (see Section 13) |
| **Artwork detail / Edit page** | Link from artwork to its shipment record |

### Nice-to-have future enhancements (not required for initial implementation)

| Enhancement | Notes |
|---|---|
| Email/notification when shipment marked RECEIVED | Prompt owner to begin inspection |
| Shipment item count vs. expected count validation at receipt | Flags discrepancy if received count differs from shipment_items total |
| Inventory_movements log view | Per-artwork timeline of all physical lifecycle events |
| Bulk inspect action | Mark all items in a shipment INSPECTED at once |

---

## 13. Validation and Safety Rules

### Rule V1 — Do not publish IN_STOCK artwork with no AVAILABLE physical inventory

**Rule:** When an admin attempts to set `artworks.status = IN_STOCK` (or `MADE_TO_ORDER`) while `show_on_website = true`, and there are no `physical_inventory` rows for this artwork with `status IN ('INSPECTED', 'AVAILABLE')`, the admin panel should:
- Show a warning: "No inspected physical inventory found for this artwork."
- Require explicit owner confirmation to proceed (override checkbox/button)
- Log the override in `artworks.notes` or `inventory_movements`

**Exception for MADE_TO_ORDER:** MADE_TO_ORDER artworks may not have a physical unit (they are produced on commission). The validation warning should be suppressed or modified for MADE_TO_ORDER — "No physical inventory on file. This is a made-to-order item — confirm this is correct."

**When this rule applies:** Only when physical_inventory tables are live and populated. During a transition period, artworks may have no physical_inventory rows simply because the tables are new. The override mechanism handles this.

### Rule V2 — received_date must not be before shipped_date

**Rule:** If `shipments.shipped_date` is set, `shipments.delivered_date` must be ≥ `shipped_date`. The admin panel should validate this on the Mark Received action.

### Rule V3 — Cannot mark item INSPECTED if not RECEIVED

**Rule:** `physical_inventory.status` must be `RECEIVED` or `INSPECTION_REQUIRED` before it can be set to `INSPECTED`. The admin panel should not show the Inspect action for items that are not yet RECEIVED.

### Rule V4 — Cannot mark item AVAILABLE if not INSPECTED

**Rule:** `physical_inventory.status` must be `INSPECTED` before it can be set to `AVAILABLE`. Prevents skipping the inspection step.

### Rule V5 — DAMAGED items cannot move to AVAILABLE without override

**Rule:** A `physical_inventory` item with `status = DAMAGED` cannot be set to `AVAILABLE` without explicit owner confirmation. The admin panel should prompt: "This item is marked DAMAGED. Confirm you want to make it available."

### Rule V6 — Order requests do not touch physical_inventory (current scope)

**Rule:** `POST /api/order-requests` does not interact with `physical_inventory` in any way. Order requests remain inquiry records only. This rule is not relaxed until ARCH-INV-02D defines the reservation model and an implementation ticket executes it.

### Rule V7 — SKU generation is not triggered by physical inventory changes

**Rule:** `server/skuUtils.js maybeGenerateSku()` is only triggered when an artwork is saved with `status IN ('IN_STOCK', 'MADE_TO_ORDER') AND show_on_website = true AND sku IS NULL`. Changes to `physical_inventory.status` do not trigger SKU generation. This is unchanged from current behavior.

### Rule V8 — No auto-publishing from physical inventory status

**Rule:** No system action (receiving a shipment, marking an item INSPECTED, marking AVAILABLE) automatically sets `artworks.status` or `artworks.show_on_website`. The admin/owner must perform this as a separate, explicit action.

### Rule V9 — Condition notes required for DAMAGED status

**Rule:** When setting `physical_inventory.status = DAMAGED`, `condition_notes` must not be empty. The admin panel should require a brief description of the damage before allowing the status change.

### Rule V10 — Prevent retroactive shipped_date before created_at

**Rule:** `shipments.shipped_date` must not be set to a date before the `shipments.created_at` timestamp. Server-side validation at update time.

---

## 14. What Remains Unchanged for Now

The following items are explicitly outside the scope of this design phase and remain as-is until separately approved:

| Item | Current behavior | Change? |
|---|---|---|
| `artworks.status` values | NEEDS_REVIEW, IN_STOCK, MADE_TO_ORDER, OUT_OF_STOCK, SOLD, ARCHIVED | No new values |
| Public visibility rule | `status IN ('IN_STOCK','MADE_TO_ORDER') AND show_on_website=true` | Unchanged |
| `POST /api/order-requests` | Inquiry record; no inventory decrement | Unchanged; reservation deferred to ARCH-INV-02D |
| `order_requests`, `order_request_items` | No changes | No changes |
| SKU auto-generation logic in `skuUtils.js` | Fires on IN_STOCK/MADE_TO_ORDER + show_on_website=true + sku IS NULL | Unchanged |
| `artwork_sizes` price NOT NULL | Still NOT NULL | Relaxation deferred to INV-PRICE-01 |
| `artworks.quantity` field | Informational; not used in business logic | Unchanged; deprecation deferred |
| Admin panel publish workflow | Owner manually sets status + show_on_website | Unchanged; new validation warning added in future (Rule V1) |
| The 4 ISYNC-18 artworks | NEEDS_REVIEW + hidden + sku=null | Unchanged until ISYNC-18-07 |
| Inventory Apply endpoint | Creates catalog records only | No change; physical_inventory creation is a separate action |
| Admin auth / JWT | Unchanged | No change |

---

## 15. Open Questions

**OQ-1 — Who creates the shipment record: admin panel or the import workflow?**  
The current Inventory Apply endpoint creates catalog records only. Should a future version of Apply optionally create a linked shipment record and `physical_inventory` rows? Or should shipment creation always be a separate admin action?  
**Recommendation:** Keep Apply as a catalog-creation operation. Shipment creation is a separate admin action. The decoupling keeps the import pipeline focused and allows the owner to create shipments independently of the import schedule.

**OQ-2 — How should the retroactive ISYNC-18 setup be handled?**  
Once `shipments` and `physical_inventory` tables exist, the 4 ISYNC-18 artworks will need `physical_inventory` rows created retroactively. This cannot be done by a migration (migrations don't know which shipment reference number to use). Should this be handled by:
- (A) A one-time admin UI action ("Attach to shipment"), or
- (B) A seed/data script run by the admin after tables are created?  
**Recommendation:** Option A. Provide the "Add Artwork to Shipment" action in the admin UI. Admin creates SHIP-2026-001, adds the 4 artworks, and the system creates the `physical_inventory` rows. No scripts needed.

**OQ-3 — Should INSPECTION_REQUIRED be a separate state or merged with RECEIVED?**  
The distinction between RECEIVED and INSPECTION_REQUIRED is subtle. In practice, every received item needs inspection.  
**Recommendation:** In the data model, retain both. In the admin UI, "Mark Shipment Received" can set all items to INSPECTION_REQUIRED (not RECEIVED) in a single action, skipping the intermediate state in UX while keeping it in the schema for audit purposes.

**OQ-4 — Should AVAILABLE be a separate state from INSPECTED?**  
The distinction is: INSPECTED = owner checked the piece; AVAILABLE = owner approved it for publishing. These may happen simultaneously.  
**Recommendation:** Keep both states in the schema. In the admin UI, the "Inspect and Approve" action can set status directly to AVAILABLE (skipping the intermediate INSPECTED in UX). This preserves audit flexibility while reducing operational overhead.

**OQ-5 — How should MADE_TO_ORDER artworks interact with physical_inventory?**  
MADE_TO_ORDER artworks (produced on commission) may have no physical unit until an order is confirmed and produced.  
**Recommendation:** `physical_inventory` rows are optional for MADE_TO_ORDER artworks. Rule V1 (publish warning) should be modified: for MADE_TO_ORDER, the warning message should say "This is a made-to-order item — no physical inventory required. Confirm?" rather than blocking the publish.

**OQ-6 — How should a shipment with partially received items be handled?**  
If a shipment of 4 items arrives but only 3 are physically present (1 missing), how should the admin handle:
- The 3 received items (proceed to inspect)
- The 1 missing item (DAMAGED? Create a new shipment for the re-sent replacement?)  
**Recommendation:** Admin marks the missing item's `physical_inventory.status = DAMAGED` with condition_notes "Not received in shipment." If a replacement is sent, create a new `shipments` record for the replacement. Document this in the admin UI help text.

**OQ-7 — At what point should artworks.notes be cleared of the "Pending shipment from India" message?**  
**Recommendation:** When the physical_inventory row for that artwork moves to RECEIVED, the admin should update `artworks.notes` to reflect the new state ("Received; pending inspection"). This is a manual action — no automatic note clearing.

---

## 16. Risks / Tradeoffs

| Risk | Severity | Mitigation |
|---|---|---|
| Two status systems (artworks.status and physical_inventory.status) getting out of sync | Medium | Admin panel shows both statuses side by side; validation Rule V1 warns on mismatch at publish time |
| Owner forgets to update physical_inventory when artwork is sold | Low | Future: ARCH-INV-02D order confirmation should update physical_inventory |
| Admin creates physical_inventory row for wrong artwork_id | Low | Dropdown selection from artworks in UI; artwork_id FK enforced in DB |
| MADE_TO_ORDER artworks cause false positives in Rule V1 | Low | Rule V1 modified for MADE_TO_ORDER case (OQ-5) |
| Shipment record created but not linked to artworks (orphan shipment) | Low | Validation: cannot close a shipment until all shipment_items have resolved physical_inventory status |
| Physical unit received but catalog record has wrong price; artwork published with wrong price | Medium | Pre-publish checklist (Step P1) requires owner to confirm price; owner controls publish timing |
| Four ISYNC-18 artworks sit as NEEDS_REVIEW indefinitely due to shipping delays | Low | notes field documents hold reason; no production risk while hidden; shipment tracking gives owner visibility |
| New tables add admin overhead for small shipments | Low | Workflow is lightweight for a 4-item batch; overhead is ~5 admin actions for the full lifecycle |
| inventory_movements not implemented yet — no audit trail during transition | Low | Deferred to ARCH-INV-02D; current transition period covered by notes fields and document trail |

---

## 17. Recommended Next Subtask

**ARCH-INV-02D — Define Order Request to Inventory Reservation/Decrement Rules**

ARCH-INV-02D should:
1. Define whether and when order request submission should trigger a physical_inventory reservation
2. Define the difference between an inquiry record (current) and a confirmed order
3. Define what "confirmed order" means and what admin actions confirm it
4. Define what happens to physical_inventory when an order is confirmed (RESERVED), fulfilled (SOLD), or cancelled (AVAILABLE restored)
5. Define whether artworks with no AVAILABLE physical inventory can still accept order requests (and if so, what happens to the customer's inquiry)
6. Define whether MADE_TO_ORDER artworks follow different reservation rules
7. Address OQ-5 from this document (MADE_TO_ORDER + physical_inventory interaction)
8. Specify any changes needed to `order_request_items` to support future reservation tracking

ARCH-INV-02D must not be started until this document (ARCH-INV-02C) is reviewed and accepted.

---

## 18. Safety Confirmation

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
| ARCH-INV-02D started | No |
| WEB-CAT-02 started | No |
| ISYNC-18-07 started | No |
| ISYNC-19 started | No |
| INV-PRICE-01 started | No |
