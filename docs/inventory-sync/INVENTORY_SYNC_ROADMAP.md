# Chitrakala Arts - Internal Reference: Inventory Sync Roadmap

> **Note:** This document describes an earlier preview-only phase and is superseded by the ISYNC-01 through ISYNC-10 implementation for the active staging workflow.

## Purpose of This Reference Document

This document is intended for Sanjay and the Chitrakala team.

It explains the business direction, sequencing, risks, and decisions around spreadsheet-to-database sync.

This is **not** the coding-agent instruction file. Give the coding agent `CODING_AGENT_INSTRUCTIONS.md` instead.

---

## End Goal

The final goal is a safe admin workflow where the team can use a spreadsheet for catalog review and updates, upload it to the admin console, preview every change, approve the sync, and let the system update PostgreSQL with audit logging.

| Workflow Step | Final Experience |
|---|---|
| Export | Admin downloads fresh inventory workbook from website admin. |
| Edit | Team edits allowed corrected/proposed fields only. |
| Upload | Admin uploads workbook to Inventory Sync page. |
| Preview | System shows exact changes and warnings. |
| Approve | Admin confirms only after review. |
| Commit | Backend updates PostgreSQL transactionally. |
| Audit | System stores old/new values and produces report. |

---

## Current Readiness

- The workbook is now clean enough for coding-agent handoff.
- The DB export tabs match the actual export columns.
- `Inventory_Master` has row-level `Sync Action` values and corrected fields.
- The current workbook identifies:
  - 36 artworks,
  - 73 artwork size rows,
  - 5 categories,
  - 9 update rows,
  - 24 review rows,
  - 3 no-change rows.
- The largest unresolved issue is size-level USD price recalculation.
- Direct automatic sync should not be built before preview/validation works.

---

## Key Business Decisions Still Needed

| Decision | Recommendation |
|---|---|
| Meaning of artwork base price when sizes exist | Treat as starting/base display price, but do not auto-overwrite from size rows yet. |
| Size USD recalculation | Use backend pricing logic and preview before update. |
| Images | Keep manual in early phases. Do not replace from spreadsheet path. |
| Archiving | Add `status` or `active` field before allowing spreadsheet archive. |
| New artworks | Add after `UPDATE` sync is stable. |
| Direct scheduled sync | Only consider later. Keep admin approval required. |

---

## Recommended Implementation Sequence

1. Give the coding agent the separate coding-agent instruction document and cleaned workbook.
2. Build preview-only backend endpoint first.
3. Test preview endpoint with the current workbook.
4. Build admin upload/preview UI.
5. Add audit tables.
6. Add commit endpoint for safe artwork `UPDATE` rows only.
7. Add separate size-level USD recalculation workflow.
8. Add admin workbook export so manual `psql` exports are no longer needed.
9. Later add `CREATE`, `ARCHIVE`, image sync, and optional scheduled/connected spreadsheet sync.

---

## Why Preview Comes Before Sync

Preview must come before DB writes because:

- The spreadsheet may be stale compared with the live DB.
- A typo in Excel could damage public product data.
- USD pricing should be recalculated by backend logic, not manually entered.
- Size pricing has unresolved business and calculation questions.
- Auditability matters because product/catalog changes affect the live website.

---

## Risk Controls

| Risk | Control |
|---|---|
| Accidental overwrite | Only corrected fields update; blank corrected fields mean no change. |
| Stale spreadsheet | Compare workbook DB values to live DB values during preview. |
| Wrong USD prices | Never import USD from Excel. Recalculate in backend. |
| Unexpected delete | Never delete because a row is missing from spreadsheet. |
| Partial update failure | Use transactions. Roll back on error. |
| No traceability | Write sync job and sync change audit records. |
| Image breakage | Exclude image replacement from early phases. |

---

## Phase Summary for the Team

| Phase | Team-Friendly Description |
|---|---|
| 1. Preview-only | Upload workbook and see what would happen. Nothing changes in DB. |
| 2. Preview UI | Make the preview understandable inside admin console. |
| 3. Safe updates | Allow approved title/material/description/category/price/featured updates. |
| 4. Audit report | Keep record of every sync and field change. |
| 5. Size USD fix | Repair size-level USD pricing with preview and approval. |
| 6. Export workbook | Download the latest workbook from admin instead of using `psql`. |
| 7. `CREATE` / `ARCHIVE` | Later: add new products and archive inactive items safely. |
| 8. Images | Later: controlled image upload/mapping workflow. |

---

## Acceptance Before Production Use

Before production sync is enabled, confirm:

- Preview counts match the current workbook.
- Admin can clearly see every proposed change.
- `REVIEW` rows are blocked from DB writes.
- `CREATE` and `ARCHIVE` are blocked until later phases.
- Price changes recalculate USD correctly.
- Transactions and audit records work.
- A sync report can be downloaded after commit.
- A backup/export exists before production sync.

---

## Immediate Next Steps

1. Share only `CODING_AGENT_INSTRUCTIONS.md` with the coding agent.
2. Keep this internal roadmap for planning and review.
3. Ask the coding agent to start with preview-only backend work.
4. Do not allow the coding agent to implement direct DB writes until preview has been reviewed.
5. Use the cleaned workbook as the first test input.

---

## Suggested Repo Location

Place the files here:

```text
docs/
  inventory-sync/
    CODING_AGENT_INSTRUCTIONS.md
    INVENTORY_SYNC_ROADMAP.md
    Chitrakala_Inventory_Sync_v2_ReadyForCodingAgent_Cleaned.xlsx
```

Then instruct the coding agent:

```text
Read docs/inventory-sync/CODING_AGENT_INSTRUCTIONS.md first.
Use the cleaned workbook as the first test input.
Do not implement DB writes in Phase 1.
```
