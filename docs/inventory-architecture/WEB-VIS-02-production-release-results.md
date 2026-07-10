# WEB-VIS-02 — Staging and Production Release Results

**Ticket:** WEB-VIS-02 — Staging and Production Release for Website Visibility Controls  
**Branch:** `feature/WEB-VIS-01-visibility-availability`  
**PR:** [#16](https://github.com/NarlaSR/chitrakala-arts/pull/16)  
**Date:** 2026-07-09  
**Status:** Railway staging validation complete — ready for production approval

---

## Scope

Validates that the WEB-VIS-01 implementation (migration + backend + frontend) behaves correctly
against a staging database before being merged and deployed to production.

> **No production DB was touched during this validation.**  
> All testing used the local staging DB (`chitrakala_dev` on `localhost:5433`).  
> No Inventory Preview, Apply, production import, or price recalculation was run.

---

## Validation Phases

| Phase | Environment | Date | Status |
|-------|-------------|------|--------|
| Local validation | `chitrakala_dev` on `localhost:5433` | 2026-07-08 | ✅ Complete |
| Railway staging validation | `shinkansen.proxy.rlwy.net:41009/railway` | 2026-07-09 | ✅ Complete |
| Production backup | Railway production | — | Pending approval |
| Production DB migration | Railway production | — | Pending approval |
| Merge PR #16 to main | GitHub | — | Pending approval |
| Deploy backend + frontend | Railway + Vercel | — | Pending approval |
| Production smoke validation | chitrakala-arts.com | — | Pending approval |

---

## Step 1 — Branch and PR Confirmation

| Item | Value |
|------|-------|
| Branch | `feature/WEB-VIS-01-visibility-availability` |
| Commit | `d34526a2f6b9d0046f8e4cd1d2fe63dd03937058` |
| PR | #16 — open at github.com/NarlaSR/chitrakala-arts/pull/16 |

---

## Step 2 — Migration Safety Review

**File:** `server/dbMigration/migrate_web_vis01.sql`

The migration is a PL/pgSQL `DO $$` block that:
1. Checks `information_schema.columns` for the `show_on_website` column
2. If not present: `ALTER TABLE artworks ADD COLUMN show_on_website BOOLEAN NOT NULL DEFAULT false`
3. Backfills `show_on_website = true` for all `status = 'IN_STOCK'` rows
4. If already present: exits immediately — no ALTER, no UPDATE

**Idempotency confirmed:** Running the migration twice is a no-op on the second run.

**Production safety:**
- Backfill scope is limited to `status = 'IN_STOCK'` at migration time only
- MADE_TO_ORDER, NEEDS_REVIEW, OUT_OF_STOCK, SOLD, ARCHIVED remain `false`
- No existing artwork data is modified beyond the new column
- No artwork price, SKU, title, or category is touched

---

## Step 3 — Local Staging DB Validation

**Database:** `chitrakala_dev` on `localhost:5433`

Migration ran as a **no-op** (column was already applied from WEB-VIS-01 local validation).
All verification queries passed.

### Schema verification

| Query | Result |
|-------|--------|
| `show_on_website` column exists | `boolean NOT NULL DEFAULT false` ✅ |
| Rows with NULL `show_on_website` | 0 ✅ |
| `artworks.price` nullable | YES ✅ (no migration needed) |
| `artwork_sizes.price` NOT NULL | YES — documented limitation, INV-PRICE-01 follow-up ✅ |
| `status` column type | `character varying` (no enum) ✅ |

### Data state after migration

| Status | show_on_website | Count |
|--------|----------------|-------|
| IN_STOCK | true | 39 |
| NEEDS_REVIEW | false | 23 |

Zero IN_STOCK artworks with `show_on_website=false`. Zero NEEDS_REVIEW with `show_on_website=true`. ✅

### Public API visibility (all 8 scenarios)

| Status | show_on_website | Public list | Detail endpoint | Result |
|--------|----------------|-------------|-----------------|--------|
| IN_STOCK | true | 39 ✅ | 200 ✅ | visible |
| IN_STOCK | false | 38 ✅ | 404 ✅ | hidden |
| MADE_TO_ORDER | true | 39 ✅ | 200 ✅ | visible |
| MADE_TO_ORDER | false | 38 ✅ | 404 ✅ | hidden |
| NEEDS_REVIEW | false | 38 ✅ | 404 ✅ | hidden |
| OUT_OF_STOCK | false | 38 ✅ | 404 ✅ | hidden |
| SOLD | false | 38 ✅ | 404 ✅ | hidden |
| ARCHIVED | false | 38 ✅ | 404 ✅ | hidden |

### Admin defaults

| Scenario | Result |
|----------|--------|
| New artwork defaults: `status=IN_STOCK`, `show_on_website=false` | ✅ hidden until admin enables |
| Hide IN_STOCK without status change: `show_on_website=false` → 404 | ✅ |
| MADE_TO_ORDER + `show_on_website=true` → 200 | ✅ |

---

## Step 4 — Public UI Validation

**Local frontend:** `http://localhost:3000` (React dev server)  
**Local backend:** `http://localhost:5000`

### Test artworks used

Three artworks were temporarily set to specific states for UI testing, then fully restored.

| Artwork | Test state | Restored to |
|---------|-----------|-------------|
| `art-1771101879286` Decorative Serving Board | MADE_TO_ORDER + show_on_website=true | IN_STOCK + show_on_website=true |
| `art-1770419263598` Eternal Glow | price_inr=null (sized artwork) | price_inr=4000.00 |
| `art-1770778808201` Serene Teal Floral Mandala Box | price_inr=null (no sizes) | price_inr=1000.00 |

All three restored. Public count confirmed 39 after restoration. ✅

### Results

| Scenario | Expected | Result |
|----------|----------|--------|
| IN_STOCK artwork displays normally | Price and no badge | ✅ |
| MADE_TO_ORDER artwork shows amber "Made to Order" badge on ArtCard | Badge present | ✅ |
| MADE_TO_ORDER artwork shows "MADE TO ORDER" banner in ArtDetails | Banner below title | ✅ |
| Non-sized artwork with null price shows "Price on request" in ArtCard | "Price on request" | ✅ |
| Sized artwork with null `artworks.price_inr` shows size prices (not "Price on request") | "Prices from $X" | ✅ (documented limitation) |
| No $NaN, undefined, null, blank, or $0 price display across 19 Dot Mandala artworks | No bad values | ✅ |
| Public category page count unchanged: 39 total, 19 in Dot Mandala | Counts match | ✅ |

### "Price on request" scope clarification

Artworks with sizes always show price from `artwork_sizes.price` (NOT NULL constraint), so
`artworks.price_inr = null` has no visible effect on sized artworks. "Price on request" applies
only to non-sized artworks. This is the documented WEB-VIS-01 limitation; follow-up: **INV-PRICE-01**.

---

## Step 4b — Railway Staging Validation

**Database:** `shinkansen.proxy.rlwy.net:41009/railway` (Railway staging — confirmed not production)  
**Date:** 2026-07-09  
**Migration command:** `node runMigration.js migrate_web_vis01.sql` (with `DATABASE_URL` set to Railway staging, `NODE_ENV=production`)

### Pre-migration baseline

| Table | Count |
|-------|-------|
| artworks | 59 |
| artwork_sizes | 72 |
| categories | 7 |

| Status | Count |
|--------|-------|
| IN_STOCK | 36 |
| NEEDS_REVIEW | 23 |

`show_on_website` column: **not present** — clean pre-migration state ✅  
`price`, `price_inr`: both nullable ✅  
Pricing: `fx_rate=92.4`, `usd_multiplier=2.25` ✅

### Migration result

```
✅ Migration completed successfully!
Database: postgresql://postgres:****@shinkansen.proxy.rlwy.net:41009/railway
```

### Post-migration schema verification

| Check | Expected | Result |
|-------|----------|--------|
| Column definition | `boolean NOT NULL DEFAULT false` | ✅ |
| NULL count | 0 | ✅ |
| IN_STOCK show_on_website=true | 36 | ✅ |
| NEEDS_REVIEW show_on_website=false | 23 | ✅ |
| IN_STOCK still hidden | 0 | ✅ |
| Non-visible statuses exposed | 0 | ✅ |
| Row counts unchanged | 59 / 72 / 7 | ✅ |
| Sample rows: prices, SKUs, titles untouched | — | ✅ |

### Idempotency

Second run: `✅ Migration completed successfully!` (no-op)  
Q3 counts identical after second run: IN_STOCK=36/true, NEEDS_REVIEW=23/false ✅

### Public API visibility (all 8 scenarios)

Tested via local backend (`http://localhost:5000`) connected to Railway staging DB.

| Status | show_on_website | Public list | Detail endpoint | Result |
|--------|----------------|-------------|-----------------|--------|
| IN_STOCK | true | 36 ✅ | 200 ✅ | ✅ visible |
| IN_STOCK | false | 35 ✅ | 404 ✅ | ✅ hidden |
| MADE_TO_ORDER | true | 36 ✅ | 200 ✅ | ✅ visible |
| MADE_TO_ORDER | false | 35 ✅ | 404 ✅ | ✅ hidden |
| NEEDS_REVIEW | false | 35 ✅ | 404 ✅ | ✅ hidden |
| OUT_OF_STOCK | false | 35 ✅ | 404 ✅ | ✅ hidden |
| SOLD | false | 35 ✅ | 404 ✅ | ✅ hidden |
| ARCHIVED | false | 35 ✅ | 404 ✅ | ✅ hidden |

Test artwork (`cks-2026-la-lg-00001`) restored to IN_STOCK + show_on_website=true after testing. Public count confirmed 36. ✅

### Admin behavior validation

| Scenario | Result |
|----------|--------|
| New artwork defaults: status=IN_STOCK, show_on_website=false | ✅ |
| Hide IN_STOCK via show_on_website=false → public 404 | ✅ |
| Set MADE_TO_ORDER + show_on_website=true → public 200 | ✅ |
| Disable show_on_website on MADE_TO_ORDER → hidden | ✅ |
| Test artwork deleted after admin validation | ✅ |

### Public UI validation

Tested on Railway staging data via local frontend (`http://localhost:3000`).

| Scenario | Result |
|----------|--------|
| IN_STOCK artwork displays normally with price | ✅ |
| MADE_TO_ORDER artwork shows amber "Made to Order" badge on ArtCard (Canvas Bag — textile-design) | ✅ |
| MADE_TO_ORDER artwork shows "MADE TO ORDER" banner in ArtDetails | ✅ |
| Non-sized artwork with null price shows "Price on request" on ArtCard (lippan artwork) | ✅ |
| No $NaN, undefined, null, blank, or $0 prices across all 36 public artworks | ✅ |
| "Price on request" artworks in public list: 1 (during test) | ✅ |

Both test artworks restored after UI validation. Final public count confirmed 36. ✅

### Explicit scope confirmations

- ✅ Production DB not touched
- ✅ Production migration not run
- ✅ PR #16 not merged
- ✅ Production deploy not triggered
- ✅ Inventory Preview not run
- ✅ Inventory Apply not run
- ✅ Production import not run
- ✅ No price recalculation
- ✅ No production artwork data modified

---

## Step 5 — Production Readiness Assessment

Staging validation passed. The following steps remain before production is live:

### Pre-production checklist (requires explicit approval to proceed)

- [ ] Merge PR #16 to `main`
- [ ] Run `node runMigration.js migrate_web_vis01.sql` against **production** Railway DB
- [ ] Verify production migration: `SELECT column_name FROM information_schema.columns WHERE table_name='artworks' AND column_name='show_on_website';` → 1 row
- [ ] Verify: `SELECT COUNT(*) FROM artworks WHERE status='IN_STOCK' AND show_on_website=false;` → 0
- [ ] Deploy backend to Railway (auto-deploy on `main` push, or manual trigger)
- [ ] Deploy frontend to Vercel (auto-deploy on `main` push, or manual trigger)
- [ ] Production smoke test: existing IN_STOCK artworks still appear on public site
- [ ] Production smoke test: count matches pre-migration baseline (38 at ISYNC-15)

### Production baseline (from ISYNC-15, 2026-07-04)

- 38 IN_STOCK artworks in Railway before this migration
- After migration: all 38 should gain `show_on_website=true` via backfill
- Public count should remain 38 immediately after migration

---

## Known Risks / Boundaries

| Item | Notes |
|------|-------|
| `artwork_sizes.price NOT NULL` | Size-level "Price on request" not yet supported. Follow-up: **INV-PRICE-01** |
| MADE_TO_ORDER quick-action | Review Queue has no "Publish as MTO" shortcut; admin must use Edit panel to set MADE_TO_ORDER + show_on_website=true |
| Price clear via PUT | Sending `price=''` clears price to null — can only happen if admin explicitly blanks the field |
| Production artwork count | Verify before and after migration against Railway to confirm no data loss |

---

## Out of Scope

- Order request table (`order_requests`, `order_request_items`) — future ticket
- SKU format change — INV-SKU-01
- Inventory Apply — ISYNC tickets
- Maintenance mode
- Production deploy (requires explicit approval)
- Production migration (requires explicit approval)
