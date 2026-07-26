# ISYNC-18-01 — Import Package Readiness Results

**Status:** BLOCKED — no production import workbook in INV-03-10 format exists  
**Date:** 2026-07-26  
**Branch:** `feature/ISYNC-18-01-import-package-readiness`  
**Restrictions:** Preview-only. Apply not run. No production data modified.

---

## Branch

| Item | Value |
|---|---|
| Branch | `feature/ISYNC-18-01-import-package-readiness` |
| Created from | `main` at commit `27bc905` |
| ISYNC-17 confirmed in history | ✅ `86d9aa6 ISYNC-17 apply import validation` |
| WEB-MAINT-02 confirmed in history | ✅ `9a13c00 Merge pull request #23 from NarlaSR/feature/WEB-MAINT-02-block-order-requests-during-maintenance` |
| Git status at branch time | Clean — only unrelated untracked files |

---

## Workbook Candidates Examined

All `.xlsx` files in the repository were inspected. None are in the INV-03-10 format required by the current parser (`inventoryParser.js`).

### `__test_workbooks/shipmentDetails_20260628_corrected_inv03b_image-file-name.xlsx`

| Check | Finding |
|---|---|
| Sheet name | `Sheet1` (not `Inventory_Import`) |
| Format | Sales/shipment tracking record — not an import workbook |
| Columns | `Item description`, `Quantity`, `Price per unit`, `Total`, `SKU`, `Art Work`, `Size`, `Year`, `Image File Name` |
| `Action` column | **MISSING** — required by parser |
| `Inventory Status` column | **MISSING** — required by parser |
| `Existing Artwork ID` column | **MISSING** |
| Data | 25 rows of individual artwork sales with unit quantities (10, 2, 1…) and a `Total` (price × qty) column; grand total row at end = ₹74,100. These are *units sold/shipped*, not inventory stock levels. |
| Image File Name values present | 4 rows have values: `test-art-01.png`, `test-art-02.png`, `test-art-03.png`, `test-art-05.png` |
| Parser compatibility | ❌ Would generate "Missing Action" and "Missing Inventory Status" errors on every row |
| Verdict | **Not an import workbook.** This is a sales/accounting record adapted to include image filenames during early INV-03b exploration. Not usable for production Apply. |

### `__test_workbooks/shipmentDetails_20260624_corrected_inv03b.xlsx`

Same structure as above, without the `Image File Name` column. 25 data rows. Same verdict: not an import workbook.

### `docs/inventory-sync/Chitrakala_Inventory_Sync_INV03_02_UPDATE_Validated.xlsx`

| Check | Finding |
|---|---|
| Sheets | ReadMe, Sync_Summary, DB_Artworks_Export, DB_Artwork_Sizes_Export, DB_Categories_Export, Inventory_Master, Potential_Issues_Auto, Reconciliation_Report, Import_Validation_Rules, DB_to_Inventory_Field_Mapping |
| Format | Legacy multi-sheet INV-03 format — different schema from current parser |
| Inventory_Master columns | `Sync Action`, `Suggested Sync Action`, `Validation Status`, `DB id`, `Corrected title`, `Corrected category_slug`, `Corrected description`, etc. (41 columns) |
| Parser compatibility | ❌ No `Inventory_Import` sheet. Parser would fall back to first sheet (`ReadMe`), which has no valid header. `Sync Action` header does not map to `Action` in `HEADER_MAP`. |
| Data coverage | 36 artworks (UPDATE only — all existing); 73 size rows; 5 categories |
| Verdict | **Incompatible format.** From a pre-ISYNC phase. The `INVENTORY_SYNC_ROADMAP.md` explicitly notes this format is "superseded by the ISYNC-01 through ISYNC-10 implementation." |

### `docs/inventory-sync/Chitrakala_Inventory_Sync_INV03_01_REVIEW_Resolved.xlsx`

Identical multi-sheet structure to INV03_02. Same verdict: incompatible, superseded format.

### `docs/inventory-sync/Chitrakala_Inventory_Sync_v2_ReadyForCodingAgent.xlsx`

Older version of the same multi-sheet format. Same verdict.

---

## Required INV-03-10 Format

The current parser (`inventoryParser.js`, ISYNC-16/17 aligned) expects:

| Requirement | Detail |
|---|---|
| Sheet name | `Inventory_Import` (parser selects by name; falls back to first sheet) |
| Row structure | Row 1: optional template note; Row 2: column headers; Row 3+: data |
| Required columns | `Action`, `Item Description`, `Quantity`, `Inventory Status` |
| Expected columns | `Existing Artwork ID`, `SKU`, `Category`, `ArtCode`, `Dimension`, `Size Label`, `Materials`, `Show_on_website`, `Price INR`, `Price USD`, `Price on Request`, `Image File Name`, `Featured`, `Owner Review Needed`, `Notes` |
| Action values | `CREATE`, `UPDATE`, `NO_CHANGE` |
| UPDATE rows | Must have `Existing Artwork ID` (production artwork `id`) |
| CREATE rows | `Existing Artwork ID` must be blank; `SKU` must be blank |

**The canonical template (`INV-03-10-production-workbook-template-FINAL-CORRECTED.xlsx`) referenced in the ISYNC-16 implementation docs is not present in the repository.** No workbook in this format exists in the project.

---

## Image ZIP Check

| Check | Finding |
|---|---|
| ZIP files found in project | **0** — no `.zip` files found anywhere in the repository |
| Image files directly present | Not searched — images are expected in a ZIP alongside the workbook upload |
| Image File Name values in shipmentDetails | 4 test placeholder names (`test-art-01.png` etc.) — not real production images |
| Verdict | **No image ZIP available.** Even if a valid workbook existed, image matching would produce "missing image" warnings for any row with an `Image File Name` value. Image import must be handled separately (manual per-artwork upload via the admin editor) or deferred to a dedicated image ticket. |

---

## Preview Run

**Preview was not run.** No workbook in the INV-03-10 format exists to submit to the Preview endpoint. Running Preview against the available workbooks would produce parser errors on every row (missing required columns), providing no useful readiness signal. Attempting it would also require the local server and local DB to be running, which adds risk without benefit given the workbook gap.

---

## BUS-REVIEW-01 Decision Status

The `BUS-REVIEW-01-inventory-data-decisions.md` document captures 12 business decisions needed before production import. As of this readiness check, **all 12 are still PENDING**:

| # | Topic | Status |
|---|---|---|
| 1 | SKU assignment for existing 38 artworks | **PENDING** — INV-DATA-01 |
| 2 | Initial status/quantity defaults | **PENDING** — INV-DATA-02 |
| 3 | Dimensions field strategy | **PENDING** — INV-DATA-03 |
| 4 | Saree/textile dimensions wording | **PENDING** — INV-DATA-03 |
| 5 | Image filename strategy | **PENDING** — INV-DATA-02 |
| 6a | Duplicate "Coaster Set (4 pieces)" titles | **PENDING** — INV-DATA-01 |
| 6b | Duplicate "Decorative Wall Panel" titles | **PENDING** — INV-DATA-01 |
| 7 | Missing pricing variants (2 artworks) | **PENDING** — INV-DATA-02 |
| 8 | Generic title "Mirror Mosaic artwork" | **PENDING** — INV-DATA-01 |
| 9 | Lippan materials correction | **PENDING** — INV-DATA-03 |
| 10 | Textile-design category handling | **PENDING** — INV-DATA-04 |
| 11 | Empty category handling (warli-art, mixed-art) | **PENDING** — WEB-CAT-01 (now merged) |

Note: Decision 11 (WEB-CAT-01 empty category suppression) was resolved by code — `WEB-CAT-01` has been merged. All other 11 decisions remain open.

---

## Blockers Summary

### Blocker 1 — No production import workbook (HARD BLOCKER)

The production import workbook in INV-03-10 format (`Inventory_Import` sheet with `Action` / `Existing Artwork ID` / `Item Description` / `Inventory Status` / `Quantity` / `Price INR` column structure) **does not exist**.

Without it:
- Preview cannot be run against real production data
- Apply cannot be run
- Row classifications (CREATE / UPDATE / REVIEW / ERROR) cannot be validated
- ISYNC-18-02 cannot start

**Action required:** Business owner or data preparer must create the production import workbook using the INV-03-10 template format. The workbook should cover all 38 existing production artworks as UPDATE rows (with real production `id` values in `Existing Artwork ID`), plus any new CREATE rows intended for this import run.

### Blocker 2 — No image ZIP (SECONDARY BLOCKER)

No image ZIP file exists. Any workbook row with a non-blank `Image File Name` value will show a "missing image" warning in Preview and will not have an image applied by Apply.

**Action required:** Decide whether to include image import in the first production Apply (requires assembling a ZIP of artwork images with filenames matching workbook `Image File Name` values), or proceed with image-less first Apply and upload images manually per artwork afterward.

### Blocker 3 — BUS-REVIEW-01 decisions outstanding

11 of 12 business decisions in `BUS-REVIEW-01` remain PENDING. Several directly affect what goes in the import workbook (SKU assignment, status/quantity defaults, dimensions strategy, duplicate title resolution).

**Action required:** Business owner completes `BUS-REVIEW-01` before or in parallel with workbook preparation.

---

## What Must Happen Before ISYNC-18-02 Can Start

| # | Action | Owner |
|---|---|---|
| 1 | Create production import workbook in INV-03-10 format | Business owner / data preparer |
| 2 | Populate UPDATE rows for all 38 existing artworks with real production artwork IDs | Business owner |
| 3 | Resolve BUS-REVIEW-01 decisions (at minimum: SKU assignment, status/quantity, dimensions) | Business owner |
| 4 | Decide image import strategy — bundled ZIP or post-import manual upload | Business owner |
| 5 | Place workbook in a known location in the repo or share for review | Business owner |

ISYNC-18-02 can start once item 1 is complete and the workbook has been placed for review.

---

## Rows Needing Correction Before Apply

Cannot assess — no production workbook exists to evaluate row-by-row.

---

## Safety Confirmations

- ✅ Apply endpoint not called
- ✅ Production import not run
- ✅ Production data not modified
- ✅ No artwork/category/pricing/SKU/inventory data changed
- ✅ Maintenance mode not touched
- ✅ `server/.env` not committed
- ✅ No migration run
- ✅ No secrets committed
- ✅ No temp scripts committed

---

## ISYNC-18-01 Status

**COMPLETE** (as a readiness assessment) — the readiness check has been run and findings are documented.

**ISYNC-18-02 status: BLOCKED** — cannot start until Blocker 1 (production workbook) is resolved.
