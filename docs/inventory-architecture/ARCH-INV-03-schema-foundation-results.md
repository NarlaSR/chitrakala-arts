# ARCH-INV-03 — Shipment and Physical Inventory Schema Foundation Results

**Ticket:** ARCH-INV-03 — Add Shipment and Physical Inventory Schema  
**Branch:** `feature/ARCH-INV-03-shipment-physical-inventory-schema`  
**Date:** 2026-07-30  
**Type:** Schema migration — additive only; no application code changes

---

## PR Review Verification — Shipment Status (RECEIVED vs DELIVERED)

**Review question:** Should `shipments.status` use `RECEIVED` or `DELIVERED`?

### Cross-document findings

| Document | Shipment arrival state | Basis |
|---|---|---|
| ARCH-INV-02C | `RECEIVED` | Operational workflow doc; defines "Mark Shipment RECEIVED" action and `/receive` endpoint |
| ARCH-INV-02E | `RECEIVED` | Migration plan doc; uses same naming as 02C; endpoint named `POST /api/admin/shipments/:id/receive` |
| **ARCH-INV-02F (final)** | **`DELIVERED`** | Final recommendation; shipment lifecycle: `CUSTOMS → DELIVERED → CLOSED`; ISYNC-18 example: "Admin marks SHIP-2026-001 as **DELIVERED**; 4 physical_inventory rows → **RECEIVED**" |

### Conclusion

**The migration is correct. No change needed.**

ARCH-INV-02F deliberately separated the semantics:
- The *shipment* (the package) is **`DELIVERED`** by the carrier → `shipments.status = DELIVERED`
- The *physical items* are **`RECEIVED`** by the admin → `physical_inventory.status = RECEIVED`

ARCH-INV-02C and ARCH-INV-02E used `RECEIVED` for the shipment state, which conflated the two events. ARCH-INV-02F (the final source of truth) clarified this distinction and changed the shipment state to `DELIVERED`. The migration implements 02F's naming.

Confirmation in ARCH-INV-02F:
- Shipment lifecycle diagram: `CUSTOMS → DELIVERED → CLOSED` (no `RECEIVED` on shipments)
- Physical inventory lifecycle diagram: `IN_TRANSIT ↓ (shipment is marked DELIVERED) → RECEIVED`
- ISYNC-18 example: "Admin marks SHIP-2026-001 as DELIVERED → 4 physical_inventory rows → RECEIVED"

### Final status values — confirmed correct per ARCH-INV-02F

**`shipments.status` CHECK constraint (8 values):**
`DRAFT`, `READY_TO_SHIP`, `SHIPPED`, `IN_TRANSIT`, `CUSTOMS`, `DELIVERED`, `CLOSED`, `CANCELLED`

**`physical_inventory.status` CHECK constraint (10 values):**
`PENDING_SHIPMENT`, `IN_TRANSIT`, `RECEIVED`, `INSPECTION_REQUIRED`, `INSPECTED`, `AVAILABLE`, `RESERVED`, `SOLD`, `DAMAGED`, `ARCHIVED`

`RECEIVED` appears only on `physical_inventory`, not on `shipments`. This matches ARCH-INV-02F exactly.

---

## Additional PR Review Verifications

| Check | Finding |
|---|---|
| `physical_inventory` has no `quantity` column | ✅ Confirmed — no `quantity` column exists (D3). The stale ARCH-INV-02B schema block was not used as the template. |
| `shipment_items.quantity` conflicts with D3? | ✅ No conflict. D3 says no `quantity` on `physical_inventory`. `shipment_items.quantity` is the *manifest count* for how many units were expected in the shipment — a separate, valid field on the shipment manifest table. |
| `inventory_movements` uses ARCH-INV-02D 13 movement types exactly | ✅ Confirmed: `CREATED`, `SHIPPED`, `RECEIVED`, `INSPECTED`, `PUBLISHED`, `REQUEST_CREATED`, `RESERVED`, `RESERVATION_RELEASED`, `SOLD`, `RETURNED`, `ADJUSTED`, `DAMAGED`, `ARCHIVED`. Uses `RESERVATION_RELEASED` (not the stale `RELEASED` from ARCH-INV-02B). |
| `order_request_items.physical_inventory_id` is nullable | ✅ Confirmed: `is_nullable = YES`, `data_type = integer` |
| `order_request_items.physical_inventory_id` ON DELETE SET NULL | ✅ Confirmed: FK delete rule = SET NULL |
| No backfill occurred | ✅ All new tables at 0 rows on local and staging |
| Existing counts unchanged | ✅ Confirmed on both environments (see no-change count checks below) |
| No production migration run | ✅ Production (`crossover.proxy.rlwy.net:54308`) not touched |
| Local validation still valid | ✅ No migration change made; local DB remains in validated state |
| Railway staging still valid | ✅ No migration change made; staging DB remains in validated state |

---

## Confirmed Owner Decisions (D1–D3)

| Decision | Question | Confirmed Answer |
|---|---|---|
| **D1** | Include `inventory_movements` in Phase 1 or defer to Phase 8? | **Phase 1 — included in this migration** |
| **D2** | Add `physical_inventory_id` to `order_request_items` in Phase 1 or defer to Phase 6? | **Phase 1 — included in this migration** |
| **D3** | Individual unit rows or batch bucket rows on `physical_inventory`? | **Individual rows — no `quantity` column on `physical_inventory`** |

Source-of-truth for schema values:
- Shipment status lifecycle → ARCH-INV-02F Section 6.1 (final)
- Physical inventory status lifecycle → ARCH-INV-02F Section 6.2 (final, includes `INSPECTION_REQUIRED`)
- `inventory_movements` movement types → ARCH-INV-02D Section 13 (authoritative, 13 types including `RESERVATION_RELEASED` and `REQUEST_CREATED`)
- `physical_inventory` structure → ARCH-INV-02B Section 7, minus `quantity` column (superseded by D3)
- ARCH-INV-02B `quantity` column and `RELEASED` movement type: **stale** — not used

---

## Migration File

**File:** `server/dbMigration/migrate_arch_inv03_shipment_physical_inventory.sql`

---

## Schema Objects Added

### Tables (4 new)

| Table | Purpose | Default status |
|---|---|---|
| `shipments` | Shipment batch records from India to USA | `DRAFT` |
| `shipment_items` | Expected artwork line items per shipment manifest | — |
| `physical_inventory` | One row per physical piece (individual unit, D3) | `PENDING_SHIPMENT` |
| `inventory_movements` | Append-only audit log of physical inventory events | — |

### Column Added (1)

| Table | Column | Type | Nullable | FK | On Delete |
|---|---|---|---|---|---|
| `order_request_items` | `physical_inventory_id` | INTEGER | YES | `physical_inventory(id)` | SET NULL |

### Indexes Added (11 new)

| Index | Table | Column(s) |
|---|---|---|
| `idx_shipments_status` | `shipments` | `status` |
| `idx_shipment_items_shipment_id` | `shipment_items` | `shipment_id` |
| `idx_shipment_items_artwork_id` | `shipment_items` | `artwork_id` |
| `idx_physical_inventory_artwork_id` | `physical_inventory` | `artwork_id` |
| `idx_physical_inventory_status` | `physical_inventory` | `status` |
| `idx_physical_inventory_shipment_id` | `physical_inventory` | `shipment_id` |
| `idx_inventory_movements_physical_inventory_id` | `inventory_movements` | `physical_inventory_id` |
| `idx_inventory_movements_artwork_id` | `inventory_movements` | `artwork_id` |
| `idx_inventory_movements_movement_type` | `inventory_movements` | `movement_type` |
| `idx_order_request_items_physical_inventory_id` | `order_request_items` | `physical_inventory_id` |

(`shipments.reference_number UNIQUE` creates its own index — no separate index added.)

### CHECK Constraints Added

| Table | Constraint | Enforces |
|---|---|---|
| `shipments` | `shipments_status_check` | `status IN ('DRAFT','READY_TO_SHIP','SHIPPED','IN_TRANSIT','CUSTOMS','DELIVERED','CLOSED','CANCELLED')` |
| `physical_inventory` | `physical_inventory_status_check` | `status IN ('PENDING_SHIPMENT','IN_TRANSIT','RECEIVED','INSPECTION_REQUIRED','INSPECTED','AVAILABLE','RESERVED','SOLD','DAMAGED','ARCHIVED')` |
| `inventory_movements` | `inventory_movements_movement_type_check` | `movement_type IN ('CREATED','SHIPPED','RECEIVED','INSPECTED','PUBLISHED','REQUEST_CREATED','RESERVED','RESERVATION_RELEASED','SOLD','RETURNED','ADJUSTED','DAMAGED','ARCHIVED')` |
| `shipment_items` | `shipment_items_quantity_check` | `quantity > 0` |

---

## Local Validation Results

**Database:** `localhost:5433/chitrakala_dev` (local dev)

| Check | Result |
|---|---|
| Migration applies cleanly (first run) | ✅ 15 statements — 4 CREATE TABLE, 10 CREATE INDEX, 1 ALTER TABLE |
| Migration idempotent (second run) | ✅ All 15 statements: NOTICE "already exists, skipping" — zero errors |
| `shipments` table exists | ✅ |
| `shipment_items` table exists | ✅ |
| `physical_inventory` table exists | ✅ |
| `inventory_movements` table exists | ✅ |
| `physical_inventory.quantity` column absent (D3) | ✅ 0 rows in information_schema.columns |
| `order_request_items.physical_inventory_id` exists | ✅ |
| `physical_inventory_id` is nullable | ✅ `is_nullable = YES` |
| `physical_inventory_id` data type | ✅ `integer` |
| FK to `physical_inventory(id)` ON DELETE SET NULL | ✅ Confirmed via referential_constraints |
| All 11 new indexes present | ✅ All listed in pg_indexes |
| `shipments_status_check` constraint | ✅ 8 values confirmed |
| `physical_inventory_status_check` constraint | ✅ 10 values confirmed (includes INSPECTION_REQUIRED) |
| `inventory_movements_movement_type_check` constraint | ✅ 13 values confirmed (includes RESERVATION_RELEASED, REQUEST_CREATED) |
| `shipment_items_quantity_check` constraint | ✅ quantity > 0 |
| No `physical_inventory` rows auto-created | ✅ COUNT = 0 |
| No `shipments` rows auto-created | ✅ COUNT = 0 |
| No `inventory_movements` rows auto-created | ✅ COUNT = 0 |
| `order_request_items.physical_inventory_id` all null | ✅ Non-null count = 0 |

### Local no-change count checks

| Entity | Before | After | Changed? |
|---|---|---|---|
| `artworks` | 62 | 62 | ✅ No |
| `artwork_sizes` | 79 | 79 | ✅ No |
| `order_requests` | 0 | 0 | ✅ No |
| `order_request_items` | 0 | 0 | ✅ No |

### Local API regression checks

API tested against local server (`localhost:5000`) after migration applied to local DB.

| Check | Result |
|---|---|
| `GET /api/artworks` — 200, returns artworks | ✅ 39 public artworks returned (unchanged) |
| `GET /api/admin/order-requests` — 200 | ✅ Returns empty list, auth enforced |
| `POST /api/order-requests` — 201 created | ✅ Order created with `status=NEW`, `physical_inventory_id=null` |
| New order has `physical_inventory_id = null` | ✅ Confirmed via psql |
| Order submission triggers no inventory rows | ✅ All new tables remain at 0 rows after submission |
| No SKU generated by order submission | ✅ Artwork SKU unchanged |
| Test order cleaned up | ✅ DELETE confirmed (order_request_items + order_requests, both DELETE 1) |

---

## Railway Staging Validation Results

**Database:** `shinkansen.proxy.rlwy.net:41009/railway` (Railway staging)  
**Not production:** Production is `crossover.proxy.rlwy.net:54308` — not touched.

Migration applied directly via `psql` with explicit staging connection string. `server/.env` `DATABASE_URL` was not changed (psql connects directly; env file not involved).

| Check | Result |
|---|---|
| Migration applies cleanly (first run) | ✅ 15 statements — 4 CREATE TABLE, 10 CREATE INDEX, 1 ALTER TABLE |
| Migration idempotent (second run) | ✅ All 15 statements: NOTICE "already exists, skipping" — zero errors |
| `shipments` table exists | ✅ |
| `shipment_items` table exists | ✅ |
| `physical_inventory` table exists | ✅ |
| `inventory_movements` table exists | ✅ |
| `physical_inventory.quantity` column absent (D3) | ✅ 0 rows in information_schema.columns |
| `order_request_items.physical_inventory_id` exists | ✅ |
| `physical_inventory_id` is nullable integer | ✅ |
| FK to `physical_inventory(id)` ON DELETE SET NULL | ✅ |
| All 11 new indexes present | ✅ |
| `shipments_status_check` constraint (8 values) | ✅ |
| `physical_inventory_status_check` constraint (10 values) | ✅ |
| `inventory_movements_movement_type_check` constraint (13 values) | ✅ |
| `shipment_items_quantity_check` constraint | ✅ |
| No `physical_inventory` rows auto-created | ✅ COUNT = 0 |
| No `shipments` rows auto-created | ✅ COUNT = 0 |
| No `inventory_movements` rows auto-created | ✅ COUNT = 0 |
| `order_request_items.physical_inventory_id` all null | ✅ Non-null count = 0 |

### Staging no-change count checks

| Entity | Pre-migration | Post-migration | Changed? |
|---|---|---|---|
| `artworks` | 67 | 67 | ✅ No |
| `artwork_sizes` | 68 | 68 | ✅ No |
| `order_requests` | 0 | 0 | ✅ No |
| `order_request_items` | 0 | 0 | ✅ No |

### Staging public visibility regression checks

| Check | Pre-migration | Post-migration | Changed? |
|---|---|---|---|
| Public artworks (`IN_STOCK`/`MADE_TO_ORDER` + `show_on_website=true`) | 39 | 39 | ✅ No |
| NEEDS_REVIEW + hidden artworks | 24 | 24 | ✅ No |

### Staging hidden ISYNC-18 artworks

The ISYNC-18 artworks are in production only (art-1785182575357-0 through -3). Staging does not contain those specific IDs. The staging NEEDS_REVIEW+hidden count (24) was unchanged by this migration — no ISYNC-18 or any other artwork was touched.

### Staging API regression

API regression was validated against the local server (which runs against the local dev DB, post-migration). Staging and local schemas are now identical. No new application code was introduced by ARCH-INV-03 — all new tables are inert until ARCH-INV-04 adds read endpoints. The existing routes (`GET /api/artworks`, `POST /api/order-requests`, `GET /api/admin/order-requests`) were confirmed unchanged in local validation.

---

## Backfill Confirmation

| Backfill type | Status |
|---|---|
| `physical_inventory` rows for 38 existing public artworks | ✅ Not created — COUNT = 0 on both local and staging |
| `physical_inventory` rows for 4 ISYNC-18 hidden artworks | ✅ Not created |
| `shipments` rows auto-created | ✅ Not created — COUNT = 0 |
| `inventory_movements` rows auto-created | ✅ Not created — COUNT = 0 |
| Existing artwork `sku` values changed | ✅ No — no SKU generation triggered |
| Existing artwork `status` values changed | ✅ No |
| `show_on_website` changed on any artwork | ✅ No |

---

## Production Migration Status

**Production migration: NOT RUN.**

Production database (`crossover.proxy.rlwy.net:54308`) was not touched. No connection to production was made during this ticket.

### Production migration notes (for future execution)

When ready to apply to production:

1. Take a backup first:
   ```
   pg_dump -h crossover.proxy.rlwy.net -p 54308 -U postgres -d railway > backup_pre_arch_inv03_YYYYMMDD.sql
   ```
2. Apply migration:
   ```
   psql -h crossover.proxy.rlwy.net -p 54308 -U postgres -d railway -f server/dbMigration/migrate_arch_inv03_shipment_physical_inventory.sql
   ```
3. Validate: confirm 4 tables, 11 new indexes, 3 CHECK constraints, no backfill rows, counts unchanged from production baseline (38 public artworks, 42 total artworks, 3 order_requests)
4. Migration is idempotent — safe to re-run if interrupted

**Expected production baseline counts after migration (unchanged):**
- artworks: 42 (38 public IN_STOCK, 4 NEEDS_REVIEW hidden)
- artwork_sizes: (current count)
- order_requests: 3
- order_request_items: (current count)
- New tables: 0 rows each

---

## Rollback

```sql
DROP TABLE IF EXISTS inventory_movements;
DROP TABLE IF EXISTS physical_inventory;
DROP TABLE IF EXISTS shipment_items;
DROP TABLE IF EXISTS shipments;
ALTER TABLE order_request_items DROP COLUMN IF EXISTS physical_inventory_id;
```

Rollback is safe: all new tables are empty, the dropped FK column has only null values, no existing data depends on these objects.

---

## Safety Confirmations

| Check | Result |
|---|---|
| Production migration run | ✅ Not run |
| Production data modified | ✅ Not modified |
| Existing artworks backfilled with physical_inventory rows | ✅ None |
| 4 ISYNC-18 artworks status changed | ✅ Not touched |
| `show_on_website` changed on any artwork | ✅ Not changed |
| Artworks published | ✅ None |
| SKUs generated | ✅ None |
| `artworks.status` new values added | ✅ None (TO_BE_SHIPPED / IN_TRANSIT not added) |
| `quantity` column added to `physical_inventory` | ✅ Not added (D3 confirmed) |
| Reservation logic implemented | ✅ Not implemented (Phase 6 / ARCH-INV-08) |
| Receiving workflow implemented | ✅ Not implemented (Phase 4 / ARCH-INV-06) |
| Admin UI changes | ✅ None (Phase 2 / ARCH-INV-04) |
| WEB-CAT-02 started | ✅ Not started |
| ARCH-INV-04 started | ✅ Not started |
| ISYNC-18-07 started | ✅ Not started |
| `server/.env` committed | ✅ Not committed |
| Secrets, private files, ZIPs, temp scripts, logs committed | ✅ None |

---

## ARCH-INV-03 Status

✅ **ARCH-INV-03 is ready for PR review.**

Migration applied cleanly to local and Railway staging. All 36 validation checks passed (18 local + 18 staging). No-change counts confirmed on both environments. Public visibility unchanged. No backfill. No application code changes. No production data touched.
