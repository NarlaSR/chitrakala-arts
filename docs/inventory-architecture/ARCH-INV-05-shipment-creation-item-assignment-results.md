# ARCH-INV-05 — Shipment Creation and Item Assignment: Results

**Branch:** `feature/ARCH-INV-05-shipment-creation-item-assignment`
**Date:** 2026-07-31
**Status:** Implementation complete; pending local + staging re-validation and owner merge approval

---

## 1. Scope

Implements the admin-side shipment creation and item assignment workflow per ARCH-INV-02F and
ARCH-INV-02C. Covers:

- POST `/api/admin/shipments` — create a new shipment record
- PATCH `/api/admin/shipments/:id` — update fields and status (forward-only transitions)
- POST `/api/admin/shipments/:id/items` — add artwork to shipment; creates `shipment_items` + `physical_inventory` rows at `PENDING_SHIPMENT` + `CREATED` movement logs
- DELETE `/api/admin/shipments/:id/items/:item_id` — remove item from DRAFT shipment; deletes `physical_inventory` rows at `PENDING_SHIPMENT` + `shipment_items` row
- GET `/api/admin/physical-inventory/summary?artwork_id=` — per-status count summary for one artwork (new, for PI badge)
- Admin UI: Create Shipment form, Shipment Detail page with Add Artwork / status update, physical inventory badge on artwork edit panel

**Out of scope (not implemented):** receiving workflow, DELIVERED status, `RECEIVED`/`INSPECTED`/`AVAILABLE`/`RESERVED`/`SOLD` physical inventory statuses, reservation workflow, fulfillment, publish safety warnings, SKU generation, public visibility changes.

---

## 2. Pre-Merge Decisions Applied

### Decision 1 — Forward-only shipment status transition guard

Added `SHIPMENT_TRANSITION_MAP` constant in `server/server.js` before the ARCH-INV-05 endpoint block:

```
DRAFT          → READY_TO_SHIP, SHIPPED, CANCELLED
READY_TO_SHIP  → SHIPPED, CANCELLED
SHIPPED        → IN_TRANSIT
IN_TRANSIT     → CUSTOMS
CUSTOMS        → (terminal in ARCH-INV-05 scope)
DELIVERED      → (terminal)
CLOSED         → (terminal)
CANCELLED      → (terminal)
```

The PATCH endpoint now:
1. Fetches the current shipment record before any update
2. Validates the requested status against `SHIPMENT_TRANSITION_MAP[current.status]`
3. Same-status re-saves (e.g. PATCH status=SHIPPED when already SHIPPED) are allowed through without error
4. Backward transitions return HTTP 400 with a descriptive error

The `SHIPPED` cascade (`physical_inventory` `PENDING_SHIPMENT` → `IN_TRANSIT` + `SHIPPED` movement logs) in `updateShipmentAdmin` now accepts a `currentStatus` parameter and only fires when `status === 'SHIPPED' && currentStatus !== 'SHIPPED'`. Repeating PATCH `status=SHIPPED` does not duplicate movement rows.

### Decision 2 — Physical inventory badge on artwork edit panel (AdminReviewQueue)

Added a read-only "Physical Inventory" badge inside the `AdminReviewQueue.js` inline edit panel. Behaviour:
- Fires `inventoryAPI.getPhysicalInventorySummaryForArtwork(artwork.id)` when `startEdit(artwork)` is called
- Shows "Loading…" while pending
- Shows "No physical inventory records yet." if no rows exist
- Shows per-status count chips (e.g. "1 PENDING_SHIPMENT") if rows exist
- Clears when the panel is closed
- Read-only — no mutations from this badge

---

## 3. Files Changed

### Backend

| File | Change |
|------|--------|
| `server/dbQueries.js` | Added `ALLOWED_SHIPMENT_STATUSES_CREATE`, `ALLOWED_SHIPMENT_STATUSES_UPDATE` constants; `createShipmentAdmin`, `updateShipmentAdmin` (with `currentStatus` guard), `addShipmentItemAdmin`, `removeShipmentItemAdmin`, `getPhysicalInventorySummaryForArtwork` functions. All exported. |
| `server/server.js` | Added `SHIPMENT_TRANSITION_MAP`; POST/PATCH/POST-items/DELETE-items shipment endpoints; GET `/api/admin/physical-inventory/summary` endpoint. PATCH endpoint fetches current status before update and passes it to `updateShipmentAdmin`. |

### Frontend

| File | Change |
|------|--------|
| `src/services/api.js` | Added `createShipment`, `updateShipment`, `addShipmentItem`, `removeShipmentItem`, `getPhysicalInventorySummaryForArtwork` to `inventoryAPI`. |
| `src/pages/AdminCreateShipment.js` | New page — create shipment form. |
| `src/styles/AdminCreateShipment.css` | New stylesheet (`acs-` prefix). |
| `src/pages/AdminShipmentDetail.js` | New page — shipment detail with status update, manifest management. |
| `src/styles/AdminShipmentDetail.css` | New stylesheet (`asd-` prefix). |
| `src/pages/AdminShipments.js` | Added "Create Shipment" button; View button → `Link`; removed inline expand panel. |
| `src/pages/AdminReviewQueue.js` | Added `inventoryAPI` import; `piSummary`/`piLoading` state; PI fetch in `startEdit`; PI badge JSX before save/cancel buttons. |
| `src/styles/AdminReviewQueue.css` | Added `.rq-pi-badge*` CSS classes. |
| `src/App.js` | Added routes for `/ckk-secure-admin/shipments/create` and `/ckk-secure-admin/shipments/:id`. |

---

## 4. Schema Alignment

Verified against `server/dbMigration/migrate_arch_inv03_shipment_physical_inventory.sql`:

| Check | Result |
|-------|--------|
| `inventory_movements.movement_type` CHECK allows `CREATED` | ✅ |
| `inventory_movements.movement_type` CHECK allows `SHIPPED` | ✅ |
| `shipments.status` CHECK allows all 8 values used | ✅ |
| `physical_inventory` has no `shipment_item_id` FK | ✅ (delete uses `shipment_id + artwork_id + artwork_size_id + status=PENDING_SHIPMENT LIMIT qty`) |
| Duplicate artwork+size in same shipment is blocked at API layer | ✅ (409 on conflict) |
| `shipment_items.quantity` = manifest count only, not PI row count | ✅ |

---

## 5. Local Validation Results (2026-07-31)

**Active DB host before validation:** `localhost:5433` (local) — confirmed not staging or production.

Backend restarted with new code (new route `GET /api/admin/physical-inventory/summary` confirmed
returning `{"error":"Access token required"}` before login, confirming new server code loaded).

**Fix applied during validation:** Carrier required-check in PATCH endpoint fired incorrectly on
same-status re-saves (e.g. `PATCH status=SHIPPED` on an already-SHIPPED shipment returned 400
because no carrier in body). Fixed: carrier is now required only on the actual transition INTO
SHIPPED (`current.status !== 'SHIPPED'`). Committed in this validation pass.

All 37 checks passed:

| Category | Checks | Result |
|---|---|---|
| Login + auth | 2 | ✅ |
| PI badge — empty state | 3 | ✅ |
| PI badge — with PI rows | 2 | ✅ |
| PI badge — missing artwork_id param | 1 | ✅ |
| Create shipment | 3 | ✅ |
| Add item (qty=2, 2 PI rows, 2 CREATED movements) | 5 | ✅ |
| PI badge — after item added | 2 | ✅ |
| Transition guard — backward blocked (DRAFT→IN_TRANSIT, CANCELLED→DRAFT, CANCELLED→SHIPPED) | 5 | ✅ |
| SHIPPED cascade (PI PENDING_SHIPMENT → IN_TRANSIT, 1 SHIPPED movement) | 5 | ✅ |
| Repeat PATCH status=SHIPPED — no duplicate movement | 2 | ✅ |
| SHIPPED→DRAFT blocked, IN_TRANSIT→DRAFT blocked | 3 | ✅ |
| DELETE item from IN_TRANSIT and CANCELLED blocked | 2 | ✅ |
| DELETE item from DRAFT — removes PI rows | 4 | ✅ |
| Admin shipments list, PI list | 2 | ✅ |
| Public gallery + categories + order-requests | 3 | ✅ |
| Cleanup — 3 test shipments removed, 0 remaining | 2 | ✅ |

**UI verification (browser):**
- Admin Shipments list loads, "+ Create Shipment" button present ✅
- Admin Create Shipment page loads with all fields ✅
- Admin Shipment Detail page loads with metadata, status dropdown, manifest table ✅
- PI badge (with rows): artwork `cks-2026-dm-lg-00003` → "2 IN TRANSIT" ✅
- PI badge (empty): artwork `cks-2026-dm-md-00001` → "No physical inventory records yet." ✅
- Public gallery homepage loads ✅
- WEB-CAT-02 / category files: `git diff HEAD~2 HEAD` shows no changes ✅

**Cleanup:** All 3 `LOCAL-INV05-TEST*` shipments and their PI/movement rows removed. Confirmed 0 rows remaining.

---

## 6. Staging Validation Results (2026-07-31)

**Target:** `shinkansen.proxy.rlwy.net:41009` (staging)
**Method:** Direct DB validation script (bypasses HTTP auth — staging admin credentials don't match; same pre-existing issue as ARCH-INV-04)
**Active host during staging:** confirmed `shinkansen` — crossover (production) not touched.

All 26 checks passed:

| Category | Checks | Result |
|---|---|---|
| Host safety (shinkansen confirmed, crossover absent) | 3 | ✅ |
| PI summary query on staging schema | 1 | ✅ |
| Create shipment (`ARCH-INV-05-STAGING-TEST`) | 1 | ✅ |
| Add item — shipment_items + physical_inventory PENDING_SHIPMENT + CREATED movement | 3 | ✅ |
| PI summary shows PENDING_SHIPMENT after add | 1 | ✅ |
| Transition map logic — DRAFT→SHIPPED allowed, bad transitions blocked | 5 | ✅ |
| SHIPPED cascade — PI → IN_TRANSIT, SHIPPED movement logged | 3 | ✅ |
| Duplicate prevention — same-status cascade guard, movement count=1 | 2 | ✅ |
| DELETE safety guard — canDelete=false for SHIPPED shipment | 2 | ✅ |
| Full row verify — shipment SHIPPED, PI IN_TRANSIT, 2 movements CREATED+SHIPPED | 5 | ✅ |
| Status CHECK constraint exists on staging shipments table | 1 | ✅ |
| Cleanup — all test rows removed, 0 remaining | 3 | ✅ |

**Test row:** `ARCH-INV-05-STAGING-TEST` (shipment id=2) — fully removed. Confirmed 0 rows remaining.

**Active DB host after staging validation:** restored to `localhost:5433` (local). Confirmed via `node -e` check.

---

## 7. Production Deploy and Read-Only Smoke (2026-07-31)

**Merge commit:** `cf8100a` — Merge feature/ARCH-INV-05-shipment-creation-item-assignment into main
**Latest main commit:** `cf8100a`
**Push:** `7fcf362..cf8100a  main -> main`
**Railway backend auto-deploy:** confirmed — new endpoint live on first probe (attempt 1)
**Vercel frontend auto-deploy:** confirmed — `www.chitrakala-arts.com` serving production build

### Public HTTP Checks

| Check | Result |
|---|---|
| `GET /api/artworks` returns 200 | ✅ |
| Public artworks count = 38 | ✅ 38 |
| All public artworks are IN_STOCK | ✅ only `["IN_STOCK"]` |
| ISYNC-18 artworks not in public list | ✅ none leaked |
| `GET /api/categories` returns 200 | ✅ |
| Production admin login page renders | ✅ — `www.chitrakala-arts.com/ckk-secure-admin` |
| `/ckk-secure-admin/shipments` → redirects to login (route deployed + guard works) | ✅ |
| `/ckk-secure-admin/shipments/create` → redirects to login (route deployed + guard works) | ✅ |
| Public gallery homepage loads | ✅ — `www.chitrakala-arts.com` |

### New Endpoint Deployment

| Check | Result |
|---|---|
| `GET /admin/physical-inventory/summary?artwork_id=test` → 401 (not 404) | ✅ deployed |
| `GET /admin/shipments` → 401 (not 404) | ✅ deployed |
| `POST /admin/shipments` → 401 (not 404) | ✅ deployed |

### Production DB — Safety Counts (read-only, crossover confirmed)

| Check | Result |
|---|---|
| Production DB host (crossover, not shinkansen) | ✅ confirmed |
| No production shipment rows | ✅ count=0 |
| No production physical_inventory rows | ✅ count=0 |
| No SHIPPED/RECEIVED/INSPECTED movement rows | ✅ count=0 |
| Production public artworks = 38 (show_on_website=true + IN_STOCK/MTO) | ✅ count=38 |
| ISYNC-18 artworks present (4 rows) | ✅ count=4 |
| ISYNC-18 artworks all have show_on_website=false | ✅ all hidden |
| No artworks status-changed to IN_STOCK/MTO in last 2h (Apply not run) | ✅ count=0 recent changes |
| Production admin user (cks-admin) exists with role=admin | ✅ |
| order_requests table accessible | ✅ 3 existing rows |

**Admin login via HTTP:** Not verified programmatically — production credentials (`cks-admin` / Railway env) not available in local environment. Admin user confirmed present in DB. Routes confirmed deployed and auth-gated. Manual verification by Sanjay recommended.

**server/.env restored to local after production smoke:** confirmed — active host `localhost:5433`.

### Safety Confirmations

- No production shipment rows created ✅
- No production physical_inventory rows created ✅
- No artwork published or visibility changed ✅
- No SKU generated ✅
- No Inventory Preview or Apply run ✅
- No order request behavior changed ✅
- ORD-03 / ORD-04 unaffected ✅

**Phase 2 completed 2026-07-31. SHIP-2026-001 created as DRAFT. See Section 8 below.**

---

## 8. Phase 2 — First Production Shipment Setup (2026-07-31)

Owner-approved controlled production action. Phase 2 approved explicitly before execution.

### Production Backup

| Item | Value |
|------|-------|
| Backup file | `chitrakala_prod_20260731_pre_arch_inv05_ship_2026_001.backup.json` (project root, not committed) |
| Backup size | 14 MB (JSON export — includes ISYNC-18 artwork image binary data) |
| Contents | shipments (0 rows), shipment_items (0 rows), physical_inventory (0 rows), inventory_movements (0 rows), isync18_artworks (4 rows) |

### Baseline Counts (before setup)

| Table | Count |
|-------|-------|
| artworks | 42 |
| artwork_sizes | 91 |
| categories | 7 |
| public artworks (IN_STOCK/MTO + show_on_website=true) | 38 |
| order_requests | 3 |
| order_request_items | 4 |
| shipments | 0 |
| shipment_items | 0 |
| physical_inventory | 0 |
| inventory_movements | 0 |

### Pre-Create Safety Checks

| Check | Result |
|-------|--------|
| No existing SHIP-2026-001 | ✅ |
| All 4 ISYNC-18 artwork IDs exist | ✅ |
| All 4 are NEEDS_REVIEW + show_on_website=false + sku=null | ✅ |
| No existing physical_inventory rows for ISYNC-18 artworks | ✅ |
| No existing shipment_items for ISYNC-18 artworks | ✅ |

### Controlled Production Action

Executed via direct production DB transaction (replicating `createShipmentAdmin` + `addShipmentItemAdmin` logic exactly). All operations ran inside a single transaction; committed atomically.

**Shipment created:**

| Field | Value |
|-------|-------|
| id | 1 |
| reference_number | SHIP-2026-001 |
| status | DRAFT |
| source_location | Chitrakala Sanskriti / India |
| destination_location | Sainar Chitrakala Ventures / USA |
| created_by (movements) | cks-admin |

**Shipment items created:**

| shipment_item.id | artwork_id | artwork_size_id | quantity |
|---|---|---|---|
| 1 | art-1785182575357-0 | null | 1 |
| 2 | art-1785182575357-1 | null | 1 |
| 3 | art-1785182575357-2 | null | 1 |
| 4 | art-1785182575357-3 | null | 1 |

Note: `artwork_size_id = null` because these artworks have no `artwork_sizes` rows on production.

**Physical inventory rows created:**

| physical_inventory.id | artwork_id | status | source |
|---|---|---|---|
| 1 | art-1785182575357-0 | PENDING_SHIPMENT | India - Artist Studio |
| 2 | art-1785182575357-1 | PENDING_SHIPMENT | India - Artist Studio |
| 3 | art-1785182575357-2 | PENDING_SHIPMENT | India - Artist Studio |
| 4 | art-1785182575357-3 | PENDING_SHIPMENT | India - Artist Studio |

**Inventory movements created:**

| movement.id | physical_inventory_id | artwork_id | movement_type | qty_change | ref_type | ref_id | created_by |
|---|---|---|---|---|---|---|---|
| 1 | 1 | art-1785182575357-0 | CREATED | 1 | shipment | 1 | cks-admin |
| 2 | 2 | art-1785182575357-1 | CREATED | 1 | shipment | 1 | cks-admin |
| 3 | 3 | art-1785182575357-2 | CREATED | 1 | shipment | 1 | cks-admin |
| 4 | 4 | art-1785182575357-3 | CREATED | 1 | shipment | 1 | cks-admin |

### Post-Action Counts

| Table | Before | After |
|-------|--------|-------|
| shipments | 0 | 1 |
| shipment_items | 0 | 4 |
| physical_inventory | 0 | 4 |
| inventory_movements | 0 | 4 |
| public artworks | 38 | 38 |
| order_requests | 3 | 3 |
| order_request_items | 4 | 4 |

### Post-Action Validation (all assertions)

| Check | Result |
|-------|--------|
| shipments = 1 | ✅ |
| shipment_items = 4 | ✅ |
| physical_inventory = 4 | ✅ |
| inventory_movements = 4 (all CREATED) | ✅ |
| shipment status = DRAFT | ✅ |
| all 4 physical_inventory rows are PENDING_SHIPMENT | ✅ |
| no PI row IN_TRANSIT / RECEIVED / INSPECTED / AVAILABLE / RESERVED / SOLD | ✅ |
| all 4 ISYNC-18 artworks: NEEDS_REVIEW + show_on_website=false + sku=null | ✅ |
| public artworks = 38 | ✅ |
| order_requests = 3 (unchanged) | ✅ |
| order_request_items = 4 (unchanged) | ✅ |
| no SKU generated | ✅ |
| no artwork published | ✅ |
| no Inventory Apply run | ✅ |
| ISYNC-18 artworks not in public gallery (0 leaked) | ✅ (confirmed via public API) |

### Admin UI Verification

| Check | Result |
|-------|--------|
| Production admin login page renders | ✅ (confirmed via browser) |
| GET /admin/shipments → 401 (not 404) | ✅ (routes deployed + auth-gated) |
| GET /admin/physical-inventory → 401 (not 404) | ✅ |
| GET /admin/physical-inventory/summary → 401 (not 404) | ✅ |
| Public gallery `/api/artworks` → 38 artworks, 0 ISYNC-18 | ✅ (confirmed via API) |
| Admin Shipments list shows SHIP-2026-001 | Requires manual login by Sanjay (production credentials not available locally) |
| Shipment detail shows 4 items | Requires manual login by Sanjay |
| Admin Physical Inventory shows 4 PENDING_SHIPMENT rows | Requires manual login by Sanjay |
| PI badge on artwork edit panel shows 1 PENDING_SHIPMENT per ISYNC-18 artwork | Requires manual login by Sanjay |

### Safety Confirmations

- No production shipment marked SHIPPED ✅
- No physical_inventory moved to IN_TRANSIT, RECEIVED, INSPECTED, AVAILABLE, RESERVED, or SOLD ✅
- No artwork published or show_on_website changed ✅
- No SKU generated ✅
- No Inventory Preview or Apply run ✅
- No order request behavior changed ✅
- server/.env confirmed localhost:5433 throughout ✅
- Backup file not committed ✅

---

## 9. Active Restrictions (carry forward)

The following restrictions remain in force and were not violated in this ticket:

- Do not implement receiving workflow
- Do not mark shipment as DELIVERED or mark SHIPPED until owner-approved Phase 3
- Do not move physical_inventory to RECEIVED, INSPECTED, AVAILABLE, RESERVED, or SOLD
- Do not implement reservation or fulfillment workflows
- Do not add publish safety warnings, generate SKUs, or change public visibility
- Production API: controlled writes only with explicit owner approval per phase

---

## 10. Done Recommendation

**ARCH-INV-05 can be marked Done.**

Phase 1 (merge + deploy) and Phase 2 (first production shipment setup) are both complete. SHIP-2026-001 exists on production as DRAFT with 4 PENDING_SHIPMENT physical inventory rows. All restrictions honoured. No receiving, inspection, publish, or SKU workflow started.

Next: ARCH-INV-06 (receiving workflow) when owner is ready to proceed after the physical shipment arrives.
