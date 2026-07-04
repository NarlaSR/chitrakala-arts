# INV-05C: Local DB Integrity Check After Test Cleanup Bug

**Status:** Complete — local DB fully repaired  
**Date:** 2026-06-27  
**Depends on:** INV-05B

---

## What Happened

During INV-05B validation hardening tests, a cleanup step used:

```sql
DELETE FROM artworks WHERE sku LIKE 'CKS-2026-%';
```

This accidentally deleted the production artwork `art-1782445237565` ("Aqua Blue Floral Wall Decor") because a test had temporarily assigned it the SKU `CKS-2026-DM-SM-99999`. Since `artwork_sizes` uses `ON DELETE CASCADE`, 2 size variant rows were also cascade-deleted (91 → 89).

The artwork was immediately re-inserted during the same test run as a placeholder `[Restored placeholder]` to maintain the row count at 38, but the original field values and size variants were missing.

---

## Affected Rows

### Artwork (1 row)

| Field | Placeholder (wrong) | Original (correct) |
|-------|--------------------|--------------------|
| id | `art-1782445237565` | `art-1782445237565` |
| title | `[Restored placeholder]` | `Aqua Blue Floral Wall Decor` |
| category | `dot-mandala` | `mirror-mosaic` |
| price_inr | 3000.00 | 8000.00 |
| price_usd | 73.00 | 152.00 |
| fx_rate_used | — | 92.4000 |
| multiplier_used | — | 1.7500 |
| description | NULL | (full production description) |
| materials | NULL | `Wood, mirrors` |
| image | `/api/images/artworks/...` (local) | `https://chitrakalaarts-production.up.railway.app/api/images/artworks/art-1782445237565` |
| created_at | 2026-06-27 (wrong — today) | 2026-06-26 03:40:37 |

### Size Variants (2 rows)

| size_label | price |
|-----------|-------|
| 18"x 18" | 8000.00 |
| 24" c 24" | 12000.00 |

---

## Source of Truth

The February 2026 backup (`server/dbMigration/chitrakala_arts_backup_2026_02_17.backup`) predates this artwork. The production backup used to originally restore `chitrakala_dev` was located at:

```
C:\Development\backups\postgres\chitrakala_prod_20260626.backup
```

This June 26 backup was restored to a temporary `chitrakala_compare` database, the original row data was extracted, and then the comparison database was dropped.

---

## Verification Queries

```sql
-- Before repair
SELECT COUNT(*)::int FROM artworks;                    -- 38
SELECT COUNT(*)::int FROM artwork_sizes;               -- 89 (2 missing)
SELECT title FROM artworks WHERE id = 'art-1782445237565';  -- [Restored placeholder]

-- After repair
SELECT COUNT(*)::int FROM artworks;                    -- 38
SELECT COUNT(*)::int FROM artwork_sizes;               -- 91 (restored)
SELECT title FROM artworks WHERE id = 'art-1782445237565';  -- Aqua Blue Floral Wall Decor
SELECT COUNT(*) FROM artwork_sizes WHERE artwork_id = 'art-1782445237565';  -- 2
```

---

## Repair Applied

```sql
BEGIN;

UPDATE artworks SET
  title            = 'Aqua Blue Floral Wall Decor',
  category         = 'mirror-mosaic',
  price            = 8000.00,
  price_inr        = 8000.00,
  price_usd        = 152.00,
  fx_rate_used     = 92.4000,
  multiplier_used  = 1.7500,
  description      = '...',
  materials        = 'Wood, mirrors',
  image            = 'https://chitrakalaarts-production.up.railway.app/api/images/artworks/art-1782445237565',
  featured         = false,
  created_at       = '2026-06-26 03:40:37.597717',
  sku              = NULL,
  quantity         = 1,
  status           = 'IN_STOCK'
WHERE id = 'art-1782445237565';

INSERT INTO artwork_sizes (artwork_id, size_label, price) VALUES
  ('art-1782445237565', '18"x 18"', 8000.00),
  ('art-1782445237565', '24" c 24"', 12000.00)
ON CONFLICT DO NOTHING;

COMMIT;
```

---

## Final Local DB Counts

| Check | Expected | Result |
|-------|----------|--------|
| `artworks` | 38 | 38 ✅ |
| `artwork_sizes` | 91 | 91 ✅ |
| `categories` | 7 | 7 ✅ |
| All artworks `IN_STOCK` | 38 | 38 ✅ |
| `sku LIKE 'CKS-2026-%'` rows | 0 | 0 ✅ |
| `id LIKE 'cks-2026-%'` rows | 0 | 0 ✅ |
| `id LIKE 'cks-cks-%'` rows | 0 | 0 ✅ |
| Placeholder title rows | 0 | 0 ✅ |

---

## Regression Test Results

Applied corrected workbook, verified counts, and safely cleaned up:

| Check | Result |
|-------|--------|
| Apply corrected workbook → 24 rows created | ✅ |
| DB 38→62 after apply | ✅ |
| Public count remains 38 (NEEDS_REVIEW hidden) | ✅ |
| Admin count = 62 | ✅ |
| Safe cleanup: matched only 24 NEEDS_REVIEW rows | ✅ |
| No production artworks in delete set | ✅ |
| DB restored to 38 after cleanup | ✅ |
| artwork_sizes still 91 after cleanup | ✅ |
| Repaired artwork title intact | ✅ |
| Repaired artwork size variants intact (2) | ✅ |

---

## Safer Cleanup Rule Going Forward

**Do not use `DELETE FROM artworks WHERE sku LIKE 'CKS-2026-%'` for cleanup.**

This pattern matches any artwork that has a `CKS-2026-*` SKU — including production artworks that may have been temporarily assigned such a SKU during testing.

**Safe cleanup pattern for imported test rows:**

```sql
-- Step 1: List what will be deleted — confirm all rows are newly imported
SELECT id, sku, title, status
FROM artworks
WHERE sku LIKE 'CKS-2026-%'
  AND status = 'NEEDS_REVIEW';

-- Step 2: Only delete if all rows are NEEDS_REVIEW (imported) — never production rows
DELETE FROM artworks
WHERE sku LIKE 'CKS-2026-%'
  AND status = 'NEEDS_REVIEW';
```

Even safer: delete by imported artwork ID prefix, which only matches rows created by the apply endpoint:

```sql
DELETE FROM artworks WHERE id LIKE 'cks-2026-%';
```

---

## Production Safety Confirmation

- ✅ Production database was NOT modified
- ✅ `chitrakala_prod_20260626.backup` was used read-only (restored to a temp DB, then dropped)
- ✅ `server/.env` points to `localhost:5433/chitrakala_dev` only
- ✅ No deployment
- ✅ No new features implemented
- ✅ No invoice/shipment work
- ✅ No test data left behind
