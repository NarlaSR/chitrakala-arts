# ISYNC-09: Staging-First Production Readiness Runbook

**Status:** Ready for human review (documentation only — no deployments made)  
**Date:** 2026-06-29 (revised)  
**Branch:** `main`  
**Covers:** ISYNC-01 through ISYNC-10 (Inventory Sync feature)

> ⚠ **Branch / PR note:** All ISYNC changes currently live as unstaged/untracked modifications on `main`. Before deployment, determine the intended merge workflow:
> - If the team uses feature branches + pull requests (recommended), create a branch (e.g. `feature/inventory-sync`), commit all changes there, and open a PR for review before merging to `main`.
> - If direct-to-main is the intentional workflow for this project, commit directly — but do not `git push` until the human code review in Step S0 is complete.
> - **Do not push to `main` without review, regardless of workflow.**

---

## ⚠ MANDATORY GATES — DO NOT SKIP

```
Production CANNOT proceed until staging validation passes.
Staging migration/deployment is a SEPARATE approval step.
Production migration/deployment is a SEPARATE approval step AFTER staging passes.
Stop and ask before any action that touches staging or production DB.
```

---

## 1. Executive Summary

The Inventory Sync feature (ISYNC-01–10) is complete locally. It allows an admin to:
1. Upload an Excel workbook of inventory items
2. Preview which rows will create or update artwork records (with image matching)
3. Apply the import — imported rows land as `NEEDS_REVIEW`, hidden from public
4. Review imported items, add/verify image/description, then publish to `IN_STOCK`

This document is the staging-first deployment and validation runbook. **Nothing in this document modifies staging or production.** Each action step is marked with ✋ (requires explicit approval before execution).

---

## 2. Current Local Completion Status

| Ticket | Description | Local Status |
|--------|-------------|-------------|
| INV-01 | Parser + read-only preview endpoint | ✅ Complete |
| INV-02 | Local DB schema migration (sku/quantity/status) | ✅ Complete |
| INV-03 prereq | Production snapshot restored locally | ✅ Complete |
| INV-03A | Public visibility fix + parser prep | ✅ Complete |
| INV-03B | Apply/import endpoint | ✅ Complete |
| INV-03B-Cleanup | Artwork ID format fix | ✅ Complete |
| INV-04 | Admin Inventory Sync UI | ✅ Complete |
| INV-05 | Admin Review Queue | ✅ Complete |
| INV-05B | Artwork update validation hardening | ✅ Complete |
| INV-05C | Local DB integrity check | ✅ Complete (affected local row repaired from backup; final baseline restored) |
| INV-06 | Image ZIP matching + upload pipeline | ✅ Complete |

**Final local baseline (post-cleanup):**

| Table | Count |
|-------|-------|
| `artworks` | 38 |
| `artwork_sizes` | 91 |
| imported `cks-2026-%` rows | 0 |
| bad `cks-cks-%` IDs | 0 |

> ⚠ **These counts are from the local `chitrakala_dev` database only.** Staging and production have their own baseline counts. Always query the target DB directly and record its actual counts before running migrations or Apply. Do not assume staging or production matches local figures.

---

## 3. Git Status and Files Changed

### Branch
`main` — up to date with origin/main (all changes are unstaged/untracked locally)

### Safety checks ✅

- `server/.env` — **not staged**, gitignored (confirmed)
- `.claude/` — **not staged**, gitignored (confirmed)
- Test workbooks/ZIPs/images — **not staged** (confirmed)
- No secrets, `.pem`, `.key` files staged

### Modified files (unstaged)

| File | Type | Description |
|------|------|-------------|
| `.gitignore` | Modified | Added `.claude/`, `__test_workbooks/`, `preview-response.json` |
| `package-lock.json` | Modified | Root lockfile updated |
| `server/package-lock.json` | Modified | Added `adm-zip` and transitive deps — **include in commit** |
| `server/package.json` | Modified | Added `adm-zip ^0.5.16`, `xlsx ^0.18.5` |
| `server/server.js` | Modified | 544 line net change — full inventory sync feature |
| `server/dbQueries.js` | Modified | New DB helper functions for inventory import |
| `src/App.js` | Modified | Two new admin routes |
| `src/pages/AdminDashboard.js` | Modified | Two new nav buttons |
| `src/services/api.js` | Modified | New inventory sync and admin artwork API methods |

### New files (untracked)

| File | Description |
|------|-------------|
| `server/inventoryParser.js` | Inventory workbook parser utility |
| `server/dbMigration/migrate_add_inventory_columns.sql` | Migration 1: sku/quantity/status columns |
| `server/dbMigration/migrate_inv03a_schema.sql` | Migration 2: image_filename/notes + categories |
| `src/pages/AdminInventorySync.js` | Inventory Sync admin page |
| `src/pages/AdminReviewQueue.js` | Review Queue admin page |
| `src/styles/AdminInventorySync.css` | Inventory Sync styles |
| `src/styles/AdminReviewQueue.css` | Review Queue styles |
| `docs/inventory-sync/` | All 10 ticket documentation files |

### Files to exclude from commit

| File | Reason |
|------|--------|
| `preview-response-db.json` | Local test output |
| `preview-response-prod-snapshot.json` | Local test output |
| `CONTEXT.md` | Internal scratch file |
| `docs/CHITRAKALA_FUTURE_ENHANCEMENTS.md` | Separate roadmap doc — review separately |
| `docs/prompt/` | Internal agent prompts |

---

## 4. Code Changes Summary

### Backend (`server/server.js`, `server/dbQueries.js`)

**Inventory parser** (`server/inventoryParser.js` — new):
- Parses `.xlsx`/`.xls` workbooks from buffer
- Column matching by header name (case-insensitive)
- SKU format: `CKS-YYYY-CODE-SIZE-00001` (new format only; old format → ERROR)
- SKU counter resets per `Year+ArtWorkCode+SizeCode`
- Explicit new-format SKUs reserve counter slots to prevent batch collisions
- Known Art Work codes: `DM`, `LA`, `MM`, `WA`, `TA`, `MA` (MW retired)
- Image filename validation: rejects path traversal (any `/`, `\`, `..`) as ERROR
- Returns per-row: `errors[]`, `warnings[]`, `imageStatus`, `plannedStatus`

**Preview endpoint** (`POST /api/admin/inventory-sync/preview`):
- Auth required
- Accepts: `file` (workbook), `imageZip` (optional), `images[]` (optional)
- Returns: `summary`, `imageSummary`, `rows[]`, `warnings[]`, `detectedColumns`, `missingColumns`
- Read-only — zero DB writes
- Image matching: `matched`/`missing`/`not_provided` per row

**Apply endpoint** (`POST /api/admin/inventory-sync/apply`):
- Auth required
- Re-parses and re-validates server-side (does not trust frontend preview)
- Single DB transaction for all row data
- Image processing after transaction (best-effort, failures reported)
- All imported rows: `status = 'NEEDS_REVIEW'`, `featured = false`, `image = NULL` initially
- Artwork IDs: `cks-${sku.toLowerCase()}` → e.g. `cks-2026-dm-sm-00001`
- Returns: `summary` with `imagesStored`, `imagesFailed`; `imageFailures[]` when non-zero

**Admin artwork update** (`PUT /api/admin/artworks/:id`):
- Now accepts: `status`, `sku`, `quantity`, `image_filename`, `notes`
- Status validated against `ALLOWED_ARTWORK_STATUSES`
- SKU validated against `^CKS-\d{4}-(DM|LA|MM|WA|TA|MA)-(SM|MD|LG|XL)-\d{5}$`
- SKU uniqueness checked (409 on duplicate)
- Quantity: integer ≥ 0 (0 stored as 0, not null)
- Blank SKU explicitly clears existing SKU (no COALESCE)

**Status update** (`PATCH /api/admin/artworks/:id/status`):
- Auth required
- Allows: `NEEDS_REVIEW`, `IN_STOCK`, `OUT_OF_STOCK`, `SOLD`, `ARCHIVED`

**Public visibility** (`GET /api/artworks`, `GET /api/artworks/:id`):
- Now filtered: `WHERE status = 'IN_STOCK'` (was unfiltered)
- `/api/artworks/:id` returns 404 for non-IN_STOCK artworks

**Admin visibility** (`GET /api/admin/artworks`):
- New route — auth required — returns all artworks regardless of status

**CORS**: Added `PATCH` to allowed methods

**DB helpers** (`server/dbQueries.js`):
- `getArtworks()` — public, `status = 'IN_STOCK'` only
- `getArtworksAdmin()` — all statuses
- `getArtworkById(id, publicOnly)` — publicOnly flag
- `updateArtwork()` — extended with 5 new fields (direct assignment, no COALESCE)
- `updateArtworkStatus(id, status)` — single-field status update
- `getArtworkBySku(sku)` — SKU lookup for uniqueness/classification
- `createArtworkFromInventory(data, client)` — transaction-aware INSERT
- `updateArtworkFromInventory(sku, data, client)` — transaction-aware PATCH by SKU

### Frontend

**`src/pages/AdminInventorySync.js`** (new):
- Route: `/ckk-secure-admin/inventory-sync`
- Workbook file picker + optional image ZIP picker
- Preview with image summary cards + row table with `imageStatus`
- Apply with confirmation dialog
- Stale-preview warning when images change after preview
- Auth guard uses `authLoading` to prevent race condition redirect
- No hardcoded correction banners (errors come from backend response only)

**`src/pages/AdminReviewQueue.js`** (new):
- Route: `/ckk-secure-admin/review-queue`
- Summary count cards by status
- Filter tabs: All / Needs Review / In Stock / Out of Stock / Sold / Archived
- Table with image thumbnails (48×48), SKU, status badges, actions
- Inline edit panel (title, description, dimensions, materials, quantity, price, notes)
- Actions: Edit, Publish, OOS, Archive
- Auth guard uses `authLoading`

**`src/services/api.js`**:
- `inventorySyncAPI.preview(workbookFile, { zip, images })` — new signature
- `inventorySyncAPI.apply(workbookFile, { zip, images })` — new signature
- `inventorySyncAPI.getAdminArtworks()` — new
- `artworksAPI.getAllAdmin()` — new
- `artworksAPI.updateStatus(id, status)` — new

**`src/App.js`**: Added routes for `/inventory-sync` and `/review-queue`

**`src/pages/AdminDashboard.js`**: Added "Inventory Sync" and "Review Queue" nav buttons

### Dependencies added

| Package | Version | Purpose |
|---------|---------|---------|
| `adm-zip` | `^0.5.16` | ZIP archive parsing for image uploads |
| `xlsx` | `^0.18.5` | Excel workbook parsing |

---

## 5. Database Migration Plan

### Migrations required (both staging and production)

Two SQL migration files must be run **in order**:

#### Migration 1: `server/dbMigration/migrate_add_inventory_columns.sql`

```sql
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS sku VARCHAR(100);
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'IN_STOCK';

CREATE UNIQUE INDEX IF NOT EXISTS idx_artworks_sku_unique
  ON artworks(sku) WHERE sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_artworks_status
  ON artworks(status);
```

#### Migration 2: `server/dbMigration/migrate_inv03a_schema.sql`

```sql
UPDATE artworks SET status = 'IN_STOCK' WHERE status IS NULL;

ALTER TABLE artworks ADD COLUMN IF NOT EXISTS image_filename VARCHAR(255);
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS notes TEXT;

INSERT INTO categories (id, name, description, display_order)
VALUES ('warli-art', 'Warli Art', '...', 6)
ON CONFLICT (id) DO NOTHING;

INSERT INTO categories (id, name, description, display_order)
VALUES ('mixed-art', 'Mixed Art', '...', 7)
ON CONFLICT (id) DO NOTHING;
```

### Migration safety analysis

| Concern | Assessment |
|---------|------------|
| `IF NOT EXISTS` / `ON CONFLICT DO NOTHING` | ✅ All statements are idempotent |
| Existing rows preserved | ✅ Only additive — no DROP, no truncate |
| Default `status = 'IN_STOCK'` for new rows | ✅ Correct — existing artworks default to IN_STOCK |
| NULL status normalization | ✅ `UPDATE WHERE status IS NULL` only affects rows that have null status (pre-migration) |
| Partial unique index for sku | ✅ `WHERE sku IS NOT NULL` — existing rows with null SKU are unaffected |
| Categories | ✅ `ON CONFLICT DO NOTHING` — existing categories untouched |
| Runner: `server/runMigration.js` | ✅ Uses DATABASE_URL from env, wraps in BEGIN/COMMIT, can target any DB |

### Migration runner command

**Bash/Mac/Linux:**
```bash
cd server
DATABASE_URL=<target-db-url> node runMigration.js migrate_add_inventory_columns.sql
DATABASE_URL=<target-db-url> node runMigration.js migrate_inv03a_schema.sql
```

**PowerShell (Windows):**
```powershell
cd server
$env:DATABASE_URL = "<target-db-url>"
node runMigration.js migrate_add_inventory_columns.sql
node runMigration.js migrate_inv03a_schema.sql
# Reset after use:
Remove-Item Env:DATABASE_URL
```

Alternatively, set `DATABASE_URL` in `server/.env` pointing to the target DB, then:

```bash
# Bash:
cd server
node runMigration.js migrate_add_inventory_columns.sql
node runMigration.js migrate_inv03a_schema.sql
```

```powershell
# PowerShell:
cd server
node runMigration.js migrate_add_inventory_columns.sql
node runMigration.js migrate_inv03a_schema.sql
```

⛔ After running against staging or production, immediately restore `server/.env` to point back to local `chitrakala_dev`.

---

## 6. Backup Plans

> ✋ **Do not run backups without explicit approval.**  
> These commands run **locally** using a locally-installed `pg_dump`. The Railway `DATABASE_URL` is passed as the connection target so the dump is pulled from Railway's Postgres to your local machine. Ensure `pg_dump` (PostgreSQL client tools) is installed locally before proceeding.

### Staging backup (before staging migration)

Get the staging `DATABASE_URL` from the Railway dashboard (staging service → Variables), then run locally:

**Bash/Mac/Linux:**
```bash
pg_dump "postgres://user:password@host:port/dbname" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file=./backups/chitrakala_staging_YYYYMMDD_pre_isync.backup

# Verify the backup file exists locally and has a non-zero size:
ls -lh ./backups/chitrakala_staging_YYYYMMDD_pre_isync.backup
```

**PowerShell (Windows):**
```powershell
$env:PGPASSWORD = "<staging-db-password>"
pg_dump "postgres://user:password@host:port/dbname" `
  --format=custom --no-owner --no-acl `
  --file=".\backups\chitrakala_staging_YYYYMMDD_pre_isync.backup"
Get-Item ".\backups\chitrakala_staging_YYYYMMDD_pre_isync.backup" | Select-Object Name, Length
```

→ Stop if backup file is 0 bytes or command fails.

**Naming convention:** `chitrakala_staging_YYYYMMDD_pre_isync.backup`  
**Location:** `server/dbMigration/backups/` (gitignored) or any secure local folder outside the repo

### Production backup (before production migration)

Same pattern with the production `DATABASE_URL`:

**Bash:**
```bash
pg_dump "postgres://user:password@host:port/dbname" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file=./backups/chitrakala_prod_YYYYMMDD_pre_isync.backup

ls -lh ./backups/chitrakala_prod_YYYYMMDD_pre_isync.backup
```

→ Stop if backup file is 0 bytes or command fails. **Do not proceed with migration until the backup file exists locally and has a non-zero size.**

**Naming convention:** `chitrakala_prod_YYYYMMDD_pre_isync.backup`

### Restore from backup (if needed)

```bash
pg_restore --clean --no-owner --no-acl \
  -d "postgres://user:password@host:port/dbname" \
  ./backups/<backup-file>.backup
```

⛔ **Never run restore against production without explicit approval and a second confirmation.**

---

## 7. Environment Readiness Checklist

### Required environment variables per environment

| Variable | Local | Staging | Production |
|----------|-------|---------|-----------|
| `DATABASE_URL` | `postgres://postgres:***@localhost:5433/chitrakala_dev` | Railway staging Postgres URL | Railway production Postgres URL |
| `JWT_SECRET` | `local-dev-secret` | Must be set in staging Railway service | Must be set in production Railway service |
| `BASE_URL` | `http://localhost:5000` | `https://<staging-backend>.up.railway.app` | `https://chitrakalaarts-production.up.railway.app` |
| `DEFAULT_ADMIN_PASSWORD` | `localdev123` | Only needed if staging DB has no users | Not needed if production has existing admin |
| `NODE_ENV` | (not set) | `production` | `production` |

### CORS — verify `BASE_URL` + allowed origins match

The CORS config in `server.js` allows specific origins including `chitrakalaarts-production.up.railway.app` and Vercel preview URLs. Before staging deployment, verify:

- Staging backend `BASE_URL` is set to the staging Railway URL (not production)
- Staging frontend (if it exists) is configured to point to staging backend
- Production frontend `REACT_APP_API_URL` points to production backend only

### Image storage safety

✅ Images are stored as BYTEA in `artworks.image_data` in PostgreSQL — **not** in the Railway ephemeral filesystem. This means images survive Railway restarts and deployments with no extra configuration.

### Upload size limits

The multer config was updated to **100 MB** for the inventory upload endpoint to accommodate image ZIPs. Verify Railway's proxy/timeout settings allow large multipart uploads:

- Railway default upload timeout: 60 seconds (may need adjustment for large ZIPs)
- Recommended: keep image ZIPs under 50 MB per batch

### Environment safety rules — STOP conditions

1. **Before ANY migration or Apply:** print `SELECT COUNT(*), MIN(created_at), MAX(created_at) FROM artworks;` to confirm you are connected to the intended DB
2. If row count is unexpected (much higher or lower than anticipated) → STOP
3. If `DATABASE_URL` contains a host you don't recognize → STOP
4. If `artworks` has existing `cks-2026-%` IDs → STOP (previous import may not have been cleaned up)
5. Never use production `DATABASE_URL` in local `.env` or staging `.env`

---

## 8. Staging Deployment and Validation Runbook

> ✋ Each numbered step requires explicit approval before execution.

### Pre-staging requirements (checklist before any action)

- [ ] Human code review of all changed files completed
- [ ] `server/.env` and secrets confirmed not in commit
- [ ] Test workbooks/ZIPs/images confirmed not in commit
- [ ] Corrected workbook ready (`CKS-2026-*` SKUs, `MA` not `MW`)
- [ ] Image ZIP ready with artwork images (filenames matching workbook `Image File Name` column)
- [ ] Railway CLI installed and authenticated
- [ ] Staging project ID known
- [ ] Staging Railway backend and staging PostgreSQL service identified (not production)

### Staging sequence

**Step S0** ✋ — Human code review and branch/PR decision

Before any deployment action:
- Complete a human review of all modified and new files listed in Section 3.
- Decide on the merge strategy (feature branch + PR, or direct-to-main).
- Ensure `server/.env` and all secrets are confirmed absent from the commit.
- Ensure test workbooks, ZIPs, and images are absent from the commit.
- Obtain explicit approval before proceeding to Step S1.

→ Do not proceed to Step S1 until Step S0 is complete and approved.

---

**Step S1** ✋ — Backup staging DB

Run locally using locally-installed `pg_dump` (see Section 6 for full instructions and PowerShell variant). Get the staging `DATABASE_URL` from the Railway dashboard:

```bash
pg_dump "postgres://user:password@host:port/dbname" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file=./chitrakala_staging_YYYYMMDD_pre_isync.backup

# Verify the backup file exists locally and has a non-zero size:
ls -lh ./chitrakala_staging_YYYYMMDD_pre_isync.backup
```

→ Stop if backup file is 0 bytes or the command fails. **Do not proceed to Step S3 without a verified local backup file.**

**Step S2** ✋ — Verify staging DB identity and baseline

Record the actual counts from the staging DB — do not assume local values:

```sql
SELECT COUNT(*)    FROM artworks;          -- record actual value
SELECT COUNT(*)    FROM artwork_sizes;     -- record actual value
SELECT COUNT(*)    FROM categories;
SELECT id, name    FROM categories ORDER BY display_order;
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'artworks' AND column_name IN ('sku','quantity','status','image_filename','notes');
SELECT COUNT(*) FROM artworks WHERE id LIKE 'cks-2026-%';

-- Verify pricing settings before Apply
-- Schema: key VARCHAR, value TEXT, updated_at TIMESTAMP (verified against local DB)
SELECT key, value FROM pricing_settings ORDER BY key;
```

Expected rows: `fx_rate` and `usd_multiplier`. Current intended website multiplier is **2.25**. If `usd_multiplier` shows a different value (e.g. still at `1.75` from a pre-update backup):
→ **STOP** — confirm with the business whether the multiplier should be updated before running Apply. Imported artwork `price_usd` values are calculated at apply time using whatever multiplier is currently in `pricing_settings`. A wrong multiplier means all imported prices will need to be recalculated.
→ Stop if any `cks-2026-%` rows exist (prior import not cleaned up).
→ Stop if artworks count is wildly different from expectation.

**Step S3** ✋ — Run staging DB migration (Migration 1)
```bash
DATABASE_URL=$STAGING_DATABASE_URL node runMigration.js migrate_add_inventory_columns.sql
```
→ Verify success message in output.

**Step S4** ✋ — Run staging DB migration (Migration 2)
```bash
DATABASE_URL=$STAGING_DATABASE_URL node runMigration.js migrate_inv03a_schema.sql
```
→ Verify success message.

**Step S5** ✋ — Verify staging migration
```sql
SELECT column_name, data_type, column_default FROM information_schema.columns
  WHERE table_name = 'artworks' AND column_name IN ('sku','quantity','status','image_filename','notes');
SELECT indexname FROM pg_indexes WHERE tablename = 'artworks'
  AND indexname IN ('idx_artworks_sku_unique','idx_artworks_status');
SELECT id, name FROM categories WHERE id IN ('warli-art','mixed-art');
SELECT COUNT(*) FROM artworks WHERE status IS NULL;  -- expect 0
```
→ Stop if any column is missing, any index is missing, or categories are absent.

**Step S6** ✋ — Deploy backend to staging Railway
```bash
railway up --service <staging-backend-service>
```
→ Watch deploy log for errors.

**Step S7** — Smoke test staging backend (see Section 10)

**Step S8** ✋ — Deploy staging frontend (if staging frontend exists)

> **If no staging frontend exists:** use the local React dev server pointed at the staging backend for UI validation. Set `REACT_APP_API_URL=https://<staging-backend>.up.railway.app` in your local `.env` (root level), restart `npm start`, and access `http://localhost:3000`. This lets you validate all admin UI workflows against the real staging DB without needing a deployed staging frontend. ⚠ Do not commit or push this local `.env` change.

**Step S9** — Smoke test staging admin UI routes (see Section 10)

**Step S10** ✋ — Run staging Inventory Preview
- Upload corrected workbook + image ZIP
- Review results: expected totalRows=24, errorCount=0, creates=24, matched images count
- Do NOT apply yet

**Step S11** ✋ — Run staging Apply (after preview reviewed and approved)

**Step S12** — Verify staging post-apply state:
```sql
SELECT COUNT(*) FROM artworks WHERE status='NEEDS_REVIEW';
SELECT COUNT(*) FROM artworks WHERE id LIKE 'cks-2026-%';
```
→ Public staging site count should NOT increase (NEEDS_REVIEW hidden).

**Step S13** ✋ — Publish one staging item via Review Queue

**Step S14** — Verify public count increases by 1 and image displays

**Step S15** — Re-upload workbook WITHOUT ZIP, run Apply → confirm existing images not cleared

**Step S16** — Decide: clean up staging import or retain

⚠ **Important:** The published test item from Step S13 is now `IN_STOCK` and would **not** be removed by a `NEEDS_REVIEW`-only delete. Always list first.

```sql
-- 1. List ALL imported rows, including any that were published (IN_STOCK):
SELECT id, sku, title, status FROM artworks WHERE id LIKE 'cks-2026-%' ORDER BY sku;
```

Option A — Revert the published item first, then delete all:
```sql
-- Revert the published test item:
UPDATE artworks SET status = 'NEEDS_REVIEW' WHERE id = '<published-id>';
-- Then delete all imported rows:
DELETE FROM artworks WHERE id LIKE 'cks-2026-%';
```

Option B — Delete all imported rows regardless of status (staging only, safe after review):
```sql
-- After reviewing the list above and confirming all are safe to remove:
DELETE FROM artworks WHERE id LIKE 'cks-2026-%';
```

⛔ Never use Option B on production without explicit approval and full list review.

**Step S17** — Verify final staging baseline counts match expectations

**Step S18** — ✅ Staging passed → proceed to production go/no-go

---

## 9. Production Deployment Runbook

> ✋ Each step requires explicit approval. Production is blocked until staging passes.

**Step P1** ✋ — Confirm staging passed (all staging smoke tests green)

**Step P2** ✋ — Confirm production go/no-go approval

**Step P3** ✋ — Backup production DB

Run locally using locally-installed `pg_dump` (see Section 6 for full instructions and PowerShell variant). Get the production `DATABASE_URL` from the Railway dashboard:

```bash
pg_dump "postgres://user:password@host:port/dbname" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file=./chitrakala_prod_YYYYMMDD_pre_isync.backup

# Verify the backup file exists locally and has a non-zero size:
ls -lh ./chitrakala_prod_YYYYMMDD_pre_isync.backup
```

→ Stop if backup file is 0 bytes or the command fails. **Do not proceed to Step P5 without a verified local backup file.**

**Step P4** ✋ — Verify production DB identity and baseline

Record the actual counts from the production DB — do not assume local or staging values:

```sql
SELECT COUNT(*)    FROM artworks;          -- record actual value
SELECT COUNT(*)    FROM artwork_sizes;     -- record actual value
SELECT COUNT(*)    FROM categories;
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'artworks' AND column_name IN ('sku','quantity','status','image_filename','notes');
SELECT COUNT(*) FROM artworks WHERE id LIKE 'cks-2026-%';  -- must be 0

-- Verify pricing settings before Apply
-- Schema: key VARCHAR, value TEXT, updated_at TIMESTAMP (verified against local DB)
SELECT key, value FROM pricing_settings ORDER BY key;
```

Expected rows: `fx_rate` and `usd_multiplier`. Intended website multiplier is **2.25** unless the business has since changed it.
→ **STOP** if `usd_multiplier` is not the intended value — confirm before Apply.
→ Stop if any `cks-2026-%` rows exist.
→ Stop if artworks count is wildly different from expectation.

**Step P5** ✋ — Run production DB Migration 1
**Step P6** ✋ — Run production DB Migration 2
**Step P7** ✋ — Verify production migration (same queries as S5)
**Step P8** ✋ — Deploy backend to production Railway
**Step P9** ✋ — Deploy frontend to Vercel production (if frontend build changed)
**Step P10** — Smoke test production (see Section 11)
**Step P11** ✋ — Run production Inventory Preview (workbook + image ZIP)
→ Review carefully — no Apply without review
**Step P11b** — Consider a small-batch pilot Apply before the full workbook

> **Recommended for first production import:** Before applying all 24+ rows, create a pilot workbook containing only 2–3 representative rows (e.g. one DM, one LA, one TA) with matching images. This limits the blast radius of any unexpected issue.
>
> **Pilot workbook requirements:**
> - Use the same column structure as the corrected workbook
> - Use valid new-format SKUs (e.g. `CKS-2026-DM-SM-00001`)
> - Use valid Art Work codes (no MW)
> - Include `Image File Name` column with filenames matching your pilot image ZIP
>
> **Pilot sequence:**
> 1. Preview pilot workbook → verify errorCount=0, createCount=2–3
> 2. Apply pilot workbook + image ZIP
> 3. Verify 2–3 NEEDS_REVIEW rows created, public count unchanged
> 4. Review Queue: inspect pilot rows, check image thumbnails
> 5. Publish one pilot item → confirm public count increases by 1, image visible
> 6. If all looks correct → proceed to full workbook Apply
> 7. If anything is wrong → delete pilot rows, diagnose, fix before full import
>
> Pilot row cleanup:
> ```sql
> SELECT id, sku, title, status FROM artworks WHERE id LIKE 'cks-2026-%' ORDER BY sku;
> -- After review: revert published item, then delete all:
> UPDATE artworks SET status = 'NEEDS_REVIEW' WHERE id = '<published-pilot-id>';
> DELETE FROM artworks WHERE id LIKE 'cks-2026-%';
> ```
>
> If the pilot is not practical (e.g. workbook row dependencies), clearly document the decision and proceed to the full workbook with extra caution.

**Step P12** ✋ — Run first production Apply (after preview reviewed and approved; pilot completed or waived)
**Step P13** — Verify `NEEDS_REVIEW` count, public count unchanged
**Step P14** — Review Queue: review all imported items
**Step P15** ✋ — Publish one production item
**Step P16** — Confirm public count increases by 1, image displays
**Step P17** — Leave remaining rows as `NEEDS_REVIEW` for staged publishing

---

## 10. Staging Smoke Tests

Run after staging deployment (Step S7/S9). All must pass before Apply.

### Infrastructure
- [ ] `GET https://<staging-backend>/api/artworks` → 200, JSON array
- [ ] `GET https://<staging-backend>/api/categories` → 200, includes dot-mandala, lippan-art, warli-art, mixed-art
- [ ] `GET https://<staging-backend>/api/artworks` → all items have `status = 'IN_STOCK'` (no NEEDS_REVIEW visible)
- [ ] `GET https://<staging-frontend>/` → public homepage loads
- [ ] Public category pages load (dot-mandala, lippan-art, mirror-mosaic, texture-art)
- [ ] Public artwork detail page loads for an existing artwork
- [ ] Existing artwork images display (not broken)

### Admin
- [ ] `POST /api/auth/login` with valid credentials → 200 + JWT
- [ ] `GET /api/admin/artworks` with auth → 200, all artworks including any NEEDS_REVIEW
- [ ] `/ckk-secure-admin/dashboard` loads
- [ ] `/ckk-secure-admin/inventory-sync` loads — no hardcoded correction banner
- [ ] `/ckk-secure-admin/review-queue` loads — default filter is Needs Review
- [ ] `/ckk-secure-admin/about`, `/settings`, `/categories`, `/contact` load without error

### Inventory Sync specific
- [ ] Preview with corrected workbook → 200, errorCount=0, 24 rows CREATE
- [ ] Preview with corrected workbook + image ZIP → imageSummary shows matched/missing counts
- [ ] Apply blocked with bad workbook (old SKU / MW) → 422
- [ ] Apply with corrected workbook + image ZIP → 200, 24 NEEDS_REVIEW rows
- [ ] `GET /api/artworks` count unchanged after Apply (NEEDS_REVIEW hidden)
- [ ] `GET /api/admin/artworks` count increases by 24
- [ ] Review Queue shows 24 NEEDS_REVIEW items with image thumbnails where applicable
- [ ] Publish one item → `GET /api/artworks` count increases by 1
- [ ] Published item visible on public staging site with image
- [ ] Re-upload workbook WITHOUT ZIP → existing images not cleared (UPDATE returns same image URL)
- [ ] Cleanup staging imported rows if desired; verify final counts

---

## 11. Production Smoke Tests

Run after production deployment. Perform preview before any Apply.

### Infrastructure
- [ ] `GET https://chitrakalaarts-production.up.railway.app/api/artworks` → 200
- [ ] `GET /api/categories` → expected categories present
- [ ] `GET /api/artworks` → all existing artworks visible, none with `NEEDS_REVIEW` status
- [ ] Public homepage loads
- [ ] Public category pages load
- [ ] Public artwork detail pages load
- [ ] Existing artwork images display

### Admin
- [ ] `POST /api/auth/login` with production credentials → 200
- [ ] Admin dashboard loads
- [ ] Inventory Sync page loads
- [ ] Review Queue page loads
- [ ] About / settings / categories still function

### Pre-apply
- [ ] `SELECT COUNT(*) FROM artworks WHERE id LIKE 'cks-2026-%'` → 0 before Apply
- [ ] Inventory Preview with corrected workbook + image ZIP → errorCount=0
- [ ] Preview shows expected CREATE count (24 if first import)
- [ ] NO Apply until preview is reviewed and explicitly approved

---

## 12. Rollback Plan

### Before any migration (either environment)
→ Restore from backup using `pg_restore --clean`. No code changes needed.

### After staging migration, before staging deploy

**Preferred rollback:** restore from the pre-migration backup (see Section 6). This is safer and faster than running a reverse migration manually.

**Manual reverse migration (only if restore is not feasible):**

```sql
DROP INDEX IF EXISTS idx_artworks_sku_unique;
DROP INDEX IF EXISTS idx_artworks_status;
ALTER TABLE artworks DROP COLUMN IF EXISTS sku;
ALTER TABLE artworks DROP COLUMN IF EXISTS quantity;
ALTER TABLE artworks DROP COLUMN IF EXISTS status;
ALTER TABLE artworks DROP COLUMN IF EXISTS image_filename;
ALTER TABLE artworks DROP COLUMN IF EXISTS notes;
```

⚠ **Before deleting `warli-art` and `mixed-art` categories:** check whether any artwork rows reference them. Only delete if no artworks are assigned to those categories — otherwise the `category` foreign reference will leave orphaned data.

```sql
-- Check first:
SELECT category, COUNT(*) FROM artworks
WHERE category IN ('warli-art', 'mixed-art')
GROUP BY category;
```

If the query returns any rows → **do NOT delete those categories**. Restore from backup instead.

If the query returns 0 rows → safe to remove:
```sql
DELETE FROM categories WHERE id IN ('warli-art', 'mixed-art');
```

### After staging backend deploy
→ Redeploy previous Railway service revision (Railway keeps deploy history):
```bash
railway rollback --service <staging-backend-service>
```

### After staging Apply (imported rows exist)
→ List and confirm, then delete. Note: any published staging test items are `IN_STOCK` and are **not** removed by a `NEEDS_REVIEW`-only delete — use the unfiltered DELETE after reviewing the list.
```sql
-- List ALL imported rows including any published ones:
SELECT id, sku, title, status FROM artworks WHERE id LIKE 'cks-2026-%' ORDER BY sku;
-- After review (staging only — removes all imported rows regardless of status):
DELETE FROM artworks WHERE id LIKE 'cks-2026-%';
```
→ Verify count returns to expected baseline.

### After staging Publish test
→ Option A: revert to NEEDS_REVIEW, then run full cleanup above.
```sql
UPDATE artworks SET status = 'NEEDS_REVIEW' WHERE id = '<published-id>';
-- Then delete all imported rows:
DELETE FROM artworks WHERE id LIKE 'cks-2026-%';
```
→ Option B: use Option B from Step S16 to delete all imported rows including the published one in a single step.

### After production migration, before production deploy
→ Restore production DB from pre-migration backup. Contact Railway support if pg_restore to Railway Postgres is needed. ⛔ Requires explicit approval.

### After production backend deploy
→ Redeploy previous Railway revision:
```bash
railway rollback --service <production-backend-service>
```

### After production Apply
→ List imported rows carefully:
```sql
SELECT id, sku, title, status FROM artworks WHERE id LIKE 'cks-2026-%' ORDER BY sku;
```
→ If cleanup needed: ⛔ **DO NOT run broad DELETE without explicit approval and review of the list above.**
```sql
-- Only after review and approval:
DELETE FROM artworks WHERE id LIKE 'cks-2026-%' AND status = 'NEEDS_REVIEW';
```

### After publishing one production item
→ Revert to NEEDS_REVIEW:
```sql
UPDATE artworks SET status = 'NEEDS_REVIEW' WHERE id = '<published-id>';
```
→ Item will disappear from public site immediately.

---

## 13. Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|-----------|
| Wrong DB URL — staging migration hits production | Medium | Print `SELECT COUNT(*) FROM artworks` before every migration; stop if count unexpected |
| Staging Apply accidentally applied to production | Low | Never put production DATABASE_URL in staging `.env`; keep separate Railway services |
| Staging schema differs from production (missed column) | Low | Both run same migration scripts; verify with `\d artworks` after each migration |
| Missing/wrong staging `BASE_URL` | Medium | Staging `BASE_URL` must be the staging Railway backend URL. If `BASE_URL` is wrong, `artworks.image` URLs stored during staging Apply will point to the wrong host, and thumbnails will be broken. Verify: after staging Apply, check that `artworks.image` values in the DB start with the staging URL, not the production URL. Set `BASE_URL` on the staging Railway service before deploying. |
| Staging frontend pointing to production backend | Medium | Verify `REACT_APP_API_URL` in staging Vercel env |
| DB migration failure mid-script | Low | Transaction-wrapped; safe to re-run after fixing; `IF NOT EXISTS` idempotent |
| Old workbook version with MW/old SKU format | High | Preview blocks with ERROR; Apply is 422; admin must fix workbook first |
| Image ZIP too large (>100 MB) → timeout | Medium | Keep ZIPs under 50 MB; increase Railway timeout if needed |
| Image filename mismatch (case/extension difference) | Medium | Matching is case-insensitive; preview shows `missing` for unmatched rows |
| Duplicate SKU risk (importing same workbook twice) | Low | Second apply classifies rows as UPDATE (not CREATE); no duplicates |
| Imported rows appearing publicly (visibility risk) | Low | `GET /api/artworks` filters `WHERE status = 'IN_STOCK'`; NEEDS_REVIEW hidden |
| No rollback for published items | Low | `UPDATE artworks SET status = 'NEEDS_REVIEW'` immediately hides; no delete needed |
| Stale build cache (old frontend) | Medium | Hard-refresh Vercel deploy; clear CDN cache if needed |
| CORS error on image fetch from staging URL | Medium | Set `BASE_URL` correctly on staging service; verify in browser devtools |
| Auth/JWT error after deploy | Low | `JWT_SECRET` must be set on Railway service; not just in local `.env` |
| Wrong `usd_multiplier` in pricing_settings at Apply time | Medium | Check `pricing_settings` before Apply; current intended value is 2.25; wrong multiplier → all imported `price_usd` values will be wrong; fix and re-run Apply after deleting bad imported rows |
| Skipping small-batch pilot on production | Medium | Pilot workbook (2–3 rows) recommended for first production import; reduces blast radius; document decision if waived |

---

## 14. Go/No-Go Checklist

### Staging go/no-go (before staging deployment)

- [ ] All local tests passed (ISYNC-01–10)
- [ ] Final local baseline confirmed: artworks=38, artwork_sizes=91, no cks-2026-% rows
- [ ] Human code review completed
- [ ] `server/.env` and secrets confirmed not in commit
- [ ] Corrected workbook ready with new-format SKUs and MA codes
- [ ] Image ZIP ready
- [ ] Staging backup taken and verified
- [ ] Staging DB identity confirmed (not production)
- [ ] Staging migration verified after run

### Production go/no-go (after staging validation)

- [ ] Staging smoke tests: ALL passed
- [ ] Staging Apply + Review Queue + Publish: ALL verified
- [ ] Staging cleanup complete (or intentional decision made)
- [ ] Production backup taken and verified
- [ ] Production DB identity confirmed (count matches expectation)
- [ ] Production migration verified after run
- [ ] Production backend deploy smoke tested
- [ ] Production Inventory Preview reviewed (errorCount=0) before any Apply

---

## 15. "Do Not Proceed Unless" Checklist

```
⛔ DO NOT push to main without human code review.
⛔ DO NOT run staging migration unless: backup exists locally and is verified non-zero.
⛔ DO NOT run staging Apply unless: preview reviewed, errorCount=0, approval given.
⛔ DO NOT run staging Apply unless: pricing_settings.usd_multiplier is the intended value.
⛔ DO NOT deploy to production unless: all staging smoke tests passed.
⛔ DO NOT run production migration unless: production backup exists locally and is verified non-zero.
⛔ DO NOT run production Apply unless: production preview reviewed, staging passed, explicit approval given.
⛔ DO NOT run production Apply unless: pricing_settings.usd_multiplier is the intended value.
⛔ DO NOT use production DATABASE_URL in local or staging .env.
⛔ DO NOT delete artworks WHERE id LIKE 'cks-2026-%' without first SELECT-ing and reviewing the full list including IN_STOCK rows.
⛔ DO NOT assume local baseline counts (38/91) are correct for staging or production — always query the target DB.
⛔ DO NOT proceed if DB artworks count is unexpected at any verification step.
⛔ DO NOT restore from backup against production without explicit approval and second confirmation.
```

---

*Generated: 2026-06-25 | Revised: 2026-06-29 | Ticket: ISYNC-09 | Branch: main*  
*No staging or production changes were made during the creation or revision of this document.*
