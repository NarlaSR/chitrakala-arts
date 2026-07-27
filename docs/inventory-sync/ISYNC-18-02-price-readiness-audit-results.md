# ISYNC-18-02 — Price Readiness Audit and INV-PRICE-01 Gate Results

**Branch:** `feature/ISYNC-18-02-price-readiness-audit`
**Date:** 2026-07-27
**Status:** COMPLETE — INV-PRICE-01 not needed for this controlled batch

**Workbook reviewed:**
`_private/inventory-import/ISYNC-18-production-import-package-DRAFT.xlsx` (gitignored, not committed)

---

## Preflight Confirmation

| Check | Result |
|---|---|
| Branch | `feature/ISYNC-18-02-price-readiness-audit` ✅ |
| Created from | synced main (`4ae17bf`) ✅ |
| ISYNC-18-00 in main | ✅ commits `664f284`, `16b9706`, merge `35cdb31` |
| ISYNC-18-01 in main | ✅ commits `0fa02ad`, `01cb1a5`, merge `4ae17bf` |
| Workbook exists | ✅ 6,280 bytes |
| Image ZIP exists | ✅ 9,554,812 bytes |
| `_private/` gitignored | ✅ `.gitignore` line 70 |
| Private files tracked | ✅ None |
| `server/.env` tracked | ✅ Not tracked |
| Git status | ✅ Clean (unrelated untracked files only) |

---

## Step 1 — Current Pricing Constraints

### Artwork-level pricing

The `artworks` table stores two price columns:

| Column | Type | Behaviour |
|---|---|---|
| `price_inr` | `NUMERIC(10,2)` | INR price — set from workbook `Price INR` column during import |
| `price_usd` | `NUMERIC(10,2)` | USD price — **always calculated by server**, never taken from workbook |

During Apply, the server fetches `fx_rate` and `usd_multiplier` from `app_settings`, then
calls `calculateUsdPrice(priceInr, fxRate, multiplier)` for every row. The workbook
`Price USD` column is parsed and stored on the parsed row object but marked *"reference
only"* — it is not written to the database.

### artwork_sizes.price behaviour

The `artwork_sizes` table holds per-size price rows. The import Apply endpoint does **not**
create `artwork_sizes` rows from the workbook. `Size Label` in the workbook is carried as
metadata on the parsed row object but is not included in the DB INSERT/UPDATE payload. No
`artwork_sizes` entries are created or modified by import Apply.

### Size-level Price on Request — not supported

The parser (`inventoryParser.js`) enforces the following rule (lines 315–321):

```
if (priceOnRequest === true && sizeLabel is set) → ERROR
"Size-level Price on Request is not supported (Size Label: '…').
 Price INR must be a numeric value for size-based artworks.
 Size-level Price on Request is deferred to INV-PRICE-01."
```

This error fires only when `Price on Request = TRUE` AND `Size Label` is non-blank.
A row with `Price on Request = FALSE` and a `Size Label` is valid — the size label
is treated as descriptive metadata only.

### Artwork-level Price on Request — supported

When `Price on Request = TRUE` and `Size Label` is blank, the row is valid: `Price INR`
is allowed to be blank, and the artwork is stored without a price. This case is separate
from INV-PRICE-01.

### Pricing assumptions confirmed (production, read-only GET)

Endpoint: `GET /api/pricing-settings` (authenticated, read-only)

| Setting | Value in production | Expected (INV-03-10 template) | Match |
|---|---|---|---|
| `fx_rate` | **92.4** | 92.4 | ✅ |
| `usd_multiplier` | **2.25** | 2.25 | ✅ |

Both values match the documented assumptions.

---

## Step 2 — Row-by-Row Price Audit

### Row 1 — 18" Round Warli Art

| Field | Value | Assessment |
|---|---|---|
| Action | CREATE | — |
| Category | warli-art | Valid |
| Quantity | 1 | Valid integer |
| Price INR | **7,000** | ✅ Numeric, positive |
| Price USD | (blank) | ✅ Correct — backend calculates: ~$170.45 |
| Price on Request | FALSE | ✅ No POR |
| Size Label | Large | ✅ Descriptive metadata only — not a size-level pricing trigger |
| Any blank/TBD/N/A/POR | None | ✅ |
| Pricing verdict | **Safe to Apply** | All pricing fields valid |
| Expected USD (calc) | 7000 ÷ 92.4 × 2.25 ≈ **$170.45** | — |

Owner follow-ups:
- Materials: blank — must fill before publishing (does not block Apply)

### Row 2 — 10" Round Warli Art

| Field | Value | Assessment |
|---|---|---|
| Action | CREATE | — |
| Category | warli-art | Valid |
| Quantity | 1 | Valid integer |
| Price INR | **2,500** | ✅ Numeric, positive |
| Price USD | (blank) | ✅ Correct — backend calculates: ~$60.88 |
| Price on Request | FALSE | ✅ No POR |
| Size Label | Medium | ✅ Descriptive metadata only |
| Any blank/TBD/N/A/POR | None | ✅ |
| Pricing verdict | **Safe to Apply** | All pricing fields valid |
| Expected USD (calc) | 2500 ÷ 92.4 × 2.25 ≈ **$60.88** | — |

Owner follow-ups:
- Materials: blank — must fill before publishing (does not block Apply)
- No image in source; image must be uploaded via admin UI before publishing (does not block Apply — image file is in ZIP and will be applied)

### Row 3 — Decorative Tray 11"

| Field | Value | Assessment |
|---|---|---|
| Action | CREATE | — |
| Category | mixed-art | Valid |
| Quantity | 1 | Valid integer |
| Price INR | **1,100** | ✅ Numeric, positive |
| Price USD | (blank) | ✅ Correct — backend calculates: ~$26.79 |
| Price on Request | FALSE | ✅ No POR |
| Size Label | Medium | ✅ Descriptive metadata only |
| Any blank/TBD/N/A/POR | None | ✅ |
| Pricing verdict | **Safe to Apply** | All pricing fields valid |
| Expected USD (calc) | 1100 ÷ 92.4 × 2.25 ≈ **$26.79** | — |

Owner follow-ups:
- Materials: blank — must fill before publishing (does not block Apply)
- Item description "Decorative Tray 11"" is functional but may benefit from a more
  descriptive public title — informational only

### Row 4 — 3 Partition Square Box with Handle

| Field | Value | Assessment |
|---|---|---|
| Action | CREATE | — |
| Category | texture-art | Valid |
| Quantity | 1 | Valid integer |
| Price INR | **1,600** | ✅ Numeric, positive |
| Price USD | (blank) | ✅ Correct — backend calculates: ~$38.96 |
| Price on Request | FALSE | ✅ No POR |
| Size Label | Small | ✅ Descriptive metadata only |
| Any blank/TBD/N/A/POR | None | ✅ |
| Pricing verdict | **Safe to Apply** | All pricing fields valid |
| Expected USD (calc) | 1600 ÷ 92.4 × 2.25 ≈ **$38.96** | — |

Owner follow-ups:
- Materials: blank — must fill before publishing (does not block Apply)
- Dimension: blank — owner should add physical dimensions before publishing (does not
  block Apply)
- Item description is functional; owner may want a more descriptive public title —
  informational only

### Price audit summary

| Row | Item | Price INR | Numeric | POR | Size POR trigger | USD (calc) | Apply safe |
|---|---|---|---|---|---|---|---|
| 1 | 18" Round Warli Art | 7,000 | ✅ | FALSE | ✅ No | ~$170.45 | ✅ |
| 2 | 10" Round Warli Art | 2,500 | ✅ | FALSE | ✅ No | ~$60.88 | ✅ |
| 3 | Decorative Tray 11" | 1,100 | ✅ | FALSE | ✅ No | ~$26.79 | ✅ |
| 4 | 3 Partition Square Box | 1,600 | ✅ | FALSE | ✅ No | ~$38.96 | ✅ |

**No POR cases. No non-numeric prices. No size-level Price on Request. All 4 rows safe.**

---

## Step 3 — INV-PRICE-01 Decision

### Assumption to confirm

> "INV-PRICE-01 is not needed for this 4-row controlled batch because all rows have
> valid numeric INR prices and no row requires size-level Price on Request."

### Decision: **C — INV-PRICE-01 is not needed for this controlled batch**

**The assumption is correct.**

Rationale:

1. **All 4 rows have valid numeric Price INR.** Values 7,000 / 2,500 / 1,100 / 1,600 are
   all non-negative integers. The parser requires `Price INR` to be a non-negative number
   when `Price on Request = FALSE`. All 4 rows satisfy this.

2. **No row has Price on Request = TRUE.** The POR flag is FALSE on all 4 rows.
   The size-level POR error in the parser (`inventoryParser.js` lines 315–321) is only
   triggered when `priceOnRequest = TRUE` AND `sizeLabel` is non-blank. That condition
   does not apply here.

3. **Size Label values are descriptive metadata only.** The Apply endpoint does not
   create `artwork_sizes` rows from the workbook. The `basePayload` written to the DB
   does not include `sizeLabel`. The size labels (Large, Medium, Small) record the
   physical size of each artwork as context but do not create size-pricing entries.

4. **USD price is handled automatically.** The backend calculates `price_usd` at Apply
   time using the confirmed production settings (`fx_rate=92.4`, `usd_multiplier=2.25`).
   No manual USD entry is needed, and no INV-PRICE-01 recalculation is required.

5. **INV-PRICE-01 scope** is size-level Price on Request (and related size-tier pricing
   for existing artworks). None of the 4 CREATE rows involve that scope.

---

## Step 4 — Owner Follow-ups

### Blocks controlled Apply

None. All 4 rows are priced and ready from a pricing perspective.

### Blocks later publishing (must resolve before admin approves any row for public display)

| Row | Item | Issue |
|---|---|---|
| All 4 | All rows | **Materials is blank** — parser accepts blank Materials, but the public product detail page should display materials. Owner must fill in before marking any row public. |
| Row 1 | 18" Round Warli Art | No additional blocking items |
| Row 2 | 10" Round Warli Art | No additional blocking items |
| Row 3 | Decorative Tray 11" | Item description may benefit from a more descriptive public title |
| Row 4 | 3 Partition Square Box | Dimension is blank — physical dimensions should be added before publishing |

All 4 rows will be created as `status = NEEDS_REVIEW` and `show_on_website = FALSE`
by the Apply endpoint (conservative import policy). No row becomes public until the admin
explicitly edits it and saves with `show_on_website = TRUE`.

### Informational only

| Row | Item | Note |
|---|---|---|
| Rows 1–2 | Warli Art (Large and Medium) | Two separate artwork records for 18" and 10" round Warli Art. The Size Label (Large/Medium) reflects physical size, not a size-pricing variant. This is correct per INV-03-10 Field_Rules ("separate artworks for different designs, colors, or styles"). |
| All 4 | Owner Review Needed = TRUE | The workbook sets `Owner Review Needed = TRUE` on all 4 rows. The admin UI will reflect this flag after import. |
| All 4 | SKU | All 4 rows have blank SKU (correct for CREATE). SKU is auto-generated by the app on first admin save when the artwork is public/orderable. |

---

## Pricing Assumptions Verified

| Assumption | Source | Verified |
|---|---|---|
| fx_rate = 92.4 | Production `GET /api/pricing-settings` | ✅ |
| usd_multiplier = 2.25 | Production `GET /api/pricing-settings` | ✅ |
| USD is backend-calculated, not workbook-supplied | `inventoryParser.js` line 376: `priceUsd, // reference only` | ✅ |
| Size-level POR requires INV-PRICE-01 | `inventoryParser.js` lines 315–321 | ✅ |
| Apply does not create artwork_sizes rows | `server.js` Apply basePayload (no sizeLabel field) | ✅ |
| Blank Price USD in workbook is correct | Parser + Apply both treat it as reference-only | ✅ |

---

## Safety Confirmations

- ✅ Apply endpoint not called
- ✅ Production import not run
- ✅ Production data not modified
- ✅ No artwork/category/pricing/SKU/inventory data changed
- ✅ Production API access was read-only only (login + GET /api/pricing-settings)
- ✅ INV-PRICE-01 not implemented
- ✅ ARCH-INV-02 not started
- ✅ No price recalculation performed
- ✅ No SKU backfill performed
- ✅ `server/.env` not committed
- ✅ Private workbook not committed (`_private/` gitignored)
- ✅ Image ZIP not committed
- ✅ No temp scripts committed

---

## ISYNC-18-02 Status

**COMPLETE** — Price readiness confirmed. INV-PRICE-01 decision: **C (not needed)**.

## ISYNC-18-03 Status

**ISYNC-18-03 can start.** All pricing constraints have been verified. The 4-row controlled
import package is cleared for the Apply runbook when the owner is ready to proceed.

ISYNC-18-03 scope (Apply runbook and owner review) requires a separate approved ticket.
Apply must not be run under this ticket.
