# ISYNC-13: Production Migration Results

**Status:** Complete — all verification checks passed  
**Date:** 2026-07-04  
**Branch used:** `feature/ISYNC-11-inventory-sync` (read locally; migrations executed via runMigration.js)  
**Author:** Sanjay Narla

---

## Summary

Production schema migration for the Inventory Sync feature completed successfully. All pre-migration, correction, and post-migration verification checks passed. No merge to main was performed. No Inventory Apply was run.

---

## Phase 2 — Production Backup

| Item | Value |
|---|---|
| Backup filename | `chitrakala_prod_20260704_pre_isync_migration.backup` |
| Backup location | `C:\Development\backups\postgres\` |
| File size | 12,652,389 bytes (~12.05 MB) |
| Backup verified | ✅ Non-zero, file confirmed in Explorer |

**Pre-migration baseline counts (confirmed after backup):**

| Table | Count |
|---|---|
| `artworks` | 38 |
| `artwork_sizes` | 91 |
| `categories` | 5 |

---

## Phase 1 — Production Read-Only Inspection Findings

| Check | Finding |
|---|---|
| Baseline counts | ✅ artworks=38, artwork_sizes=91, categories=5 |
| Categories | ✅ mirror-mosaic and texture-art already present — no category correction needed |
| Inventory columns | ✅ None existed — clean pre-migration state |
| Inventory indexes | ✅ None existed — clean pre-migration state |
| Bad SKU data | ✅ None — sku column did not exist |
| `fx_rate` | `92.4` |
| `usd_multiplier` | `1.75` — flagged for baseline correction |

---

## Phase 3 — Pricing Baseline Correction

**Decision:** Correct `usd_multiplier` from `1.75` to `2.25` before migration (Option A approved by business owner).

**SQL executed:**
```sql
UPDATE pricing_settings
SET value = '2.25',
    updated_at = CURRENT_TIMESTAMP
WHERE key = 'usd_multiplier'
  AND value = '1.75';
```

**Result:** `UPDATE 1` — exactly one row updated.

**Post-correction verification:**

| key | value | Notes |
|---|---|---|
| `fx_rate` | `92.4` | Unchanged ✅ |
| `usd_multiplier` | `2.25` | Corrected ✅ |

No artwork prices were recalculated or modified. Row counts unchanged (38/91/5).

---

## Phase 4 — Schema Migration

### Migration 1 of 2

**File:** `server/dbMigration/migrate_add_inventory_columns.sql`  
**Ticket:** INV-02  
**Result:** `Migration completed successfully!` ✅

SQL applied:
```sql
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS sku VARCHAR(100);
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'IN_STOCK';

CREATE UNIQUE INDEX IF NOT EXISTS idx_artworks_sku_unique
  ON artworks(sku) WHERE sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_artworks_status
  ON artworks(status);
```

### Migration 2 of 2

**File:** `server/dbMigration/migrate_inv03a_schema.sql`  
**Ticket:** INV-03A  
**Result:** `Migration completed successfully!` ✅

SQL applied:
```sql
UPDATE artworks SET status = 'IN_STOCK' WHERE status IS NULL;
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS image_filename VARCHAR(255);
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS notes TEXT;
INSERT INTO categories (id, name, description, display_order)
  VALUES ('warli-art', 'Warli Art', '...', 6) ON CONFLICT (id) DO NOTHING;
INSERT INTO categories (id, name, description, display_order)
  VALUES ('mixed-art', 'Mixed Art', '...', 7) ON CONFLICT (id) DO NOTHING;
```

---

## Post-Migration Verification Results

All 8 checks passed.

### 1. Row counts ✅
| Table | Count | Expected |
|---|---|---|
| `artworks` | 38 | 38 ✅ |
| `artwork_sizes` | 91 | 91 ✅ |
| `categories` | 7 | 7 ✅ |

### 2. New columns on artworks ✅
| column_name | data_type | default | nullable |
|---|---|---|---|
| `image_filename` | character varying | — | YES |
| `notes` | text | — | YES |
| `quantity` | integer | `1` | YES |
| `sku` | character varying | — | YES |
| `status` | character varying | `'IN_STOCK'` | YES |

All 5 ISYNC columns present with correct types and defaults.

### 3. Required indexes ✅
| Index | Definition |
|---|---|
| `idx_artworks_sku_unique` | `CREATE UNIQUE INDEX ... ON artworks USING btree (sku) WHERE (sku IS NOT NULL)` |
| `idx_artworks_status` | `CREATE INDEX ... ON artworks USING btree (status)` |

### 4. Status values ✅
- NULL status count: **0** ✅
- Status distribution: `IN_STOCK = 38` — all existing artworks defaulted correctly, no other statuses

### 5. Categories ✅
| id | name | display_order |
|---|---|---|
| dot-mandala | Dot Mandala Art | 1 |
| lippan-art | Lippan Art | 2 |
| mirror-mosaic | Mirror Mosaic | 3 |
| texture-art | Texture Art | 4 |
| textile-design | Textile Art | 5 |
| warli-art | Warli Art | 6 |
| mixed-art | Mixed Art | 7 |

### 6. Pricing settings ✅
| key | value |
|---|---|
| `fx_rate` | `92.4` |
| `usd_multiplier` | `2.25` |

### 7. Bad SKU check ✅
- Total rows with a SKU value: **0** (all NULL — correct, no SKUs backfilled)
- Rows with `cks-cks-` pattern: **0**

### 8. Full artworks column list ✅
22 columns confirmed present:

`id`, `title`, `category`, `price`, `description`, `dimensions`, `materials`, `image`, `featured`, `created_at`, `image_data`, `image_mime_type`, `updated_at`, `price_inr`, `price_usd`, `fx_rate_used`, `multiplier_used`, `sku`, `quantity`, `status`, `image_filename`, `notes`

---

## Maintenance Mode

No maintenance mode, feature flag, or site-setting toggle exists in the application. Ticket `WEB-MAINT-01` should be created separately. Does not block ISYNC-14/15.

---

## Explicit Scope Confirmations

- ✅ No merge to main performed
- ✅ No production deploy triggered
- ✅ No Inventory Preview run
- ✅ No Inventory Apply run
- ✅ No artwork SKU/status/quantity business backfill (migration-safe defaults only)
- ✅ No artwork pricing recalculation
- ✅ No artworks published, archived, or deleted

---

## Open Risks / Notes

| # | Risk | Severity |
|---|---|---|
| 1 | `main` auto-deploys on merge — ISYNC-14 must confirm Railway/Vercel auto-deploy status before merging | High — managed by ISYNC-14 |
| 2 | No maintenance mode exists — public site remains live during ISYNC-14 deploy window | Low — deploy is additive; existing artworks all `IN_STOCK` and unaffected |
| 3 | Production inventory Apply/import blocked pending INV-DATA gap tickets | Known — not part of ISYNC-14 |
| 4 | `WEB-MAINT-01` not yet created | Low — not blocking |

---

## Handoff to ISYNC-14

ISYNC-13 is complete. Pre-merge checklist items owned by this ticket are all ✅:

- [x] Fresh production backup created and verified
- [x] Pre-migration baseline counts recorded
- [x] `usd_multiplier` corrected to `2.25`
- [x] `migrate_add_inventory_columns.sql` run and verified
- [x] `migrate_inv03a_schema.sql` run and verified
- [x] All 8 post-migration verification checks passed
- [x] No merge to main
- [x] No production deploy
- [x] No Inventory Apply

**ISYNC-14 may proceed upon business owner approval:** merge `feature/ISYNC-11-inventory-sync` to `main` and confirm production auto-deploy.
