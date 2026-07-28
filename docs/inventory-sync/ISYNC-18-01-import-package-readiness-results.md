# ISYNC-18-01 — Import Package Readiness Results

**Branch:** `feature/ISYNC-18-01-import-package-readiness`
**Status:** COMPLETE — Preview passed; 4 CREATE / 0 ERROR / 4 images matched

| Phase | Date | Outcome |
|---|---|---|
| Phase 1 — Readiness check | 2026-07-26 | BLOCKED — no INV-03-10 workbook, no image ZIP |
| Phase 2 — Preview run | 2026-07-27 | PASSED — all 4 rows valid CREATE, all images matched |

---

## Phase 2 — Preview Run (2026-07-27)

### Inputs used

| Input | Path | Status |
|---|---|---|
| Workbook | `_private/inventory-import/ISYNC-18-production-import-package-DRAFT.xlsx` | EXISTS — 6,280 bytes |
| Image ZIP | `_private/inventory-import/ISYNC-18-import-images-DRAFT.zip` | EXISTS — 9,554,812 bytes |

Both inputs are gitignored (`_private/`). Neither was committed.

### Preview endpoint

```
POST https://chitrakalaarts-production.up.railway.app/api/admin/inventory-sync/preview
Fields: file (workbook), imageZip (image ZIP)
```

Read-only. No Apply. No database writes. No production data modified.

### HTTP result

**200 OK** — Preview completed successfully.

### Sheet and column detection

| Check | Result |
|---|---|
| Sheet used | `Inventory_Import` — exact name matched, no fallback |
| Detected columns | 19 / 19 — all expected columns present |
| Missing columns | None |
| Batch warnings | None |

### Row classification summary

| Classification | Count | Expected |
|---|---|---|
| **CREATE** | **4** | **4** |
| UPDATE | 0 | 0 |
| UPDATE_CANDIDATE | 0 | 0 |
| REVIEW | 0 | 0 |
| **ERROR** | **0** | **0** |
| **Total rows** | **4** | **4** |

### Image match summary

| Metric | Value |
|---|---|
| Rows with Image File Name | 4 |
| **Matched** | **4** |
| Missing | 0 |
| Not provided | 0 |
| Unreferenced uploads | 0 |

### Per-row detail

| Row | Action | Item Description | Classification | Image File Name | Image Status |
|---|---|---|---|---|---|
| 1 | CREATE | 18" Round Warli Art | **CREATE** | `warli-round-18.png` | matched |
| 2 | CREATE | 10" Round Warli Art | **CREATE** | `warli-round-10.png` | matched |
| 3 | CREATE | Decorative Tray 11" | **CREATE** | `mixed-tray-11.png` | matched |
| 4 | CREATE | 3 Partition Square Box with Handle | **CREATE** | `texture-box-3part.png` | matched |

No per-row errors. No per-row warnings.

### Validation checklist (per ticket)

| # | Check | Result |
|---|---|---|
| 1 | Inventory Preview ran successfully | ✅ HTTP 200 |
| 2 | Workbook sheet detected correctly | ✅ `Inventory_Import` |
| 3 | Header detected (all columns) | ✅ 19/19 |
| 4 | All 4 rows classified correctly | ✅ 4 CREATE |
| 5 | CREATE / UPDATE / REVIEW / ERROR counts | ✅ 4 / 0 / 0 / 0 |
| 6 | All 4 images matched | ✅ 4/4 matched |
| 7 | No missing-image warnings | ✅ 0 missing |
| 8 | No unsafe filename warnings | ✅ No warnings of any kind |
| 9 | Preview caused no database writes | ✅ Read-only endpoint |
| 10 | Package ready for ISYNC-18-02 | ✅ — see below |

---

## Phase 1 — Readiness Check (2026-07-26, historical)

Phase 1 ran before ISYNC-18-00 (the package build) was complete. It found the following
blockers, which have since been resolved:

| Blocker | Severity | Resolution |
|---|---|---|
| No workbook in INV-03-10 format | HARD | Resolved by ISYNC-18-00 — draft workbook built |
| No image ZIP | HARD | Resolved — `ISYNC-18-import-images-DRAFT.zip` placed and validated |
| BUS-REVIEW-01 decisions pending | SECONDARY | Still open — does not affect Preview or the 4-row package |

**Phase 1 full detail** is preserved below for reference.

### Workbook candidates examined (Phase 1)

All `.xlsx` files in the repository at Phase 1 time were inspected. None were in INV-03-10 format:

- `shipmentDetails_20260628_corrected_inv03b_image-file-name.xlsx` — sales/accounting record,
  missing `Action`, `Inventory Status`, `Existing Artwork ID`; not an import workbook
- `shipmentDetails_20260624_corrected_inv03b.xlsx` — same structure, no Image File Name column
- `Chitrakala_Inventory_Sync_INV03_02_UPDATE_Validated.xlsx` — legacy multi-sheet INV-03 format,
  no `Inventory_Import` sheet, incompatible parser schema
- `Chitrakala_Inventory_Sync_INV03_01_REVIEW_Resolved.xlsx` — same legacy format
- `Chitrakala_Inventory_Sync_v2_ReadyForCodingAgent.xlsx` — older version of same legacy format

The canonical template (`INV-03-10-production-workbook-template-FINAL-CORRECTED.xlsx`) was not
committed to the repository. It was placed in `_private/inventory-import/` (gitignored) before
Phase 2. The ISYNC-18-00 draft workbook was built from that template.

---

## Rows Needing Correction Before Apply

No corrections needed based on Preview. All 4 rows classified as clean CREATE with no errors
or warnings.

**Before Apply can be scheduled (separate ticket):**
- Materials field is blank on all 4 rows — owner must fill in before admin approval
- Item descriptions need owner review for public-facing accuracy
- Owner Review Needed = TRUE on all 4 rows — admin must review each record after import
  and before any row is published (`show_on_website = TRUE`)

These are not blockers for Preview and are not errors — they reflect the current
NEEDS_REVIEW + show_on_website=FALSE import policy. Apply can proceed once the owner
approves, under a separate ticket.

---

## BUS-REVIEW-01 Decision Status

11 business decisions remain open. None affect the current 4-row controlled package.
They affect the scope of any future expanded import run.

| # | Topic | Status | Affects current package |
|---|---|---|---|
| 1 | SKU assignment for existing 38 artworks | PENDING | No (CREATE rows, no UPDATE) |
| 2 | Initial status/quantity defaults | PENDING | No (all NEEDS_REVIEW, qty=1) |
| 3 | Dimensions field strategy | PENDING | No (informational) |
| 4 | Saree/textile dimensions wording | PENDING | No |
| 5 | Image filename strategy | PENDING | No (images validated separately) |
| 6a | Duplicate "Coaster Set (4 pieces)" titles | PENDING | No |
| 6b | Duplicate "Decorative Wall Panel" titles | PENDING | No |
| 7 | Missing pricing variants (2 artworks) | PENDING | No |
| 8 | Generic title "Mirror Mosaic artwork" | PENDING | No |
| 9 | Lippan materials correction | PENDING | No |
| 10 | Textile-design category handling | PENDING | No |
| 11 | Empty category handling (warli-art, mixed-art) | RESOLVED — WEB-CAT-01 merged | N/A |

---

## Safety Confirmations

- ✅ Apply endpoint not called
- ✅ Production import not run
- ✅ Production data not modified
- ✅ No artwork/category/pricing/SKU/inventory data changed
- ✅ Production API access was read-only only (login + Preview POST — no writes)
- ✅ Maintenance mode not touched
- ✅ `server/.env` not committed
- ✅ No migration run
- ✅ No SKU backfill performed
- ✅ No price recalculation performed
- ✅ No secrets committed
- ✅ No temp scripts committed
- ✅ Private workbook not committed (`_private/` is gitignored)
- ✅ Image ZIP not committed (`_private/` is gitignored)

---

## ISYNC-18-01 Status

**COMPLETE** — Preview passed. All 4 rows valid CREATE. All 4 images matched. No errors.

## ISYNC-18-02 Status

**ISYNC-18-02 can start.** The 4-row controlled import package has passed Preview
validation. There are no blocking issues for the package.

ISYNC-18-02 is the Price Readiness Audit and INV-PRICE-01 Gate — not Apply.
Apply requires a separate approved ticket and owner sign-off after ISYNC-18-02.
