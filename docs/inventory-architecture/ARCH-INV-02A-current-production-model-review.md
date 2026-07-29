# ARCH-INV-02A — Current Production Catalog, Visibility, SKU, and Order Request Model Review

**Ticket:** ARCH-INV-02A — Review Current Production Catalog, Visibility, SKU, and Order Request Model  
**Branch:** `feature/ARCH-INV-02A-current-production-model-review`  
**Date:** 2026-07-28  
**Type:** Read-only current-state review — no code changes, no schema changes, no production data changes  
**Input docs:** ARCH-INV-01, ISYNC-18-04 through ISYNC-18-06, ORD-04, INV-SKU-01, WEB-VIS-01, ORD-01, ORD-02

---

## 1. Purpose

This document is a current-state review of how the Chitrakala Arts production system works today. It covers the artwork catalog, public visibility, artwork status, SKU generation, artwork_sizes, order requests, admin Review Queue, and the 4 NEEDS_REVIEW imported artworks from ISYNC-18.

This document does **not** design the future architecture. It is the source-of-truth input for the ARCH-INV-02 design effort. All findings are based on direct production API inspection, code reading, and prior results documents.

---

## 2. Current Production Snapshot

All counts verified via read-only API calls on 2026-07-28.

| Metric | Expected | Verified | Match |
|---|---|---|---|
| Admin artworks | 42 | 42 | Yes |
| Public artworks | 38 | 38 | Yes |
| Status: IN_STOCK | 38 | 38 | Yes |
| Status: NEEDS_REVIEW | 4 | 4 | Yes |
| show_on_website=true | 38 | 38 | Yes |
| show_on_website=false | 4 | 4 | Yes |
| sku=null (all artworks) | 42 | 42 | Yes |
| artwork_sizes rows | 91 | 91 (stable across all ops) | Yes |
| Categories | 7 | 7 | Yes |
| order_requests | 3 | 3 | Yes |
| order_request_items | 4 | 4 | Yes |
| Maintenance mode | false | false | Yes |
| fx_rate | 92.4 | 92.4 | Yes |
| usd_multiplier | 2.25 | 2.25 | Yes |

### Status Breakdown

| Status | Count | Notes |
|---|---|---|
| IN_STOCK | 38 | All 38 have show_on_website=true and sku=null |
| NEEDS_REVIEW | 4 | All 4 ISYNC-18 imported artworks; show_on_website=false, sku=null |
| MADE_TO_ORDER | 0 | Status exists in code and schema; not currently used in production |
| OUT_OF_STOCK | 0 | |
| SOLD | 0 | |
| ARCHIVED | 0 | |

### Categories

| Slug | Name | Has Public Artworks |
|---|---|---|
| dot-mandala | Dot Mandala Art | Yes |
| lippan-art | Lippan Art | Yes |
| mirror-mosaic | Mirror Mosaic | Yes |
| texture-art | Texture Art | Yes |
| textile-design | Textile Art | Yes |
| warli-art | Warli Art | No — 2 artworks are NEEDS_REVIEW |
| mixed-art | Mixed Art | No — 1 artwork is NEEDS_REVIEW |

`warli-art` and `mixed-art` category records exist in the DB but have no public artworks. They appear in `GET /api/categories` regardless.

### Pricing Settings

| Setting | Value |
|---|---|
| fx_rate | 92.4 |
| usd_multiplier | 2.25 |
| Formula | `price_usd = Math.round(price_inr / fx_rate * usd_multiplier)` |

---

## 3. Current Artwork Catalog Model

### artwork record fields (verified from production API)

Both the admin and public artwork endpoints return the same field set:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable internal identifier (e.g., `art-1782445237565`). Never changes. |
| `title` | string | Display title |
| `category` | string | One of 7 category slugs |
| `description` | string | Customer-facing product description |
| `dimensions` | string | Physical size (e.g., `18in round`, `5.5m x 1.1m`) |
| `materials` | string | Materials list |
| `notes` | string | Internal admin notes. **Currently returned by the public API — see Gap in Section 9.** |
| `featured` | boolean | Featured flag |
| `status` | string | `IN_STOCK`, `NEEDS_REVIEW`, `MADE_TO_ORDER`, `OUT_OF_STOCK`, `SOLD`, `ARCHIVED` |
| `show_on_website` | boolean | Second visibility gate. **Currently returned by the public API — see Gap.** |
| `sku` | string or null | SKU. Currently null on all 42 artworks. |
| `quantity` | integer | Defaults to 1. Informational; not enforced against orders. |
| `price` | decimal | Legacy price field (USD, pre-pricing-rework) |
| `price_inr` | decimal | INR price. Nullable = Price on Request. |
| `price_usd` | decimal | USD price. Calculated at import/save time. |
| `fx_rate_used` | decimal | fx_rate at time of last price calculation |
| `multiplier_used` | decimal | usd_multiplier at time of last price calculation |
| `image` | string | Image URL (`/api/images/artworks/:id`) |
| `image_filename` | string | Filename used during workbook import matching |
| `image_mime_type` | string | MIME type of stored image |
| `sizes` | array | Joined artwork_sizes rows for this artwork |
| `created_at` | timestamp | |
| `updatedAt` | timestamp | |

### artworks table schema history

Key migrations applied to production:
- `migrate_add_inventory_columns.sql` — added `sku`, `quantity`, `notes`, `materials`, `dimensions`, `image_filename`, `image_mime_type`, `image_data`
- `migrate_web_vis01.sql` — added `show_on_website BOOLEAN NOT NULL DEFAULT false` + backfilled `true` for all IN_STOCK artworks at migration time
- `migrate_add_currency_pricing.sql` — added `price_inr`, `price_usd`, `fx_rate_used`, `multiplier_used`
- `migrate_inv03a_schema.sql` — added `MADE_TO_ORDER` to status CHECK constraint

---

## 4. Current Public Visibility Model

### The Two-Gate Rule

An artwork is publicly visible **only if both gates pass**:

| Gate | Column | Required value |
|---|---|---|
| Gate 1: Status | `status` | Must be `IN_STOCK` or `MADE_TO_ORDER` |
| Gate 2: Website flag | `show_on_website` | Must be `true` |

**Implemented in:**
- `server/dbQueries.js` `getArtworks()` — `WHERE status IN ('IN_STOCK', 'MADE_TO_ORDER') AND show_on_website = true`
- `server/dbQueries.js` `getArtworkById(id, publicOnly=true)` — same condition

### Visibility Matrix

| Status | show_on_website=true | show_on_website=false |
|---|---|---|
| IN_STOCK | **Public — Available** | Hidden |
| MADE_TO_ORDER | **Public — Made to Order** | Hidden |
| NEEDS_REVIEW | Never public | Never public |
| OUT_OF_STOCK | Never public (default) | Never public |
| SOLD | Never public (default) | Never public |
| ARCHIVED | Never public | Never public |

### How NEEDS_REVIEW and show_on_website=false Keep Imported Rows Hidden

When the inventory Apply endpoint creates a new artwork via workbook import, it hardcodes:
- `status = 'NEEDS_REVIEW'`
- `show_on_website = false` (DB default)
- `sku = null`

This means imported rows can never appear in the public API regardless of other field values. The two-gate filter ensures both conditions must be explicitly changed by an admin before any artwork becomes visible. This was validated by ISYNC-18-04: all 4 imported artworks were absent from `GET /api/artworks` immediately after Apply.

### Current Production Visibility State

- All 38 public artworks: `status=IN_STOCK`, `show_on_website=true`
- All 4 NEEDS_REVIEW artworks: `show_on_website=false`, absent from public API
- No MADE_TO_ORDER artworks exist in production today

---

## 5. Current SKU Model

### SKU Format

```
CKS-[Year]-[ArtCode]-[NNNNN]
```

| Segment | Values |
|---|---|
| `CKS` | Literal prefix |
| `[Year]` | 4-digit year when SKU first assigned |
| `[ArtCode]` | DM, LA, MM, WA, TA, MA, TD (per category) |
| `[NNNNN]` | 5-digit zero-padded sequence, per-category per-year |

**Example:** `CKS-2026-DM-00001` — first Dot Mandala artwork published in 2026.

**Validation pattern:** `^CKS-\d{4}-(DM|LA|MM|WA|TA|MA|TD)-\d{5}$`

### SKU Generation Trigger Rules

Implemented in `server/skuUtils.js` `maybeGenerateSku()`:

| Condition | SKU generated? |
|---|---|
| `status=IN_STOCK`, `show_on_website=true`, no existing SKU | Yes |
| `status=MADE_TO_ORDER`, `show_on_website=true`, no existing SKU | Yes |
| `status=IN_STOCK`, `show_on_website=false` | No |
| `status=NEEDS_REVIEW` (any show_on_website) | No |
| `status=OUT_OF_STOCK`, `SOLD`, `ARCHIVED` | No |
| Artwork already has a SKU | No — existing SKU preserved |

SKU generation is wired into: `POST /api/artworks` (create), `PUT /api/artworks/:id` (update), and `PATCH /api/admin/artworks/:id/status` (Review Queue status change).

### Why All 42 Production Artworks Currently Have null SKU

- The 38 existing `IN_STOCK` artworks were in production before `INV-SKU-01` was deployed. No bulk backfill was run. These artworks will receive a SKU the next time an admin edits and saves them while they are IN_STOCK + show_on_website=true.
- The 4 NEEDS_REVIEW artworks have `status=NEEDS_REVIEW` and `show_on_website=false`. Neither condition qualifies for SKU generation. Their SKU will remain null until an admin promotes them to IN_STOCK or MADE_TO_ORDER + show_on_website=true via the admin panel (typically via the Review Queue PATCH status endpoint).

### Why SKU Generation Must Wait Until Public/Orderable Save

The design deliberately ties SKU generation to the first moment an artwork becomes publicly orderable, not to import time. This ensures:
1. SKUs are not wasted on artworks that are later rejected or never published
2. The SKU assignment year reflects when the artwork was first made public
3. The admin review process (filling in materials, dimensions, description) happens before a SKU is committed

---

## 6. Current artwork_sizes Model

### What artwork_sizes represents

`artwork_sizes(id, artwork_id, size_label, price)` — size and price variants of the same artwork design.

- One row per size option for an artwork
- `size_label`: text description of the size (e.g., `12" round`, `18" round`, `24" round`)
- `price`: INR price for that size. USD is computed at request time by the backend.
- Zero size rows = single-price artwork; price lives on the artwork row itself.
- Many artworks have multiple sizes (e.g., 91 rows across 42 artworks)

### What artwork_sizes is NOT

| What it is | What it is NOT |
|---|---|
| Size/price option data for a design | A physical stock table |
| Presentation layer for multi-size artworks | A shipment/receiving tracker |
| Supports "price by size" | Does not track quantity per size |
| | Does not track whether a size is in transit or received |
| | Does not model physical inventory at the size level |

### Current schema constraint: artwork_sizes.price is NOT NULL

`artwork_sizes.price NUMERIC(10,2) NOT NULL` — size-level prices cannot be null at the DB level. This means "Price on Request" for a specific size is **not currently supported** for artworks with sizes. Price on Request works only for single-price artworks where `artworks.price_inr IS NULL`. This is a known limitation (INV-PRICE-01 scope).

---

## 7. Current Order Request Model

### Order Creation Flow

Endpoint: `POST /api/order-requests` (public, rate-limited at 5/hour/IP)

Order of operations:
1. Maintenance-mode guard — returns `503` immediately if site is in maintenance; notifier never reached
2. Input validation (name, email, phone, message, items array, item count cap of 50)
3. Per-item validation: each item's `artwork_id` is validated against the **current** public/orderable state via `db.getArtworkById(artworkId, publicOnly=true)` — same two-gate rule (`IN_STOCK` or `MADE_TO_ORDER` AND `show_on_website=true`)
4. If `artwork_size_id` is provided, verified to belong to that artwork
5. Snapshots captured from live artwork data at submission time
6. `db.createOrderRequest()` — single DB transaction writing `order_requests` + `order_request_items`
7. `sendOrderRequestNotificationEmail()` — called after creation succeeds; best-effort, never blocks the response
8. `201 Created` response returned regardless of email outcome

### Tables

**order_requests** (verified column list from production API):

| Column | Notes |
|---|---|
| `id` | SERIAL integer PK |
| `customer_name` | VARCHAR(255) NOT NULL |
| `customer_email` | VARCHAR(254) NOT NULL |
| `customer_phone` | VARCHAR(50), optional |
| `customer_message` | TEXT, optional |
| `status` | `NEW`, `REVIEWING`, `QUOTE_SENT`, `CONFIRMED`, `CANCELLED`, `FULFILLED` |
| `created_at` | TIMESTAMP |
| `updated_at` | TIMESTAMP |

**order_request_items** (verified column list from production API):

| Column | Notes |
|---|---|
| `id` | SERIAL PK |
| `order_request_id` | FK → order_requests(id) ON DELETE CASCADE |
| `artwork_id` | FK → artworks(id) ON DELETE SET NULL (live reference) |
| `artwork_size_id` | FK → artwork_sizes(id) ON DELETE SET NULL, optional |
| `quantity` | INTEGER, default 1 |
| `snapshot_sku` | SKU at submission time (currently null — all artworks have no SKU) |
| `snapshot_title` | Title at submission time |
| `snapshot_category` | Category at submission time |
| `snapshot_size_label` | Size label at submission time |
| `snapshot_price_inr` | INR price at submission time |
| `snapshot_price_usd` | USD price at submission time |
| `snapshot_image` | Image URL at submission time |
| `snapshot_availability` | `IN_STOCK` or `MADE_TO_ORDER` at submission time |
| `created_at` | TIMESTAMP |

### Admin Endpoints

| Endpoint | Notes |
|---|---|
| `GET /api/admin/order-requests` | List with `item_count`; optional `?status=` filter |
| `GET /api/admin/order-requests/:id` | Full detail: customer fields + all snapshot line items |
| `PATCH /api/admin/order-requests/:id/status` | Updates status only; validates against 6 allowed values |

No DELETE endpoint. Cleanup requires direct psql.

### Order Request Status Lifecycle

```
NEW (default on creation)
  → REVIEWING
  → QUOTE_SENT
  → CONFIRMED
  → CANCELLED
  → FULFILLED
```

Admin manages transitions via the PATCH endpoint. No automatic transitions. No business logic tied to status changes (no inventory decrements, no artwork status changes).

### Admin Notification Email (ORD-04)

`sendOrderRequestNotificationEmail()` in `server/server.js`:

- Called after successful order creation (step 7 above)
- Recipient: `process.env.INQUIRY_EMAIL` → first DB contact email → **no hardcoded fallback** (ORD-04 fix)
- If `RESEND_API_KEY` is missing: logs a clear warning and returns without sending
- If no recipient configured: logs a clear warning and returns without sending
- Any send failure: caught, logged (with order request ID), never surfaced to the customer
- Email includes: request ID, status, customer name/email/phone/message, per-item quantity/title/size/SKU/price/availability
- No persistent notification status on the order_request row (no `admin_notification_status` column — deferred per ORD-04 design decision)

### Does Order Creation Affect Artwork or Inventory?

**No.** Verified in ORD-01, ORD-02, and ORD-04:
- `POST /api/order-requests` only reads from `artworks` and `artwork_sizes`
- It writes only to `order_requests` and `order_request_items`
- No artwork `status`, `show_on_website`, `quantity`, `sku`, or any other artwork field is modified by order creation
- `PATCH /api/admin/order-requests/:id/status` updates only `order_requests.status`; no artwork side effects

Order requests are inquiry/request records. They do not reserve, decrement, or alter inventory.

### Can Imported Hidden NEEDS_REVIEW Artworks Be Ordered?

**No.** The `POST /api/order-requests` endpoint validates every item via `db.getArtworkById(artworkId, publicOnly=true)`, which applies the same two-gate filter. Any artwork that is NEEDS_REVIEW or has `show_on_website=false` is rejected with HTTP 400 before the order is created. The 4 ISYNC-18 artworks cannot be included in any customer order request in their current state.

---

## 8. Current Admin Review Queue Model

### How NEEDS_REVIEW Records Appear in Admin

The admin artwork list (`GET /api/admin/artworks`) returns all artworks regardless of status or `show_on_website`. NEEDS_REVIEW artworks appear alongside IN_STOCK artworks in the admin panel. The Review Queue page (`/ckk-secure-admin/review-queue`) filters this list to show artworks with `status=NEEDS_REVIEW`.

Admin UI capabilities for NEEDS_REVIEW artworks:
- View all fields (including missing fields like blank materials/dimensions)
- Edit any field via the edit panel (PATCH endpoint)
- Change status via the status dropdown (PATCH `/api/admin/artworks/:id/status`)
- Change `show_on_website` via checkbox (triggers SKU generation if qualifying)
- "Publish" quick action sets `status=IN_STOCK` (does not change `show_on_website` independently)

### State of the 4 ISYNC-18 Imported Artworks (verified 2026-07-28)

| ID | Title | Status | show_on_website | SKU |
|---|---|---|---|---|
| art-1785182575357-0 | 18" Round Warli Art | NEEDS_REVIEW | false | null |
| art-1785182575357-1 | 10" Round Warli Art | NEEDS_REVIEW | false | null |
| art-1785182575357-2 | Decorative Tray 11" | NEEDS_REVIEW | false | null |
| art-1785182575357-3 | 3 Partition Square Box with Handle | NEEDS_REVIEW | false | null |

### Missing Owner Fields (from ISYNC-18-05)

| Artwork | Missing |
|---|---|
| All 4 | Materials (blank) |
| All 4 | Proper description (currently verbose import sourcing notes) |
| All 4 | Pending-shipment notes update recommended |
| Row 4 only | Dimensions (blank) |

### Why These 4 Artworks Must Not Be Published Yet

1. Artworks have not physically shipped from India
2. Materials field is blank on all 4 (required before customer-facing publish)
3. Description is currently import sourcing notes, not public-facing product copy
4. Owner has not confirmed images match the received physical items
5. ISYNC-18-07 (controlled publish validation) has not been run
6. No SKU auto-generation has occurred (happens automatically on first qualifying admin save)

Pending-shipment hold is maintained by: `status=NEEDS_REVIEW` + `show_on_website=false`. These cannot be overridden by the public API or order request flow.

---

## 9. Current Gaps / Pain Points

The following gaps were identified through current-state code review, API inspection, and prior results documents.

### Gap 1: Artwork record mixes catalog and availability concepts

The `artworks` table currently serves as both a catalog record (title, description, materials, images) and a lightweight availability tracker (status, quantity). There is no separate physical inventory table. This means:
- Whether an artwork is "in stock" is stored on the catalog record, not on a separate inventory row
- Importing a new artwork creates a catalog record immediately, even before the physical item is received
- The ISYNC-18 workaround (import as NEEDS_REVIEW before shipment) demonstrates the coupling problem

### Gap 2: No physical inventory or stock record

There is no table tracking physical stock units. The `quantity` field on `artworks` is an integer but is not enforced against orders (no decrement on order creation). The system has no concept of:
- How many physical units of an artwork exist
- Where they are (in studio, shipped, in transit, at destination)
- Whether a unit has been allocated to a pending order

### Gap 3: No shipment/receiving lifecycle

When artworks are imported before physical receipt (as with ISYNC-18), there is no formal way to represent the shipment state. The current workaround uses:
- `status=NEEDS_REVIEW` as a hold flag (semantically incorrect — NEEDS_REVIEW means "not yet admin-reviewed", not "not yet received")
- `notes` field with a human-readable pending-shipment message

This is an interim workaround. The `notes` field is admin-only and not indexed or queryable for operational use. There is no way to list "all artworks pending shipment" without reading the notes field content.

### Gap 4: Order requests do not reserve or decrement inventory

Creating an order request does not change anything on the artwork record. Two customers can simultaneously request the same artwork. The admin must manually manage which order requests can be fulfilled. There is no reservation, hold, or decrement mechanism.

### Gap 5: Public API exposes admin-only fields

The public artwork endpoint (`GET /api/artworks`, `GET /api/artworks/:id`) returns the same field set as the admin endpoint, including:
- `notes` — internal admin-only notes (e.g., "Pending shipment from India. Do not publish...")
- `show_on_website` — internal visibility gate
- `image_mime_type`, `image_filename` — internal image metadata

These fields do not pose a security risk in their current content, but exposing `notes` publicly could be an issue if sensitive internal notes are added in the future. A clean field separation between public and admin responses is recommended.

### Gap 6: `/api/artworks?category=<slug>` does not filter server-side

**Confirmed on 2026-07-28:** `GET /api/artworks?category=dot-mandala` returns all 38 public artworks (identical to `GET /api/artworks` with no category parameter). The `category` query parameter is accepted but ignored by `dbQueries.js:getArtworks()`. Category filtering is implemented client-side only.

This is a pre-existing bug (first documented in ISYNC-18-04). It does not affect current production behavior because client-side filtering works. It will become a risk when:
- warli-art and mixed-art gain public artworks (categories with very few items)
- Any future server-side pagination or SEO work assumes the API filters correctly

Ticket: WEB-CAT-02.

### Gap 7: artwork_sizes.price is NOT NULL — no size-level Price on Request

`artwork_sizes.price NUMERIC(10,2) NOT NULL` at the DB level. Price on Request is only possible for artworks with no sizes (where `artworks.price_inr IS NULL`). Artworks with size options must have a confirmed INR price for every size row. Ticket: INV-PRICE-01.

### Gap 8: No persistent notification status on order requests

When `sendOrderRequestNotificationEmail()` runs, its outcome (sent, failed, not configured) is logged to server stdout but not persisted to the `order_requests` row. There is no `admin_notification_status`, `admin_notified_at`, or `admin_notification_error` column. Admin cannot see from the UI whether a notification email was sent for a given order. This was a deliberate deferral in ORD-04 (optional enhancement, requires migration).

### Gap 9: No SKUs assigned to any production artwork

All 42 artworks have `sku=null`. SKU generation is implemented (INV-SKU-01) and will trigger automatically on the next qualifying admin save. But until each artwork is individually saved while public/orderable, order request snapshots will have `snapshot_sku=null`. This means historical order request records cannot be linked back to a SKU if the artwork is later edited without a SKU.

### Gap 10: warli-art and mixed-art have no category images

Categories `warli-art` and `mixed-art` have `image=null`. If the frontend renders category images, these two categories will display without images until images are added.

---

## 10. Implications for ARCH-INV-02

The following requirements for the future ARCH-INV-02 design emerge directly from current-state gaps. This section does not design the solution — it defines what must be addressed.

### Separate catalog from physical inventory

The `artworks` table should continue to own the catalog record (title, category, description, materials, images, pricing, visibility). A separate physical inventory concept should track: how many physical units exist, where they are, and their receiving status. These two models should be joinable but independently manageable.

### Track shipment/receiving lifecycle separately

"In shipment", "received", "inspected", and "available for publish" are physical inventory states. They must not live in `artworks.status`, which is a catalog/availability concept. ARCH-INV-02 should define how these states are tracked without polluting the catalog status column.

### Preserve the two-gate public visibility rule

The current two-gate rule (`status IN ('IN_STOCK','MADE_TO_ORDER') AND show_on_website = true`) works and should not be broken. ARCH-INV-02 should confirm whether this model is sufficient long-term or whether additional gates (e.g., shipment received confirmation) should be required before `show_on_website` can be set to true.

### Keep order request lifecycle separate from inventory movement

Order requests are inquiry records. They must remain independent of inventory state. ARCH-INV-02 should define whether confirmed orders ever trigger an inventory reservation or decrement, and if so, through what mechanism and at what point in the status lifecycle (CONFIRMED, FULFILLED, or another state).

### Define the notes-field workaround replacement

The `notes` field pending-shipment workaround is a stopgap. ARCH-INV-02 should replace it with a formal structured field or linked table that makes shipment state queryable without parsing free-text notes.

---

## 11. Recommended Next ARCH-INV-02 Subtasks

These subtasks are recommendations only. They are not started or designed in this document.

| Subtask | Scope |
|---|---|
| **ARCH-INV-02B** — Define Future Catalog vs Physical Inventory Data Model | Design the separation between `artworks` (catalog record) and a new physical inventory/stock record. Define what columns move, what stays, and what new tables or columns are needed. |
| **ARCH-INV-02C** — Define Shipment/Receiving Lifecycle and Admin Workflow | Design how "pending shipment", "in transit", "received", and "inspected" states are tracked without adding values to `artworks.status`. Define admin workflow for marking receipt and clearing the hold before ISYNC-18-07-style publish. |
| **ARCH-INV-02D** — Define Order Request to Inventory Reservation/Decrement Rules | Decide: do confirmed orders trigger an inventory hold? At what order status? Who authorizes it? How is it reversed if an order is cancelled? |
| **ARCH-INV-02E** — Migration and Phased Implementation Plan | Define migration order, backward compatibility requirements, and rollout phases. ISYNC-18 artworks are in production now; any schema change must handle them. |

---

## 12. Safety Confirmation

| Item | Status |
|---|---|
| Code changes | None |
| Schema changes | None |
| Production data changes | None |
| Production migrations | None |
| Inventory Preview run | No |
| Inventory Apply run | No |
| Artworks published | No |
| show_on_website changed | No |
| SKUs generated | No |
| ISYNC-18 artworks modified | No |
| order_requests modified | No |
| server/.env committed | No |
| Secrets, temp scripts, logs committed | No |

All production checks were read-only API calls (`GET` endpoints and admin `GET` endpoints only).
