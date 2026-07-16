# ORD-01 — Public Artwork Inquiry / Order Request Foundation

**Status:** Complete (local dev only — not deployed, migration not run against production)
**Date:** 2026-07-16
**Depends on:** ARCH-INV-01, WEB-VIS-01/02, INV-SKU-01 (all confirmed present on `main`)
**Branch:** `feature/ORD-01-order-request-foundation` (created from `origin/main`)

## Summary

Adds the backend storage and admin foundation for customer artwork inquiries
("order requests"): a database schema, a public creation endpoint, admin
viewing/status APIs, and an admin screen to review submitted requests and
their line items. This is explicitly **not** a checkout flow — no payment,
cart, shipping, tax, email automation, or inventory-decrement logic is
included. Creating an order request never modifies artwork records.

## Tables added

### `order_requests`

Customer/order-level information.

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `customer_name` | VARCHAR(255) NOT NULL | |
| `customer_email` | VARCHAR(254) NOT NULL | |
| `customer_phone` | VARCHAR(50) | optional |
| `customer_message` | TEXT | optional inquiry note |
| `status` | VARCHAR(30) NOT NULL DEFAULT `'NEW'` | CHECK constrained to `NEW`, `REVIEWING`, `QUOTE_SENT`, `CONFIRMED`, `CANCELLED`, `FULFILLED` |
| `created_at` / `updated_at` | TIMESTAMP | |

Indexes: `status`, `created_at`.

### `order_request_items`

Selected artwork/order-line information, one row per requested artwork (and
optional size).

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `order_request_id` | INTEGER NOT NULL, FK → `order_requests(id)` `ON DELETE CASCADE` | |
| `artwork_id` | VARCHAR(50), FK → `artworks(id)` `ON DELETE SET NULL` | live reference, for admin convenience |
| `artwork_size_id` | INTEGER, FK → `artwork_sizes(id)` `ON DELETE SET NULL` | optional; only set for sized artworks |
| `quantity` | INTEGER NOT NULL DEFAULT 1, `CHECK (quantity > 0)` | |
| `snapshot_sku` | VARCHAR(100) | request-time SKU |
| `snapshot_title` | VARCHAR(255) NOT NULL | request-time title |
| `snapshot_category` | VARCHAR(50) | request-time category |
| `snapshot_size_label` | VARCHAR(100) | request-time size/dimension label |
| `snapshot_price_inr` / `snapshot_price_usd` | NUMERIC(10,2) | request-time price |
| `snapshot_image` | VARCHAR(255) | request-time image URL |
| `snapshot_availability` | VARCHAR(30) | request-time status (`IN_STOCK` / `MADE_TO_ORDER`) |
| `created_at` | TIMESTAMP | |

Indexes: `order_request_id`, `artwork_id`.

**Why `ON DELETE SET NULL` and not `CASCADE`** on the artwork references: an
order request is a historical record. If an artwork is later deleted, the
request must still show what was asked for — the `snapshot_*` columns are
the source of truth for display; `artwork_id`/`artwork_size_id` are only a
convenience link to the live record when it still exists.

**Migration file:** [server/dbMigration/migrate_ord01_order_requests.sql](../../server/dbMigration/migrate_ord01_order_requests.sql)
— `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` throughout, so
re-running it against a database that already has these tables is a no-op.
Does **not** alter `artworks`, `artwork_sizes`, or `categories` in any way.
Run manually via `node server/runMigration.js migrate_ord01_order_requests.sql`
— **not** wired into automatic startup (`initializeDatabase()`), matching
this repo's existing convention for schema-adding migrations (see
`migrate_web_vis01.sql`, `migrate_add_artwork_sizes.sql`).
**Not run against production as part of this ticket.**

## APIs added

### Public

- **`POST /api/order-requests`** — creates an order request with one or more
  line items. Rate-limited (5/hour/IP in production; disabled in dev, same
  pattern as the existing contact-form limiter).
  - Body: `{ name, email, phone?, message?, items: [{ artwork_id, artwork_size_id?, quantity? }] }`
  - Validates `name` (2–255 chars), `email` (format), optional `phone`/`message`
    length, `items` non-empty and ≤ 50 entries, each `quantity` a whole
    number 1–999 (default 1).
  - **Every item is validated against the artwork's CURRENT state** via
    `db.getArtworkById(id, publicOnly=true)` — the exact same "public/
    orderable" definition already used by the public artwork API/list
    (`status IN ('IN_STOCK','MADE_TO_ORDER') AND show_on_website = true`).
    A request referencing any other artwork (wrong status, hidden, or
    nonexistent) is rejected with `400` before anything is written.
  - If `artwork_size_id` is supplied, it's verified to actually belong to
    that `artwork_id` (rejects size/artwork mismatches).
  - Snapshot fields (`sku`, `title`, `category`, `size_label`, `price_inr`,
    `price_usd`, `image`, `availability`) are captured from the artwork's
    live data at the moment of request — never edited afterward.
  - Only reads artwork/size data — **never writes to `artworks` or
    `artwork_sizes`**.

### Admin (all `authenticateToken`-protected)

- **`GET /api/admin/order-requests`** — list, with `item_count` per request.
  Optional `?status=` filter (validated against the allowed status set).
- **`GET /api/admin/order-requests/:id`** — full detail: customer fields +
  all line items with snapshot data.
- **`PATCH /api/admin/order-requests/:id/status`** — updates
  `order_requests.status` only. Validates against the six allowed values.
  Never touches artwork records — no quantity, status, SOLD, or
  OUT_OF_STOCK side effects anywhere in this endpoint.

## Admin screen added

**Route:** `/ckk-secure-admin/order-requests` (new nav button: "Order
Requests" on the Admin Dashboard header, next to "Review Queue").

**Page:** [src/pages/AdminOrderRequests.js](../../src/pages/AdminOrderRequests.js)
+ [src/styles/AdminOrderRequests.css](../../src/styles/AdminOrderRequests.css),
following the same structure as the existing `AdminReviewQueue` page:

- Summary count cards + filter tabs per status (All / New / Reviewing /
  Quote Sent / Confirmed / Cancelled / Fulfilled).
- Table: ID, Customer, Email, Status badge, Item count, Submitted date,
  View/Hide action.
- Expandable detail panel per request (fetches `GET
  /api/admin/order-requests/:id` on first expand, cached thereafter) showing:
  - **Customer details:** name, email, phone, inquiry message.
  - **Status:** dropdown (all 6 values) + "Save Status" button, calling the
    PATCH endpoint.
  - **Requested items table:** image thumbnail, SKU, title, category, size,
    quantity, price (INR/USD), and an availability badge distinguishing
    `IN_STOCK` vs `MADE_TO_ORDER` — so mixed-availability requests are
    clearly visible in one place.

## Validation performed (local dev)

Backend on `http://localhost:5000` (local Postgres), frontend (CRA dev
server) on `http://localhost:3000`.

**Note on environment:** this feature branch was created fresh from
`origin/main` (the branch I'd been working on, `WEB-MAINT-01`, predates the
`show_on_website`/`MADE_TO_ORDER` work and doesn't have it). The local dev
database was also missing the `show_on_website` column — I ran the
already-existing, already-merged `migrate_web_vis01.sql` locally to bring
dev in line with `main`'s code (no new migration content of my own; this
just applied prior, already-approved work to my local DB so ORD-01 could be
tested against the real "public/orderable" logic it depends on).

### Migration

- `migrate_ord01_order_requests.sql` run twice in a row — second run was a
  no-op (`CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`), schema
  unchanged.
- Confirmed final column list for both tables matches the design above.

### Creation endpoint (`POST /api/order-requests`)

| Case | Result |
|---|---|
| Mixed request: 1 `IN_STOCK` item (no size) + 1 `MADE_TO_ORDER` item (with size, qty 2) | `201`, both items persisted with correct snapshots (title, category, size label, INR/USD price, correct availability label each) ✅ |
| Item references an artwork with `show_on_website = false` | `400` — "not a valid public/orderable artwork" ✅ |
| Item references a nonexistent artwork id | `400` — same message ✅ |
| `artwork_size_id` belongs to a different artwork than `artwork_id` | `400` — "does not belong to artwork" ✅ |
| Invalid email format | `400` ✅ |
| Empty `items` array | `400` — "At least one item is required" ✅ |

Verified directly in Postgres after each test: the referenced artworks'
`status`, `show_on_website`, and `quantity` were **unchanged** before and
after every creation call.

### Admin APIs

| Call | Result |
|---|---|
| `GET /api/admin/order-requests`, no token | `401` ✅ |
| `PATCH /api/admin/order-requests/1/status`, no token | `401` ✅ |
| `GET /api/admin/order-requests`, valid admin token | list with `item_count: 2` ✅ |
| `GET /api/admin/order-requests?status=NEW` | filtered correctly ✅ |
| `GET /api/admin/order-requests?status=BOGUS` | `400` ✅ |
| `GET /api/admin/order-requests/1` | full detail incl. both snapshot line items ✅ |
| `GET /api/admin/order-requests/9999` | `404` ✅ |
| `PATCH .../1/status {"status":"REVIEWING"}` | `200`, status updated ✅ |
| `PATCH .../1/status {"status":"BOGUS"}` | `400` ✅ |

### Admin UI (browser)

- Logged in, navigated Dashboard → **Order Requests** (new nav button).
- List showed the test request with correct customer name/email, status
  badge, item count (2), submitted timestamp.
- Filter tabs and summary counts updated correctly when switching status.
- Clicked **View** → detail panel loaded customer info, status dropdown, and
  a line-items table showing both the `IN_STOCK` and `MADE_TO_ORDER` items
  side by side with images, SKU, title, category, size, quantity, INR/USD
  price, and availability badge.
- Changed status via the dropdown → **Save Status** → list and summary
  counts updated immediately to reflect the new status (`REVIEWING` →
  `CONFIRMED`), confirming the "basic admin review capability" round-trips
  correctly through the real UI, not just the API.

### Cleanup

Test order request (id 1) and its items were deleted from the local dev
database after validation (`DELETE FROM order_requests WHERE id = 1`,
cascade removed the items). The two artworks temporarily toggled to
`MADE_TO_ORDER` / `show_on_website=false` for testing were reverted to their
original values immediately after the relevant test.

## Safety confirmations

- ✅ No production migration was run — `migrate_ord01_order_requests.sql` was
  only run against the local dev database.
- ✅ No production deploy was performed.
- ✅ No artwork, category, order (existing), or inventory data was modified
  outside the two new tables — verified directly in Postgres before/after
  testing.
- ✅ No Inventory Preview or Inventory Apply was run.
- ✅ No production import was run.
- ✅ No SKU backfill — SKUs are only read (snapshotted), never generated or
  modified.
- ✅ No price recalculation.
- ✅ No cart, checkout, payment, shipping, or tax logic was added.
- ✅ No email automation was added.
- ✅ No automatic SOLD/OUT_OF_STOCK/quantity change logic exists anywhere in
  the new code — creating or reviewing an order request only reads artwork
  data and only writes to `order_requests`/`order_request_items`.

## Out of scope (unchanged, per ticket)

Cart, checkout, payment, shipping calculation, tax calculation, fulfillment,
email automation, inventory decrement, automatic artwork status changes, and
any public-facing "submit an inquiry" UI (the public creation endpoint
exists for a future ticket to build against; no public form was added here).
