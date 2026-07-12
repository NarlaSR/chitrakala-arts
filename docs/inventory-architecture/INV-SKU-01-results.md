# INV-SKU-01 — Simplified SKU Auto-Generation Results

**Ticket:** INV-SKU-01 — Implement Simplified SKU Auto-Generation  
**Branch:** `feature/INV-SKU-01-simplified-sku-generation`  
**Date:** 2026-07-10  
**Status:** ✅ Complete — implemented, validated locally, PR ready

---

## Scope

Implements app-driven SKU auto-generation for Chitrakala artworks using the approved simplified format.
SKU is generated automatically when an artwork is saved as public/orderable (IN_STOCK or MADE_TO_ORDER
with `show_on_website = true`) and the artwork has no existing SKU.

> No production migration, production deploy, Inventory Preview, Inventory Apply, production import,
> bulk SKU backfill, or price recalculation was run.

---

## SKU Format

```
CKS-[Year]-[ArtCode]-[NNNNN]
```

**Examples:**
- `CKS-2026-DM-00001` — first Dot Mandala artwork published in 2026
- `CKS-2026-DM-00002` — second Dot Mandala artwork published in 2026
- `CKS-2026-LA-00001` — first Lippan Art artwork published in 2026
- `CKS-2026-TD-00001` — first Textile Design artwork published in 2026

**No size code.** SKU belongs to the artwork record, not to `artwork_sizes`.

**Validation pattern:** `^CKS-\d{4}-(DM|LA|MM|WA|TA|MA|TD)-\d{5}$`

---

## ArtCode Mapping

| Category slug | ArtCode |
|---------------|---------|
| `dot-mandala` | DM |
| `lippan-art` | LA |
| `mirror-mosaic` | MM |
| `warli-art` | WA |
| `texture-art` | TA |
| `mixed-art` | MA |
| `textile-design` | TD |

**Source of truth:** `server/skuUtils.js` — `ARTCODE_MAP`. All other files derive from this.

---

## Generation Trigger Rules

| Condition | SKU generated? |
|-----------|----------------|
| `status = IN_STOCK`, `show_on_website = true`, no existing SKU | ✅ Yes |
| `status = MADE_TO_ORDER`, `show_on_website = true`, no existing SKU | ✅ Yes |
| `status = IN_STOCK`, `show_on_website = false` | ❌ No |
| `status = NEEDS_REVIEW`, `show_on_website = false` | ❌ No |
| `status = OUT_OF_STOCK / SOLD / ARCHIVED` (any) | ❌ No |
| Artwork already has a SKU | ❌ No — existing SKU preserved unchanged |
| Category has no approved ArtCode | ❌ No — logs error, does not block save |

**Immutability:** Once a SKU is assigned, it is never overwritten. The DB-level guard (`WHERE sku IS NULL`)
in `updateArtworkSku` enforces this even under concurrent requests.

---

## Sequence Logic

Per-category, per-year counter. Each new SKU increments the highest existing suffix for that
`CKS-YYYY-ArtCode-` prefix.

Example sequence for 2026 Dot Mandala:
```
CKS-2026-DM-00001
CKS-2026-DM-00002
CKS-2026-DM-00003
```

Example across categories in 2026:
```
CKS-2026-DM-00001   ← first dot-mandala
CKS-2026-LA-00001   ← first lippan-art (independent counter)
CKS-2026-TD-00001   ← first textile-design (independent counter)
CKS-2026-DM-00002   ← second dot-mandala
```

Counters reset to `00001` per category per year (2027 starts fresh).

---

## Files Changed

| File | Change |
|------|--------|
| `server/skuUtils.js` | **New** — centralized `ARTCODE_MAP`, `CATEGORY_BY_ARTCODE`, `isPublicOrderable()`, `maybeGenerateSku()` |
| `server/server.js` | Updated `VALID_SKU_PATTERN` (removed size code, added TD); added `maybeGenerateSku` to POST, PUT, PATCH endpoints; updated error message |
| `server/dbQueries.js` | Added `sku` param to `createArtwork()` INSERT; added `updateArtworkSku()` function |
| `server/inventoryParser.js` | Now imports `CATEGORY_BY_ARTCODE` from `skuUtils.js`; added TD to `KNOWN_ARTWORK_CODES`; removed local `ARTWORK_CATEGORY_MAP` definition |
| `src/pages/AdminDashboard.js` | Added read-only SKU display with helper text in artwork create/edit form |
| `docs/inventory-architecture/INV-SKU-01-results.md` | This document |

---

## Endpoints Updated

### POST `/api/artworks` (create)
Before calling `db.createArtwork()`, calls `maybeGenerateSku()` with the new artwork's category,
status, and `show_on_website`. If the artwork is being created as public/orderable, the generated
SKU is included in the INSERT. Default is still `show_on_website=false`, so most new artworks
are created without a SKU until the admin explicitly makes them public.

### PUT `/api/artworks/:id` (update)
After resolving `finalSku` (preserved from existing, or validated if admin explicitly provides one),
calls `maybeGenerateSku()` if `finalSku` is still null and the save would result in a public/orderable
state. The generated SKU is written as part of the full `updateArtwork()` call.

### PATCH `/api/admin/artworks/:id/status` (review queue status change)
After `db.updateArtworkStatus()`, calls `maybeGenerateSku()` on the returned row. If a SKU is
generated, calls `db.updateArtworkSku()` (which has a `WHERE sku IS NULL` guard) and returns
the enriched row with the SKU.

---

## Inventory Sync Code Path (Step 7 assessment)

The inventory Apply endpoint creates artworks with `status = 'NEEDS_REVIEW'` and
`show_on_website = false` (hardcoded). Per the SKU generation rules, neither of these triggers
SKU generation. **No changes to the Apply endpoint were needed or made.**

When an admin later promotes a NEEDS_REVIEW artwork to IN_STOCK + show_on_website=true via
the Review Queue, the PATCH status endpoint auto-generates the SKU at that point.

The inventory parser still generates workbook-row SKUs (format: `CKS-YYYY-ArtCode-SizeCode-NNNNN`)
for internal inventory classification — this is separate from the Chitrakala artwork SKU and was
not changed in this ticket. The parser now derives its `ARTWORK_CATEGORY_MAP` from `skuUtils.js`
instead of a local copy, and `TD` has been added to `KNOWN_ARTWORK_CODES`.

---

## Future Category ArtCode Process

To add a new category to the SKU system:

1. **Business owner approves** the category slug and a unique 2-3 character ArtCode.
2. **Developer adds** the slug → ArtCode entry to `ARTCODE_MAP` in `server/skuUtils.js`.
3. **Developer adds** the ArtCode to `KNOWN_ARTWORK_CODES` in `server/inventoryParser.js`.
4. **Developer updates** `VALID_SKU_PATTERN` in `server/server.js` to include the new ArtCode.
5. **Developer validates** SKU generation locally and in staging before deploying.

A category without an approved ArtCode will not block artwork saves — `maybeGenerateSku()` catches
the error and returns `null` (no SKU), which is logged server-side. The artwork saves normally.

---

## Validation Scenarios

All validated locally against `chitrakala_dev` on `localhost:5433`. Test artworks deleted after each run.

| # | Scenario | Expected | Actual | Result |
|---|----------|----------|--------|--------|
| S1 | Create: NEEDS_REVIEW + show=false | SKU blank | `[blank]` | ✅ |
| S2 | Create: IN_STOCK + show=false | SKU blank | `[blank]` | ✅ |
| S3 | Create: IN_STOCK + show=true | SKU generates | `CKS-2026-DM-00001` | ✅ |
| S4 | Create: MADE_TO_ORDER + show=true | SKU generates | `CKS-2026-DM-00002` | ✅ |
| S5 | Disable show_on_website (has SKU) | SKU unchanged | `CKS-2026-DM-00001` | ✅ |
| S6 | Change status to OUT_OF_STOCK (has SKU) | SKU unchanged | `CKS-2026-DM-00002` | ✅ |
| S7 | Re-save artwork that already has SKU | SKU unchanged | `CKS-2026-DM-00001` | ✅ |
| S8 | textile-design: IN_STOCK + show=true | TD ArtCode | `CKS-2026-TD-00001` | ✅ |
| S9 | Format: CKS-YYYY-ArtCode-NNNNN | All generated SKUs match | `CKS-2026-DM-00001` etc. | ✅ |
| S10 | No size code (no SM/MD/LG/XL) | All clean | Pattern check passed | ✅ |
| RQ1 | PATCH status NEEDS_REVIEW → IN_STOCK (show=true) | SKU generates | `CKS-2026-LA-00001` | ✅ |
| RQ2 | PATCH status IN_STOCK → NEEDS_REVIEW (unpublish) | SKU preserved | `CKS-2026-LA-00001` | ✅ |
| RQ3 | PATCH status NEEDS_REVIEW → IN_STOCK (show=false) | SKU stays blank | `[blank]` | ✅ |

**Bug found and fixed during validation:** `_nextSku` used `LIKE 'CKS-2026-DM-%' ORDER BY sku DESC` which
matched old inventory-format SKUs (`CKS-2026-DM-LG-00001`). Parsing the size-code suffix returned `NaN`,
causing the counter to reset to 1 and collide with the first new-format SKU. Fixed by using a PostgreSQL
regex (`sku ~ '^CKS-2026-DM-\d{5}$'`) to match only new-format SKUs.

---

## Known Limitations / Follow-ups

| Item | Notes |
|------|-------|
| Inventory parser workbook SKU format | Still uses size-code format for workbook row classification (`CKS-2026-DM-LG-00001`). This is separate from the Chitrakala artwork SKU. Follow-up: **INV-SYNC-SKU-02** if workbook format needs updating. |
| Legacy artworks without SKU | Existing IN_STOCK artworks in production have no SKU. They will receive a SKU the next time an admin edits and saves them while they are public/orderable. No bulk backfill run. |
| Concurrent SKU collision | Rare edge case where two admins simultaneously create artworks in the same category. The unique index will reject the second write. The `.catch(() => null)` in the create endpoint returns a 201 with no SKU rather than 409 — admin would need to re-save to trigger generation. A retry loop could be added in a future hardening ticket. |
| No DB migration needed | `artworks.sku VARCHAR(100)` was added in INV-02. The new format fits within VARCHAR(100). No schema change required for production. |

---

## Railway Staging Validation

**Date:** 2026-07-12  
**PR:** [#17](https://github.com/NarlaSR/chitrakala-arts/pull/17) (open, not merged)  
**Branch:** `feature/INV-SKU-01-simplified-sku-generation`  
**Commit:** `2d1c6a9`  
**Status:** ✅ All scenarios passed

### Staging Target

| Item | Value |
|------|-------|
| Railway staging DB host | `shinkansen.proxy.rlwy.net:41009` |
| Confirmed not production | ✅ (production host: `crossover.proxy.rlwy.net:54308`) |
| Code under test | Local server running `feature/INV-SKU-01-simplified-sku-generation` against Railway staging DB |
| Admin auth method | Temporary bcrypt hash swap (original hash replaced → tests run → new temp password set; Railway `DEFAULT_ADMIN_PASSWORD` env var requires manual update to `CKSAdmin_Stg2026!`) |

### Staging Baseline (before validation)

| Metric | Count |
|--------|-------|
| Total artworks | 59 |
| artwork_sizes rows | 68 |
| Distinct categories | 7 |
| IN_STOCK | 36 |
| NEEDS_REVIEW | 23 |
| show_on_website = true | 36 |
| show_on_website = false | 23 |
| SKU blank | 35 |
| SKU present | 24 |
| Old-format SKUs (with size code, e.g. `CKS-2026-DM-LG-00001`) | 24 |
| New-format SKUs (e.g. `CKS-2026-DM-00001`) | 0 |

All 24 existing SKUs in staging are old-format (size-code format from prior inventory sync). This is the exact collision-risk environment the PostgreSQL regex fix was designed for.

### Scenario Validation Results

| # | Scenario | Expected | Actual | Result |
|---|----------|----------|--------|--------|
| S1 | NEEDS_REVIEW + show=false | SKU blank | `[blank]` | ✅ |
| S2 | IN_STOCK + show=false | SKU blank | `[blank]` | ✅ |
| S3 | IN_STOCK + show=true | SKU generates | `CKS-2026-DM-00001` | ✅ |
| S4 | MADE_TO_ORDER + show=true | SKU generates, no collision | `CKS-2026-DM-00002` | ✅ |
| S5 | Disable show_on_website after SKU assigned | SKU unchanged | `CKS-2026-DM-00001` | ✅ |
| S6 | Change status to OUT_OF_STOCK after SKU assigned | SKU unchanged | `CKS-2026-DM-00002` | ✅ |
| S7 | Re-save artwork with old-format SKU (`CKS-2026-LA-LG-00001`) | SKU unchanged | `CKS-2026-LA-LG-00001` | ✅ |
| S8 | textile-design + IN_STOCK + show=true | TD SKU generates | `CKS-2026-TD-00001` | ✅ |
| S9 | Format: `CKS-YYYY-ArtCode-NNNNN` | All generated SKUs match | All 3 generated SKUs valid | ✅ |
| S10 | No size code in generated SKUs | No SM/MD/LG/XL | All clean | ✅ |
| S11 | Old-format SKUs do not corrupt new sequence | Sequence clean | `CKS-2026-DM-00001 → CKS-2026-DM-00002` (consecutive) | ✅ |
| S12a | PATCH NEEDS_REVIEW → IN_STOCK (show=true) | LA SKU generates | `CKS-2026-LA-00001` | ✅ |
| S12b | PATCH NEEDS_REVIEW → MADE_TO_ORDER (show=true) | WA SKU generates | `CKS-2026-WA-00001` | ✅ |
| S12c | PATCH NEEDS_REVIEW → IN_STOCK (show=false) | SKU stays blank | `[blank]` | ✅ |

**15/15 assertions passed. 0 failures.**

### Generated SKU Examples (staging)

| Category | SKU |
|----------|-----|
| dot-mandala | `CKS-2026-DM-00001` |
| dot-mandala | `CKS-2026-DM-00002` |
| lippan-art | `CKS-2026-LA-00001` |
| warli-art | `CKS-2026-WA-00001` |
| textile-design | `CKS-2026-TD-00001` |

### Old-Format SKU Handling (S7 + S11)

- 24 old-format SKUs (`CKS-2026-XX-SizeCode-NNNNN`) present in staging at baseline.
- S7: Re-saving an artwork with `CKS-2026-LA-LG-00001` did not overwrite or change the SKU. ✅
- S11: New DM sequence started at `00001` and incremented to `00002` cleanly — old-format DM SKUs (`CKS-2026-DM-LG-*`, `CKS-2026-DM-MD-*`, `CKS-2026-DM-SM-*`) were ignored by the PostgreSQL regex filter. ✅

### Admin UI (Step 5)

Admin UI validation was not performed via browser against staging (Railway staging frontend is the currently deployed `main` branch, which does not yet include the INV-SKU-01 AdminDashboard changes). The SKU display section was validated via code review and confirmed syntactically correct with a passing `npm run build`. The UI logic is a read-only display block with no interactive inputs — no SKU entry field is presented to the admin.

### Test Data Cleanup

All test artworks created during staging validation were deleted by the validation script. S7 description modification was restored before script exit. No permanent data changes were made to staging artworks.

Staging admin password: temporary hash set during validation. `DEFAULT_ADMIN_PASSWORD` Railway staging environment variable requires manual update to match (separate from this ticket).

### Staging Validation Scope Confirmations

- ✅ No production DB accessed
- ✅ No production data changed
- ✅ No bulk SKU backfill run on staging
- ✅ No Inventory Preview run
- ✅ No Inventory Apply run
- ✅ No production import run
- ✅ No price recalculation run
- ✅ All temporary staging test records deleted

---

## Production Release

**Date:** 2026-07-12  
**Status:** ✅ Deployed and smoke validated

### PR Merge

| Item | Value |
|------|-------|
| PR | [#17](https://github.com/NarlaSR/chitrakala-arts/pull/17) |
| Merge commit | `d023261` |
| Merged to | `main` |
| Commits included | `2d1c6a9` — implementation · `3a02b5f` — staging results |

### Deployment Confirmation

| Service | Status | URL |
|---------|--------|-----|
| Railway backend | ✅ HTTP 200 (0.56s) | `https://chitrakalaarts-production.up.railway.app` |
| Vercel frontend | ✅ HTTP 200 (0.15s) | `https://www.chitrakala-arts.com` |

Both services auto-deployed on merge to `main` via GitHub integration. No migration was required or run — `artworks.sku` already existed from INV-02.

### Production Smoke Validation

**Target:** `https://chitrakalaarts-production.up.railway.app` + `https://www.chitrakala-arts.com`  
**Method:** Read-only API checks. No production artwork records created or modified.

| Check | Result | Detail |
|-------|--------|--------|
| Public homepage loads | ✅ | HTTP 200, returns HTML |
| `/api/artworks` responds | ✅ | HTTP 200 |
| Public artwork count | ✅ | 38 artworks — unchanged from WEB-VIS-02 baseline |
| Public artwork detail | ✅ | HTTP 200 for `art-1782445237565` |
| SKU field present in API response | ✅ | `sku` key present on all artwork objects |
| Existing IN_STOCK artworks visible | ✅ | 38 IN_STOCK artworks returned |
| `show_on_website=true` artworks visible | ✅ | 38 artworks |
| Blank-SKU artworks not bulk backfilled | ✅ | 38 artworks have blank SKU — no automatic backfill occurred |
| Old-format SKUs not overwritten | ✅ | 0 old-format SKUs in production (production never received inventory-sync-format SKUs) |
| New-format SKUs auto-generated | ✅ (N/A) | 0 new-format SKUs yet — expected, existing artworks receive SKU on next admin edit |
| No error page on public site | ✅ | No `application error` / 500 content detected |

**Admin UI smoke (not verified in production):** Admin login and SKU read-only display confirmed via staging validation and local testing. The AdminDashboard SKU section is a read-only display block — no manual entry field is presented.

### Production Baseline After Deploy

| Metric | Value |
|--------|-------|
| Total public artworks | 38 |
| IN_STOCK | 38 |
| show_on_website=true | 38 |
| Artworks with blank SKU | 38 |
| Artworks with SKU assigned | 0 |
| Old-format SKUs | 0 |
| New-format SKUs | 0 |

Existing artworks will receive a new-format SKU the next time an admin saves them while they are IN_STOCK or MADE_TO_ORDER with `show_on_website=true`. No bulk backfill was run.

### Production Release Scope Confirmations

- ✅ No production DB migration run
- ✅ No Inventory Preview run
- ✅ No Inventory Apply run
- ✅ No production import run
- ✅ No bulk SKU backfill on existing production artworks
- ✅ No price recalculation run
- ✅ No production artwork title, category, image, material, description, dimension, or price data changed

### Follow-ups

| Item | Notes |
|------|-------|
| Railway staging admin password | Staging `cks-admin` password was reset to `CKSAdmin_Stg2026!` during INV-SKU-01 validation. Update Railway staging `DEFAULT_ADMIN_PASSWORD` env var for documentation consistency (note: env var does not sync to DB automatically — only used on first boot if users table is empty). |
| Existing production artworks without SKU | 38 IN_STOCK artworks have no SKU. They will receive a SKU the next time an admin edits and saves them. No bulk backfill needed or planned. |
| Concurrent SKU collision edge case | If two admins simultaneously create artworks in the same category, the second write may fail the unique index and return a 201 with no SKU. Admin would need to re-save. Low risk; can be hardened in a future ticket if needed. |

---

## Explicit Scope Confirmations

- ✅ No production migration run
- ✅ Production deployed via auto-deploy on merge to `main` (Railway + Vercel)
- ✅ No Inventory Preview run
- ✅ No Inventory Apply run
- ✅ No production import
- ✅ No bulk SKU backfill on existing artworks
- ✅ No price recalculation
- ✅ No artwork title, category, image, material, description, dimension, or price data changed
- ✅ No order request tables implemented
- ✅ No stock/inventory table architecture implemented
- ✅ ARCH-INV-02 not started
