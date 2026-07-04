# INV-02: Inventory Schema Migration + DB-Backed Preview Test

**Status:** Complete (read-only preview only — no apply endpoint)  
**Branch:** `feature/inventory-sync-db-schema-preview`  
**Depends on:** INV-01 (parser + preview endpoint)

---

## Purpose

INV-01 built the parser and preview endpoint but ran without a database — valid rows were classified as `CREATE_CANDIDATE` with a batch warning about the missing `sku` column. INV-02 adds the `sku`, `quantity`, and `status` columns to `artworks` and re-runs the preview against a real local PostgreSQL instance so rows are classified as `CREATE` or `UPDATE` using live SKU lookup.

---

## Migration

**File:** `server/dbMigration/migrate_add_inventory_columns.sql`

```sql
-- Migration: Add inventory sync columns to artworks table
-- Ticket: INV-02
-- Safe to run on existing data: columns are additive and indexes are IF NOT EXISTS.

ALTER TABLE artworks ADD COLUMN IF NOT EXISTS sku VARCHAR(100);
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'IN_STOCK';

-- Partial unique index: allows multiple NULL SKUs for existing rows while enforcing uniqueness
-- only for rows that have a SKU.
CREATE UNIQUE INDEX IF NOT EXISTS idx_artworks_sku_unique
  ON artworks(sku)
  WHERE sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_artworks_status
  ON artworks(status);
```

**Why a partial unique index instead of `UNIQUE` constraint on the column:**  
Existing artwork rows do not have SKUs yet. A plain `UNIQUE` constraint would reject multiple `NULL` values in some configurations. The partial index (`WHERE sku IS NOT NULL`) enforces uniqueness only among rows that actually have a SKU, leaving `NULL`-SKU rows untouched.

---

## Local Environment Setup

### Prerequisites

- PostgreSQL running locally (port 5433)
- `chitrakala_dev` database exists

### 1. Create `server/.env`

`server/.env` is gitignored. Create it locally with:

```env
DATABASE_URL=postgres://postgres:<your-local-pg-password>@localhost:5433/chitrakala_dev
JWT_SECRET=local-dev-secret
DEFAULT_ADMIN_PASSWORD=<choose-a-local-admin-password>
```

`DEFAULT_ADMIN_PASSWORD` is only consumed on first startup when the `users` table is empty — it creates the initial admin account. It is not needed once the admin row exists.

### 2. Run migration

```bash
cd server
node runMigration.js migrate_add_inventory_columns.sql
```

Expected output:
```
✅ Migration completed successfully!
```

### 3. Verify columns

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'artworks'
  AND column_name IN ('sku', 'quantity', 'status')
ORDER BY column_name;
```

Expected:

| column_name | data_type | column_default |
|-------------|-----------|----------------|
| quantity | integer | 1 |
| sku | character varying | (null) |
| status | character varying | 'IN_STOCK' |

### 4. Verify indexes

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'artworks'
  AND indexname IN ('idx_artworks_sku_unique', 'idx_artworks_status');
```

Expected:

| indexname | indexdef |
|-----------|---------|
| idx_artworks_sku_unique | CREATE UNIQUE INDEX ... ON artworks(sku) WHERE (sku IS NOT NULL) |
| idx_artworks_status | CREATE INDEX ... ON artworks(status) |

---

## Starting the Server with DB

```bash
cd server
node server.js
```

Expected startup log (confirms DB mode, not JSON fallback):
```
✅ Database schema initialized successfully
Database: PostgreSQL (Connected)
✅ Server running on port 5000
```

---

## Running the Preview Upload Test

### Prerequisites

- Server running with `DATABASE_URL` configured
- Valid admin token from `POST /api/auth/login`

### curl — login

```bash
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<your-DEFAULT_ADMIN_PASSWORD>"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
```

### curl — upload preview

```bash
curl -X POST http://localhost:5000/api/admin/inventory-sync/preview \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@shipmentDetails_20260624.xlsx" \
  -o preview-response-db.json
```

---

## INV-02 Test Results (2026-06-25)

**DB state at time of test:** `artworks` = 0 rows, `categories` = 3, `users` = 1

### Column/index verification

| Check | Result |
|-------|--------|
| `artworks.sku` exists | ✅ |
| `artworks.quantity` exists | ✅ |
| `artworks.status` exists | ✅ |
| `idx_artworks_sku_unique` partial index | ✅ |
| `idx_artworks_status` index | ✅ |

### Preview response summary

```json
{
  "totalRows": 24,
  "createCount": 24,
  "updateCount": 0,
  "reviewCount": 0,
  "errorCount": 0
}
```

### Batch warnings
```
(none)
```
The `sku` column is now detected — the `CREATE_CANDIDATE` advisory warning from INV-01 is gone.

### detectedColumns
```json
["Item description","Quantity","Price per unit","Total","SKU","Art Work","Size","Year"]
```

### missingColumns
```json
[]
```

### First 3 classified rows

| Row | Classification | itemDescription | artWork | size | SKU | generated |
|-----|---------------|-----------------|---------|------|-----|-----------|
| 3 | CREATE | 4 piece coaster set | DM | SM | CKS-DM-SM-2026-0001 | false (in sheet) |
| 4 | CREATE | 24" x 24" lippan artwork | LA | LG | CKS-LA-LG-2026-0001 | true |
| 5 | CREATE | 12" x 14" lippan artwork | LA | MD | CKS-LA-MD-2026-0002 | true |

### DB write safety

| Check | Result |
|-------|--------|
| Artwork count before upload | 0 |
| Artwork count after upload | 0 |
| No writes during preview | ✅ |

---

## Expected Behavior — Before Any SKU Backfill

Because `artworks` is currently empty and no existing rows carry a `sku`, every valid row in the uploaded sheet will classify as `CREATE`. `updateCount` will be 0.

This is expected and correct. The preview endpoint performs no writes — classification is purely informational for a future apply/import step.

---

## Optional Reversible UPDATE Test

To verify that an existing DB SKU causes `UPDATE` classification:

```sql
-- Set one artwork's SKU to match a value in the sheet
UPDATE artworks SET sku = 'CKS-DM-SM-2026-0001' WHERE id = '<some-local-artwork-id>';
```

Then upload the sheet again — row 3 should classify as `UPDATE`.

Immediately revert:
```sql
UPDATE artworks SET sku = NULL WHERE sku = 'CKS-DM-SM-2026-0001';
```

Confirm the revert:
```sql
SELECT id, sku FROM artworks WHERE sku IS NOT NULL;
-- should return 0 rows
```

This test requires at least one row in `artworks`. With the current empty DB, insert a test artwork first or wait until a production DB snapshot is imported (recommended before INV-03 apply/import testing).

---

## Rollback

To undo the INV-02 migration entirely:

```sql
DROP INDEX IF EXISTS idx_artworks_sku_unique;
DROP INDEX IF EXISTS idx_artworks_status;
ALTER TABLE artworks DROP COLUMN IF EXISTS sku;
ALTER TABLE artworks DROP COLUMN IF EXISTS quantity;
ALTER TABLE artworks DROP COLUMN IF EXISTS status;
```

This is safe to run at any time while `sku` values are still NULL (no backfill has occurred).

---

## Out of Scope (this ticket)

- `POST /api/admin/inventory-sync/apply` — not implemented
- DB inserts or updates from spreadsheet
- SKU backfill for existing artworks
- Production DB changes
- `artwork_sizes` migration (pre-existing gap, separate ticket)
- AdminDashboard upload UI
- Invoice/shipment tables
- PDF generation
