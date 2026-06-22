# Prompt 01: Build Inventory Sync Preview Backend Endpoint

## Context

We are adding a safe spreadsheet-to-PostgreSQL inventory sync workflow for the Chitrakala Arts admin console.

The first implementation must be **preview-only**. Do not write anything to the database in this task.

The cleaned workbook and documentation are in:

```text
docs/inventory-sync/
  CODING_AGENT_INSTRUCTIONS.md
  INVENTORY_SYNC_ROADMAP.md
  Chitrakala_Inventory_Sync_v2_ReadyForCodingAgent_Cleaned.xlsx
```

Before coding, read:

```text
docs/inventory-sync/CODING_AGENT_INSTRUCTIONS.md
```

Use the cleaned workbook as the first test input:

```text
docs/inventory-sync/Chitrakala_Inventory_Sync_v2_ReadyForCodingAgent_Cleaned.xlsx
```

---

## Current Stack

The project is a Chitrakala Arts full-stack app with:

```text
React frontend
Node/Express backend
PostgreSQL database
existing admin JWT authentication
```

Relevant DB tables:

```text
artworks
artwork_sizes
categories
```

Relevant workbook tab:

```text
Inventory_Master
```

`Inventory_Master` is the primary machine-readable sync input.

The other workbook tabs are supporting/reference tabs only.

---

## Main Goal for This Task

Implement a backend endpoint that accepts the cleaned XLSX workbook and returns a validation/preview result.

This task must not update the database.

### Endpoint

```text
POST /api/admin/inventory-sync/preview
```

### Requirements

- Admin-only endpoint using existing admin JWT auth.
- Accept XLSX upload.
- Validate required workbook tabs and headers.
- Parse `Inventory_Master` rows.
- Validate row-level `Sync Action` and corrected fields.
- Compare workbook data against live PostgreSQL data.
- Detect stale workbook data.
- Return preview JSON with summary counts and field-level before/after changes.
- Do not write to DB.

---

## Workbook Rules

### Primary tab

Read this tab:

```text
Inventory_Master
```

### Important columns

The code should use these columns from `Inventory_Master`:

```text
Sync Action
DB id
DB title
DB category_slug
DB description
DB materials
DB price_inr
DB price_usd
DB fx_rate_used
DB multiplier_used
DB featured
DB image
Corrected title
Corrected category_slug
Corrected description
Corrected materials
Corrected price_inr
Corrected featured
Corrected image
```

Column names should be matched by header text, not by hardcoded column index.

---

## Sync Action Behavior

Support these in Phase 1:

| Sync Action | Behavior |
|---|---|
| `NO_CHANGE` | Skip. Warn if corrected fields are populated. |
| `UPDATE` | Preview supported field updates if corrected fields are populated and valid. |
| `REVIEW` | Do not update. Return as review-only / blocked from commit. |

Block these in Phase 1:

| Sync Action | Behavior |
|---|---|
| `CREATE` | Unsupported. Return as blocked. |
| `ARCHIVE` | Unsupported. Return as blocked. |

Invalid or blank Sync Action should return a validation error for that row.

---

## Supported Corrected Fields for Phase 1 Preview

Only these corrected fields are supported for preview:

| Workbook Corrected Field | DB Field |
|---|---|
| `Corrected title` | `artworks.title` |
| `Corrected category_slug` | `artworks.category` |
| `Corrected description` | `artworks.description` |
| `Corrected materials` | `artworks.materials` |
| `Corrected price_inr` | `artworks.price_inr` |
| `Corrected featured` | `artworks.featured` |

Do not apply `Corrected image` in Phase 1. If populated, return a warning or blocked message.

---

## Pricing Rules

Do not import or trust spreadsheet values for:

```text
price_usd
fx_rate_used
multiplier_used
```

If `Corrected price_inr` is populated, the preview should show that `price_usd` would be recalculated by backend pricing logic.

Do not implement DB write behavior yet.

If an existing backend function calculates USD price, identify it and use it for preview calculations.

If pricing logic is currently duplicated, note that in the final response and recommend centralizing it before commit logic is added.

---

## Live DB Validation

Do not rely only on the workbook `DB_*` export tabs.

For each row with `DB id`, fetch the current live row from PostgreSQL.

Compare workbook DB values against live DB values.

If the workbook DB value differs from live DB value, return a stale-data warning like:

```text
STALE_WORKBOOK_DATA
```

Example:

```json
{
  "type": "STALE_WORKBOOK_DATA",
  "artworkId": "art-...",
  "field": "title",
  "workbookValue": "Old Title",
  "liveDbValue": "New Title"
}
```

Rows with stale DB data should not be considered safe for commit in later phases unless explicitly revalidated.

---

## Validation Rules

Implement these validations:

1. Required workbook tab `Inventory_Master` exists.
2. Required headers exist.
3. `Sync Action` is valid.
4. `DB id` is required for `UPDATE`, `REVIEW`, and `NO_CHANGE`.
5. `DB id` must exist in live `artworks` table.
6. `UPDATE` must contain at least one supported non-empty `Corrected_*` field.
7. `NO_CHANGE` should warn if corrected fields are populated.
8. `REVIEW` should not be included in update candidates.
9. `CREATE` and `ARCHIVE` are blocked as unsupported in Phase 1.
10. `Corrected category_slug`, if populated, must exist in live `categories.id`.
11. `Corrected price_inr`, if populated, must be numeric and greater than 0.
12. `Corrected featured`, if populated, must be boolean-compatible: `TRUE`, `FALSE`, true, false, 1, or 0.
13. `Corrected image`, if populated, should not be applied in Phase 1.
14. Do not import `price_usd`, `fx_rate_used`, `multiplier_used`, `created_at`, or `updated_at`.

---

## Expected Preview Counts for Current Workbook

When tested with the cleaned workbook, the preview should approximately return:

```text
36 total rows
9 UPDATE rows
24 REVIEW rows
3 NO_CHANGE rows
0 CREATE rows
0 ARCHIVE rows
```

If counts differ, explain why.

---

## Preview Response Shape

Return JSON with this information:

```json
{
  "summary": {
    "totalRows": 36,
    "toUpdate": 9,
    "reviewOnly": 24,
    "noChange": 3,
    "blocked": 0,
    "warnings": 0
  },
  "updates": [
    {
      "rowNumber": 0,
      "artworkId": "art-...",
      "title": "Artwork title",
      "changes": [
        {
          "field": "materials",
          "from": "wood",
          "to": "Wood"
        }
      ]
    }
  ],
  "reviewRows": [],
  "blockedRows": [],
  "warnings": []
}
```

Use project conventions if existing API response format differs, but keep the same information.

---

## Files to Inspect Before Coding

Inspect the repo and identify the actual structure. Likely files/directories include:

```text
server/server.js
server/dbQueries.js
server/priceUtils.js
server/dbMigration/
src/services/api.js
src/pages/AdminDashboard.js
src/pages/AdminSettingsPage.js
src/context/AuthContext.js
```

The exact files may differ. Adapt to the actual project.

---

## Dependency Guidance

Check existing dependencies first.

If the project already has an XLSX parser, use it.

If not, add a well-known XLSX parser such as:

```text
xlsx
exceljs
```

Explain why the dependency was added.

---

## Testing Requirements

Add automated tests if the project has a test framework.

At minimum, provide manual test steps and sample expected output.

Test cases should include:

- valid cleaned workbook,
- missing `Inventory_Master` tab,
- missing required header,
- invalid `Sync Action`,
- `UPDATE` with no corrected fields,
- `NO_CHANGE` with corrected fields,
- invalid category,
- invalid price,
- invalid featured value,
- missing DB id,
- stale workbook data,
- blocked `CREATE`,
- blocked `ARCHIVE`,
- non-admin request rejected.

---

## Out of Scope for This Task

Do not implement these yet:

```text
DB commit/write endpoint
admin Confirm Sync button
CREATE support
ARCHIVE support
image replacement
artwork_sizes updates
size USD recalculation commit
scheduled spreadsheet sync
Google Sheets / OneDrive integration
```

---

## Required Final Response from Coding Agent

After implementation, provide:

1. Summary of what was built.
2. Files changed.
3. New dependency added, if any.
4. How to run/test the endpoint.
5. Example request.
6. Example response summary.
7. Tests added or manual test checklist.
8. Known limitations.
9. Confirmation that no DB write logic was added.

---

## Safety Reminder

This task is preview-only.

Do not write to the database.

Do not add commit logic.

Do not update production data.
