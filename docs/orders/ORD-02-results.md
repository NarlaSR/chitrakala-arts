# ORD-02 — Public Cart and Order Request Submission Flow

**Status:** Complete (local dev only — not deployed)
**Date:** 2026-07-20
**Depends on:** ORD-01, WEB-VIS-01/02, INV-SKU-01

## Branch

- **Used:** `feature/ORD-02-public-order-request-flow`
- **Created from:** `feature/ORD-01-order-request-foundation` — confirmed at the
  start of this ticket that ORD-01 is **not** yet merged into `main`
  (`git merge-base --is-ancestor origin/feature/ORD-01-order-request-foundation origin/main`
  → `NOT MERGED`), so per the ticket instructions the branch was created from
  the ORD-01 branch rather than `main`. Verified the branch carries the full
  ORD-01 foundation before starting: `order_requests`/`order_request_items`
  tables, `POST /api/order-requests`, the admin Order Requests screen, and
  `getArtworkSizeForArtwork`/`createOrderRequest` in `dbQueries.js`.

## Existing flow inspected before building

Per the ticket's instruction, the existing wishlist/inquiry flow was
inspected first: `WishlistContext` (sessionStorage-backed), `WishlistModal`,
and `InquiryForm`, wired into `Header.js` (cart-icon button + item count) and
`ArtDetails.js` ("Add to Wishlist" button). It already had the right shape —
session-persisted list, add/remove, a review modal — but submitted by
stuffing item text into a single message string and posting to
`/api/contact/send-message`, not the ORD-01 structured backend. Per "prefer
reusing/upgrading... avoid creating a second competing cart system," this was
**upgraded in place**, not forked: the old wishlist files were removed and
replaced by renamed, adapted equivalents that call `POST /api/order-requests`
with structured `items`.

## Files changed

### Backend
- [server/dbQueries.js](../../server/dbQueries.js) — `getArtworkSizes` now
  also selects `id`, so the public artwork API can expose a stable
  `artwork_size_id` per size row (previously only `size_label`/`price` were
  returned, so the frontend had no way to reference a specific size).
- [server/server.js](../../server/server.js):
  - Hoisted the contact-form's local `sanitizeHTML` helper to module scope
    (behavior-unchanged) so it can be reused by the new order-request email.
  - Added `sendOrderRequestNotificationEmail()` — best-effort, called after
    `db.createOrderRequest()` succeeds inside `POST /api/order-requests`.
    No-ops silently if `RESEND_API_KEY` isn't configured; any other failure
    is caught and logged, never thrown, never surfaced to the caller.

### Frontend — new (replacing the wishlist files)
- [src/context/RequestCartContext.js](../../src/context/RequestCartContext.js)
  (replaces `WishlistContext.js`)
- [src/components/RequestCartModal.js](../../src/components/RequestCartModal.js)
  (replaces `WishlistModal.js`)
- [src/components/RequestDetailsForm.js](../../src/components/RequestDetailsForm.js)
  (replaces `InquiryForm.js`)
- [src/styles/RequestCartModal.css](../../src/styles/RequestCartModal.css),
  [src/styles/RequestDetailsForm.css](../../src/styles/RequestDetailsForm.css)

### Frontend — modified
- [src/index.js](../../src/index.js) — `WishlistProvider` → `RequestCartProvider`.
- [src/components/Header.js](../../src/components/Header.js),
  [src/styles/Header.css](../../src/styles/Header.css) — cart button/count
  renamed (`wishlist-btn` → `request-cart-btn`, etc.); same 🛒 icon.
- [src/pages/ArtDetails.js](../../src/pages/ArtDetails.js) — CTA reworked
  (see below); "Available" label added for `IN_STOCK` (previously only
  `MADE_TO_ORDER` showed a label); size selector added for multi-size
  artworks.
- [src/styles/ArtDetails.css](../../src/styles/ArtDetails.css) — added
  `.art-availability--instock`, `.art-size-selector`, `.request-toast`.
- [src/services/api.js](../../src/services/api.js) — added
  `orderRequestsAPI.create()` (public), alongside the existing ORD-01 admin
  functions.

### Frontend — removed
`src/context/WishlistContext.js`, `src/components/WishlistModal.js`,
`src/components/InquiryForm.js`, `src/styles/WishlistModal.css`,
`src/styles/InquiryForm.css` — fully superseded by the files above; no
remaining references (verified by grep for `wishlist`/`Wishlist`/`Inquiry`
across `src/`).

## Public request/cart behavior implemented

- **Storage:** `sessionStorage` key `orderRequestCart` (public-only, no
  accounts/login), same persistence pattern as the original wishlist.
- **Add:** `RequestCartContext.addToRequest(item)` — item carries
  `artwork_id`, optional `artwork_size_id`, and *display-only* fields
  (title/image/category/size_label/availability/price). Dedup key is
  `artwork_id + artwork_size_id`, so the same artwork in two different sizes
  is two distinct, valid lines (not a duplicate), while re-adding the exact
  same artwork+size is a no-op — "prevent duplicate accidental additions."
- **Remove:** `removeFromRequest(artwork_id, artwork_size_id)`, wired to a
  Remove button per line in the modal.
- **Continue Browsing:** closes the modal without touching the cart.
- **Mixed availability:** cart items carry their own `availability`
  (`IN_STOCK`/`MADE_TO_ORDER`), rendered as distinct badges — verified with
  both in the same cart (see Validation below).

## Artwork detail / CTA behavior

- `ArtDetails.js` already only loads via the **public** artwork endpoint
  (`artworksAPI.getById` → `GET /api/artworks/:id`, which uses
  `db.getArtworkById(id, publicOnly=true)`), so any artwork that is
  `NEEDS_REVIEW`/`ARCHIVED`/`SOLD`/`OUT_OF_STOCK`/hidden simply never loads —
  the page renders "Artwork Not Found" and no request UI exists on it at
  all. This was true before ORD-02 and is unchanged; verified directly
  (see Validation).
- Availability label: `Available` for `IN_STOCK` (new), `Made to Order` for
  `MADE_TO_ORDER` (already existed).
- Price on request: already worked for both the single-price and per-size
  cases (falls back to `'Price on request'` when the relevant price field is
  `null`); unchanged.
- CTA button: `Add to Request` / `Added to Request` (disabled once that
  exact artwork+size is already in the cart).
- **Size selection (new):** multi-size artworks now show a "Choose a size to
  request" dropdown (defaults to the first/cheapest size) so the correct
  `artwork_size_id` and its own price are sent — previously the wishlist had
  no way to know which size the customer wanted. Single-size or no-size
  artworks show no dropdown (nothing to choose).

## Request/cart review UI

`RequestCartModal` shows, per item: image, title, category, size (if any),
an availability badge (Available/Made to Order), and price or "Price on
request" — remove button per item, "Continue Browsing," and the details
form leading to "Submit Request." Responsive (max-width modal, stacks
cleanly on narrow viewports) and styled with the existing site's CSS
variables/typography, consistent with the rest of the admin/public UI.

## Customer details form

`RequestDetailsForm`: name (required), email (required, regex-validated),
phone (optional), message (optional, capped at 2000 chars client-side —
backend caps at 5000). Client-side errors are shown inline; nothing internal
is ever exposed (the same simple messages used elsewhere in the app).

## Backend endpoint used

`POST /api/order-requests` (ORD-01, unmodified in behavior). The frontend
sends **only** `{ name, email, phone?, message?, items: [{ artwork_id,
artwork_size_id?, quantity }] }` — no snapshot fields are sent or trusted;
the backend re-validates every item against the current public/orderable
state and builds its own snapshot, exactly as ORD-01 already does.

## Email notification behavior

- Configured (`RESEND_API_KEY` set): sends a notification to the resolved
  admin recipient (same `INQUIRY_EMAIL` → contact-table email → default
  fallback chain as the existing contact form) after the order request is
  saved, summarizing customer details and requested items.
- Not configured (this local dev environment — verified `RESEND_API_KEY` is
  unset here): silently skipped; the order request still saves and the API
  still returns `201` — verified directly (see Validation).
- Any send failure is caught, logged server-side only, and never affects the
  HTTP response — the DB write happens first and is never rolled back for an
  email problem.

## Admin verification

Confirmed in the browser, logged in as admin, using two temporarily-created
test submissions (deleted after each check):
- A public submission (from the actual customer-facing flow, one `IN_STOCK`
  sized item + one `MADE_TO_ORDER` item) appeared in
  `/ckk-secure-admin/order-requests` immediately, with correct customer
  name/email/phone/message, status `NEW`, and item count `2`.
- Expanding the row showed both line items with correct snapshots: title,
  category, the specific size label and its own price (not the artwork's
  base price), quantity, INR/USD price, and the correct availability badge
  per item (`IN STOCK` vs `MADE TO ORDER`).
- No admin workflow was added or changed beyond what ORD-01 already
  provides — no new admin screens, fields, or actions.

## Safety confirmations

- ✅ No payment, checkout, shipping calculation, or tax calculation was
  added.
- ✅ No inventory decrement, automatic SOLD, automatic OUT_OF_STOCK, or any
  other automatic artwork status/quantity change exists anywhere in this
  code — `POST /api/order-requests` only *reads* artwork/size data to
  validate and snapshot; it never writes to `artworks` or `artwork_sizes`.
  Verified directly in Postgres: artwork `status`/`show_on_website`/
  `quantity` were checked before and after every test submission (including
  the deliberately-broken "hidden artwork" case) and were unchanged except
  where I intentionally toggled them for testing — all reverted afterward.
- ✅ No SKU/price/category data was modified.
- ✅ No customer login/accounts were added — the cart is anonymous,
  session-scoped, public-only.
- ✅ No Inventory Preview/Apply, production import, or price recalculation
  was run.
- ✅ No production migration or deploy was performed. `getArtworkSizes`'s
  `SELECT` change requires no migration — `artwork_sizes.id` already exists
  as the table's primary key; only the query changed to select it.
- ✅ ORD-01 schema was not modified.

## Validation checklist results

| Requirement | Result |
|---|---|
| Public user can add an `IN_STOCK` artwork to the cart | ✅ (with size selection) |
| Public user can add a `MADE_TO_ORDER` artwork to the cart | ✅ |
| Cart can hold `IN_STOCK` + `MADE_TO_ORDER` together | ✅ verified in modal — both badges shown correctly |
| Price on request displays for items without a finalized price | ✅ (pre-existing logic, unchanged, re-verified) |
| User can remove an item from the cart | ✅ verified — item removed, empty-state message shown, sessionStorage confirmed empty |
| User can continue browsing after adding | ✅ ("Continue Browsing" closes modal, cart untouched) |
| User cannot submit an empty cart | ✅ — the form isn't rendered at all when the cart is empty |
| User cannot submit without a name | ✅ client-side validation blocks it |
| User cannot submit with invalid/missing email | ✅ client-side validation blocks it |
| Successful submission creates an order request via ORD-01 backend | ✅ verified via `POST /api/order-requests` and in Postgres |
| Successful request appears in admin Order Requests screen | ✅ verified in browser |
| Admin can view customer details and line-item snapshots | ✅ verified — full detail panel checked |
| Confirmation message appears after successful submission | ✅ exact suggested copy shown |
| Cart clears after successful submission | ✅ verified — sessionStorage empty, button reverts to "Add to Request" |
| Cart does NOT clear after failed submission | ✅ verified — artwork hidden mid-flow, submit rejected, item remained in cart and in sessionStorage |
| Hidden/`NEEDS_REVIEW`/`ARCHIVED`/`SOLD`/`OUT_OF_STOCK`/`show_on_website=false` artworks not exposed for request actions | ✅ verified — hidden artwork's detail page renders "Artwork Not Found," no CTA exists |
| Backend rejects invalid/non-public item references | ✅ verified directly via API (bypassing the UI) — `400` with a customer-safe message |
| No artwork status/quantity/SKU/price/category/show_on_website changes during submission | ✅ verified directly in Postgres before/after every test |
| Email notification sends if configured, or request still succeeds if unavailable | ✅ verified the "unavailable" path (no `RESEND_API_KEY` locally) — request still saved, `201` returned, no error surfaced |
| Frontend build passes | ✅ `npm run build` — compiled successfully, no warnings |
| Backend syntax/checks pass | ✅ `node --check server.js` / `node --check dbQueries.js` |

## Production/deploy note

- No production deployment was performed.
- No production migration was run. (This ticket also required no new
  migration — the only backend schema-adjacent change is widening an
  existing `SELECT` to include `artwork_sizes.id`, which is already a
  column in production; nothing needs to be added to the database.)
- If the ORD-01 migration (`migrate_ord01_order_requests.sql`) is not
  already deployed to production, ORD-02's production deployment depends on
  that migration/deploy being approved and applied first — ORD-02's
  frontend and backend both assume `order_requests`/`order_request_items`
  already exist.
- Do not deploy until the ORD-01 and ORD-02 deployment order is confirmed
  with the site owner.

---

## Railway Staging Validation

**Date:** 2026-07-21
**Target:** `shinkansen.proxy.rlwy.net:41009` (Railway staging — NOT production `crossover.proxy.rlwy.net:54308`)
**Branch tested:** `staging-test/web-maint-ord-validation` (WEB-MAINT-01 + ORD-01 + ORD-02 merged)
**Result:** ✅ 22/22 assertions passed (status workflow + regression)

### Status workflow validation

All statuses tested in sequence on test order request ID 3:
`NEW → REVIEWING → QUOTE_SENT → CONFIRMED → CANCELLED → FULFILLED`

| # | Assertion | Result |
|---|-----------|--------|
| 1 | `PATCH /api/admin/order-requests/:id/status {status: "REVIEWING"}` → 200 | ✅ |
| 2 | `PATCH {status: "QUOTE_SENT"}` → 200 | ✅ |
| 3 | `PATCH {status: "CONFIRMED"}` → 200 | ✅ |
| 4 | `PATCH {status: "CANCELLED"}` → 200 | ✅ |
| 5 | Request still exists and retrievable after `CANCELLED` | ✅ |
| 6 | Snapshots intact after all status changes | ✅ |
| 7 | `PATCH {status: "FULFILLED"}` → 200 | ✅ |
| 8 | Invalid status `DELETED` → 400/422 | ✅ |

### Combined regression validation

| # | Assertion | Result |
|---|-----------|--------|
| 9 | Public categories endpoint works, returns 4 (staging baseline) | ✅ |
| 10 | All 7 categories unchanged | ✅ |
| 11 | Public artworks unchanged (39 from API, 39 from DB) | ✅ |
| 12 | Artwork detail endpoint works | ✅ |
| 13 | Maintenance mode OFF at end of all tests | ✅ |
| 14 | Admin order list accessible | ✅ |
| 15 | Artwork count unchanged (67) | ✅ |
| 16 | Category count unchanged (7) | ✅ |
| 17 | Public artwork DB count unchanged (39) | ✅ |

### Safety confirmations — staging validation

- ✅ No production DB accessed (staging only)
- ✅ No production migration run (ORD-02 requires none)
- ✅ No Inventory Preview / Apply run
- ✅ No production import
- ✅ No artwork, category, or pricing data modified
- ✅ No price recalculation
- ✅ Maintenance mode OFF at end of all tests
- ✅ Test order request deleted from staging — `order_requests` count: 0
- ✅ `server/.env` not staged or committed
