# ISYNC-12: Production Release Plan

**Status:** Planning only — no production changes made under this ticket  
**Date:** 2026-07-04  
**Branch validated in staging:** `feature/ISYNC-11-inventory-sync` at `d7575e3`  
**Production main tip at time of writing:** `34c4251`  
**Author:** Sanjay Narla

---

## ⚠ Critical Rule — Read Before Any Action

**`main` auto-deploys to production via Railway (backend) and Vercel (frontend).**

Merging the ISYNC branch to `main` before the production schema migration will cause the public-facing gallery API to fail. The ISYNC backend code queries columns (`status`, `sku`, `image_filename`, `notes`) that do not yet exist in the production database. A code-first deploy would produce database errors on every public API call until migrations are run.

**Required order: production schema migration first, then merge, then deploy.**

---

## 1. Purpose

This document is the pre-merge production release plan for the Inventory Sync feature (INV-01 through INV-10, ISYNC-01 through ISYNC-11). It defines the exact sequence required to safely deploy the feature to production without downtime or data loss.

The ISYNC feature branch has been fully validated in staging (ISYNC-11). It is ready for production release, but the release must follow a controlled sequence because:

1. `main` automatically deploys to the Railway production backend and Vercel production frontend on every commit.
2. The ISYNC code references DB columns that do not exist in the current production schema.
3. If the PR is merged before those columns are added, production will serve errors on the public gallery, admin login, and all API routes that touch the `artworks` table.

**This document is planning only. No production data is changed, no migrations are executed, and no merge to `main` is performed under ISYNC-12.**

---

## 2. Current Known State

### Feature Branch
| Item | Value |
|---|---|
| Branch | `feature/ISYNC-11-inventory-sync` |
| Validated commit | `d7575e3` — Merge PR #14 (nav overflow fix) |
| Last backend change | `67fe786` — fix: stop fabricating image URLs for artworks with no stored image data |
| Security fix | `0f6315a` — fix: remove unauthenticated `/_whoami-db` debug endpoint |

### Staging Validation (ISYNC-11) — Complete
- Schema migrations applied and verified on staging DB ✅
- Staging baseline correction applied (usd_multiplier, missing categories) ✅
- Inventory Preview tested: 24 CREATE rows, 0 errors, 3 images matched ✅
- Inventory Apply tested: 24 rows created, all `NEEDS_REVIEW`, total=59 artworks ✅
- Review Queue loaded and publish-one-item flow verified ✅
- Image rendering fix deployed and verified (no broken icons) ✅
- Re-upload without ZIP verified: no status downgrade, no image cleared ✅
- Nav overflow fix (PR #14) merged and verified ✅
- Public site regression checks passed ✅

### Production DB State (estimated, not verified live)
| Table | Expected count |
|---|---|
| `artworks` | 38 |
| `artwork_sizes` | 91 |
| `categories` | 5 (does **not** yet have `warli-art` or `mixed-art`) |

Production schema does **not** yet have these columns:

| Column | Table | Added by |
|---|---|---|
| `sku` | `artworks` | `migrate_add_inventory_columns.sql` |
| `quantity` | `artworks` | `migrate_add_inventory_columns.sql` |
| `status` | `artworks` | `migrate_add_inventory_columns.sql` |
| `image_filename` | `artworks` | `migrate_inv03a_schema.sql` |
| `notes` | `artworks` | `migrate_inv03a_schema.sql` |

> `price_inr`, `price_usd`, `fx_rate_used`, `multiplier_used`, and `updated_at` were added to `artworks` by `migrate_add_currency_pricing.sql` (CKA-14, 2026-03-07) and are assumed already present in production.

### Inventory Apply / Import
Production Inventory Apply has **not** been run and is **not** part of this release. After release, the production Preview → Apply workflow is a separate business-approved action.

---

## 3. Production Release Sequence

Steps must be executed in this exact order. Each step marked ✋ requires explicit approval before execution.

```
[ ISYNC-12 ] Planning only — this document
      |
      v
[ ISYNC-13 ] ✋ Production backup → ✋ Production schema migration → ✋ Schema verification
      |
      v
[ ISYNC-14 ] ✋ Merge feature branch to main → Auto-deploy fires → ✋ Pause confirmed
      |
      v
[ ISYNC-15 ] ✋ Production smoke validation
      |
      v
[ Future ]   Production Preview (business approval) → Production Apply (separate approval)
```

### Detailed Step Order

1. **Keep ISYNC-11 PR open and unmerged.** Do not merge until ISYNC-13 schema verification passes.

2. **Take a fresh production DB backup.** See Section 4. This is the rollback restore point.

3. **Verify the backup** is non-zero and documents the pre-migration row counts.

4. **Disable production auto-deploy** on Railway and Vercel dashboards before running migrations. This prevents any accidental deploy between migration and the intentional code push.

5. **Run production schema migrations** (ISYNC-13). The two ISYNC migration files only. Do not run staging-only baseline correction files. Do not run other migration files that are already applied.

6. **Verify production schema** — columns, indexes, categories, and NULL status normalization. See Section 5.

7. **Re-enable auto-deploy** (or leave disabled for manual deploy — business owner decides).

8. **Merge ISYNC-11 PR to `main`** (ISYNC-14). Railway and Vercel will auto-deploy, or trigger manually if auto-deploy was left disabled.

9. **Wait for Railway and Vercel deployments to complete** before running any checks.

10. **Run production smoke tests** (ISYNC-15). See Section 7. Do not run Inventory Apply during smoke testing.

11. **Production Inventory Preview** — run after smoke tests pass. Business owner approves the workbook before this step.

12. **Production Inventory Apply** — separate approval. Only after Preview is reviewed and business owner confirms.

---

## 4. Production Backup Plan

### What to back up
Take a full logical backup of the production database using `pg_dump`. This backs up the entire production DB, not just the ISYNC tables.

### Command pattern (business owner runs on their machine)
```powershell
# Set in terminal — do not paste URL into chat or save to a shared file
$env:PROD_DB_URL = "YOUR_PRODUCTION_DATABASE_URL"

& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" `
  --format=custom `
  --no-owner `
  --no-acl `
  -f "C:\Development\backups\postgres\chitrakala_prod_20260704_pre_isync.backup" `
  "$env:PROD_DB_URL"

Remove-Item Env:PROD_DB_URL
```

### Verify the backup
```powershell
Get-Item "C:\Development\backups\postgres\chitrakala_prod_20260704_pre_isync.backup" | Select-Object Name, Length
```
Expected: file exists, size > 0. Report the file size before proceeding.

### Pre-migration count baseline
Before running any migration, confirm row counts match expectations:
```sql
SELECT 'artworks'     AS "table", COUNT(*) FROM artworks
UNION ALL
SELECT 'artwork_sizes', COUNT(*) FROM artwork_sizes
UNION ALL
SELECT 'categories',   COUNT(*) FROM categories;
```
Expected: `artworks=38`, `artwork_sizes=91`, `categories=5`.

### Backup file record
Record the backup filename, size, and pre-migration counts in this document or in the ISYNC-13 session notes before proceeding.

### Stop condition
**If pg_dump fails, exits non-zero, or produces a zero-byte file: stop. Do not proceed to migration. Report the error and wait for instructions.**

---

## 5. Production Migration Plan

### Migration files required for production

These two files must be reviewed and run on production, in this order:

| Order | File | Ticket | What it adds |
|---|---|---|---|
| 1 | `server/dbMigration/migrate_add_inventory_columns.sql` | INV-02 | `sku VARCHAR(100)`, `quantity INTEGER DEFAULT 1`, `status VARCHAR(30) DEFAULT 'IN_STOCK'`, `idx_artworks_sku_unique` (partial unique), `idx_artworks_status` |
| 2 | `server/dbMigration/migrate_inv03a_schema.sql` | INV-03A | `image_filename VARCHAR(255)`, `notes TEXT`, NULL status normalization, `warli-art` category, `mixed-art` category |

Both files use `ADD COLUMN IF NOT EXISTS` and `ON CONFLICT DO NOTHING` — they are safe to re-run if interrupted.

### Files NOT to run on production
| File | Reason |
|---|---|
| `migrate_add_artwork_sizes.sql` | Pre-ISYNC migration, already applied to production |
| `migrate_add_currency_pricing.sql` | Pre-ISYNC migration (CKA-14, 2026-03-07), already applied to production |
| `s2_5_staging_baseline_correction.sql` | Staging-only baseline correction — **never run on production** |
| `verify_staging_*.sql` | Staging-only verification helpers — do not run on production |

### How to run (ISYNC-13, requires explicit approval)
```powershell
# Set in terminal only
$env:PROD_DB_URL = "YOUR_PRODUCTION_DATABASE_URL"

node runMigration.js migrate_add_inventory_columns.sql
node runMigration.js migrate_inv03a_schema.sql

Remove-Item Env:PROD_DB_URL
```

> `runMigration.js` reads `DATABASE_URL` from the environment via dotenv, wraps the SQL in `BEGIN`/`COMMIT`, and logs a masked connection string. Do not echo or print the full URL.

### Post-migration verification queries

Run all of the following. Every check must pass before proceeding.

**1. New columns present on `artworks`:**
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'artworks'
  AND column_name IN ('sku', 'quantity', 'status', 'image_filename', 'notes')
ORDER BY column_name;
```
Expected: 5 rows returned.

**2. Indexes created:**
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'artworks'
  AND indexname IN ('idx_artworks_sku_unique', 'idx_artworks_status');
```
Expected: 2 rows returned.

**3. No NULL statuses remain:**
```sql
SELECT COUNT(*) FROM artworks WHERE status IS NULL;
```
Expected: `0`.

**4. All existing rows defaulted to `IN_STOCK`:**
```sql
SELECT status, COUNT(*) FROM artworks GROUP BY status ORDER BY status;
```
Expected: a single row `IN_STOCK | 38` (no other statuses, no NULLs).

**5. New categories added:**
```sql
SELECT id, name, display_order FROM categories ORDER BY display_order;
```
Expected: 7 rows including `warli-art` (display_order 6) and `mixed-art` (display_order 7).

**6. Row counts unchanged:**
```sql
SELECT 'artworks'     AS "table", COUNT(*) FROM artworks
UNION ALL
SELECT 'artwork_sizes', COUNT(*) FROM artwork_sizes
UNION ALL
SELECT 'categories',   COUNT(*) FROM categories;
```
Expected: `artworks=38`, `artwork_sizes=91`, `categories=7`.

### Stop conditions
- Any column from check #1 is missing → stop, do not merge
- Either index from check #2 is missing → stop, do not merge
- Check #3 returns > 0 → stop, investigate before merging
- Check #4 shows unexpected statuses → stop, investigate
- Check #5 returns fewer than 7 rows or wrong display_orders → stop
- Check #6 `artworks` or `artwork_sizes` count changed → stop, data was modified unexpectedly

---

## 6. Pre-Merge Checklist

Complete every item before merging to `main`. All must be ✅.

**Staging validation**
- [ ] ISYNC-11 staging validation complete and approved
- [ ] Inventory Preview and Apply tested in staging
- [ ] Review Queue and publish-one-item tested in staging
- [ ] Re-upload without ZIP tested (no status downgrade, no image cleared)
- [ ] Image rendering fix (no broken icons) verified in staging
- [ ] Nav overflow fix verified in staging
- [ ] Public API regression checks passed

**Security**
- [ ] `/_whoami-db` endpoint removed (commit `0f6315a`)
- [ ] All `/api/admin/*` routes return `401` without a valid JWT
- [ ] No credentials committed to the repo

**Branch state**
- [ ] Feature branch is up to date with `main` (no unmerged commits on `main` that conflict)
- [ ] No untracked sensitive files staged (no `.env`, no workbooks, no ZIPs, no image files)
- [ ] PR opened and reviewed

**Production DB**
- [ ] Fresh production backup taken and verified (non-zero size)
- [ ] Pre-migration production row counts recorded
- [ ] `migrate_add_inventory_columns.sql` run on production and verified
- [ ] `migrate_inv03a_schema.sql` run on production and verified
- [ ] All 6 post-migration verification queries passed
- [ ] Auto-deploy status on Railway and Vercel confirmed and set intentionally

**Non-blocking follow-ups documented (do not block merge)**
- [ ] Preview `plannedStatus` label is misleading for UPDATE rows (tracked: task_775a3684)
- [ ] Missing `/assets/images/placeholder.jpg` public fallback (tracked: task_3ea3357e)
- [ ] `PATCH /api/admin/artworks/:id/status` returns full `image_data` bytes (tracked: task_46e8dbf7)

**Approval**
- [ ] Business owner explicitly approves merge to `main`

---

## 7. Post-Deploy Smoke Checklist

Run after Railway and Vercel deployments complete. All must pass before declaring the release successful.

**Public site**
- [ ] Production home page loads without error
- [ ] `GET /api/categories` returns 7 categories (including `warli-art` and `mixed-art`)
- [ ] `GET /api/artworks` returns 38 artworks, all `IN_STOCK`, no `NEEDS_REVIEW` rows visible
- [ ] Individual artwork detail pages load
- [ ] Category filter pages load
- [ ] About page loads

**Admin**
- [ ] Admin login page loads at `/ckk-secure-admin`
- [ ] Admin login succeeds with production credentials
- [ ] Admin dashboard loads and shows correct artwork count
- [ ] Inventory Sync page loads at `/ckk-secure-admin/inventory-sync`
- [ ] Review Queue page loads at `/ckk-secure-admin/review-queue`

**Security**
- [ ] `GET /_whoami-db` returns `404` (debug endpoint is gone)
- [ ] `GET /api/admin/artworks` without JWT returns `401`
- [ ] `POST /api/admin/inventory-sync/preview` without JWT returns `401`

**Inventory Sync — smoke only**
- [ ] Inventory Sync page renders upload form
- [ ] **Do not run Inventory Preview during smoke testing**
- [ ] **Do not run Inventory Apply during smoke testing**

---

## 8. Rollback / Stop Plan

### If production migration fails
- `runMigration.js` wraps SQL in `BEGIN`/`COMMIT`. A failure mid-migration rolls back the entire transaction. No partial state is left.
- Confirm no partial columns exist by re-running verification query #1.
- Stop. Do not merge. Do not deploy. Report the exact error and wait for instructions.
- If the DB is in an uncertain state: restore from the pre-ISYNC production backup taken in Section 4.

### If production deploy fails (Railway or Vercel)
- Railway: roll back to the previous deployment in the Railway dashboard (Deployments → previous commit → Redeploy).
- Vercel: roll back to the previous deployment in the Vercel dashboard (Deployments → previous → Promote to Production).
- Do not attempt hotfixes without business owner approval.

### If public site breaks after deploy
1. Immediately check `GET /api/artworks` and `GET /api/categories` from a browser or curl.
2. Check Railway backend logs for SQL errors (missing column errors indicate migration was not run or failed silently).
3. If errors reference missing columns: the production migration did not apply cleanly. Roll back the code deployment and re-verify migration state.
4. If errors are not column-related: stop and report the exact error before taking further action.

### When to stop and ask
Stop and ask the business owner before proceeding if any of the following occur:
- Production backup fails or is zero bytes
- Any post-migration verification query does not return the expected result
- Production artwork count changes after migration (should be 38, unchanged)
- Public site returns 500 errors after deploy
- Admin login stops working after deploy
- Any unexpected data visible publicly (e.g., `NEEDS_REVIEW` items appearing)

**Never run Inventory Apply as a recovery action.** Apply only runs on explicit business approval with a reviewed and approved workbook.

---

## 9. Out of Scope for ISYNC-12

The following are explicitly out of scope for this planning ticket:

| Item | Notes |
|---|---|
| Production DB migration execution | ISYNC-13 |
| Merging ISYNC branch to `main` | ISYNC-14 |
| Production deployment | ISYNC-14 / auto-deploy after merge |
| Production smoke validation | ISYNC-15 |
| Production Inventory Preview | Post-release, separate approval |
| Production Inventory Apply | Post-release, separate business approval with approved workbook |
| Existing artwork SKU/status/quantity backfill | Future INV-DATA ticket |
| Pricing recalculation for existing artworks | Future ticket |
| Data cleanup from staging imported rows | Staging concern only |
| Website visibility enhancement implementation | Future feature ticket |
| Intern audit DB (INV-02–07) | Complete. Follow-up data-gap tickets produced. Does not block schema migration/deploy; blocks production Apply and workbook approval. |

---

## 10. Handoff to ISYNC-13 / ISYNC-14 / ISYNC-15

| Ticket | Scope | Gate |
|---|---|---|
| **ISYNC-13** | Production backup + production schema migration + schema verification | Requires explicit approval before each sub-step. Do not proceed if backup fails or any verification query does not match. |
| **ISYNC-14** | Merge ISYNC-11 PR to `main` + confirm auto-deploy (or trigger manual deploy) | Requires ISYNC-13 complete and all 6 verification queries passed. Requires business owner merge approval. |
| **ISYNC-15** | Production smoke validation (public site, admin, security checks) | Requires ISYNC-14 deploy confirmed. Do not run Inventory Apply during ISYNC-15. |

---

## Open Questions (to resolve before ISYNC-13)

| # | Question | Impact |
|---|---|---|
| 1 | Are Railway and Vercel production auto-deploy currently enabled? | Determines whether auto-deploy must be paused before running migrations. Check Railway and Vercel dashboards before starting ISYNC-13. |
| 2 | Does production currently have `mirror-mosaic` and `texture-art` categories (display_order 3 and 4)? | Production export shows 5 categories but their IDs are unconfirmed. If these are missing, a separate production baseline correction is needed before migration — similar to staging S2.5. |
| 3 | What is the production `usd_multiplier` value in `pricing_settings`? | Staging had `1.75` (wrong); corrected to `2.25` in S2.5. If production also has `1.75`, a production baseline correction is needed. |
| 4 | Is the ISYNC-11 PR formally opened on GitHub, and has it been reviewed? | Pre-merge checklist requires a reviewed PR. |
| 5 | Intern audit DB (INV-02–07) complete. | Audit produced data-gap follow-up tickets. These do **not** block production schema migration or code deploy (ISYNC-13/14/15). They **do** block production Inventory Apply/import and final workbook approval — Apply must not run on production until data-gap tickets are resolved and the workbook is re-approved. |
