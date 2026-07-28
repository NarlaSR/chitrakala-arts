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

## Credential Safety

**Never commit production credentials to this repository or any repository.**

- Load admin credentials from environment variables at script runtime:
  - `CHITRAKALA_ADMIN_USERNAME`
  - `CHITRAKALA_ADMIN_PASSWORD`
- Alternatively, use `getpass.getpass()` so the password is prompted interactively and
  never appears in source code, shell history, or terminal output.
- Never paste real passwords into runbook scripts, inline comments, or example commands.
- Never log credential values. `print("Auth OK")` is acceptable; `print(password)` is not.
- Before any commit, confirm `server/.env` is not staged: run `git status --short` and
  verify `server/.env` is absent from the staged list.
- After running a script, delete the temporary script file from the scratchpad.
  Do not save scripts containing credentials to the project repo.
- Clear shell history entries that contained credential values if necessary.

The Python script templates in Sections D and E use environment variables for credentials.
Set those variables in your shell before running the script — do not edit the source to
embed the password inline.

---

## A. Pre-Apply Owner Approval Checklist

**Owner approval must be obtained outside this document — confirm via Jira or chat before
ISYNC-18-04 execution begins.** The checkbox table below is a reference summary only.
A checked box in this file is not sufficient authorization. The operator must have a
separate, explicit message or Jira approval from the owner before proceeding to Step B.

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
# Do not paste the password into terminal history — set it as a variable.

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

Record all values below immediately after the backup, before running Apply.
These values are used in Section F to confirm Apply had exactly the expected effect.
Use read-only calls only (GET for API, SELECT for DB — no writes).

### C1 — API-accessible counts

```
# Authenticate (credentials from env — see Credential Safety section)
POST /api/auth/login  →  save token

# Public artworks (no auth required)
GET /api/artworks

# Admin artworks (all statuses, all categories)
GET /api/admin/artworks
Authorization: Bearer <token>

# Categories
GET /api/categories
```

**Public artwork definition:** An artwork is publicly visible when
`status IN ('IN_STOCK', 'MADE_TO_ORDER') AND show_on_website = true`.
The GET /api/artworks endpoint returns only artworks meeting this definition.
The 4 imported rows will have status=NEEDS\_REVIEW and show\_on\_website=false —
they do not qualify and must not appear in the public response.

### C2 — DB-level counts (psql)

```sql
-- Connect: postgresql://postgres:<PASSWORD>@crossover.proxy.rlwy.net:54308/railway

SELECT COUNT(*) AS artwork_sizes_count   FROM artwork_sizes;
SELECT COUNT(*) AS order_requests_count  FROM order_requests;
SELECT COUNT(*) AS order_request_items_count FROM order_request_items;
SELECT COUNT(*) AS categories_count      FROM categories;

SELECT key, value
FROM app_settings
WHERE key IN ('fx_rate', 'usd_multiplier', 'maintenance_mode');
```

### C3 — Baseline record (fill in before Apply)

| Metric | Baseline value (fill in) |
|---|---|
| Total artworks — admin (`/api/admin/artworks`) | |
| Total artworks — public (`/api/artworks`) | |
| artwork\_sizes count (DB) | |
| categories count (DB or `/api/categories`) | |
| order\_requests count (DB) | |
| order\_request\_items count (DB) | |
| `fx_rate` (app\_settings) | |
| `usd_multiplier` (app\_settings) | |
| `maintenance_mode` (app\_settings) | |
| NEEDS\_REVIEW count (admin artworks, status = NEEDS\_REVIEW) | |
| warli-art count (admin, all statuses) | |
| mixed-art count (admin, all statuses) | |
| texture-art count (admin, all statuses) | |

### C4 — Expected changes after Apply

| Metric | Expected change |
|---|---|
| Total artworks admin | +4 |
| Total artworks public | unchanged (0 new public artworks) |
| artwork\_sizes | unchanged |
| categories | unchanged |
| order\_requests | unchanged |
| order\_request\_items | unchanged |
| fx\_rate | unchanged |
| usd\_multiplier | unchanged |
| maintenance\_mode | unchanged |
| NEEDS\_REVIEW count | +4 |
| warli-art count (admin) | +2 |
| mixed-art count (admin) | +1 |
| texture-art count (admin) | +1 |

---

## D. Final Preview Check (Run Immediately Before Apply)

Re-run Preview against production as the final gate check, immediately before Apply.
Preview is read-only — no DB writes.

### Command

Save this script to the scratchpad directory. Do not commit it.
Set `CHITRAKALA_ADMIN_USERNAME` and `CHITRAKALA_ADMIN_PASSWORD` in your shell before running.

```python
"""Final pre-Apply Preview check. Save to scratchpad — do not commit."""
import json, os, getpass, requests
from pathlib import Path

PROD     = "https://chitrakalaarts-production.up.railway.app"
WB_PATH  = Path("C:/Development/Projects/chitrakala-arts/_private/inventory-import/ISYNC-18-production-import-package-DRAFT.xlsx")
ZIP_PATH = Path("C:/Development/Projects/chitrakala-arts/_private/inventory-import/ISYNC-18-import-images-DRAFT.zip")

username = os.environ.get("CHITRAKALA_ADMIN_USERNAME") or input("Admin username: ")
password = os.environ.get("CHITRAKALA_ADMIN_PASSWORD") or getpass.getpass("Admin password: ")

r = requests.post(f"{PROD}/api/auth/login",
                  json={"username": username, "password": password}, timeout=15)
assert r.status_code == 200, f"Login failed: {r.status_code}"
token = r.json()["token"]
print("Auth OK")

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

Save this script to the scratchpad directory. Do not commit it.
Set `CHITRAKALA_ADMIN_USERNAME` and `CHITRAKALA_ADMIN_PASSWORD` in your shell before running.

```python
"""
ISYNC-18 Production Apply — 4-row controlled import.
Run only after: backup taken, baseline recorded, final Preview passed.
Save to scratchpad — do not commit to the project repo.
"""
import json, os, getpass, requests
from pathlib import Path

PROD     = "https://chitrakalaarts-production.up.railway.app"
WB_PATH  = Path("C:/Development/Projects/chitrakala-arts/_private/inventory-import/ISYNC-18-production-import-package-DRAFT.xlsx")
ZIP_PATH = Path("C:/Development/Projects/chitrakala-arts/_private/inventory-import/ISYNC-18-import-images-DRAFT.zip")

username = os.environ.get("CHITRAKALA_ADMIN_USERNAME") or input("Admin username: ")
password = os.environ.get("CHITRAKALA_ADMIN_PASSWORD") or getpass.getpass("Admin password: ")

r = requests.post(f"{PROD}/api/auth/login",
                  json={"username": username, "password": password}, timeout=15)
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

### Expected response shape

Artwork IDs are generated at Apply time in the form `art-{timestamp}-{index}`, where
timestamp (milliseconds since epoch) and index are determined at runtime.
Do not assume specific ID values — record the exact IDs from the actual response.

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
    {"rowNumber": "<N>", "artworkId": "<record actual ID>", "sku": null, "title": "18\" Round Warli Art"},
    {"rowNumber": "<N>", "artworkId": "<record actual ID>", "sku": null, "title": "10\" Round Warli Art"},
    {"rowNumber": "<N>", "artworkId": "<record actual ID>", "sku": null, "title": "Decorative Tray 11\""},
    {"rowNumber": "<N>", "artworkId": "<record actual ID>", "sku": null, "title": "3 Partition Square Box ..."}
  ],
  "updated": [],
  "skipped": [],
  "errors": []
}
```

**Record the 4 artwork IDs from the `created` array immediately after Apply.**
They are required for validation (Section F) and rollback (Section G).

### Stop condition

- HTTP status != 200 → **STOP. Check response body. Confirm transaction rolled back (server logs: "rolled back"). Do not retry without investigating.**
- `errorCount` > 0 → **STOP. Review error details.**
- `imagesFailed` > 0 → **STOP. Review image failure details before proceeding to validation.**

---

## F. Post-Apply Validation Checklist

Run all checks immediately after a successful Apply (HTTP 200, createdCount=4).

### F1 — Artwork and table counts (admin + DB)

Compare against the baseline recorded in Section C3.

| Metric | Expected | Actual |
|---|---|---|
| Total artworks (admin) | baseline + 4 | |
| artwork\_sizes count | unchanged | |
| categories count | unchanged | |
| order\_requests count | unchanged | |
| order\_request\_items count | unchanged | |
| fx\_rate | unchanged | |
| usd\_multiplier | unchanged | |
| maintenance\_mode | unchanged | |
| NEEDS\_REVIEW count | baseline + 4 | |
| warli-art count (admin) | baseline warli + 2 | |
| mixed-art count (admin) | baseline mixed + 1 | |
| texture-art count (admin) | baseline texture + 1 | |

### F2 — Public API count unchanged

Public artworks are defined as: `status IN ('IN_STOCK', 'MADE_TO_ORDER') AND show_on_website = true`.
The 4 imported rows have `status = NEEDS_REVIEW` and `show_on_website = false` and must not appear.

```
GET /api/artworks
```

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

### F5 — Category API: no hidden import rows leak publicly

Check that the public artworks-per-category counts are unchanged, and that warli-art
and mixed-art do not appear in a public-only category listing (since this import adds
no public artworks to those categories).

```
GET /api/artworks?category=warli-art   → count unchanged from baseline
GET /api/artworks?category=mixed-art   → count unchanged from baseline
GET /api/artworks?category=texture-art → count unchanged from baseline
```

If the categories API supports a `publicOnly` filter:

```
GET /api/categories?publicOnly=true
```

- `warli-art` must not appear if it had zero public artworks before this import
  (the 2 imported warli-art rows are NEEDS\_REVIEW + show\_on\_website=false and do not qualify)
- `mixed-art` must not appear if it had zero public artworks before this import
  (same reason — the 1 imported mixed-art row is hidden)
- `texture-art` public behavior must be unchanged — if it appeared before Apply with
  existing public artworks, it must still appear with the same count

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

**Option A — Targeted SQL cleanup (preferred)**

Use the 4 artwork IDs recorded from the Apply response. All image data is stored in the
`artworks` table (`image_data`, `image_mime_type` columns) — there is no separate image table.
Deleting the 4 artwork rows removes all associated data.

```sql
-- Connect to production DB: crossover.proxy.rlwy.net:54308/railway
-- Substitute the 4 artwork IDs from the Apply response.
-- Read every comment. Review the SELECT output before running DELETE.

BEGIN;

-- Step 1: Confirm all 4 rows match expected attributes.
-- Stop and ROLLBACK if any of the following are true:
--   - Fewer or more than 4 rows returned
--   - Any title does not match an ISYNC-18 imported artwork
--   - Any category is not one of: warli-art, warli-art, mixed-art, texture-art
--   - Any status != 'NEEDS_REVIEW'
--   - Any show_on_website = true
--   - Any sku IS NOT NULL
--   - Any created_at is before the Apply timestamp

SELECT id, title, category, status, show_on_website, sku, created_at
FROM artworks
WHERE id IN (
  '<artwork-id-row-1>',
  '<artwork-id-row-2>',
  '<artwork-id-row-3>',
  '<artwork-id-row-4>'
);

-- Step 2: Delete only after Step 1 confirms all 4 rows are exactly as expected.
-- The extra WHERE guards prevent accidental deletion of any unrelated artwork
-- if an ID was miscopied or the wrong ID was used.

DELETE FROM artworks
WHERE id IN (
  '<artwork-id-row-1>',
  '<artwork-id-row-2>',
  '<artwork-id-row-3>',
  '<artwork-id-row-4>'
)
  AND status = 'NEEDS_REVIEW'
  AND show_on_website = false
  AND sku IS NULL;

-- Step 3: Confirm exactly 4 rows were affected.
-- If the DELETE affected any count other than 4, run ROLLBACK (do not COMMIT).

-- Step 4: Verify total count returns to baseline.
SELECT COUNT(*) FROM artworks;
SELECT COUNT(*) FROM artworks WHERE status = 'NEEDS_REVIEW';

-- Step 5: Commit only if DELETE affected exactly 4 rows and counts match baseline.
COMMIT;

-- If DELETE row count was not exactly 4, or any check failed:
-- ROLLBACK;
```

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
| H17 | warli-art or mixed-art appears in public category listing with new artworks | Section F5 |
| H18 | artwork\_sizes, order\_requests, or order\_request\_items count changed | Section F1 |

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

| Row | Item | Category | Price INR | artworkId (from Apply response) |
|---|---|---|---|---|
| 1 | 18" Round Warli Art | warli-art | 7,000 | <record actual ID> |
| 2 | 10" Round Warli Art | warli-art | 2,500 | <record actual ID> |
| 3 | Decorative Tray 11" | mixed-art | 1,100 | <record actual ID> |
| 4 | 3 Partition Square Box | texture-art | 1,600 | <record actual ID> |

---

## Pre-Apply Checklist

| Step | Result |
|---|---|
| Owner approval (Section A) — confirmed via Jira/chat | ✅ / ❌ |
| Backup taken (Section B) | ✅ / ❌ — <filename> (<size> bytes) |
| Baseline captured (Section C) | ✅ |
| Final Preview (Section D) | ✅ HTTP 200 / ❌ |

---

## Baseline Counts (fill in from Section C)

| Metric | Baseline |
|---|---|
| Total artworks (admin) | |
| Total artworks (public) | |
| artwork_sizes | |
| categories | |
| order_requests | |
| order_request_items | |
| fx_rate | |
| usd_multiplier | |
| maintenance_mode | |
| NEEDS_REVIEW count | |
| warli-art (admin) | |
| mixed-art (admin) | |
| texture-art (admin) | |

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
| artwork_sizes | unchanged | | |
| categories | unchanged | | |
| order_requests | unchanged | | |
| order_request_items | unchanged | | |
| fx_rate | unchanged | | |
| usd_multiplier | unchanged | | |
| maintenance_mode | unchanged | | |
| NEEDS_REVIEW count | baseline + 4 | | |
| warli-art count (admin) | baseline + 2 | | |
| mixed-art count (admin) | baseline + 1 | | |
| texture-art count (admin) | baseline + 1 | | |
| Public artwork count | unchanged | | |
| warli-art: no new public artworks | 0 new public | | |
| mixed-art: no new public artworks | 0 new public | | |
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
- An artwork becomes public only when the admin sets show_on_website = TRUE and
  status = IN_STOCK (or MADE_TO_ORDER) via an explicit admin edit and save

---

## Safety Confirmations

- ✅ / ❌ No artwork published from this Apply
- ✅ / ❌ No SKU generated by Apply (auto-generated on first admin save when public)
- ✅ / ❌ server/.env not committed
- ✅ / ❌ Private workbook not committed
- ✅ / ❌ Image ZIP not committed
- ✅ / ❌ Apply response saved to _private/ (gitignored)
- ✅ / ❌ No credentials committed or logged

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
- ✅ No credentials committed or logged
- ✅ INV-PRICE-01 not implemented
- ✅ ARCH-INV-02 not started

---

## ISYNC-18-03 Status

**COMPLETE** — Runbook created and safety revisions applied. Execution proceeds under ISYNC-18-04.
