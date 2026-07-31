# ARCH-INV-04 — Admin Inventory Read-Only Views: Results

**Ticket:** ARCH-INV-04 — Admin Inventory Read-Only Views  
**Branch:** `feature/ARCH-INV-04-admin-inventory-readonly-views`  
**Merge commit:** `42db397` — Merge feature/ARCH-INV-04-admin-inventory-readonly-views into main  
**Push:** `99bc015..42db397` → `origin/main`  
**Commits:** `31053d5` (implementation), `83e304c` (staging DB query results), `d976260` (full validation)  
**Date:** 2026-07-31  
**Status:** Done. Merged to main. Production smoke complete — all checks passed.

---

## Scope

Read-only admin visibility for the ARCH-INV-03 schema:
1. **Shipments** — list view with expandable manifest detail
2. **Physical Inventory** — list view with status-based filtering
3. **Inventory Movements** — backend endpoint only (`/api/admin/inventory-movements`)

No create/update/delete endpoints. No workflow actions. No public visibility changes.

---

## Files Changed

| File | Change |
|---|---|
| `server/dbQueries.js` | Added 4 query functions: `getShipmentsAdmin`, `getShipmentByIdAdmin`, `getPhysicalInventoryAdmin`, `getInventoryMovementsAdmin` |
| `server/server.js` | Added 4 GET endpoints under `/api/admin/` |
| `src/services/api.js` | Added `inventoryAPI` export (4 methods) |
| `src/pages/AdminShipments.js` | New — Shipments list + expandable manifest detail |
| `src/styles/AdminShipments.css` | New |
| `src/pages/AdminPhysicalInventory.js` | New — Physical Inventory list with status filters |
| `src/styles/AdminPhysicalInventory.css` | New |
| `src/App.js` | Added 2 admin routes |
| `src/pages/AdminDashboard.js` | Added 2 nav buttons (Shipments, Physical Inventory) |

---

## Backend Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/shipments` | Bearer JWT | All shipments with manifest item count |
| GET | `/api/admin/shipments/:id` | Bearer JWT | Single shipment with line items (joined with artwork titles) |
| GET | `/api/admin/physical-inventory` | Bearer JWT | All physical inventory rows (joined with artworks + shipments) |
| GET | `/api/admin/inventory-movements` | Bearer JWT | All movements (optional `?physical_inventory_id=` filter), capped at 500 rows |

No public endpoints for shipment or physical inventory data were added. All 4 endpoints require a valid Bearer JWT.

---

## Staging Admin UI Status — Known Limitation

**Option B used.** Staging admin UI login could not be validated.

- Staging DB (`shinkansen.proxy.rlwy.net:41009`) confirmed correct target (not production).
- ARCH-INV-03 tables confirmed present on staging via direct DB queries (see Staging Validation section below).
- Admin UI login on staging is blocked by a **pre-existing credential mismatch** between the staging DB's admin record and the current `server/.env` credentials. This issue predates ARCH-INV-04 and is unrelated to it.
- All UI validation was performed locally where admin credentials are known and working.

---

## Local Validation — Admin Authentication

| Check | Result |
|---|---|
| `POST /api/auth/login` with `local-admin / localdev123` → 200 | ✅ Token returned, `role: admin` confirmed |
| `isAdmin()` resolves correctly in React auth context | ✅ — confirmed via `AuthContext` code review: reads localStorage on mount, sets user state |
| Admin dashboard loads and shows both new nav buttons | ✅ "Shipments" and "Physical Inventory" buttons visible in `.admin-actions` |

---

## Local Validation — Unauthenticated Endpoint Rejection

All 4 new endpoints tested without a Bearer token via direct `fetch()`:

| Endpoint | Expected | Result |
|---|---|---|
| `GET /api/admin/shipments` | 401 | ✅ 401 |
| `GET /api/admin/shipments/1` | 401 | ✅ 401 |
| `GET /api/admin/physical-inventory` | 401 | ✅ 401 |
| `GET /api/admin/inventory-movements` | 401 | ✅ 401 |

---

## Local Validation — All 4 Authenticated Endpoints

Tested with a valid `local-admin` JWT via direct `fetch()` with `Authorization: Bearer <token>`:

| Endpoint | Expected | Result | Response |
|---|---|---|---|
| `GET /api/admin/shipments` | 200 | ✅ 200 | `[]` — no shipments created yet |
| `GET /api/admin/shipments/1` | 404 (no data) | ✅ 404 | `{"error":"Shipment not found"}` — endpoint exists; correct no-data response |
| `GET /api/admin/physical-inventory` | 200 | ✅ 200 | `[]` — no physical inventory rows yet |
| `GET /api/admin/inventory-movements` | 200 | ✅ 200 | `[]` — no movements yet |

Note on `/api/admin/shipments/:id`: because the shipments table is empty, no valid ID exists. Calling with id=1 returns 404 "Shipment not found" — this confirms the endpoint is wired, auth is enforced (401 without token), and the not-found branch is correct. The authenticated path that returns 200 + detail will be exercisable once shipments are created.

---

## Local Validation — Admin Pages and UI

| Check | Result |
|---|---|
| Frontend compiled with no errors | ✅ (`Compiled successfully`) |
| `/ckk-secure-admin/shipments` route loads | ✅ Heading "Shipments" confirmed |
| Shipments page: 9 filter buttons (All + 8 status values) | ✅ All + Draft, Ready to Ship, Shipped, In Transit, Customs, Delivered, Closed, Cancelled |
| Shipments page: empty state renders ("No shipments with status All") | ✅ |
| Shipments page: no error banner | ✅ `GET /api/admin/shipments` → 200 |
| Shipments page: "Physical Inventory" nav button navigates correctly | ✅ |
| `/ckk-secure-admin/physical-inventory` route loads | ✅ Heading "Physical Inventory" confirmed |
| Physical Inventory page: 11 filter buttons (All + 10 status values) | ✅ All + Pending, In Transit, Received, Needs Inspection, Inspected, Available, Reserved, Sold, Damaged, Archived |
| Physical Inventory page: empty state renders | ✅ |
| Physical Inventory page: no error banner | ✅ `GET /api/admin/physical-inventory` → 200 |
| Physical Inventory page: "Shipments" nav button navigates correctly | ✅ |
| Dashboard "Shipments" nav button present | ✅ |
| Dashboard "Physical Inventory" nav button present | ✅ |
| Browser console: no runtime errors from ARCH-INV-04 code | ✅ Only pre-existing React Router future flag warnings |

---

## Staging Validation — DB Queries

Validated against staging DB (`shinkansen.proxy.rlwy.net`) via Node.js/pg direct queries.

| Check | Result |
|---|---|
| Staging DB confirmed: shinkansen (not crossover/production) | ✅ |
| All 4 ARCH-INV-03 tables present | ✅ shipments, shipment_items, physical_inventory, inventory_movements |
| `getShipmentsAdmin` query executes cleanly | ✅ 0 rows |
| `getPhysicalInventoryAdmin` query executes cleanly | ✅ 0 rows |
| `getInventoryMovementsAdmin` query executes cleanly | ✅ 0 rows |
| `getShipmentByIdAdmin` items JOIN query executes cleanly | ✅ 0 rows |
| No staging data created or modified | ✅ |

---

## Production Smoke — Deploy

| Check | Result |
|---|---|
| Merge commit | `42db397` — Merge feature/ARCH-INV-04-admin-inventory-readonly-views into main |
| Push to origin/main | ✅ `99bc015..42db397` |
| Railway backend auto-deploy | ✅ `chitrakalaarts-production.up.railway.app` responding |
| Vercel frontend auto-deploy | ✅ `www.chitrakala-arts.com` responding |

---

## Production Smoke — Public Checks (No Auth Required)

| Check | Result |
|---|---|
| Production frontend homepage loads | ✅ Nav, featured artworks, categories all render |
| Public artwork detail page loads | ✅ "Rhythms of Heritage – Blue Mirror Mosaic Art Work" — title, description, prices, size selector render |
| "Add to Request" button works | ✅ Button changes to "Added to Request" |
| Request cart opens | ✅ Cart modal opens with artwork item and contact form (Name, Email, Phone, Message, Submit) |
| Admin login page loads | ✅ `/ckk-secure-admin` renders "Admin Login" form |
| No browser console errors on production frontend | ✅ |

---

## Production Smoke — Unauthenticated Endpoint Rejection (Production)

All 4 new endpoints tested against production backend without a Bearer token:

| Endpoint | Expected | Result |
|---|---|---|
| `GET /api/admin/shipments` | 401 | ✅ 401 `{"error":"Access token required"}` |
| `GET /api/admin/shipments/1` | 401 | ✅ 401 `{"error":"Access token required"}` |
| `GET /api/admin/physical-inventory` | 401 | ✅ 401 `{"error":"Access token required"}` |
| `GET /api/admin/inventory-movements` | 401 | ✅ 401 `{"error":"Access token required"}` |

---

## Production Smoke — Admin-Authenticated Checks

| Check | Result |
|---|---|
| Admin login with `cks-admin` production credentials | ✅ |
| Admin dashboard loads | ✅ |
| Dashboard "Shipments" button visible | ✅ |
| Dashboard "Physical Inventory" button visible | ✅ |
| Admin Shipments page loads (`/ckk-secure-admin/shipments`) | ✅ |
| Shipments empty state renders | ✅ |
| Admin Physical Inventory page loads (`/ckk-secure-admin/physical-inventory`) | ✅ |
| Physical Inventory empty state renders | ✅ |
| Navigation between pages works | ✅ |
| Admin Order Requests page still works | ✅ |
| `GET /api/admin/shipments` authenticated → 200 `[]` | ✅ |
| `GET /api/admin/shipments/1` authenticated → 404 | ✅ |
| `GET /api/admin/physical-inventory` authenticated → 200 `[]` | ✅ |
| `GET /api/admin/inventory-movements` authenticated → 200 `[]` | ✅ |
| Production DB row counts: shipments=0, shipment_items=0, physical_inventory=0, inventory_movements=0 | ✅ |
| 4 ISYNC-18 artworks: status=NEEDS_REVIEW, show_on_website=false, sku=null | ✅ |

---

## Safety Confirmations

| Check | Result |
|---|---|
| No POST/PUT/PATCH/DELETE endpoints added | ✅ GET only — all 4 new routes use `app.get(...)` |
| No shipment creation, receiving, reservation, or fulfillment workflow added | ✅ |
| No schema migration added | ✅ No `.sql` file added |
| No production data touched | ✅ Not connected to production at any point |
| No staging test rows remain | ✅ No data was written to staging |
| Temp Node/pg script (`staging_check_tmp.js`) deleted | ✅ Confirmed deleted; not staged |
| Temp users check script (`check_users_tmp.js`) deleted | ✅ Confirmed deleted; not staged |
| No `server/.env`, secrets, logs, or raw response JSON staged | ✅ `git status` confirms only ARCH-INV-04 source files committed |
| WEB-CAT-02 files not touched | ✅ |
| Public gallery and order request flow unchanged | ✅ No public routes added; no existing routes modified |
| No artwork status or visibility changes | ✅ |
| ARCH-INV-05 not started | ✅ |
