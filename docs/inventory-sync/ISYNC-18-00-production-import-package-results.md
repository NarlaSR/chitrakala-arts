# ISYNC-18-00 — Production Import Package Results

**Branch:** `feature/ISYNC-18-00-production-import-package`
**Date:** 2026-07-26
**Status:** DRAFT COMPLETE — BLOCKED (image ZIP not found)

---

## Summary

Source data reviewed, production state verified via read-only API, and a 4-row draft
import workbook has been built. The draft is complete and correctly formatted for the
INV-03-10 / ISYNC-16 Preview workflow.

**The import package is blocked from Preview/Apply until the image ZIP is supplied.**
Two of the four selected rows reference image filenames (`test-art-05.png`,
`test-art-03.png`) that are not present locally. The other two rows have no image and
require images to be uploaded manually via the admin UI before publishing.

---

## Source Data Reviewed

### shipmentDetails_20260628_corrected_inv03b_image-file-name.xlsx

- Location: `__test_workbooks/` (gitignored)
- Total data rows: 25
- Rows with image filenames: 4
  - Row 4 (`24" x 24" lippan artwork`): `test-art-01.png`
  - Row 8 (`18" round Warli art`): `test-art-05.png`
  - Row 16 (`Canvas Texture art floral painting - 4 piece set`): `test-art-02.png`
  - Row 26 (`3 partitions square box with handle - texture art`): `test-art-03.png`
- Format: accounting/shipment record — columns `Item description`, `Quantity`,
  `Price per unit`, `Total`, `SKU`, `Art Work`, `Size`, `Year`, `Image File Name`

### INV03_02 (Chitrakala_Inventory_Sync_INV03_02_UPDATE_Validated.xlsx)

- Location: `docs/inventory-sync/` (committed)
- Artworks listed: 36
- Used as reference to identify existing production artwork IDs

### INV-03-10 Template (final corrected)

- Location: `_private/inventory-import/INV-03-10-production-workbook-template-FINAL-CORRECTED.xlsx`
  (gitignored, not committed)
- Used as the source format for the draft workbook
- `Inventory_Import` sheet: row 1 = template note, row 2 = 19-column header,
  rows 3–4 = sample rows (removed in draft)

---

## Production State Verification (read-only API)

Endpoint: `GET /api/admin/artworks` (production, read-only, no DB connection)
Total production artworks: **38**

| Category | Count | Notes |
|---|---|---|
| dot-mandala | 19 | Includes keychains, boxes, trays, mandalas, butterfly, serving boards |
| lippan-art | 8 | Includes wall panels, decorative squares/rounds, mirror frames |
| mirror-mosaic | 4 | Includes 2 artworks added after INV03_02 (see below) |
| textile-design | 6 | Sarees, canvas bags, Tussar saree |
| texture-art | 1 | Elegant Pink Floral Texture Wall Art – 4 Panel Canvas Set |
| **warli-art** | **0** | **Confirmed empty** |
| **mixed-art** | **0** | **Confirmed empty** |

### Two artworks in production not in INV03_02

These were identified as the 2 artworks added since INV03_02 was created:

| ID | Category | Title |
|---|---|---|
| art-1782445237565 | mirror-mosaic | Aqua Blue Floral Wall Decor |
| art-1782444332537 | mirror-mosaic | Mirror Mosaic artwork |

Both are `IN_STOCK` and were created during ISYNC-17 production smoke testing.

---

## Package Scope Decision

**First package: 4 CREATE rows only.**

Criteria applied per ISYNC-18-00 ticket:
- Small controlled subset
- No ambiguity about new vs. existing artwork
- Clean numeric prices (no Price on Request)
- No BUS-REVIEW-01 dependency for these rows
- No INV-PRICE-01 dependency
- No UPDATE rows (UPDATE requires confirmed production artwork IDs and owner review)

**Selected rows:**

| # | Item Description | Category | ArtCode | Size | Price INR | Image File Name | Why selected |
|---|---|---|---|---|---|---|---|
| 1 | 18" Round Warli Art | warli-art | WA | Large | ₹7,000 | test-art-05.png | warli-art empty in production; has image |
| 2 | 10" Round Warli Art | warli-art | WA | Medium | ₹2,500 | (none) | warli-art empty in production |
| 3 | Decorative Tray 11" | mixed-art | MA | Medium | ₹1,100 | (none) | mixed-art empty in production |
| 4 | 3 Partition Square Box with Handle | texture-art | TA | Small | ₹1,600 | test-art-03.png | New TA product; no match in production |

**All 4 rows:** Action = CREATE, Existing Artwork ID = blank, SKU = blank,
Inventory Status = NEEDS_REVIEW, show_on_website = FALSE, Owner Review Needed = TRUE.

---

## Excluded Rows and Reasoning

The remaining 21 shipmentDetails rows were excluded from the first package:

| Rows | Reason for exclusion |
|---|---|
| Row 3 (`4 piece coaster set`, DM/SM) | Pre-assigned SKU `CKS-2026-DM-SM-00001` in source; maps to existing "Coaster Set (4 pieces)" — UPDATE candidate, needs owner confirmation |
| Rows 4–5 (lippan artwork 24" and 12") | May be variants of existing "Luxury Lippan Art Wall Panel" — ambiguous; needs owner clarification |
| Row 6 (`12" round Mirror mosaic`) | Could be new or match existing mirror-mosaic artworks — ambiguous |
| Rows 7, 10 (18" and 12" Dot mandala) | Many DM artworks in production; specific mapping unclear — needs owner confirmation |
| Row 11 (`4 piece Round Tray set`) | May match "Hand Painted Wooden Mandala Tray (fillable Round)" — ambiguous |
| Row 12 (`4" x 4" pen stand with photo frame`, DM/SM) | Potentially new but small niche item; no image; needs owner confirmation |
| Row 14 (`Decorative Tray 9"`, DM/SM) | Could match existing DM serving board/tray variants — ambiguous |
| Row 15 (`4" square and round decorative pieces`, LA/SM) | May match "Lippan Art Small decorative Squares (set of 5)" — ambiguous |
| Row 16 (`Canvas Texture art floral painting - 4 piece set`) | Matches "Elegant Pink Floral Texture Wall Art – 4 Panel Canvas Set" (art-1772991773037) — UPDATE candidate, not CREATE |
| Rows 17–19 (storage boxes and magnet frame, DM/DM) | Ambiguous vs. existing DM box/storage artworks |
| Rows 20–23 (Wall décor serving boards 9"–15") | Likely variants of "Decorative Serving Board" (art-1771101879286) — UPDATE or size-variant decision needed |
| Rows 24–25 (Wall décor Butterfly medium/large) | May be variants of "Butterfly Set (3 pieces)" — UPDATE or size-variant decision needed |
| Row 18 (`2.5" x 9.5" storage box - texture art`) | Potentially new TA item but no image and low priority for first package |

Excluded rows requiring BUS-REVIEW-01 decisions before classification:
- Serving board size variants (Rows 20–23)
- Butterfly variants (Rows 24–25)
- LA artwork variants (Rows 4–5, 15)

---

## Draft Workbook

**Path:** `_private/inventory-import/ISYNC-18-production-import-package-DRAFT.xlsx`
**Status:** Created 2026-07-26 — **not committed** (path is gitignored)
**Sheet:** `Inventory_Import` — 1 header row + 4 CREATE data rows

**Workbook will not be committed.** Business data stays in `_private/` (gitignored).

**Before this workbook can be used for Preview:**
1. Image ZIP must be supplied with `test-art-05.png` and `test-art-03.png`
2. Materials for all 4 rows must be confirmed by owner and filled in
3. Item descriptions should be reviewed by owner for public-facing accuracy
4. Owner Review Needed = TRUE on all rows — admin must approve each before publish

---

## Image ZIP Status

| File | Required for | Status |
|---|---|---|
| `test-art-05.png` | Row 1: 18" Round Warli Art | **MISSING** — referenced in shipmentDetails but not found locally |
| `test-art-03.png` | Row 4: 3 Partition Square Box | **MISSING** — referenced in shipmentDetails but not found locally |
| `test-art-01.png` | Not in package (24" lippan artwork excluded) | Not checked |
| `test-art-02.png` | Not in package (canvas set is UPDATE, not CREATE) | Not checked |

No image ZIP file was found in `_private/`, `__test_workbooks/`, or `docs/inventory-sync/`.

Images for Rows 2 and 3 (Warli Art MD, Decorative Tray) have no filename in the source
data — these must be uploaded via admin UI after CREATE.

---

## Blockers

| # | Blocker | Severity | Required before |
|---|---|---|---|
| 1 | Image ZIP not found (`test-art-05.png`, `test-art-03.png`) | HARD | Preview run |
| 2 | Materials for all 4 rows not in source data | SECONDARY | Owner publish approval |
| 3 | Item descriptions need owner review for public accuracy | SECONDARY | Owner publish approval |
| 4 | BUS-REVIEW-01 decisions PENDING (affects 13+ excluded rows) | SECONDARY | Expanding package scope |

---

## Safety Confirmation

- No production Preview was run
- No Apply/import was run
- No production DB writes were made
- No SKU backfill was performed
- No price recalculation was run
- No migration was run
- Production API access was read-only GET only (artwork list lookup to verify category state)
- Draft workbook is not committed

---

## ISYNC-18-02 Status

**BLOCKED** — image ZIP not found; Preview cannot proceed until blocker 1 is resolved.

Next steps when image ZIP is available:
1. Place image ZIP in `_private/inventory-import/`
2. Confirm Materials and Item Description for all 4 rows with owner
3. Run Preview against production (read-only, no Apply)
4. Review Preview output with owner before scheduling Apply under a separate ticket
