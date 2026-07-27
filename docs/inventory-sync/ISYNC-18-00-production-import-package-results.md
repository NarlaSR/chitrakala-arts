# ISYNC-18-00 — Production Import Package Results

**Branch:** `feature/ISYNC-18-00-production-import-package`
**Date:** 2026-07-27
**Status:** DRAFT COMPLETE — READY FOR OWNER REVIEW (image ZIP validated; all 4 rows have matching images)

---

## Summary

Source data reviewed, production state verified via read-only API, 4-row draft import
workbook built from the INV-03-10 template, and image ZIP validated. All 4 workbook
rows now have confirmed image filenames that exactly match the files in the ZIP.

**The hard blockers from ISYNC-18-01 are resolved for this controlled package.**
ISYNC-18-02 (Preview) can now proceed once the owner reviews Materials and
Item Descriptions for the 4 rows. Preview is read-only and does not require Apply.

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
| 1 | 18" Round Warli Art | warli-art | WA | Large | ₹7,000 | warli-round-18.png | warli-art empty in production; has image |
| 2 | 10" Round Warli Art | warli-art | WA | Medium | ₹2,500 | warli-round-10.png | warli-art empty in production |
| 3 | Decorative Tray 11" | mixed-art | MA | Medium | ₹1,100 | mixed-tray-11.png | mixed-art empty in production |
| 4 | 3 Partition Square Box with Handle | texture-art | TA | Small | ₹1,600 | texture-box-3part.png | New TA product; no match in production |

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
**Status:** Updated 2026-07-27 — **not committed** (path is gitignored)
**Sheet:** `Inventory_Import` — 1 header row + 4 CREATE data rows

**Workbook will not be committed.** Business data stays in `_private/` (gitignored).

**Current workbook image filenames (verified 2026-07-27):**

| Row | Item Description | Image File Name | Status |
|---|---|---|---|
| 1 | 18" Round Warli Art | `warli-round-18.png` | Matches ZIP |
| 2 | 10" Round Warli Art | `warli-round-10.png` | Matches ZIP |
| 3 | Decorative Tray 11" | `mixed-tray-11.png` | Matches ZIP |
| 4 | 3 Partition Square Box with Handle | `texture-box-3part.png` | Matches ZIP |

Note: original shipmentDetails placeholder filenames (`test-art-05.png`, `test-art-03.png`)
have been replaced with the actual filenames from the image ZIP. Rows 2 and 3 were
previously blank and are now also populated.

**Before this workbook can be used for Apply (not required for Preview):**
1. Materials for all 4 rows must be confirmed by owner and filled in
2. Item descriptions should be reviewed by owner for public-facing accuracy
3. Owner Review Needed = TRUE on all rows — admin must approve each before publish

---

## Image ZIP Status

**ZIP:** `_private/inventory-import/ISYNC-18-import-images-DRAFT.zip`
**Validated:** 2026-07-27 — not committed (gitignored)

| File in ZIP | Size | Top-level | Required for | Workbook match |
|---|---|---|---|---|
| `warli-round-18.png` | 2.5 MB | Yes | Row 1: 18" Round Warli Art | EXACT MATCH |
| `warli-round-10.png` | 2.3 MB | Yes | Row 2: 10" Round Warli Art | EXACT MATCH |
| `mixed-tray-11.png` | 2.6 MB | Yes | Row 3: Decorative Tray 11" | EXACT MATCH |
| `texture-box-3part.png` | 2.4 MB | Yes | Row 4: 3 Partition Square Box | EXACT MATCH |

All 4 images are present, all top-level (no nested folders), all filenames match the
workbook exactly. The ZIP contains exactly the 4 intended images — no extras.

Original shipmentDetails placeholder filenames (`test-art-05.png`, `test-art-03.png`)
have been replaced in the workbook. Rows 2–3 which previously had no image filename
have also been updated with the correct filenames from the ZIP.

---

## Blockers

| # | Blocker | Severity | Status | Required before |
|---|---|---|---|---|
| 1 | Image ZIP not found | HARD | **RESOLVED** — ZIP validated 2026-07-27 | Preview run |
| 2 | Materials for all 4 rows not in source data | SECONDARY | Open | Owner publish approval (not Preview) |
| 3 | Item descriptions need owner review for public accuracy | SECONDARY | Open | Owner publish approval (not Preview) |
| 4 | BUS-REVIEW-01 decisions PENDING (affects 13+ excluded rows) | SECONDARY | Open | Expanding package scope |

**No hard blockers remain for the 4-row controlled package.**
Preview (read-only) can proceed. Apply requires blockers 2 and 3 to be resolved first.

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

## ISYNC-18-01 Restart Status

ISYNC-18-01 found three blockers that prevented a Preview run:
- HARD: No workbook in INV-03-10 format → **RESOLVED** (`ISYNC-18-production-import-package-DRAFT.xlsx`)
- HARD: No image ZIP → **RESOLVED** (`ISYNC-18-import-images-DRAFT.zip`, all 4 images validated)
- SECONDARY: BUS-REVIEW-01 decisions pending → still open (does not block Preview)

**ISYNC-18-01 can restart.** Both hard blockers are resolved for the 4-row controlled
package. The secondary BUS-REVIEW-01 blocker only affects expanding the package scope
beyond these 4 rows and does not block Preview of the current draft.

## ISYNC-18-02 Status

**READY** — hard blockers resolved; workbook and image ZIP are complete and validated.

Next steps:
1. Owner reviews Item Description and Materials for all 4 rows (required before Apply, not Preview)
2. Run Preview against production (read-only, no Apply) — workbook and ZIP are ready
3. Review Preview output with owner
4. Schedule Apply under a separate approved ticket after Preview and owner sign-off
