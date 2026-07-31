# ARCH-INV-04 — Admin Inventory Read-Only Views: Results

**Ticket:** ARCH-INV-04 — Admin Inventory Read-Only Views  
**Branch:** `feature/ARCH-INV-04-admin-inventory-readonly-views`  
**Date:** 2026-07-31  
**Status:** Local validation complete — staging validation pending

---

## Scope

Read-only admin visibility for the ARCH-INV-03 schema:
1. **Shipments** — list view with expandable manifest detail
2. **Physical Inventory** — list view with status-based filtering
3. **Inventory Movements** — backend endpoint only (no standalone page; served via `/api/admin/inventory-movements`)

No create/update/delete endpoints added. No workflow actions (receiving, reserving, fulfilling). No changes to public artwork visibility.

---

## Files Changed

| File | Change |
|---|---|
| `server/dbQueries.js` | Added 4 query functions: `getShipmentsAdmin`, `getShipmentByIdAdmin`, `getPhysicalInventoryAdmin`, `getInventoryMovementsAdmin` |
| `server/server.js` | Added 4 GET endpoints under `/api/admin/` |
| `src/services/api.js` | Added `inventoryAPI` export (4 methods) |
| `src/pages/AdminShipments.js` | New — Shipments list + expandable detail |
| `src/styles/AdminShipments.css` | New |
| `src/pages/AdminPhysicalInventory.js` | New — Physical Inventory list |
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

---

## Local Validation

| Check | Result |
|---|---|
| Frontend compiled with no errors | ✅ (`Compiled successfully`) |
| Admin dashboard shows "Shipments" nav button | ✅ |
| Admin dashboard shows "Physical Inventory" nav button | ✅ |
| `/ckk-secure-admin/shipments` route loads | ✅ |
| `GET /api/admin/shipments` returns 200 | ✅ |
| Shipments page: empty state correct (no data yet) | ✅ "No shipments with status All" |
| Shipments page: 8 status filter buttons render (All + 7 statuses + Cancelled) | ✅ |
| `/ckk-secure-admin/physical-inventory` route loads | ✅ |
| `GET /api/admin/physical-inventory` returns 200 | ✅ |
| Physical Inventory page: empty state correct | ✅ "No physical inventory rows with status All" |
| Physical Inventory page: 11 status filter buttons render (All + 10 statuses) | ✅ |
| "Physical Inventory" → "Shipments" nav link works | ✅ |
| "Shipments" → "Physical Inventory" nav link works | ✅ |
| No error banner on either page | ✅ |
| No create/update/delete endpoints added | ✅ |
| No changes to public artwork visibility | ✅ |

---

## Schema Alignment

| Endpoint | Tables queried | JOIN strategy |
|---|---|---|
| `GET /api/admin/shipments` | shipments, shipment_items | LEFT JOIN item count |
| `GET /api/admin/shipments/:id` | shipments, shipment_items, artworks | shipment_items JOIN artworks for title |
| `GET /api/admin/physical-inventory` | physical_inventory, artworks, shipments | JOIN artworks (NOT NULL), LEFT JOIN shipments (nullable) |
| `GET /api/admin/inventory-movements` | inventory_movements, artworks | LEFT JOIN artworks for title |

Status values match ARCH-INV-03 migration schema exactly:
- shipments.status: DRAFT / READY_TO_SHIP / SHIPPED / IN_TRANSIT / CUSTOMS / DELIVERED / CLOSED / CANCELLED
- physical_inventory.status: PENDING_SHIPMENT / IN_TRANSIT / RECEIVED / INSPECTION_REQUIRED / INSPECTED / AVAILABLE / RESERVED / SOLD / DAMAGED / ARCHIVED

---

## Safety Confirmations

| Check | Result |
|---|---|
| No POST/PUT/PATCH/DELETE endpoints added | ✅ GET only |
| No shipment creation or receiving workflow added | ✅ |
| No physical inventory rows created in production | ✅ |
| No artwork status changes | ✅ |
| No show_on_website modifications | ✅ |
| WEB-CAT-02 files not touched | ✅ |
| ARCH-INV-05 not started | ✅ |
| No secrets, env files, or backups committed | ✅ |
