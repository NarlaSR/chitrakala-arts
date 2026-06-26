# INV-03-06 — Data Gaps Log for Non-Sync Items

**Ticket:** INV-03-06 — Document Data Gaps for Non-Sync Items
**Branch:** feature/inv-03-closeout
**Date:** 2026-06-25
**Status:** Documentation only — no DB writes, no backend changes, no price commits

---

## Purpose

This report catalogs data quality gaps and follow-up items discovered during the INV-03 inventory sync workflow. These are non-blocking items for Phase 1 artwork UPDATE sync, deferred cleanup tasks, business-owner decisions still needed, and future pricing workflow items.

Phase 1 sync (9 UPDATE rows) remains clean and unblocked. This document exists to ensure nothing is lost when moving to INV-04 and beyond.

---

## Source Files Reviewed

| Source | Notes |
|--------|-------|
| `docs/inventory-sync/INV03_01_REVIEW_DECISIONS.md` | 24 REVIEW rows resolved to NO_CHANGE; all had REVIEW_SIZE_PRICING flags |
| `docs/inventory-sync/INV03_02_UPDATE_FIELD_VALIDATION.md` | 9 UPDATE rows validated; CRLF/LF warning noted |
| `docs/inventory-sync/INV03_03_SIZE_USD_RECALCULATION_REPORT.md` | 73 size rows flagged USD_RECALC_NEEDED across 33 artworks |
| `docs/inventory-sync/INV03_04_ASSUMPTIONS_VALIDATION_REPORT.md` | FX rate, invoice support, customs/shipping/overhead, margin floor — all need business-owner confirmation |
| `docs/inventory-sync/INV03_05_FINAL_PREVIEW_SIGNOFF.md` | Clean preview; 1 expected warning on price_inr change |
| Live API — `GET /api/artworks` | 36 artworks inspected for description length, title casing, materials casing, embedded pricing, and dimensions |

---

## Summary of Gap Categories

| Category | Count | Priority | Blocks Phase 1 Sync? |
|----------|-------|----------|----------------------|
| Embedded pricing in description text | 2 artworks | P1 | No (but should fix before launch) |
| Unconfirmed business pricing assumptions | 6 items | P1 | No (blocks final pricing commit only) |
| Short / stub descriptions (under 100 chars) | 8 artworks | P2 | No |
| Title casing inconsistencies | 5 artworks | P2 | No |
| Ambiguous size labels | 4 artworks / 7 size rows | P2 | No |
| Backend CRLF/LF normalization in preview compare | 1 backend issue | P2 | No |
| Multiplier `1.75` references to mark historical | 1 item | P2 | No |
| Materials casing — resolved by Phase 1 UPDATE rows | 3 artworks | —  | Resolved in Phase 1 |
| Materials truncation — resolved by Phase 1 UPDATE row | 1 artwork | —  | Resolved in Phase 1 |
| Missing `dimensions` DB column (all artworks) | 36 artworks | P3 | No |
| Size-level USD recalculation needed | 33 artworks / 73 rows | P3 | No (separate workflow) |

**Phase 1 blockers: 0.** All gaps below are non-blocking for the 9 UPDATE artwork sync.

---

## Priority Definitions

| Priority | Meaning |
|----------|---------|
| **P1** | Should be reviewed and resolved before public launch or final pricing commit |
| **P2** | Cleanup recommended but not blocking Phase 1 sync or launch |
| **P3** | Future enhancement or separate workflow; tracked for awareness only |

---

## P1 — Review Before Launch

### Embedded Pricing in Description Text

Two artworks have INR size-price text embedded directly in their `description` field. This is a UX and data quality concern: the prices may conflict with the `artwork_sizes` table and may become stale if pricing changes.

**art-1770778509370 — Coaster Set (4 pieces)**
- Description tail: `"Set of 4 - Rs 750 / Set of 6 - Rs 1000"`
- These prices appear to differ from size row prices in the DB.
- Recommended action: Remove embedded pricing from description; ensure correct prices are in `artwork_sizes` rows.

**art-1770419460850 — Mandala in Blue and Peach**
- Description tail: `"18" - Rs 6200 / 24" Rs 8000 / 36" Rs 16000"`
- These are larger size prices not fully represented in the current single `12"` size row.
- Recommended action: Remove embedded pricing from description; add proper size rows for 18", 24", 36" variants with correct INR prices; recalculate USD using backend pricing.

### Unconfirmed Business Pricing Assumptions (from INV-03-04)

The following were flagged in INV-03-04 as needing business-owner sign-off before any final pricing commit workflow is built:

| Item | Status | Action Needed |
|------|--------|---------------|
| FX rate — continue using `92.40` or update to live rate? | Unconfirmed | Business owner to confirm |
| Invoice/purchase-price support for 9 UPDATE rows | Not found in workbook | Business owner to provide |
| Customs cost assumption | Not defined | Business owner to define |
| Shipping cost assumption | Not defined | Business owner to define |
| Overhead cost assumption | Not defined | Business owner to define |
| Minimum acceptable margin floor | Not defined | Business owner to define |

These do not block Phase 1 artwork field sync (titles, descriptions, materials). They do block any future automated pricing commit workflow.

---

## P2 — Non-Blocking Cleanup Recommended

### Short / Stub Descriptions

Eight artworks have descriptions under 100 characters. These are thin for customer-facing copy and may not adequately represent the artwork.

| Artwork ID | Title | Description Length | Current Description |
|---|---|---|---|
| art-1771102688340 | Small decorative Rounds (set of 5) | 19 chars | "Small accent pieces" |
| art-1772899719136 | Lippan Art Small decorative Squares (set of 5) | 42 chars | "Decorative squares and round in a set of 5" |
| art-1771102578812 | Decorative Wall Panel | 51 chars | "Beautiful arrangement with clay, colors and mirrors" |
| art-1770933508740 | Canvas Bag - Birds | 51 chars | "Beautiful, colorful birds sitting on a tree branch." |
| art-1771102482592 | Decorative Wall Panel | 47 chars | "Beautiful piece decorated with clay and mirrors" |
| art-1771101978525 | Hand painted Tussar Saree | 60 chars | "Beautiful hand painted saree with Ornamental design all over" |
| art-1771454920479 | Canvas Bag - Flowers | 63 chars | "Beautiful flowers with a butterflies showcased on a canvas bag." |
| art-1771102194181 | Coaster Set (4 pieces) | 67 chars | "Beautiful dot mandala coaster set in variety of patterns and colors" |

Recommended action: Business owner to write or approve richer descriptions for each. Especially critical for the two "Decorative Wall Panel" entries with near-identical stub descriptions.

### Title Casing Inconsistencies

Five artworks have clear mid-title casing errors (not preposition rules — actual noun/verb lowercase errors):

| Artwork ID | Current Title | Issue |
|---|---|---|
| art-1771101978525 | Hand painted Tussar Saree | "painted" should be "Painted" |
| art-1770779208267 | Rectangular Wooden box | "box" should be "Box" |
| art-1770771970545 | Mango-Shaped storage box | "storage" and "box" should be title-cased |
| art-1772899719136 | Lippan Art Small decorative Squares (set of 5) | "decorative" should be "Decorative" |
| art-1771102688340 | Small decorative Rounds (set of 5) | "decorative" should be "Decorative" |

Note: Titles with conjunctions, prepositions, and articles in lowercase ("in", "and", "of") are intentional title-case style — those are not flagged. Only clear noun/verb casing errors are listed above.

Recommended action: Fix via a future UPDATE workbook row or direct admin edit after business-owner confirmation.

### Ambiguous Size Labels

Seven size rows across four artworks use `"or"` or `"and"` to describe a shape choice within a single size label. This makes size labels ambiguous as product options and may cause display or ordering issues.

| Artwork ID | Title | Ambiguous Size Label |
|---|---|---|
| art-1771102482592 | Decorative Wall Panel (lippan) | `8" (round) or 8" (square)` |
| art-1771102482592 | Decorative Wall Panel (lippan) | `10" (round) or 10" (square")` |
| art-1771102578812 | Decorative Wall Panel | `8"(round) or 8" (square)` |
| art-1771102578812 | Decorative Wall Panel | `10"(round) or 10" (square)` |
| art-1771903526915 | Handcrafted Mud & Mirror Floral Mandala | `8"(round) or 8" (square)` |
| art-1771903526915 | Handcrafted Mud & Mirror Floral Mandala | `10" (round) or 10" (square")` |
| art-1772899719136 | Lippan Art Small decorative Squares (set of 5) | `4" (squares and round)` |

Note: Inconsistent spacing between `8"(round)` and `8" (round)` also present across artworks.

Recommended action: Split each ambiguous size label into two separate size rows (one for round, one for square) if pricing differs, or standardize the label format if pricing is the same. This is a `artwork_sizes` table change and should be part of a dedicated size-management workflow.

### Backend CRLF/LF Normalization in Preview Compare

Identified in INV-03-02: the preview endpoint generates stale-data warnings when workbook description text uses different line endings (LF vs CRLF) than the live DB. This produces false-positive stale warnings and is a backend text-comparison bug, not a spreadsheet or data issue.

Recommended action: Add line-ending normalization in `server/inventorySync.js` field comparison logic before Phase 1 commit endpoint is built. This is a non-blocking backend bug.

### Multiplier `1.75` References

INV-03-04 confirmed the active pricing multiplier is `2.25`. The previous multiplier `1.75` is historical. Any remaining references to `1.75` in docs, UI, or config should be explicitly labeled historical or updated.

Known locations to check:
- `docs/` files referencing the old multiplier
- Admin UI pricing-settings labels
- Any inline comments in `server/priceUtils.js` or `server/inventorySync.js`

Recommended action: Search and audit `1.75` references; mark historical or update as appropriate.

---

## Items Resolved by Phase 1 UPDATE Rows

The following gaps were identified during INV-03 but are already addressed by the 9 Phase 1 UPDATE rows. They do not need separate follow-up after Phase 1 commits.

| Artwork ID | Title | Gap | Resolution |
|---|---|---|---|
| art-1771904016600 | Heart Shaped Wooden Coaster Set | `materials = 'wood'` (lowercase) | UPDATE row 31: corrected to `Wood` |
| art-1771903835260 | Wooden Coaster Set | `materials = 'wood'` (lowercase) | UPDATE row 30: corrected to `Wood` |
| art-1770775579766 | Intricate Floral Mandala Art in Green & Gold | `materials = 'wood'` (lowercase) | UPDATE row 7: corrected to `Wood` |
| art-1771030980031 | Midnight Plum Hand-Painted Floral Saree | `materials = 'Pure Wrinkle Cr'` (truncated) | UPDATE row 17: corrected to `Pure Wrinkle Crepe` |

---

## P3 — Future Enhancements / Separate Workflows

### Missing `dimensions` DB Column (All 36 Artworks)

The `artworks.dimensions` column is `NULL` for all 36 artworks. Physical dimensions (height × width × depth) for wall art are not stored as a structured field; they are implied by size labels in `artwork_sizes` or embedded in descriptions informally.

Recommended action: If structured dimensions are needed for shipping calculations, product filtering, or international listings, define a schema for `dimensions` and add a collection workflow. This is a longer-term data model decision.

### Size-Level USD Recalculation (33 Artworks / 73 Size Rows)

All 73 rows in `artwork_sizes` have stale `price_usd` values relative to the current FX rate (92.40) and multiplier (2.25). This was fully documented in INV-03-03 but not committed.

Key figures:
- 73 size rows affected
- 33 artworks affected
- Largest positive delta: +$411 (Eternal Glow 36" × 36")
- Largest negative delta: −$18 (Decorative Wall Panel 8")
- Average absolute delta: ~$33

This requires a separate controlled workflow (not Phase 1 artwork sync) with:
1. Backend recalculation endpoint for `artwork_sizes.price_usd`
2. Preview step showing current vs recalculated per size row
3. Business-owner approval of new USD prices before commit
4. Transaction with rollback and audit log

Full detail is in `docs/inventory-sync/INV03_03_SIZE_USD_RECALCULATION_REPORT.md` and `INV03_03_SIZE_USD_RECALCULATION_REPORT.csv`.

---

## Explicit Confirmations

- No DB writes occurred during this ticket.
- No backend code was changed.
- No price fields were updated.
- No `artwork_sizes.price_usd` values were modified.
- No workbook was modified.
- No git stash was applied.
- Working tree was clean before and after.

---

## Recommendation for Business Owner

Before proceeding to INV-04 (Phase 1 artwork UPDATE commit), the following items require business-owner review:

1. **Embedded pricing in descriptions** (art-1770778509370, art-1770419460850): Confirm correct prices, then remove text from descriptions and ensure proper size rows exist.
2. **FX rate confirmation**: Confirm whether to use 92.40 or update to a current live rate before any size USD recalculation.
3. **Pricing cost assumptions**: Provide or confirm customs, shipping, overhead inputs and minimum margin floor before automated pricing workflows are built.
4. **Short descriptions**: Review the 8 artworks with stub descriptions and provide richer copy before launch.
5. **Title casing fixes**: Confirm the 5 casing corrections for the next UPDATE batch.

Items 2–5 do not block Phase 1 artwork field sync (titles, descriptions, materials corrections in the 9 UPDATE rows). Item 1 is recommended to be cleaned up before launch to avoid customer confusion.

**Proceed to INV-04** for Phase 1 artwork UPDATE apply after business-owner approval.
