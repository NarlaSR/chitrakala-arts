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

## Explicit Scope Confirmations

- ✅ No production migration run
- ✅ No production deploy
- ✅ No Inventory Preview run
- ✅ No Inventory Apply run
- ✅ No production import
- ✅ No bulk SKU backfill on existing artworks
- ✅ No price recalculation
- ✅ No artwork title, category, image, material, description, dimension, or price data changed
- ✅ No order request tables implemented
- ✅ No stock/inventory table architecture implemented
- ✅ ARCH-INV-02 not started
