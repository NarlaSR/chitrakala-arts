# ISYNC-18-03 — Controlled Production Apply Runbook

**Branch:** `feature/ISYNC-18-03-controlled-apply-runbook`  
**Date:** 2026-07-27  
**Status:** RUNBOOK ONLY — Apply has not been executed  
**Applies to:** ISYNC-18-04 (execution ticket)

---

## Overview

This runbook covers the first controlled production Inventory Apply for Chitrakala Arts.
The import package contains 4 new artworks from the July 2026 shipment.
The Apply endpoint creates all rows as `NEEDS_REVIEW` with `show_on_website = false` —
no artwork becomes public without an explicit admin edit and save after the import.

### Package summary

| Row | Item | Category | Price INR | Expected USD | Image file |
|---|---|---|---|---|---|
| 1 | 18" Round Warli Art | warli-art | ₹7,000 | ~$170.45 | warli-round-18.png |
| 2 | 10" Round Warli Art | warli-art | ₹2,500 | ~$60.88 | warli-round-10.png |
| 3 | Decorative Tray 11" | mixed-art | ₹1,100 | ~$26.79 | mixed-tray-11.png |
| 4 | 3 Partition Square Box | texture-art | ₹1,600 | ~$38.96 | texture-box-3part.png |

All 4 rows: Action=CREATE, SKU=blank, Qty=1, Price on Request=FALSE,
Inventory Status=NEEDS\_REVIEW, show\_on\_website=FALSE, Owner Review Needed=TRUE.

USD prices are calculated by the server at Apply time using production settings
`fx_rate=92.4`, `usd_multiplier=2.25` — workbook Price USD column is blank (correct).

**Known follow-ups that do not block Apply** (must resolve before publishing):
- Materials is blank on all 4 rows
- Dimension is blank on Row 4 (3 Partition Square Box)

### Prerequisite tickets

| Ticket | Status | Evidence |
|---|---|---|
| ISYNC-18-00 (package build) | Complete | Merged to main (`35cdb31`) |
| ISYNC-18-01 (Preview validation) | Complete — Preview passed | Merged to main (`4ae17bf`) |
| ISYNC-18-02 (price readiness) | Complete — INV-PRICE-01 not needed | Merged to main (`c70b208`) |

---

## A. Pre-Apply Owner Approval Checklist

Owner must confirm all items below before operator runs Apply.
This checklist is the gate — do not proceed to Step B without owner sign-off.

| # | Item | Owner confirms |
|---|---|---|
| A1 | Draft workbook reviewed: all 4 Item Descriptions are correct | ☐ |
| A2 | All 4 Categories are correct (warli-art ×2, mixed-art ×1, texture-art ×1) | ☐ |
| A3 | All 4 Price INR values are correct (7000 / 2500 / 1100 / 1600) | ☐ |
| A4 | All 4 images have been reviewed and match the artwork descriptions | ☐ |
| A5 | Understood: all 4 rows land as NEEDS\_REVIEW + not visible on website — no artwork goes public from this Apply | ☐ |
| A6 | Understood: Materials blank (all 4) and Dimension blank (Row 4) must be filled before publishing — this is expected and does not block Apply | ☐ |
| A7 | Understood: SKU is generated automatically by the app on first admin save when the artwork is public/orderable — no SKU is created by Apply | ☐ |
| A8 | No owner-reported errors or corrections to the package since ISYNC-18-01 passed Preview | ☐ |
| A9 | Apply can proceed | ☐ |

---

## B. Production Backup

Take a full production DB backup before any DB change.
Do not proceed if the backup fails or produces a file smaller than 1 MB.

### Files required

- **Workbook:** `_private/inventory-import/ISYNC-18-production-import-package-DRAFT.xlsx` (gitignored, local only)
- **Image ZIP:** `_private/inventory-import/ISYNC-18-import-images-DRAFT.zip` (gitignored, local only)

### Backup command

```powershell
# Substitute the production DATABASE_URL password from server/.env
# Production host: crossover.proxy.rlwy.net:54308  DB: railway

$date = Get-Date -Format "yyyyMMdd"
$outFile = "C:\Development\backups\postgres\chitrakala_prod_${date}_pre_isync18.backup"

pg_dump "postgresql://postgres:<PASSWORD>@crossover.proxy.rlwy.net:54308/railway" `
  -Fc `
  -f $outFile

Write-Host "Backup written to: $outFile"
(Get-Item $outFile).Length | ForEach-Object { Write-Host "Size: $_ bytes" }
```

### Verification

```powershell
# File must exist and be >= 1 MB
$f = Get-Item "C:\Development\backups\postgres\chitrakala_prod_${date}_pre_isync18.backup"
if ($f.Length -lt 1MB) { Write-Error "Backup too small — STOP" }
```

### Stop condition

- Backup command exits non-zero → **STOP. Do not proceed.**
- Backup file missing or smaller than 1 MB → **STOP. Do not proceed.**

### Restore command (for rollback reference — do not run now)

```powershell
pg_restore -d "postgresql://postgres:<PASSWORD>@crossover.proxy.rlwy.net:54308/railway" `
  --clean --if-exists `
  "C:\Development\backups\postgres\chitrakala_prod_${date}_pre_isync18.backup"
```

---

## C. Production Baseline Capture

Record these values immediately after the backup, before running Apply.
Use a read-only production API call (GET only — no writes).

### Step C1 — Total public artwork count

```
GET https://chitrakalaarts-production.up.railway.app/api/artworks
```

Record: total count in response (expected ~38 as of ISYNC-18-00 check).

### Step C2 — Category breakdown (admin — authenticated)

```
GET https://chitrakalaarts-production.up.railway.app/api/admin/artworks
Authorization: Bearer <token>
```

Record the count of artworks per category slug, especially:
- `warli-art` (expected: 0)
- `mixed-art` (expected: 0)
- `texture-art` (expected: ≥1)

### Step C3 — NEEDS\_REVIEW count (admin)

From the admin artworks response, record how many rows have `status = NEEDS_REVIEW`
(expected: 0 before this Apply; this is the baseline to compare against post-Apply).

### Baseline record (fill in before Apply)

| Metric | Baseline value (fill in) |
|---|---|
| Total artworks (GET /api/artworks) | |
| Total artworks admin (GET /api/admin/artworks) | |
| warli-art count | |
| mixed-art count | |
| texture-art count | |
| NEEDS\_REVIEW count | |
| Public artworks (show\_on\_website=TRUE or status=IN\_STOCK) | |

---

## D. Final Preview Check (Run Immediately Before Apply)

Re-run Preview against production as the final gate check, immediately before Apply.
Preview is read-only — no DB writes.

### Command (Python — same pattern as run_preview.py in scratchpad)

```python
"""Final pre-Apply Preview check."""
import json, requests
from pathlib import Path

PROD     = "https://chitrakalaarts-production.up.railway.app"
WB_PATH  = Path("C:/Development/Projects/chitrakala-arts/_private/inventory-import/ISYNC-18-production-import-package-DRAFT.xlsx")
ZIP_PATH = Path("C:/Development/Projects/chitrakala-arts/_private/inventory-import/ISYNC-18-import-images-DRAFT.zip")

r = requests.post(f"{PROD}/api/auth/login",
                  json={"username": "cks-admin", "password": "sonu@786"}, timeout=15)
assert r.status_code == 200
token = r.json()["token"]

with open(WB_PATH, "rb") as wf, open(ZIP_PATH, "rb") as zf:
    resp = requests.post(
        f"{PROD}/api/admin/inventory-sync/preview",
        headers={"Authorization": f"Bearer {token}"},
        files={
            "file":     (WB_PATH.name,  wf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
            "imageZip": (ZIP_PATH.name, zf, "application/zip"),
        },
        timeout=60,
    )

print(f"HTTP {resp.status_code}")
data = resp.json()
s = data.get("summary", {})
im = data.get("imageSummary", {})
print(f"Sheet: {data.get('sheetUsed')}  Cols: {len(data.get('detectedColumns', []))}/19")
print(f"CREATE:{s.get('createCount')}  UPDATE:{s.get('updateCount')}  REVIEW:{s.get('reviewCount')}  ERROR:{s.get('errorCount')}")
print(f"Images: {im.get('matched')}/{im.get('rowsWithImageFilename')} matched")
print(f"Warnings: {data.get('warnings', [])}")
for i, row in enumerate(data.get("rows", []), 1):
    errs = row.get("errors", [])
    warns = row.get("warnings", [])
    print(f"  Row {i}: [{row.get('action')}] {row.get('itemDescription','')[:40]}  img={row.get('imageStatus')}  errors={errs}  warns={warns}")
```

### Expected result

| Check | Expected |
|---|---|
| HTTP status | 200 |
| Sheet | Inventory\_Import |
| Detected columns | 19/19 |
| CREATE count | 4 |
| UPDATE count | 0 |
| REVIEW count | 0 |
| ERROR count | 0 |
| Images matched | 4/4 |
| Batch warnings | none |
| Per-row errors | none on any row |

### Stop condition

Any deviation from the expected result → **STOP. Do not run Apply.** Investigate the
discrepancy. If the workbook or ZIP has changed, re-run ISYNC-18-01 Preview validation
before continuing.

---

## E. Apply Execution

**Do not run Apply until Sections A through D are complete and all stop conditions clear.**

Apply is a single atomic transaction for all 4 rows. If the transaction fails, the server
rolls back and nothing is written. Images are processed outside the transaction — an image
failure does not roll back the artwork rows, but is reported in the response.

### Command

```python
"""
ISYNC-18 Production Apply — 4-row controlled import.
Run only after: backup taken, baseline recorded, final Preview passed.
Save this file to scratchpad, not to the project repo.
"""
import json, requests
from pathlib import Path

PROD     = "https://chitrakalaarts-production.up.railway.app"
WB_PATH  = Path("C:/Development/Projects/chitrakala-arts/_private/inventory-import/ISYNC-18-production-import-package-DRAFT.xlsx")
ZIP_PATH = Path("C:/Development/Projects/chitrakala-arts/_private/inventory-import/ISYNC-18-import-images-DRAFT.zip")

r = requests.post(f"{PROD}/api/auth/login",
                  json={"username": "cks-admin", "password": "sonu@786"}, timeout=15)
assert r.status_code == 200, f"Login failed: {r.status_code}"
token = r.json()["token"]
print("Auth OK")

with open(WB_PATH, "rb") as wf, open(ZIP_PATH, "rb") as zf:
    resp = requests.post(
        f"{PROD}/api/admin/inventory-sync/apply",
        headers={"Authorization": f"Bearer {token}"},
        files={
            "file":     (WB_PATH.name,  wf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
            "imageZip": (ZIP_PATH.name, zf, "application/zip"),
        },
        timeout=120,
    )

print(f"HTTP {resp.status_code}")
data = resp.json()

# Save response locally (gitignored via _private/)
out = Path("C:/Development/Projects/chitrakala-arts/_private/apply-response.json")
out.write_text(json.dumps(data, indent=2), encoding="utf-8")
print(f"Response saved to: {out}")

# Print summary
s = data.get("summary", {})
print(f"\n--- Summary ---")
print(f"  createdCount : {s.get('createdCount')}")
print(f"  updatedCount : {s.get('updatedCount')}")
print(f"  skippedCount : {s.get('skippedCount')}")
print(f"  errorCount   : {s.get('errorCount')}")
print(f"  imagesStored : {s.get('imagesStored')}")
print(f"  imagesFailed : {s.get('imagesFailed')}")

print(f"\n--- Created artwork IDs (record these for rollback if needed) ---")
for row in data.get("created", []):
    print(f"  Row {row.get('rowNumber')}: {row.get('artworkId')}  title={row.get('title')}")

if data.get("imageFailures"):
    print(f"\n--- Image failures ---")
    for f in data["imageFailures"]:
        print(f"  {f}")
```

### Expected response

```json
{
  "summary": {
    "totalRows": 4,
    "createdCount": 4,
    "updatedCount": 0,
    "skippedCount": 0,
    "errorCount": 0,
    "imagesStored": 4,
    "imagesFailed": 0
  },
  "created": [
    {"rowNumber": ..., "artworkId": "art-<timestamp>-0", "sku": null, "title": "18\" Round Warli Art"},
    {"rowNumber": ..., "artworkId": "art-<timestamp>-1", "sku": null, "title": "10\" Round Warli Art"},
    {"rowNumber": ..., "artworkId": "art-<timestamp>-2", "sku": null, "title": "Decorative Tray 11\""},
    {"rowNumber": ..., "artworkId": "art-<timestamp>-3", "sku": null, "title": "3 Partition Square Box ..."}
  ],
  "updated": [],
  "skipped": [],
  "errors": []
}
```

**Record the 4 artwork IDs from the `created` array immediately.** They are required for
rollback (Section G) and for the ISYNC-18-04 report.

### Stop condition

- HTTP status != 200 → **STOP. Check response body. Confirm transaction rolled back (server logs: "rolled back"). Do not retry without investigating.**
- `errorCount` > 0 → **STOP. Review error details.**
- `imagesFailed` > 0 → **STOP. Review image failure details before proceeding to validation.**

---

## F. Post-Apply Validation Checklist

Run all checks immediately after a successful Apply (HTTP 200, createdCount=4).

### F1 — Artwork count (admin)

```
GET /api/admin/artworks
```

| Metric | Expected | Actual |
|---|---|---|
| Total artworks | baseline + 4 | |
| warli-art count | baseline warli + 2 | |
| mixed-art count | baseline mixed + 1 | |
| texture-art count | baseline texture + 1 | |

### F2 — Public API count unchanged

```
GET /api/artworks
```

Public count must equal the pre-Apply baseline (no new artwork is public).

| Check | Expected | Actual |
|---|---|---|
| Total public artworks | baseline (unchanged) | |

### F3 — New rows: status and visibility

For each of the 4 artwork IDs from the Apply response:

```
GET /api/admin/artworks/<artworkId>
Authorization: Bearer <token>
```

| Check | Expected for all 4 rows |
|---|---|
| `status` | `NEEDS_REVIEW` |
| `show_on_website` | `false` |
| `sku` | `null` |
| `featured` | `false` |
| `image` | Absolute URL (`/api/images/artworks/<id>`) — confirms image stored |

### F4 — Prices on new rows

| Artwork | Expected price\_inr | Expected price\_usd |
|---|---|---|
| 18" Round Warli Art | 7000.00 | ~170.45 |
| 10" Round Warli Art | 2500.00 | ~60.88 |
| Decorative Tray 11" | 1100.00 | ~26.79 |
| 3 Partition Square Box | 1600.00 | ~38.96 |

Price USD is calculated at Apply time from live production settings
`fx_rate=92.4 / usd_multiplier=2.25`. Minor rounding (±0.01) is acceptable.

### F5 — Category landing pages (public)

Verify no new artwork appears on the public-facing category pages. The 4 new rows have
`show_on_website=false` and must be invisible to the public catalog.

- `GET /api/artworks?category=warli-art` — count unchanged from baseline
- `GET /api/artworks?category=mixed-art` — count unchanged from baseline
- `GET /api/artworks?category=texture-art` — count unchanged from baseline

### F6 — Admin Review Queue

Log in to the admin panel and open the Review Queue. Confirm:
- All 4 new artworks appear in NEEDS\_REVIEW state
- Owner Review Needed flag is set on all 4
- Images are visible in the admin UI for all 4 rows

---

## G. Cleanup / Rollback Plan

### Scenario 1 — Apply transaction error (HTTP non-200 or "rolled back" in logs)

The server returns an error and explicitly rolls back. Nothing was written to production.
No rollback action required. Investigate the error, fix the root cause, then re-run from
Section D (final Preview check) when ready.

### Scenario 2 — Apply succeeded but post-Apply validation fails

If post-Apply validation (Section F) reveals unexpected state, stop and assess.
Do not publish or edit any artwork until the discrepancy is resolved.

**Option A — Targeted SQL cleanup (preferred for controlled recovery of the 4 import rows)**

Use the 4 artwork IDs recorded from the Apply response.

```sql
-- Connect to production DB: crossover.proxy.rlwy.net:54308/railway
-- Confirm the IDs match the expected creation timestamp before deleting.

-- 1. Review what will be deleted
SELECT id, title, category, status, show_on_website, created_at
FROM artworks
WHERE id IN (
  'art-<timestamp>-0',
  'art-<timestamp>-1',
  'art-<timestamp>-2',
  'art-<timestamp>-3'
);

-- 2. Delete the 4 rows (image_data is in artworks table — no separate table to clean)
DELETE FROM artworks
WHERE id IN (
  'art-<timestamp>-0',
  'art-<timestamp>-1',
  'art-<timestamp>-2',
  'art-<timestamp>-3'
);

-- 3. Verify count returns to baseline
SELECT COUNT(*) FROM artworks;

-- 4. Verify no NEEDS_REVIEW rows remain (if baseline was 0)
SELECT COUNT(*) FROM artworks WHERE status = 'NEEDS_REVIEW';
```

Note: `image_data` and `image_mime_type` are columns in the `artworks` table.
Deleting the artwork row removes the image data. No separate image table to clean.

**Option B — Full DB restore from backup (for severe data corruption or unknown state)**

Use the restore command from Section B. This reverts the entire database to the
pre-Apply snapshot. All changes since the backup are lost — use only if targeted
cleanup is not possible.

---

## H. Stop Conditions

Stop immediately and do not proceed if any of the following occur:

| # | Condition | When |
|---|---|---|
| H1 | Backup missing or < 1 MB | After B — before any production write |
| H2 | Backup command exits non-zero | After B |
| H3 | Final Preview (Section D) returns non-200 | Before Apply |
| H4 | Final Preview shows ERROR count > 0 | Before Apply |
| H5 | Final Preview shows images matched < 4/4 | Before Apply |
| H6 | Final Preview shows any batch warnings | Before Apply — investigate first |
| H7 | Apply returns non-200 HTTP status | At Apply |
| H8 | Apply response `errorCount` > 0 | At Apply |
| H9 | Apply response `createdCount` != 4 | At Apply |
| H10 | Apply response `imagesFailed` > 0 | At Apply — investigate before continuing validation |
| H11 | Post-Apply total artwork count != baseline + 4 | Section F |
| H12 | Any new artwork has `show_on_website = true` | Section F — this must never happen |
| H13 | Any new artwork has `status` != `NEEDS_REVIEW` | Section F |
| H14 | Any new artwork appears in public `/api/artworks` response | Section F |
| H15 | Price values differ from expected by more than ₹1 / $0.05 | Section F |
| H16 | Network error or timeout during Apply | At Apply — do not retry without confirming DB state |

When any stop condition is hit: pause, record what was observed, and do not take
further action on production until the root cause is understood.

---

## I. ISYNC-18-04 Final Report Template

Copy this template into `docs/inventory-sync/ISYNC-18-04-controlled-production-apply-results.md`
and fill in actual values after the Apply is complete.

```markdown
# ISYNC-18-04 — Controlled Production Apply Results

**Date:** <YYYY-MM-DD>
**Branch:** feature/ISYNC-18-04-...
**Operator:** <name>
**Status:** <COMPLETE / BLOCKED / PARTIAL>

---

## Apply Package

| Row | Item | Category | Price INR | artworkId |
|---|---|---|---|---|
| 1 | 18" Round Warli Art | warli-art | 7,000 | <art-id> |
| 2 | 10" Round Warli Art | warli-art | 2,500 | <art-id> |
| 3 | Decorative Tray 11" | mixed-art | 1,100 | <art-id> |
| 4 | 3 Partition Square Box | texture-art | 1,600 | <art-id> |

---

## Pre-Apply Checklist

| Step | Result |
|---|---|
| Owner approval (Section A) | ✅ / ❌ |
| Backup taken (Section B) | ✅ / ❌ — <filename> (<size> bytes) |
| Baseline captured (Section C) | ✅ — baseline: <N> artworks |
| Final Preview (Section D) | ✅ HTTP 200 / ❌ |

---

## Apply Result

| Field | Value |
|---|---|
| HTTP status | |
| createdCount | |
| updatedCount | |
| skippedCount | |
| errorCount | |
| imagesStored | |
| imagesFailed | |

---

## Post-Apply Validation

| Check | Expected | Actual | Result |
|---|---|---|---|
| Total artworks (admin) | baseline + 4 | | |
| warli-art count | baseline + 2 | | |
| mixed-art count | baseline + 1 | | |
| texture-art count | baseline + 1 | | |
| Public artwork count | baseline (unchanged) | | |
| All 4 new rows: status NEEDS_REVIEW | yes | | |
| All 4 new rows: show_on_website = false | yes | | |
| All 4 new rows: sku = null | yes | | |
| All 4 new rows: image URL set | yes | | |
| Admin Review Queue shows 4 new rows | yes | | |

---

## Stop Conditions Hit

<None — or list conditions triggered and resolution>

---

## Owner Follow-up Actions

After the admin reviews the 4 rows in the Review Queue:

- Fill in Materials for all 4 rows before publishing
- Fill in Dimension for Row 4 (3 Partition Square Box) before publishing
- Review and update Item Descriptions if desired
- Set show_on_website = TRUE and status = IN_STOCK only when each artwork is ready to go public

---

## Safety Confirmations

- ✅ / ❌ No artwork published from this Apply
- ✅ / ❌ No SKU generated by Apply (auto-generated on first admin save when public)
- ✅ / ❌ server/.env not committed
- ✅ / ❌ Private workbook not committed
- ✅ / ❌ Image ZIP not committed
- ✅ / ❌ Apply response saved to _private/ (gitignored)

---

## ISYNC-18-03 Runbook Reference

Runbook: `docs/inventory-sync/ISYNC-18-03-controlled-production-apply-runbook.md`
```

---

## Safety Confirmations (this ticket)

- ✅ Apply endpoint not called in ISYNC-18-03
- ✅ Production data not modified
- ✅ No artwork published
- ✅ No price recalculation performed
- ✅ No SKU backfill performed
- ✅ server/.env not committed
- ✅ Private workbook not committed (`_private/` gitignored)
- ✅ Image ZIP not committed
- ✅ INV-PRICE-01 not implemented
- ✅ ARCH-INV-02 not started

---

## ISYNC-18-03 Status

**COMPLETE** — Runbook created. Execution proceeds under ISYNC-18-04.
