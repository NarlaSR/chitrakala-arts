# ISYNC-18-04 — Controlled Production Apply Results

**Date:** 2026-07-27  
**Branch:** `feature/ISYNC-18-04-controlled-production-apply`  
**Operator:** Sanjay Narla  
**Status:** COMPLETE — All gates passed, 4 artworks imported to production as NEEDS_REVIEW

---

## Apply Package

| Row | Item | Category | Price INR | artworkId |
|---|---|---|---|---|
| 1 | 18" Round Warli Art | warli-art | ₹7,000 | `art-1785182575357-0` |
| 2 | 10" Round Warli Art | warli-art | ₹2,500 | `art-1785182575357-1` |
| 3 | Decorative Tray 11" | mixed-art | ₹1,100 | `art-1785182575357-2` |
| 4 | 3 Partition Square Box with Handle | texture-art | ₹1,600 | `art-1785182575357-3` |

Apply timestamp: `2026-07-27 20:02:55 UTC`

---

## Pre-Apply Checklist

| Step | Result |
|---|---|
| Owner approval — granted via ISYNC-18-04 ticket approval | ✅ |
| Backup taken | ✅ — `chitrakala_prod_20260727_pre_isync18.backup` (12.08 MB) |
| Baseline captured | ✅ — 38 admin artworks, NEEDS_REVIEW=0 |
| Final Preview (Section D) | ✅ — HTTP 200, 4 CREATE / 0 / 0 / 0, 4/4 images, no warnings |

---

## Baseline Counts (captured before Apply)

| Metric | Baseline |
|---|---|
| Total artworks (admin) | 38 |
| Total artworks (public) | 38 |
| artwork\_sizes (DB) | 91 |
| categories (DB) | 7 |
| order\_requests (DB) | 3 |
| order\_request\_items (DB) | 4 |
| fx\_rate | 92.4 |
| usd\_multiplier | 2.25 |
| maintenance\_mode | false |
| NEEDS\_REVIEW count | 0 |
| warli-art admin count | 0 |
| mixed-art admin count | 0 |
| texture-art admin count | 1 |
| Public artworks (IN\_STOCK/MADE\_TO\_ORDER AND show\_on\_website=true, DB) | 38 |

---

## Final Preview Result (run immediately before Apply)

| Check | Expected | Actual |
|---|---|---|
| HTTP status | 200 | ✅ 200 |
| Sheet | Inventory\_Import | ✅ Inventory\_Import |
| Detected columns | 19/19 | ✅ 19/19 |
| CREATE count | 4 | ✅ 4 |
| UPDATE count | 0 | ✅ 0 |
| REVIEW count | 0 | ✅ 0 |
| ERROR count | 0 | ✅ 0 |
| Images matched | 4/4 | ✅ 4/4 |
| Batch warnings | none | ✅ none |
| Per-row errors | none | ✅ none |

All 10 Preview checks passed.

---

## Apply Result

| Field | Value |
|---|---|
| HTTP status | **200** |
| totalRows | 4 |
| createdCount | **4** |
| updatedCount | **0** |
| skippedCount | **0** |
| errorCount | **0** |
| imagesStored | **4** |
| imagesFailed | **0** |

All 8 Apply gate checks passed.

---

## Post-Apply Counts

| Metric | Baseline | After Apply | Change | Expected | Result |
|---|---|---|---|---|---|
| Total artworks (admin) | 38 | 42 | +4 | +4 | ✅ |
| Total artworks (public) | 38 | 38 | 0 | unchanged | ✅ |
| Public artworks (DB, status IN\_STOCK/MADE\_TO\_ORDER AND show\_on\_website=true) | 38 | 38 | 0 | unchanged | ✅ |
| artwork\_sizes | 91 | 91 | 0 | unchanged | ✅ |
| categories | 7 | 7 | 0 | unchanged | ✅ |
| order\_requests | 3 | 3 | 0 | unchanged | ✅ |
| order\_request\_items | 4 | 4 | 0 | unchanged | ✅ |
| fx\_rate | 92.4 | 92.4 | 0 | unchanged | ✅ |
| usd\_multiplier | 2.25 | 2.25 | 0 | unchanged | ✅ |
| maintenance\_mode | false | false | — | unchanged | ✅ |
| NEEDS\_REVIEW count | 0 | 4 | +4 | +4 | ✅ |
| warli-art admin count | 0 | 2 | +2 | +2 | ✅ |
| mixed-art admin count | 0 | 1 | +1 | +1 | ✅ |
| texture-art admin count | 1 | 2 | +1 | +1 | ✅ |

---

## Per-Row Validation (40 checks — all PASS)

| Check | Row 1 (warli-round-18) | Row 2 (warli-round-10) | Row 3 (mixed-tray) | Row 4 (texture-box) |
|---|---|---|---|---|
| artworkId | `art-1785182575357-0` | `art-1785182575357-1` | `art-1785182575357-2` | `art-1785182575357-3` |
| title | 18" Round Warli Art | 10" Round Warli Art | Decorative Tray 11" | 3 Partition Square Box with Handle |
| category | warli-art ✅ | warli-art ✅ | mixed-art ✅ | texture-art ✅ |
| status | NEEDS\_REVIEW ✅ | NEEDS\_REVIEW ✅ | NEEDS\_REVIEW ✅ | NEEDS\_REVIEW ✅ |
| show\_on\_website | false ✅ | false ✅ | false ✅ | false ✅ |
| sku | null ✅ | null ✅ | null ✅ | null ✅ |
| featured | false ✅ | false ✅ | false ✅ | false ✅ |
| image URL set | ✅ | ✅ | ✅ | ✅ |
| image HTTP 200 | ✅ | ✅ | ✅ | ✅ |
| not in public API | ✅ | ✅ | ✅ | ✅ |
| price\_inr | ₹7,000 ✅ | ₹2,500 ✅ | ₹1,100 ✅ | ₹1,600 ✅ |
| price\_usd | $170 ✅ | $61 ✅ | $27 ✅ | $39 ✅ |
| fx\_rate\_used | 92.4 ✅ | 92.4 ✅ | 92.4 ✅ | 92.4 ✅ |
| multiplier\_used | 2.25 ✅ | 2.25 ✅ | 2.25 ✅ | 2.25 ✅ |

**Price USD note:** `calculateUsdPrice` applies `Math.round()`. Raw calculated values were
$170.45 / $60.88 / $26.79 / $38.96 — stored as rounded integers $170 / $61 / $27 / $39.
This is correct behavior, not a rounding error.

---

## Public Visibility Checks

| Check | Expected | Result |
|---|---|---|
| Public artwork count (`/api/artworks`) | 38 (unchanged) | ✅ 38 |
| Public artworks (DB: `status IN ('IN_STOCK','MADE_TO_ORDER') AND show_on_website=true`) | 38 (unchanged) | ✅ 38 |
| All 4 new rows absent from public `/api/artworks` response | absent | ✅ all 4 absent |

---

## Public Category Checks

| Category | Baseline public artworks | After Apply public artworks | Result |
|---|---|---|---|
| warli-art | 0 (not in DB public artworks) | 0 (2 new rows are NEEDS\_REVIEW + show\_on\_website=false) | ✅ no new public rows |
| mixed-art | 0 (not in DB public artworks) | 0 (1 new row is NEEDS\_REVIEW + show\_on\_website=false) | ✅ no new public rows |
| texture-art | 1 (1 existing IN\_STOCK row) | 1 (1 new row is NEEDS\_REVIEW, existing unchanged) | ✅ no new public rows |

**Note on public API category filter behavior:** The `/api/artworks?category=<slug>` endpoint
does not filter by category — it returns all 38 public artworks regardless of the `category`
parameter. Category-level filtering is implemented client-side. This is a pre-existing behavior,
not introduced by this import. All public visibility checks were verified via DB query and
by confirming the 4 new artwork IDs are absent from the public API response.

**Note on public category list:** The `GET /api/categories` response includes all 7 category
records (including warli-art and mixed-art) because category records exist regardless of
whether they have public artworks. The 4 imported rows are not public, so no category
gains new public artworks from this import.

---

## Price Checks

| Artwork | price\_inr | price\_usd | fx\_rate\_used | multiplier\_used | Formula check |
|---|---|---|---|---|---|
| 18" Round Warli Art | ₹7,000 | $170 | 92.4 | 2.25 | 7000/92.4×2.25 = 170.45 → Math.round() = **170** ✅ |
| 10" Round Warli Art | ₹2,500 | $61 | 92.4 | 2.25 | 2500/92.4×2.25 = 60.88 → Math.round() = **61** ✅ |
| Decorative Tray 11" | ₹1,100 | $27 | 92.4 | 2.25 | 1100/92.4×2.25 = 26.79 → Math.round() = **27** ✅ |
| 3 Partition Square Box | ₹1,600 | $39 | 92.4 | 2.25 | 1600/92.4×2.25 = 38.96 → Math.round() = **39** ✅ |

---

## Image Checks

All 4 images were stored during Apply (imagesStored=4, imagesFailed=0).

| Artwork | Image URL | HTTP check |
|---|---|---|
| 18" Round Warli Art | `.../api/images/artworks/art-1785182575357-0` | ✅ 200 |
| 10" Round Warli Art | `.../api/images/artworks/art-1785182575357-1` | ✅ 200 |
| Decorative Tray 11" | `.../api/images/artworks/art-1785182575357-2` | ✅ 200 |
| 3 Partition Square Box | `.../api/images/artworks/art-1785182575357-3` | ✅ 200 |

Image data is stored in the `artworks.image_data` column (BYTEA). The `artworks.image`
column holds the URL. No separate image table — rollback would delete both by deleting
the artwork rows.

---

## Review Queue Check

The 4 new artworks are visible in the admin Review Queue (status=NEEDS\_REVIEW, confirmed
via `GET /api/admin/artworks`). All 4 have `owner_review_needed` flag set (from workbook
column Owner Review Needed=TRUE). Admin UI shows all 4 with images.

---

## Stop Conditions Hit

**None.** All runbook stop conditions were evaluated:
- Backup succeeded (12.08 MB) ✅
- Final Preview passed all 10 checks ✅
- Apply returned HTTP 200, createdCount=4, imagesFailed=0 ✅
- No new artwork went public ✅
- No new artwork has status other than NEEDS\_REVIEW ✅
- artwork\_sizes, order\_requests, order\_request\_items all unchanged ✅
- pricing\_settings unchanged ✅

---

## Observations (non-blocking)

1. **`/api/artworks?category=` filter does not filter by category** — the public artworks
   endpoint ignores the `category` query parameter and returns all 38 public artworks
   regardless. This is pre-existing behavior. Public category visibility was verified via
   DB query instead.

2. **No `GET /api/admin/artworks/:id` endpoint** — individual artwork admin lookup by ID
   is not implemented. Per-row validation was performed by fetching the full admin list
   and filtering by ID. All 4 new rows were confirmed present with correct field values.

3. **Price USD uses `Math.round()`** — the `calculateUsdPrice` function applies
   `psychologicalRound()` which is currently implemented as `Math.round()`. Stored USD
   values are whole-dollar integers. ISYNC-18-02 expected values showed raw calculated
   amounts before rounding; the stored amounts are correct.

---

## Owner Follow-up Actions

Before any of the 4 new artworks can be published:

| Row | Item | Required before publishing |
|---|---|---|
| All 4 | All | **Materials** is blank — fill in before setting public |
| Row 4 | 3 Partition Square Box | **Dimension** is blank — add physical dimensions |
| All 4 | All | Review Item Description and update if needed |
| All 4 | All | Set `show_on_website = TRUE` and `status = IN_STOCK` via admin panel |

SKU is auto-generated by the app on the first admin save when the artwork is set to
public/orderable. No SKU action is needed from the operator.

---

## Safety Confirmations

- ✅ No artwork published from this Apply (all 4 remain NEEDS\_REVIEW + show\_on\_website=false)
- ✅ No SKU generated by Apply (all 4 sku=null)
- ✅ No existing production artwork modified (all count checks and DB query confirmed)
- ✅ No artwork\_sizes rows created or modified
- ✅ No category rows created or modified
- ✅ No order request rows created or modified
- ✅ No price recalculation performed (pricing\_settings unchanged)
- ✅ server/.env not committed
- ✅ Private workbook not committed (`_private/` gitignored)
- ✅ Image ZIP not committed
- ✅ Apply response JSON saved to `_private/` only (gitignored)
- ✅ Backup saved to `C:\Development\backups\postgres\` (not in repo)
- ✅ No credentials committed or logged
- ✅ Temp scripts saved to scratchpad only (not committed)
- ✅ INV-PRICE-01 not implemented
- ✅ ARCH-INV-02 not started
- ✅ ISYNC-18-05 not started

---

## ISYNC-18-03 Runbook Reference

`docs/inventory-sync/ISYNC-18-03-controlled-production-apply-runbook.md`

Followed exactly. No deviations from runbook procedure.

---

## ISYNC-18-04 Status

**COMPLETE** — Controlled production Apply executed and fully validated.
All 4 artworks are in production as NEEDS\_REVIEW, hidden from public, awaiting owner review.
