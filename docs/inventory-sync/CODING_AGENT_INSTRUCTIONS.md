# Chitrakala Arts - Coding Agent Instructions: Inventory Spreadsheet Sync

> **Note:** This document describes an earlier preview-only phase and is superseded by the ISYNC-01 through ISYNC-10 implementation for the active staging workflow.

## Purpose

Build a safe admin-only inventory spreadsheet sync workflow for Chitrakala Arts.

The first implementation must validate and preview an uploaded workbook. **Do not write to the database in Phase 1.**

---

## Current Stack and Data

- Frontend: React admin console
- Backend: Node.js / Express API
- Database: PostgreSQL
- Authentication: existing admin JWT auth
- Primary tables: `artworks`, `artwork_sizes`, `categories`
- Input workbook: `Chitrakala_Inventory_Sync_v2_ReadyForCodingAgent_Cleaned.xlsx`

### Relevant DB Columns

| Table | Relevant Columns |
|---|---|
| `artworks` | `id`, `title`, `category`, `description`, `materials`, `price_inr`, `price_usd`, `fx_rate_used`, `multiplier_used`, `featured`, `image`, `created_at`, `updated_at` |
| `artwork_sizes` | `id`, `artwork_id`, `size_label`, `price`, `price_usd`, `created_at` |
| `categories` | `id`, `name`, `description`, `image`, `display_order` |

---

## Workbook Contract

| Workbook Tab | How Code Should Use It |
|---|---|
| `Inventory_Master` | Primary machine-readable sync input. Read `Sync Action` and `Corrected_*` fields here. |
| `Reconciliation_Report` | Human context only. Do **not** parse this tab as the source of DB updates. |
| `DB_Artworks_Export` | Reference snapshot only. Validate against live DB before preview/commit. |
| `DB_Artwork_Sizes_Export` | Reference snapshot for size review only. |
| `DB_Categories_Export` | Reference snapshot. Validate categories against live DB. |
| `Potential_Issues_Auto` | Helper tab only. Do not drive updates from this. |
| `Sync_Summary` | Human summary only. Do not drive updates from this. |

---

## Phase 1 Scope: Preview Only

Phase 1 must be preview-only.

Include:

- Create backend preview endpoint.
- Create upload/preview UI only after endpoint works.
- Support only `NO_CHANGE`, `UPDATE`, and `REVIEW` actions.
- Block `CREATE` and `ARCHIVE` as unsupported.
- Validate workbook structure and row-level values.
- Compare workbook values against the live DB.
- Return preview JSON.

Do **not**:

- Write to the database.
- Import images.
- Import `price_usd`.
- Import `fx_rate_used`.
- Import `multiplier_used`.
- Import `created_at` or `updated_at`.
- Import `image_data` or `image_mime_type`.
- Update `artwork_sizes` yet.
- Support `CREATE` or `ARCHIVE` yet.

---

## Backend Endpoint: Preview

| Item | Specification |
|---|---|
| Endpoint | `POST /api/admin/inventory-sync/preview` |
| Auth | Admin JWT required |
| Input | `multipart/form-data` XLSX file upload |
| Output | JSON preview summary and row-level details |
| Writes | None. Absolutely no DB writes in Phase 1 |

### Preview Processing Steps

1. Accept XLSX upload and reject non-XLSX or oversized files.
2. Validate required workbook tabs exist.
3. Validate required `Inventory_Master` headers exist.
4. Parse `Inventory_Master` rows only; ignore blank rows.
5. Validate `Sync Action` for each row.
6. For `UPDATE` rows, identify non-empty `Corrected_*` fields.
7. Fetch live DB row by `DB id` / artwork ID.
8. Compare workbook DB fields to live DB values to detect stale workbook data.
9. Validate corrected values against data type and business rules.
10. Generate field-level before/after change preview.
11. Return preview JSON with counts, warnings, blocked rows, review rows, and update candidates.
12. Do not update DB.

---

## Inventory_Master Field Rules

| Workbook Column | Rule |
|---|---|
| `Sync Action` | Required. Must be `NO_CHANGE`, `UPDATE`, `REVIEW`, `CREATE`, or `ARCHIVE`. Phase 1 supports only `NO_CHANGE`, `UPDATE`, `REVIEW`. |
| `DB id` | Required for `UPDATE`, `REVIEW`, and `NO_CHANGE`. Must exist in live `artworks` table. |
| `Corrected title` | Optional. If present and `Sync Action = UPDATE`, update `artworks.title`. |
| `Corrected category_slug` | Optional. If present, must exist in live `categories.id`. Update `artworks.category`. |
| `Corrected description` | Optional. If present, update `artworks.description`. |
| `Corrected materials` | Optional. If present, update `artworks.materials`. |
| `Corrected price_inr` | Optional. If present, must be numeric and greater than 0. Update `artworks.price_inr` and recalculate `price_usd` via backend logic. |
| `Corrected featured` | Optional. If present, must be `TRUE` or `FALSE`. Update `artworks.featured`. |
| `Corrected image` | Do not apply in Phase 1. Show warning or block if populated. |

---

## Sync Action Behavior

| Action | Phase 1 Behavior |
|---|---|
| `NO_CHANGE` | Skip. Warn if corrected fields are populated. |
| `UPDATE` | Eligible for preview if at least one supported `Corrected_*` field is populated and validations pass. |
| `REVIEW` | Do not update. Return as review-only / blocked from commit. |
| `CREATE` | Unsupported in Phase 1. Block with clear message. |
| `ARCHIVE` | Unsupported in Phase 1. Block with clear message. |

---

## Preview JSON Requirements

Return a structured response similar to this shape. Field names can be adjusted to match existing project conventions, but the information must be present.

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
      "artworkId": "art-...",
      "title": "Current title",
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

---

## Pricing Rules

- Never import `price_usd` from spreadsheet.
- Never import `fx_rate_used` or `multiplier_used` from spreadsheet.
- If `Corrected price_inr` changes artwork price, calculate `price_usd` with the existing backend pricing utility.
- Use the same rounding behavior currently used by the public/admin artwork pricing logic.
- If backend pricing function is duplicated or inconsistent, centralize it before applying sync commits.

---

## Size-Level USD Recalculation: Separate Workflow

Do not edit `artwork_sizes` during the initial `Inventory_Master` update sync.

Build a separate preview/recalculation workflow for `artwork_sizes.price_usd`.

Required behavior:

1. For each size row, compute recalculated USD using `artwork_sizes.price` and backend pricing logic.
2. Preview current `price_usd` vs recalculated `price_usd`.
3. Commit only rows where recalculated value differs after applying the real backend rounding rules.
4. Use a transaction and audit log.
5. Do not manually import size USD values from spreadsheet.

---

## Phase 2 UI Requirements

1. Add `Admin > Inventory Sync` page.
2. Add workbook upload control.
3. Add `Validate & Preview` button.
4. Show summary cards:
   - total rows,
   - update candidates,
   - review rows,
   - no-change rows,
   - blocked rows,
   - warnings.
5. Show update preview table with:
   - artwork ID,
   - title,
   - field,
   - current DB value,
   - proposed value.
6. Show review-only rows separately.
7. Show blocked rows and validation messages separately.
8. Do not show `Confirm Sync` button until preview-only behavior is approved.

---

## Phase 3 Commit Endpoint

| Item | Specification |
|---|---|
| Endpoint | `POST /api/admin/inventory-sync/commit` |
| Input | `sync_job_id` from a validated preview job |
| Writes | Only safe artwork `UPDATE` rows |
| Transaction | Required. Roll back all changes if any write fails |
| Audit | Required. Record every field old/new value |

### Commit Flow

1. Store preview result as a sync job.
2. Commit endpoint receives `sync_job_id`, not a fresh unvalidated file.
3. Re-check live DB for stale data before writing.
4. Update only supported fields with non-empty `Corrected_*` values.
5. Recalculate `price_usd` if `price_inr` changed.
6. Write audit records.
7. Commit transaction.
8. Return sync report.

---

## Audit Tables

| Table | Purpose |
|---|---|
| `inventory_sync_jobs` | One row per upload/preview/commit job. |
| `inventory_sync_changes` | One row per proposed/applied field-level change. |

Suggested `inventory_sync_jobs` fields:

- `id`
- `uploaded_filename`
- `uploaded_by`
- `status`
- `total_rows`
- `update_count`
- `review_count`
- `blocked_count`
- `warning_count`
- `created_at`
- `committed_at`
- `notes`

Suggested `inventory_sync_changes` fields:

- `id`
- `sync_job_id`
- `artwork_id`
- `table_name`
- `field_name`
- `old_value`
- `new_value`
- `status`
- `message`
- `created_at`

---

## Required Tests

| Area | Tests |
|---|---|
| Workbook structure | Missing tabs, missing headers, empty workbook, non-XLSX file. |
| Actions | Invalid action, `UPDATE` with no corrected fields, `NO_CHANGE` with corrected fields, blocked `CREATE` / `ARCHIVE`. |
| Validation | Invalid category, invalid price, invalid featured value, missing DB id. |
| Stale data | Workbook DB value differs from live DB. |
| Preview | 9 updates, 24 reviews, 3 no-change rows for current cleaned workbook. |
| Pricing | `price_inr` update recalculates `price_usd` via backend logic. |
| Security | Non-admin cannot preview or commit. |
| Commit | Transaction rollback on failure; audit rows created. |

---

## First Implementation Deliverable

The first deliverable should be:

- Preview-only backend endpoint working against the cleaned workbook.
- No DB writes.
- Preview JSON returns expected counts for current workbook:
  - 36 total rows,
  - 9 `UPDATE`,
  - 24 `REVIEW`,
  - 3 `NO_CHANGE`.
- Validation errors and stale-data warnings are clearly returned.
- Unit/integration tests are added for preview validation.
