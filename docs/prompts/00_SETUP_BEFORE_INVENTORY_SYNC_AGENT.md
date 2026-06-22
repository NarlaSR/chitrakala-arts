# Setup Instructions Before Giving the First Inventory Sync Prompt to the Coding Agent

## Purpose

These steps prepare the Chitrakala Arts repo so the coding agent has the right context, the correct files, and a safe working environment before starting the spreadsheet-to-DB inventory sync work.

The first coding task should be **preview-only**. The coding agent must not write to the database in the first phase.

---

## 1. Create the Recommended Folder Structure

In the project repo, create these folders if they do not already exist:

```text
docs/
  inventory-sync/
  prompt/
```

Use:

```bash
mkdir -p docs/inventory-sync
mkdir -p docs/prompt
```

On Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force -Path docs/inventory-sync
New-Item -ItemType Directory -Force -Path docs/prompt
```

---

## 2. Copy the Inventory Sync Documentation Files

Place these files under:

```text
docs/inventory-sync/
```

Required files:

```text
CODING_AGENT_INSTRUCTIONS.md
INVENTORY_SYNC_ROADMAP.md
Chitrakala_Inventory_Sync_v2_ReadyForCodingAgent_Cleaned.xlsx
```

Recommended final structure:

```text
docs/
  inventory-sync/
    CODING_AGENT_INSTRUCTIONS.md
    INVENTORY_SYNC_ROADMAP.md
    Chitrakala_Inventory_Sync_v2_ReadyForCodingAgent_Cleaned.xlsx
  prompt/
    00_SETUP_BEFORE_INVENTORY_SYNC_AGENT.md
    01_INVENTORY_SYNC_PREVIEW_BACKEND_PROMPT.md
```

---

## 3. Copy the Prompt Files

Place these prompt/setup files under:

```text
docs/prompt/
```

Files:

```text
00_SETUP_BEFORE_INVENTORY_SYNC_AGENT.md
01_INVENTORY_SYNC_PREVIEW_BACKEND_PROMPT.md
```

The file `01_INVENTORY_SYNC_PREVIEW_BACKEND_PROMPT.md` is the first prompt to give the coding agent.

---

## 4. Start From a Clean Git State

Before asking the coding agent to work, confirm that your repo is clean or intentionally staged.

```bash
git status
```

If there are unrelated changes, either commit them or stash them before starting.

Recommended branch:

```bash
git checkout -b feature/inventory-sync-preview
```

If the branch already exists:

```bash
git checkout feature/inventory-sync-preview
```

---

## 5. Do Not Use Production DB for First Development

The first implementation must be developed and tested against a local or staging database.

Do **not** let the coding agent test against production Railway Postgres unless explicitly approved.

Recommended safety rule:

```text
Phase 1 must not write to any database.
```

Even though Phase 1 is preview-only, still avoid production DB for early testing if possible.

---

## 6. Confirm Required Environment Variables

Check existing backend configuration and `.env` files.

Likely required values:

```text
DATABASE_URL
JWT_SECRET
PORT
NODE_ENV
```

If the repo has a server folder, check:

```text
server/.env
```

Do not commit `.env` files.

---

## 7. Run Existing App Before the Agent Starts

Make sure the current app runs before asking the coding agent to make changes.

Typical commands may be:

```bash
npm install
cd server
npm install
npm start
```

In another terminal:

```bash
npm start
```

Adjust based on the actual repo scripts.

Verify:

- backend starts,
- frontend starts,
- admin login works,
- existing artwork pages still load.

---

## 8. Ask the Agent to Inspect These Areas First

Before coding, the agent should inspect the existing project structure and identify:

```text
server routes
admin auth middleware
PostgreSQL query helpers
pricing utility functions
admin frontend API service
admin dashboard routes/pages
file upload patterns already used in the project
```

Potential files/directories to inspect may include:

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

The exact files may differ. The agent should inspect and adapt to the real project structure.

---

## 9. Confirm XLSX Parsing Library Strategy

The coding agent should check existing dependencies before adding a new package.

Possible XLSX parsing libraries:

```text
xlsx
exceljs
```

The agent should prefer a stable existing dependency if one already exists. If adding a dependency, it should explain why.

The workbook parser must read:

```text
Inventory_Master
```

The DB export tabs are useful reference tabs, but the sync validation should compare against the **live DB**, not only the export tabs.

---

## 10. Safety Rules to Repeat to the Coding Agent

Before giving the first prompt, make sure these rules are clear:

```text
1. Phase 1 is preview-only.
2. Do not write to the DB.
3. Do not add commit/sync write logic yet.
4. Do not update production data.
5. Do not import price_usd, fx_rate_used, or multiplier_used from Excel.
6. Do not support CREATE or ARCHIVE yet.
7. Do not support image replacement yet.
8. Use live DB values to detect stale workbook data.
9. Build tests for validation behavior.
10. Return a summary of files changed and tests run.
```

---

## 11. First Prompt to Use

After completing these setup steps, give the coding agent this prompt file:

```text
docs/prompt/01_INVENTORY_SYNC_PREVIEW_BACKEND_PROMPT.md
```

The first prompt asks the agent to implement the **preview-only backend endpoint**.

Do not ask for admin UI or DB commit in the first task.

---

## 12. Expected First Coding Deliverable

After the first prompt, the coding agent should return:

```text
1. Backend preview endpoint implemented.
2. Workbook upload parsing implemented.
3. Inventory_Master validation implemented.
4. Live DB comparison implemented.
5. Preview JSON returned.
6. No DB writes.
7. Tests added or manual test steps documented.
8. Files changed listed.
9. Known limitations listed.
```

Expected workbook counts for the cleaned workbook:

```text
36 total Inventory_Master rows
9 UPDATE rows
24 REVIEW rows
3 NO_CHANGE rows
0 CREATE rows
0 ARCHIVE rows
```
