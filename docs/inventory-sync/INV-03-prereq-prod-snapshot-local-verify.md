# INV-03 Prerequisite: Production Snapshot Local Verification

**Status:** Complete (read-only — no apply endpoint)  
**Date:** 2026-06-25  
**Depends on:** INV-01 (parser + preview endpoint), INV-02 (schema migration)

---

## Purpose

Before building the INV-03 apply/import endpoint, the preview must be verified against production-like data. This step confirms that the endpoint correctly classifies rows as `CREATE` vs `UPDATE` when the local database contains real artwork records restored from production.

---

## What Was Already Done

- A production database backup was restored into local `chitrakala_dev` by the developer.
- This step does not perform or repeat the restore.
- Do not drop, recreate, or overwrite `chitrakala_dev`.

---

## Local Environment Safety

### `server/.env` (gitignored — do not commit)

```env
DATABASE_URL=postgres://postgres:<your-local-pg-password>@localhost:5433/chitrakala_dev
JWT_SECRET=local-dev-secret
DEFAULT_ADMIN_PASSWORD=localdev123
```

`server/.env` points to `localhost:5433/chitrakala_dev` only. It does not contain a Railway or production DATABASE_URL. The file is listed in `.gitignore` and confirmed absent from `git status`.

---

## Restored Local DB Counts (2026-06-25)

| Table | Rows |
|-------|------|
| `artworks` | 38 |
| `artwork_sizes` | 91 |
| `categories` | 5 |
| `users` | 1 (production: `cks-admin`) |
| `settings` | 1 |
| `pricing_settings` | 2 (fx_rate=92.4, usd_multiplier=1.75) |
| `about` | 1 |
| `art_forms` | 3 |
| `contact` | 1 |

**Note on pricing_settings:** The restored production DB shows fx_rate=92.4 (updated 2026-03-17), not the 83 default. This confirms the backup includes live configuration data.

---

## INV-02 Migration Status After Restore

The production backup did not include the INV-02 migration (sku/quantity/status columns), because those columns do not yet exist in production. After restoring, the migration was re-applied locally:

```bash
cd server
node runMigration.js migrate_add_inventory_columns.sql
```

### Column verification (post-migration)

| Column | Data type | Default |
|--------|-----------|---------|
| `sku` | character varying(100) | — |
| `quantity` | integer | 1 |
| `status` | character varying(30) | IN_STOCK |

### Index verification

| Index | Definition |
|-------|-----------|
| `idx_artworks_sku_unique` | UNIQUE ON artworks(sku) WHERE sku IS NOT NULL |
| `idx_artworks_status` | ON artworks(status) |

Artworks with existing SKU: **0** (no production rows have SKUs yet — none have been backfilled).

---

## Local Admin Setup

The restored DB contains a production admin user (`cks-admin`) with a production password hash. For local dev testing only, a separate `local-admin` user (role: admin) was added with password `localdev123`. The production `cks-admin` row was not modified.

To re-create `local-admin` if the DB is restored again:

```bash
cd server
node -e "
require('dotenv').config();
const {Pool}=require('pg');const bcrypt=require('bcryptjs');
const pool=new Pool({connectionString:process.env.DATABASE_URL});
bcrypt.hash('localdev123',10).then(h=>pool.query(
  \"INSERT INTO users(id,username,password,role)VALUES('local-admin-1','local-admin',\$1,'admin')ON CONFLICT(username)DO UPDATE SET password=\$1\",[h]
)).then(()=>{console.log('done');pool.end()});
"
```

---

## Starting the Server

```bash
cd server
node server.js
```

Expected startup log:
```
✅ Database schema initialized successfully
Database: PostgreSQL (Connected)
✅ Server running on port 5000
```

No JSON fallback message. No missing-relation errors.

---

## Preview Test — Login

```bash
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"local-admin","password":"localdev123"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
```

---

## Preview Test — Upload

```bash
curl -X POST http://localhost:5000/api/admin/inventory-sync/preview \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@shipmentDetails_20260624.xlsx" \
  -o preview-response-prod-snapshot.json
```

---

## Test Results (2026-06-25)

### Server startup
✅ Database: PostgreSQL (Connected) — no JSON fallback

### Column/index checks (post re-migration)
✅ `sku`, `quantity`, `status` present  
✅ `idx_artworks_sku_unique`, `idx_artworks_status` present

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
`sku` column detected — the INV-01 `CREATE_CANDIDATE` advisory is gone.

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

### Classification interpretation

All 24 valid rows classify as `CREATE` because no production artwork row carries a `sku` value matching the workbook. This is the expected state before SKU backfill or the apply/import step runs for the first time.

### DB write safety

| Check | Result |
|-------|--------|
| Artwork count before preview | 38 |
| Artwork count after preview | 38 |
| No writes during preview | ✅ |

---

## Reversible UPDATE Classification Test

Since no rows naturally classified as `UPDATE`, one test was performed to verify the UPDATE path works:

1. Selected artwork: `art-1770419392051` ("Blush Serenity Mandala – Art in Soft Pink & White"), original `sku = NULL`
2. Temporarily set `sku = 'CKS-DM-SM-2026-0001'` (matches row 3 of the workbook)
3. Re-ran preview upload
4. Row 3 ("4 piece coaster set") classified as **UPDATE** ✅
5. Immediately restored `sku = NULL`
6. Confirmed `sku = NULL` after restore ✅
7. Artwork count unchanged (38) ✅
8. No test data left behind ✅

---

## Production Safety Confirmation

- ✅ `server/.env` points to `localhost:5433/chitrakala_dev` only
- ✅ No Railway or production DATABASE_URL in any local env file
- ✅ No production DB changes made at any point
- ✅ No apply/import endpoint implemented
- ✅ No spreadsheet rows inserted or updated in DB
- ✅ No AdminDashboard UI built
- ✅ No invoice or shipment tables created
- ✅ No PDF generation implemented

---

## Recommended Next Step: INV-03

The preview endpoint is fully verified against production-like data. The system is ready to build the apply/import endpoint:

`POST /api/admin/inventory-sync/apply`

This endpoint will:
- Accept the same multipart upload as the preview
- INSERT rows classified as `CREATE` into `artworks` (with `sku`, `quantity`, `status`, `price_inr`, `price_usd`)
- PATCH rows classified as `UPDATE` (update `quantity`, `price_inr`, `price_usd`, `status`)
- Skip `REVIEW` rows unless the admin explicitly includes them
- Skip `ERROR` rows always
- Return a structured result report (inserted count, updated count, skipped count, errors)

Before INV-03, agree on:
1. Which fields from the workbook map to which `artworks` columns (e.g. item description → title or a new field)
2. How `category` should be assigned for new artworks (Art Work code → category mapping)
3. Whether `artwork_sizes` rows should be created during apply (or deferred)

---

## Out of Scope (this prerequisite step)

- Apply/import endpoint
- DB inserts from spreadsheet
- SKU backfill on existing artworks
- `artwork_sizes` migration (pre-existing gap)
- AdminDashboard upload UI
- Invoice/shipment tables
- PDF generation
- Production DB changes
