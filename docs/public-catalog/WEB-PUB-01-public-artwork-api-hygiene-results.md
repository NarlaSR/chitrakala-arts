# WEB-PUB-01 — Remove Admin-Only Fields from Public Artwork API

**Status:** Complete — implemented, local and staging validation both passed
**Date:** 2026-08-05
**Depends on:** WEB-CAT-02 (Done), ISYNC-18 (Done), ARCH-INV-03 through ARCH-INV-06 (Done)
**Branch:** `feature/WEB-PUB-01-public-artwork-api-hygiene` (created from updated `main`)

## Preflight

| Check | Result |
|---|---|
| `git checkout main` / `git pull origin main --ff-only` | Fast-forwarded `cdf7422` → `595c3ef` |
| WEB-CAT-02 merged into `main` | ✅ `51fd8fe` "Merge pull request #28 from NarlaSR/feature/WEB-CAT-02-public-category-filter" + production smoke `b1248bc` |
| ISYNC-18 merged/closed | ✅ `e67a231` |
| ARCH-INV-03 through ARCH-INV-06 merged/done | ✅ `910e4e2` (03), `42db397` (04), `cf8100a` (05), `961f9bc` (06) — all confirmed ancestors of `origin/main`. (`main` had also advanced further with ARCH-INV-07, unrelated to this ticket, not touched.) |
| Git status clean except unrelated untracked files | ✅ Same pre-existing untracked leftovers as prior tickets, none touched |
| `server/.env` / secrets / logs / temp scripts / workbooks / ZIPs / backups / raw response JSON staged | ✅ None — only pre-existing untracked leftovers present, none staged |
| Branch created | `feature/WEB-PUB-01-public-artwork-api-hygiene`, from `main` at `595c3ef` |

## Files inspected

- `server/server.js` — `GET /api/artworks`, `GET /api/artworks/:id` (public routes to be shaped), `GET /api/admin/artworks` (to confirm no admin change), `PUT /api/artworks/:id/price`, `PUT /api/artworks/:id`, `DELETE /api/artworks/:id`, `PATCH /api/admin/artworks/:id/status` (admin writes, to confirm none affected), `POST /api/order-requests` (to check what it reads off the shared `getArtworkById()` return value), `POST /api/admin/shipments/:id/items` (ARCH-INV, to confirm it also uses the unshaped internal artwork object).
- `server/dbQueries.js` — `getArtworks()`, `getArtworkById()`, `getArtworksAdmin()`, `enrichArtworkRows()`, `getArtworkSizes()` — to see exactly what each query/enrichment step adds, and to decide whether shaping belongs here or in the route layer.
- Live Postgres schema (`information_schema.columns`) for `artworks`, `artwork_sizes`, `categories` — to get the authoritative full field list, not just what happens to appear in one sample response.
- Frontend: `src/pages/Home.js`, `src/pages/CategoryPage.js`, `src/pages/ArtDetails.js`, `src/components/ArtCard.js`, `src/utils/priceUtils.js`, `src/context/RequestCartContext.js`, `src/components/RequestCartModal.js`, `src/components/RequestDetailsForm.js`, `src/pages/RequestConfirmation.js`, `src/services/api.js` — to determine, field by field, what the public UI actually reads off an artwork object (delegated to a research pass covering every field with file:line citations, cross-checked directly for the one field that mattered most — see below).
- `src/pages/AdminReviewQueue.js`, `src/pages/AdminOrderRequests.js`, `src/pages/AdminDashboard.js` — only enough to confirm they call `/api/admin/...` endpoints exclusively, never the public `/api/artworks` endpoints, so they cannot be affected by this change.
- ARCH-INV admin shipment/physical-inventory routes (`/api/admin/shipments*`, `/api/admin/physical-inventory*`) — confirmed they use their own dedicated query functions (`getShipmentsAdmin`, `getPhysicalInventoryAdmin`, etc.), never `getArtworks()`/`getArtworkById()`'s public-path output, and live in entirely separate tables (`shipments`, `shipment_items`, `physical_inventory`, `inventory_movements`) joined only in admin-only code paths — so there is no possibility of shipment/PI fields leaking into the public artwork response today, and no risk of this change touching ARCH-INV behavior.

## Current public list/detail response fields (before cleanup)

Captured live from `GET /api/artworks/:id` (identical field set — minus `sizes` context differences — for `GET /api/artworks`):

```json
{
  "id": "art-1782445237565",
  "title": "Aqua Blue Floral Wall Decor",
  "category": "mirror-mosaic",
  "price": "8000.00",
  "description": null,
  "dimensions": null,
  "materials": "Wood, mirrors",
  "image": "https://.../api/images/artworks/art-1782445237565",
  "featured": false,
  "created_at": "2026-06-26T07:40:37.597Z",
  "image_mime_type": null,
  "price_inr": "8000.00",
  "price_usd": "152.00",
  "fx_rate_used": "92.4000",
  "multiplier_used": "1.7500",
  "sku": null,
  "quantity": 1,
  "status": "IN_STOCK",
  "show_on_website": true,
  "sizes": [{ "id": 646, "size_label": "18\"x 18\"", "price": "8000.00", "price_usd": 152 }],
  "updatedAt": "2026-07-01T16:20:43.073Z"
}
```

Root cause: both public route handlers (`server/server.js`) only ever did `if ('image_data' in artwork) delete artwork.image_data;` plus the `updated_at` → `updatedAt` rename — every other column from `SELECT * FROM artworks` (20 columns, confirmed via `information_schema.columns`) passes straight through unfiltered. There has never been an explicit public-field whitelist.

**`artworks` table columns (all 20, confirmed live):** `id, title, category, price, description, dimensions, materials, image, featured, created_at, image_data, image_mime_type, updated_at, price_inr, price_usd, fx_rate_used, multiplier_used, sku, quantity, status, show_on_website`.

**Nested `sizes[]` fields (via `getArtworkSizes()` + enrichment):** only `id, size_label, price, price_usd` — `getArtworkSizes()` already explicitly selects just `id, size_label, price` (not `artwork_id`/`created_at`, which also exist on `artwork_sizes`), and enrichment adds computed `price_usd`. **No admin-only fields are nested inside `sizes[]` today.**

**Category:** `category` is a flat VARCHAR slug string (e.g. `'mirror-mosaic'`) copied straight from `artworks.category` — there is no nested category object and no join, so there's nothing admin-only to leak there either.

## Field-by-field: public-needed vs. admin/internal-only

A dedicated investigation pass grepped every public-facing frontend file (`Home.js`, `CategoryPage.js`, `ArtDetails.js`, `ArtCard.js`, `priceUtils.js`, `RequestCartContext.js`, `RequestCartModal.js`, `RequestDetailsForm.js`, `RequestConfirmation.js`, `services/api.js`) for every field currently present in the public response, with file:line citations for each usage found.

| Field | Public UI usage found? | Decision |
|---|---|---|
| `id` | ✅ Used everywhere (links, cart, order-request `artwork_id`) | **Keep** |
| `title` | ✅ `ArtDetails.js`, `ArtCard.js` | **Keep** |
| `category` | ✅ `Home.js` (featured grouping), `CategoryPage.js` (client-side filter), `ArtDetails.js` | **Keep** |
| `price` (bare/legacy) | ✅ Used as a fallback when `price_inr` is null, in `priceUtils.js:36` and `ArtDetails.js:99` | **Keep** — removing would change behavior for any artwork relying on the legacy field |
| `description` | ✅ `ArtDetails.js`, `ArtCard.js` | **Keep** |
| `dimensions` | ✅ `ArtDetails.js` (spec display + size-label fallback) | **Keep** |
| `materials` | ✅ `ArtDetails.js` | **Keep** |
| `image` | ✅ `ArtDetails.js`, `ArtCard.js` | **Keep** |
| `featured` | ✅ `Home.js:43` — the only place it's read, but it's load-bearing (Featured Artworks section) | **Keep** |
| `created_at` | ❌ Zero public-facing usage found — only used in `AdminReviewQueue.js` (admin) | **Remove** |
| `updatedAt` (from `updated_at`) | ✅ `ArtDetails.js`/`ArtCard.js` — cache-busting query string on the image URL | **Keep** |
| `price_inr` | ✅ `ArtDetails.js`, `priceUtils.js` | **Keep** |
| `price_usd` | ✅ `ArtDetails.js`, `priceUtils.js` | **Keep** |
| `fx_rate_used` | ❌ Zero public-facing usage — only referenced as an *outgoing* field name in an admin price-update call (`services/api.js`, called only from `AdminDashboard.js`) | **Remove** |
| `multiplier_used` | ❌ Same as `fx_rate_used` — admin-only | **Remove** |
| `sku` | ❌ Zero public-facing usage — only used in `AdminDashboard.js`/`AdminReviewQueue.js`. **Critical distinction confirmed:** the order-request *creation* route (`POST /api/order-requests`, `server.js:2100`) reads `artwork.sku` directly off the object returned by `db.getArtworkById(id, true)` to build `snapshot_sku` — but this is an **internal Node-level call to the shared DB function**, not a read of the public HTTP JSON response. Since field-shaping will only be applied to the JSON sent back by the two public GET route handlers (not inside `dbQueries.js`), removing `sku` from the public response has **zero effect** on snapshot capture | **Remove from public response; unaffected internally** |
| `quantity` | ❌ Zero public-facing usage as an artwork field — only in admin code (`AdminReviewQueue.js`, `AdminShipmentDetail.js`, `AdminInventorySync.js`). (The customer-chosen request quantity in `RequestConfirmation.js`/`RequestCartModal.js` is a different, order-request-level field, unrelated to the artwork's own stock `quantity` column) | **Remove** |
| `status` | ✅ `ArtDetails.js:98,128`, `ArtCard.js:26` — drives the "Available"/"Made to Order" label and is sent into the request-cart context as `availability`. Per the ticket's explicit caution, removing this would require frontend changes, so it is **kept**, not removed. This is safe to expose as-is: only artworks that already passed the public visibility filter (`status IN ('IN_STOCK','MADE_TO_ORDER')`) ever reach this response, so the exposed value can only ever be one of those two values — never `NEEDS_REVIEW`/`SOLD`/`ARCHIVED`/`OUT_OF_STOCK` | **Keep** |
| `show_on_website` | ❌ Zero public-facing usage — admin-only control field (`AdminDashboard.js`, `AdminReviewQueue.js`). Ticket explicitly flags this as a control field that should never be public | **Remove** |
| `image_mime_type` | ❌ Zero usage anywhere in `src/`, admin included — internal blob-serving metadata only relevant to the `/api/images/artworks/:id` binary-serving route | **Remove** |

**"notes" field:** the `artworks` table has **no `notes` column at all** (confirmed via `information_schema.columns` — the 20 columns listed above are the complete set). There is nothing to remove here; documenting this so the absence isn't mistaken for an oversight.

**Shipment/physical-inventory fields:** none exist on `artworks` or are joined into it — confirmed by inspecting `enrichArtworkRows()` (only touches `sizes`, `image`, `price_usd`) and the ARCH-INV admin routes (entirely separate tables, separate query functions, never touching `getArtworks()`/`getArtworkById()`'s output).

## Does the order-request flow depend on any field being removed?

**Yes — on `sku`, `title`, `category`, `dimensions`, `price_inr`, `price_usd`, `image`, `status`** (`server.js:2096-2108`, the `resolvedItems.push({...})` block that builds `snapshot_*` fields for `order_request_items`). All of these except `sku` are already being **kept** in the public whitelist for UI reasons too. `sku` is the one field being removed from the public response that the snapshot logic needs — and it remains fully available internally because **field-shaping will be applied only to the outgoing JSON in the two public GET route handlers, never inside `getArtworkById()`/`getArtworks()` themselves**, which the order-request route calls directly. This was the single most important thing to get right in this investigation, and it drove the implementation approach below.

## Does public availability/price display depend on any field being removed?

No. Availability display uses `status` (kept). Price display uses `price`, `price_inr`, `price_usd`, and per-size `sizes[].price`/`sizes[].price_usd` (all kept). None of the fields being removed (`created_at`, `fx_rate_used`, `multiplier_used`, `sku`, `quantity`, `show_on_website`, `image_mime_type`) are read by any price or availability display code.

## Implementation approach (decided from the above)

**Shape the response only at the public route-handler layer (`server/server.js`), never inside `server/dbQueries.js`.** This is the only approach consistent with the order-request route's internal need for the full (unshaped) artwork object from the same shared `getArtworkById()`/`getArtworks()` functions. Two small helper functions, `shapePublicArtwork()` and `shapePublicArtworkSize()`, will be added near the public artwork routes and applied to the response array/object immediately before `res.json(...)` in `GET /api/artworks` and `GET /api/artworks/:id` only. No other route, and no `dbQueries.js` function, will be touched.

**No stop condition was triggered:** no schema migration needed, no new endpoint needed, no field removal requires a frontend change (every field being removed has zero public-frontend usage, confirmed by direct grep with citations), no uncertainty about public-vs-admin status for any field, no change to visibility logic, WEB-CAT-02 category filtering, order-request behavior, ORD-03, ORD-04, or ARCH-INV behavior.

---

## Public-safe fields retained

`id`, `title`, `category`, `price`, `description`, `dimensions`, `materials`, `image`, `featured`, `price_inr`, `price_usd`, `status`, `sizes[]` (`id`, `size_label`, `price`, `price_usd`), `updatedAt`.

## Admin/internal fields removed

`created_at`, `fx_rate_used`, `multiplier_used`, `sku`, `quantity`, `show_on_website`, `image_mime_type` — plus, discovered only during staging validation (see below), `notes` and `image_filename`, which exist on the real staging/production schema but not on the local dev schema, and were correctly excluded automatically by the whitelist approach without needing to know about them in advance.

## Files changed

- `server/server.js` — added `shapePublicArtworkSize()` and `shapePublicArtwork()` helper functions; applied them in `GET /api/artworks` and `GET /api/artworks/:id` only.

No other file changed. `server/dbQueries.js` is untouched (confirmed via `git diff` — zero lines changed). No frontend file changed. No migration added.

## Implementation summary

Two small whitelist helpers were added directly above the two public artwork routes in `server/server.js`:

```js
function shapePublicArtworkSize(size) {
  return { id: size.id, size_label: size.size_label, price: size.price, price_usd: size.price_usd };
}

function shapePublicArtwork(artwork) {
  return {
    id: artwork.id, title: artwork.title, category: artwork.category, price: artwork.price,
    description: artwork.description, dimensions: artwork.dimensions, materials: artwork.materials,
    image: artwork.image, featured: artwork.featured, price_inr: artwork.price_inr,
    price_usd: artwork.price_usd, status: artwork.status,
    sizes: Array.isArray(artwork.sizes) ? artwork.sizes.map(shapePublicArtworkSize) : [],
    updatedAt: artwork.updated_at || artwork.updatedAt || null,
  };
}
```

`GET /api/artworks` now does `res.json(artworks.map(shapePublicArtwork))`; `GET /api/artworks/:id` now does `res.json(shapePublicArtwork(artwork))`. Both previously had inline `delete artwork.image_data` / `updated_at` → `updatedAt` rename logic, which is now folded into the whitelist (any field not explicitly listed, including `image_data`, is simply never included in the output object). **`server/dbQueries.js` was not touched at all** — `db.getArtworks()`/`db.getArtworkById()` still return the full, unshaped row (all 20+ columns) exactly as before, because `POST /api/order-requests` calls `db.getArtworkById(id, true)` directly and reads `artwork.sku` (among other fields) to build its `order_request_items` snapshot. Shaping only the two public HTTP responses — never the shared DB functions — was the key architectural decision from the investigation.

## Public API field-shaping behavior

| Endpoint | Before | After |
|---|---|---|
| `GET /api/artworks` | Full `SELECT *` row (20 columns) minus `image_data`, plus computed `sizes`/`updatedAt` | Exactly the 14-field whitelist above |
| `GET /api/artworks/:id` | Same as above | Same whitelist |
| `GET /api/admin/artworks` | Full row, unchanged | **Unchanged** — still full row (verified live) |
| `POST /api/order-requests` snapshot capture | Reads full row internally via `db.getArtworkById()` | **Unchanged** — still reads the full row internally; only the public HTTP response is shaped |

## `/api/artworks` validation

| Environment | Count | Result |
|---|---|---|
| Local | `37` (unchanged from pre-change baseline) | ✅ |
| Staging | `39` (matches WEB-CAT-02's prior staging baseline exactly) | ✅ |

Note: the ticket's validation checklist mentions confirming `38` as a possible production-like baseline; this ticket performed local (`37`) and staging (`39`) validation only, per its own instruction to run staging "only if safe and credentials are available" and to never touch production before merge approval — no production count was checked or is in scope here.

## Category-filter validation

| Slug | Local | Staging |
|---|---|---|
| *(none)* | 37 | 39 |
| `dot-mandala` | 19 | 20 |
| `lippan-art` | 8 | 10 |
| `texture-art` | 1 | 0 *(all 3 staging texture-art items are currently hidden — a real data-state fact confirmed during WEB-CAT-02, unrelated to this change)* |
| `warli-art` | 0 *(no local ISYNC-18 data)* | 1 *(2 hidden ISYNC-18 imports correctly excluded + 1 separate legitimately-public item correctly included — same known-correct staging state as WEB-CAT-02)* |
| `mixed-art` | 0 | 0 |
| Unknown slug | 0, `[]` | — |

All figures match the pre-existing WEB-CAT-02 baselines exactly — category filtering is fully unaffected by this ticket's field-shaping change.

## Hidden `NEEDS_REVIEW` / ISYNC-18 validation

- **Local:** no real `NEEDS_REVIEW` data exists in this dev DB (same limitation documented in WEB-CAT-02). Inserted a temporary hidden test artwork (`webpub01-test-warli-hidden`, `NEEDS_REVIEW`, `show_on_website=false`, `category='warli-art'`, with a real `sku` value) and confirmed: excluded from `?category=warli-art` (`0`), excluded from the unfiltered list (`37`, unchanged), **detail endpoint returns `404`**, and correctly visible (with full fields) via `GET /api/admin/artworks` (`38`). Deleted immediately after.
- **Staging (real data):** confirmed the two real hidden `warli-art` ISYNC-18 imports (`cks-2026-wa-md-00001`, `cks-2026-wa-lg-00001`) and the hidden `mixed-art` import (`cks-2026-ma-md-00001`) never appear in any public list/category response, and their detail endpoints return `404` (`GET /api/artworks/cks-2026-wa-md-00001` and `.../cks-2026-ma-md-00001` both confirmed `404`). A comprehensive automated check across the unfiltered list and all 8 category values confirmed zero `NEEDS_REVIEW` items, zero non-`IN_STOCK`/`MADE_TO_ORDER` items, and zero admin-field leaks in every single response.

## Public page validation

| Page | Local | Staging |
|---|---|---|
| Homepage (categories + Featured Artworks, depends on `.featured`) | ✅ Loads correctly, featured section renders | Not re-checked separately (same frontend code, already proven unaffected by API shape via the detail/category checks below) |
| Category page (`/category/dot-mandala`) | ✅ "19 artwork(s) available", matches API | ✅ Page rendered correctly against real staging data |
| Artwork detail page | ✅ Availability label, sizes, prices, materials, category all correct | ✅ Confirmed via live browser test |
| Price display | ✅ Per-size and base prices render correctly | ✅ Confirmed |
| Availability display | ✅ "Available" label renders correctly (from `status`) | ✅ Confirmed |
| Request cart (add/remove) | ✅ Works correctly | ✅ Works correctly |

## Order request regression result

✅ **No regression, on both environments.** Local: `POST /api/order-requests` → `201`, correct snapshot fields captured. **Critical rigor check:** created a temporary public test artwork with a real, non-null `sku` (`CKS-2026-MM-88888`); confirmed the public detail API correctly omits `sku` entirely (`'sku' in a === false`), then submitted an order request against it and confirmed `snapshot_sku: "CKS-2026-MM-88888"` was captured **correctly and completely** in the resulting `order_request_items` row and visible in the admin order-request detail view — definitive proof that removing `sku` from the public response has zero effect on internal snapshot capture. Staging: `201` via direct API call and via a full live browser submission, both successful.

## ORD-03 confirmation regression result

✅ **No regression, on both environments.** Local: full browser submission → confirmation page rendered with reference `#25` and correct content. Staging: full browser submission → confirmation page rendered with reference `#12` and correct content, against real staging artwork data.

## ORD-04 notification impact result

✅ **None — verified live via server log on both environments**, not just by code inspection (`sendOrderRequestNotificationEmail()` was never touched — confirmed via `git diff`):
- Local: `"Order request #23/#24/#25: admin notification not sent — RESEND_API_KEY is not configured."`
- Staging: `"Order request #11/#12: admin notification not sent — RESEND_API_KEY is not configured."`

## Admin endpoint regression result

✅ **Fully unchanged, confirmed live on both environments.** `GET /api/admin/artworks` still returns the complete, unshaped row — including `show_on_website`, `sku`, `quantity`, `fx_rate_used`, `multiplier_used`, `created_at`, `image_mime_type`, and (on staging, where they exist) `notes`/`image_filename`. `GET /api/admin/order-requests` unaffected. No admin route or admin query function was touched by this ticket (confirmed via `git diff`).

## ARCH-INV impact confirmation

✅ **No impact — confirmed both by code inspection and live testing.** `git diff` proves zero lines changed outside the two public artwork routes in `server.js`; no ARCH-INV route or `dbQueries.js` function was touched. Local: `GET /api/admin/shipments`/`physical-inventory` return the same pre-existing `500` (missing local ARCH-INV schema — an environment limitation documented in WEB-CAT-02, unrelated to this ticket). Staging (real schema/data): both endpoints return `200`; `STAG-TEST-001` (shipment id 3) and its associated `physical_inventory` row (id 3, `DAMAGED`) were snapshotted before and after all testing and are **byte-identical** — confirmed untouched.

## Staging validation results

Completed in full. **Target confirmed:** `shinkansen.proxy.rlwy.net:41009` (staging), confirmed via hostname/port check before connecting; `crossover.proxy.rlwy.net:54308` (production) never used. Credential: reused the current staging admin login established during the prior WEB-CAT-02 refresh session, used only in-memory for this session's API calls, never written to any file or printed in full.

All staging results are folded into the sections above (category filtering, hidden ISYNC-18 validation, order request/ORD-03/ORD-04 regression, ARCH-INV impact, field-shaping/leak checks). Staging test data (order requests id 11, id 12) was fully cleaned up; before/after counts (`artworks: 67`, `order_requests: 0`) confirmed identical.

## Tests added / manual validation explanation

**No backend test framework exists in this repository** (same finding as WEB-CAT-02 and prior tickets — confirmed again via search: no `*.test.js`/`*.spec.js` outside `node_modules`, no Jest/Mocha/Supertest/Chai dependency in either `package.json`). Per the ticket's own fallback instruction, manual/API validation was performed and is documented in full above and in the command list below.

**Representative validation commands used** (all against `http://localhost:5000`, both local and — with `DATABASE_URL` pointed at staging — against the real environment):
```
curl -s http://localhost:5000/api/artworks
curl -s "http://localhost:5000/api/artworks?category=dot-mandala"
curl -s "http://localhost:5000/api/artworks?category=warli-art"
curl -s "http://localhost:5000/api/artworks?category=mixed-art"
curl -s "http://localhost:5000/api/artworks?category=nonexistent-xyz"
curl -s http://localhost:5000/api/artworks/<id>
curl -s http://localhost:5000/api/admin/artworks -H "Authorization: Bearer <token>"
curl -s -X POST http://localhost:5000/api/order-requests -H "Content-Type: application/json" -d '{...}'
curl -s http://localhost:5000/api/admin/order-requests/<id> -H "Authorization: Bearer <token>"
curl -s http://localhost:5000/api/admin/shipments -H "Authorization: Bearer <token>"
curl -s http://localhost:5000/api/admin/physical-inventory -H "Authorization: Bearer <token>"
```
plus a Node script performing a comprehensive invariant check (status/visibility/`NEEDS_REVIEW`/field-leak) across the unfiltered list and every category value in one pass, and full browser-driven order-request submissions through to the ORD-03 confirmation page on both environments.

## Test data cleanup

| Environment | Test data created | Cleanup |
|---|---|---|
| Local | 1 hidden test artwork (`webpub01-test-warli-hidden`), 1 public test artwork with a real SKU (`webpub01-test-sku-public`), 3 order requests (ids 23, 24, 25) | ✅ All deleted; final artwork count `37`, pre-existing order-request rows (4, 7, 17) confirmed untouched |
| Staging | 2 order requests (ids 11, 12) | ✅ Both deleted; final `order_requests` count `0` (baseline), final artwork count `67` (baseline) |

## Safety confirmations

- ✅ No schema migration — none needed, none added.
- ✅ No new API endpoint added.
- ✅ Public visibility rule unchanged — `status IN ('IN_STOCK','MADE_TO_ORDER') AND show_on_website = true`, untouched in `dbQueries.js`.
- ✅ Hidden `NEEDS_REVIEW` artworks never returned publicly — verified with both a local synthetic test and real staging ISYNC-18 data.
- ✅ WEB-CAT-02 category filtering logic unchanged and unaffected — `git diff` confirms zero changes to the category-filtering code path; all category counts match prior baselines exactly.
- ✅ Order request creation behavior unchanged — `201` responses, correct snapshot capture including `sku` (rigorously proven with a dedicated test case).
- ✅ ORD-03 confirmation behavior unchanged — verified live on both environments.
- ✅ ORD-04 notification behavior unchanged — verified live via logs on both environments; notifier code untouched.
- ✅ ARCH-INV shipment/physical-inventory behavior unchanged — verified live on staging; `STAG-TEST-001` and its physical_inventory record confirmed byte-identical before/after.
- ✅ Admin artwork APIs unchanged — still return full fields, verified live on both environments.
- ✅ No artwork/category/pricing/SKU/inventory data modified — only two temporary local test artworks were created and immediately deleted; no existing row was ever modified.
- ✅ The 4 ISYNC-18 hidden imported artworks were never modified — only read (via list/detail/admin checks) on staging; never written to.
- ✅ No Inventory Preview/Apply run.
- ✅ No artwork published, no SKU generated/backfilled.
- ✅ No production DB accessed — staging host confirmed before every operation; production host never used.
- ✅ `server/.env` never committed — used only as a temporary local override for staging validation, restored to the local-only value immediately after, remains gitignored throughout.
- ✅ No secrets, logs, temp scripts, workbooks, ZIPs, backups, or raw response JSON committed.

## Final git status

Clean except pre-existing, unrelated untracked files (same set present since prior tickets) — none touched or committed.

## Ready for PR review

✅ **Yes.** Root cause (no field whitelist on public artwork responses) fixed with a minimal, surgical diff (one file, two new helper functions, two call sites updated) that keeps `dbQueries.js`, admin routes, order-request creation, ORD-03, ORD-04, WEB-CAT-02 filtering, and ARCH-INV entirely untouched. No stop conditions were hit. All required local and staging validation passed, including a rigorous end-to-end proof that the internal order-request SKU snapshot mechanism is unaffected by the public-facing field removal.
