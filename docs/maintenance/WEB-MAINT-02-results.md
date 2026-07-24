# WEB-MAINT-02 — Block Public Order Request Submissions During Maintenance Mode

**Status:** Complete — Railway staging validation passed after ISYNC-17 merge; ready for final merge/deploy approval; not deployed, no production migration
**Date:** 2026-07-23 (original implementation); revalidated 2026-07-24 after ISYNC-16 merge; refreshed 2026-07-24 after ISYNC-17 merge; staging-validated 2026-07-24 after ISYNC-17 merge
**Depends on:** WEB-MAINT-01, ORD-01, ORD-02 (all confirmed merged into `main`)
**Branch:** `feature/WEB-MAINT-02-block-order-requests-during-maintenance` (created from updated `main`; merged forward twice with latest `main` — once for ISYNC-16, once for ISYNC-17 — see [Revalidation after ISYNC-16 merge](#revalidation-after-isync-16-merge-2026-07-24), [Refresh after ISYNC-17 merge](#refresh-after-isync-17-merge-2026-07-24-2), and [Railway staging validation after ISYNC-17](#railway-staging-validation-after-isync-17-2026-07-24) below)

## Summary

Identified during the [POST-ORD-QA-01](../orders/POST-ORD-QA-01-order-request-qa-readiness-report.md) review: maintenance mode was frontend-only — it hid the public order-request UI, but `POST /api/order-requests` itself had no maintenance awareness and would still accept and persist a submission if called directly (or from an already-loaded browser tab). This ticket closes that gap with a single, targeted server-side check reusing the existing maintenance-mode source of truth. No new setting, no schema change, no middleware.

## Dependency confirmation

Before branching, confirmed all three dependencies are on `main`:

```
git merge-base --is-ancestor origin/feature/WEB-MAINT-01-maintenance-mode origin/main  → merged
git merge-base --is-ancestor origin/feature/ORD-01-order-request-foundation origin/main → merged
git merge-base --is-ancestor origin/feature/ORD-02-public-order-request-flow origin/main → merged
```

`main` tip at branch time: `4c4c185` ("WEB-MAINT-01 + ORD-01 + ORD-02 production release results"). Branch created directly from updated `main` per the ticket's instructions (all three dependencies were merged, so no cross-branch work or unrelated merges were needed).

## Files changed

- [server/server.js](../../server/server.js) — added a maintenance-mode check as the first statement inside the `POST /api/order-requests` handler (10 lines added, nothing else touched).

No other file was modified. No schema/migration files added. No frontend files changed (the ticket only required blocking the API; the existing frontend UI-hiding behavior from WEB-MAINT-01 is unchanged and untouched).

## Implementation summary

Reused the existing `getMaintenanceMode()` async helper (`server/server.js:42-52`), already the single source of truth for maintenance state (`app_settings.maintenance_mode` in the database, falling back to the `MAINTENANCE_MODE` env var only if no DB row exists). No second maintenance setting or duplicate env-only check was introduced, and no refactor was needed — the helper was already defined at module scope and directly callable from the order-request route.

The check was added as the very first line inside the route handler's `try` block, before `req.body` is even destructured — i.e. before any input validation and before any database read/write:

```js
app.post('/api/order-requests', orderRequestLimiter, async (req, res) => {
  try {
    // Block new public submissions while the site is in maintenance mode.
    // Checked first, before any validation or database access, using the
    // same admin-controlled source of truth as the rest of the site
    // (getMaintenanceMode() / app_settings.maintenance_mode).
    if (await getMaintenanceMode()) {
      return res.status(503).json({
        error: 'Site is temporarily under maintenance. Please try again later.',
      });
    }

    const { name, email, phone, message, items } = req.body;
    // ... existing validation and creation logic, unchanged
```

This is a targeted, single-route check rather than global middleware — per the ticket's guidance to avoid broad middleware that could accidentally block admin APIs. No other route (public or admin) was touched, so nothing else changes behavior.

**Response shape:** `{ "error": "..." }`, matching this endpoint's existing error convention (every other validation failure on this route already returns `{ error: "<message>" }`, not `{ message: ... }`).

## Exact maintenance-mode behavior

| State | `POST /api/order-requests` |
|---|---|
| Maintenance OFF | Works exactly as before — normal validation, creation, `201` response. |
| Maintenance ON | Immediately returns `503`, before any validation or DB access. Confirmed this holds even for a malformed/empty request body (see Testing below) — the maintenance check always wins. |

Admin routes (`GET /api/admin/order-requests`, `GET /api/admin/order-requests/:id`, `PATCH /api/admin/order-requests/:id/status`), the maintenance toggle routes (`GET`/`PATCH /api/admin/settings/maintenance-mode`), `GET /api/config/maintenance-mode`, `GET /api/health`, and `/api/auth/login` are all untouched by this change and behave identically regardless of maintenance state — verified directly (see Testing below), not just by code inspection.

## API response example

Request:
```
POST /api/order-requests
Content-Type: application/json

{ "name": "...", "email": "...", "items": [...] }
```

Response while maintenance mode is ON:
```
HTTP/1.1 503 Service Unavailable
Content-Type: application/json

{ "error": "Site is temporarily under maintenance. Please try again later." }
```

## Admin access confirmation

Verified live against a running local instance, with maintenance mode ON:

- `POST /api/auth/login` reachable and returning its normal `401 { "error": "Invalid credentials" }` for a bad password (i.e. not maintenance-gated) — confirms login is unaffected.
- `GET /api/admin/order-requests` → `200`, full list returned including pre-existing requests.
- `GET /api/admin/order-requests/:id` → `200`, full detail with line-item snapshots returned.
- `PATCH /api/admin/order-requests/:id/status` → `200`, status updated successfully (`NEW` → `REVIEWING`) on an existing request.
- `PATCH /api/admin/settings/maintenance-mode` → `200`, admin successfully turned maintenance mode back OFF from within the "maintenance is ON" state.

## Testing results

All testing was performed against a local backend (`node server/server.js`, local Postgres via `DATABASE_URL`), branch `feature/WEB-MAINT-02-block-order-requests-during-maintenance`. An admin JWT was minted locally using the server's own `JWT_SECRET` (already present in the local `.env`) to test the admin routes without needing separately-known dev credentials — same effect as a real admin login, no security bypass, local dev only.

| # | Test | Result |
|---|---|---|
| 1 | Maintenance OFF — submit `POST /api/order-requests` with a real artwork (`art-1782445237565`, size id 646) | `201`, order request id 5 created with correct snapshot data |
| 1b | Confirm it appears in admin | `GET /api/admin/order-requests` → `200`, id 5 present with correct customer name/email/item count |
| 2 | Turn maintenance mode ON via `PATCH /api/admin/settings/maintenance-mode` | `200`, `{"maintenanceMode":true}`; confirmed via public `GET /api/config/maintenance-mode` → `{"maintenanceMode":true}` |
| 2b | Attempt `POST /api/order-requests` (valid payload) while ON | `503 { "error": "Site is temporarily under maintenance. Please try again later." }` |
| 2c | Attempt `POST /api/order-requests` with an **empty/invalid** body (`{}`) while ON | Still `503` with the same maintenance message — **not** a `400` validation error — proves the maintenance check runs before validation, as required |
| 2d | Confirm no new `order_requests` row created | `GET /api/admin/order-requests` while maintenance was ON still showed only the pre-existing ids (4, 5) — no new row from either 2b or 2c |
| 2e | Confirm no new `order_request_items` rows created | Same list call showed unchanged `item_count` for all existing requests — no orphaned or new item rows |
| 3 | Admin login route reachable during maintenance | `POST /api/auth/login` (wrong password) → `401 "Invalid credentials"`, not `503` — confirms the route isn't maintenance-gated |
| 3b | Admin can view existing order request detail during maintenance | `GET /api/admin/order-requests/5` → `200`, full detail returned |
| 3c | Admin can update an existing order request status during maintenance | `PATCH /api/admin/order-requests/5/status {"status":"REVIEWING"}` → `200`, status updated |
| 3d | Admin can turn maintenance mode OFF | `PATCH /api/admin/settings/maintenance-mode {"maintenanceMode":false}` → `200`, `{"maintenanceMode":false}` |
| 4 | Maintenance OFF again — submit `POST /api/order-requests` | `201`, order request id 6 created successfully — confirms the endpoint returns to normal behavior immediately after maintenance is turned off, no restart needed |
| 5 | Safety: artwork data unchanged | `GET /api/artworks/art-1782445237565` compared before/after all testing — `status`, `quantity`, `price_inr`, `price_usd`, `sku`, `category`, `show_on_website`, and `updatedAt` all identical throughout |
| 6 | Backend syntax checks | `node --check server/server.js` → OK; `node --check server/dbQueries.js` → OK (unmodified, checked for completeness) |
| 6b | Frontend build | Not run — no frontend files were changed by this ticket |

### Test data cleanup

Order requests id 5 and id 6 (created during tests 1 and 4 above) were deleted from the local dev database after testing, matching this repo's existing convention for QA test-data cleanup (see ORD-01/ORD-02 results docs). Pre-existing test data (id 4, from prior ORD-02 testing) was left untouched. This is local-dev-only data; no production database was touched.

## Safety confirmation

- ✅ No artwork data modified — verified directly via the public artwork API before/after all testing.
- ✅ No category data modified.
- ✅ No pricing data modified.
- ✅ No SKU data modified.
- ✅ No inventory quantity/status modified.
- ✅ No existing order request rows modified, except the single explicit admin status-update test (id 5, `NEW` → `REVIEWING`), which is an intended, in-scope test of existing admin functionality, not a side effect of this change.
- ✅ No order requests were deleted except the QA test rows created by this session's own testing (ids 5, 6) — a standard cleanup step, not a change to pre-existing data.
- ✅ No Inventory Preview run.
- ✅ No Inventory Apply run.
- ✅ No production import run.
- ✅ No price recalculation run.
- ✅ No checkout/payment/shipping/tax behavior added.
- ✅ No change to public catalog visibility/orderability rules — the public/orderable definition (`status IN ('IN_STOCK','MADE_TO_ORDER') AND show_on_website=true`) is untouched; this ticket only adds a maintenance-mode gate in front of the existing submission logic.
- ✅ No second maintenance setting created — `getMaintenanceMode()` / `app_settings.maintenance_mode` remains the single source of truth.
- ✅ No broad middleware added — the check is scoped to the single `POST /api/order-requests` route only.
- ✅ No admin route was blocked or altered.
- ✅ No production deploy performed.
- ✅ No production migration performed (none needed — see below).

## Production/deploy note (original implementation)

- No production deployment was performed as part of this ticket.
- No production migration was performed or is required — this change adds no new table, column, or setting; it only adds a conditional read of the already-existing `app_settings.maintenance_mode` value inside an existing route handler.
- This change should be deployed only after WEB-MAINT-01, ORD-01, and ORD-02 are already live in production (or included in the same approved release), since it depends on all three already being present and does nothing on its own without them.

---

## Revalidation after ISYNC-16 merge (2026-07-24)

### Why

ISYNC-16 was merged into `main` after the original WEB-MAINT-02 implementation above, and it touched backend server/Preview-parser behavior (`server/server.js`, `server/inventoryParser.js`). Since WEB-MAINT-02 also modifies backend order-request behavior in `server/server.js`, the branch needed to be updated with latest `main` and fully revalidated before staging/merge, to confirm both changesets coexist correctly. This is a revalidation only — no new feature scope was added.

### Merge confirmation

| Item | Result |
|---|---|
| `main` commit merged into WEB-MAINT-02 | **`53609ea`** — "ISYNC-16 production preview smoke results" |
| Merge sequence followed | `git checkout main` → `git pull origin main --ff-only` (fast-forwarded `4c4c185` → `53609ea`) → `git checkout feature/WEB-MAINT-02-block-order-requests-during-maintenance` → `git merge main` |
| Conflicts occurred | **No.** `git merge` completed automatically via the `ort` strategy (merge commit `038c077`) |
| Conflicting files | None — no manual conflict resolution was needed |
| Files changed by the merge | `server/server.js`, `server/inventoryParser.js`, `docs/inventory-sync/ISYNC-16-preview-validation-results.md` (new file, brought in from `main`) |

Even though there were no `git`-flagged conflicts, both changesets were independently verified to be intact post-merge (not just "no conflict markers"):

- **WEB-MAINT-02 guard preserved:** the maintenance-mode check (`if (await getMaintenanceMode()) { return res.status(503)... }`) is still the first statement inside `POST /api/order-requests` (`server/server.js:1940-1950`), byte-identical to the original implementation.
- **ISYNC-16 changes preserved:** `POST /api/admin/inventory-sync/preview` still contains the Action-based row classification (`CREATE`/`UPDATE`/`NO_CHANGE`), `sheetUsed` detection, and UPDATE-row artwork-ID verification introduced by ISYNC-16 — confirmed by diffing `server/server.js` between `4c4c185` (pre-ISYNC-16) and `53609ea` (post-ISYNC-16) and cross-checking the merged file contains the same logic.
- **No overlap between the two changesets:** ISYNC-16's changes are entirely scoped to the `/api/admin/inventory-sync/preview` handler and `server/inventoryParser.js`; WEB-MAINT-02's changes are entirely scoped to `POST /api/order-requests`. The two routes share no code path, and `getMaintenanceMode()` itself (`server/server.js:42-52`) was untouched by ISYNC-16.

### Local revalidation results

Backend started locally (`node server/server.js`) against local Postgres (`DATABASE_URL` pointing at `localhost:5432`), branch at merge commit `038c077`.

| # | Test | Result |
|---|---|---|
| 1 | Syntax checks | `node --check server/server.js` → OK; `node --check server/dbQueries.js` → OK |
| 2 | Maintenance OFF — submit valid request (`art-1782445237565`, size 646) | `201`, order id 8 created |
| 2b | Appears in admin | `GET /api/admin/order-requests` → `200`, id 8 present |
| 3 | Maintenance ON via `PATCH /api/admin/settings/maintenance-mode` | `200`, confirmed via `GET /api/config/maintenance-mode` → `true` |
| 3b | Valid payload while ON | `503 { "error": "Site is temporarily under maintenance. Please try again later." }` |
| 3c | Invalid/empty payload (`{}`) while ON | Still `503` with the same message — **not** `400` — maintenance check confirmed to run before validation |
| 3d | No new `order_requests`/`order_request_items` rows from blocked attempts | `GET /api/admin/order-requests` unchanged (still only ids 8, 7, 4) |
| 4 | Admin login reachable during maintenance | Wrong password → `401 "Invalid credentials"`, not `503` |
| 4b | Admin order request list | `200` |
| 4c | Admin order request detail (id 8) | `200` |
| 4d | Admin order request status update (id 8: `NEW` → `REVIEWING`) | `200` |
| 4e | Admin turns maintenance OFF | `200`, `{"maintenanceMode":false}` |
| 5 | Maintenance OFF again — submit valid request | `201`, order id 9 created — confirms immediate recovery, no restart needed |
| 6 | **ISYNC-16 Preview endpoint smoke test** | See dedicated section below |
| 7 | Safety: artwork data unchanged | `GET /api/artworks/art-1782445237565` identical before/after (status, quantity, price_inr/usd, sku, category, show_on_website, updatedAt) |

**Local cleanup:** order request ids 8 and 9 (created during this revalidation) were deleted from the local dev DB afterward. Pre-existing rows (id 7, id 4, from prior sessions) were left untouched.

### ISYNC-16 Preview smoke result

Per the ticket's restriction, only the **Preview** endpoint was smoke-tested — no Apply, no production import, no price recalculation.

- Generated a minimal one-row test workbook (`Inventory_Import` sheet, header row `Action | Item Description | Category | ArtCode | Inventory Status | Quantity | Price INR`, one `CREATE` row) in the session scratchpad (not committed to the repo).
- `POST /api/admin/inventory-sync/preview` (admin-authenticated) → **`200`**.
- Response: `sheetUsed: "Inventory_Import"` ✅ (correct sheet-name detection, the core ISYNC-16 behavior), `detectedColumns` matched the workbook headers, 1 row classified as `CREATE` with zero errors, `summary.totalRows: 1`.
- Confirmed the Preview call performed **no write**: re-queried `GET /api/artworks` afterward and confirmed no artwork titled "WEB-MAINT-02 smoke test item" exists in the database — Preview remained read-only, as designed.
- **Conclusion: ISYNC-16 Preview/parser behavior was not broken by the merge.**

### Railway staging validation

**Method:** per this repo's established convention (see `docs/inventory-sync/ISYNC-09-staging-production-readiness-runbook.md`), staging validation runs the local backend (this branch's code) with `DATABASE_URL` pointed at the Railway staging Postgres instance, rather than a separately deployed staging app server.

| Item | Result |
|---|---|
| Staging DB host | `shinkansen.proxy.rlwy.net:41009` |
| Confirmed NOT production | ✅ — host does not contain `crossover` (the production host, `crossover.proxy.rlwy.net:54308`, was never used); `current_database()` returned `railway`; the known staging-only artwork `art-1783882548608` ("SKU-STAG-TEST S12a") was present, matching prior staging validation docs (ISYNC-16, INV-SKU-01) |
| Admin login used | `cks-admin` (documented staging admin account from prior INV-SKU-01/ISYNC-16 validation) — real login, not a minted token |

**Before counts:**

| Table | Count |
|---|---|
| artworks | 67 |
| artwork_sizes | 68 |
| categories | 7 |
| order_requests | 0 |
| order_request_items | 0 |

**Validation steps:**

| # | Test | Result |
|---|---|---|
| 1 | Maintenance OFF — submit valid public order request (`art-1783882548608`) | `201`, **staging test order_request id = 4** |
| 2 | Admin login (`cks-admin`) | `200`, valid token issued |
| 3 | Turn maintenance mode ON | `200`, confirmed via `GET /api/config/maintenance-mode` → `true` |
| 4 | Valid payload while ON | `503 { "error": "Site is temporarily under maintenance. Please try again later." }` |
| 5 | Invalid/empty payload (`{}`) while ON | Still `503`, not `400` — maintenance check runs before validation on staging too |
| 6 | Confirm no new rows from blocked attempts | `GET /api/admin/order-requests` → only id 4 present (from step 1); no additional rows |
| 7 | Admin login reachable during maintenance | `200` (re-logged in while maintenance was ON) |
| 8 | Admin order request list during maintenance | `200` |
| 9 | Admin order request detail (id 4) during maintenance | `200` |
| 10 | Admin order request status update (id 4: `NEW` → `REVIEWING`) during maintenance | `200` |
| 11 | Turn maintenance mode OFF | `200`, `{"maintenanceMode":false}` |
| 12 | **Confirm final maintenance state** | `GET /api/config/maintenance-mode` → **`{"maintenanceMode":false}`** ✅ |

**Test request IDs created on staging:** `order_requests.id = 4` (single test row; the blocked attempts in steps 4–5 created no rows).

**Cleanup:** `DELETE FROM order_requests WHERE id = 4` — deleted directly (cascade removed its 1 `order_request_items` row). Confirmed `order_requests` count returned to `0` immediately after.

**After counts:**

| Table | Before | After | Match |
|---|---|---|---|
| artworks | 67 | 67 | ✅ unchanged |
| artwork_sizes | 68 | 68 | ✅ unchanged |
| categories | 7 | 7 | ✅ unchanged |
| order_requests | 0 | 0 | ✅ back to expected count after cleanup |
| order_request_items | 0 | 0 | ✅ back to expected count after cleanup |

**Additional safety check:** re-fetched `GET /api/artworks/art-1783882548608` after all staging testing — `price_inr` (500.00), `price_usd` (12.00), `sku` (`CKS-2026-LA-00001`), `status` (`IN_STOCK`), `quantity` (1), `category` (`lippan-art`) all identical to the values captured in the test request's own snapshot at creation time. No drift.

**Credential handling note:** the staging database connection string was supplied by the user directly into the local, gitignored `server/.env` file (never pasted into chat/commits). It was used only for the duration of this validation and the local `.env` was restored to its original local-Postgres `DATABASE_URL` immediately afterward. No staging credentials appear in this document, any commit, or any other tracked file.

### Safety confirmations (revalidation)

- ✅ Local: no artwork/category/pricing/SKU/inventory data changed (verified before/after).
- ✅ Staging: no artwork/category/pricing/SKU/inventory data changed — before/after counts identical for `artworks`, `artwork_sizes`, `categories`; test artwork's own fields unchanged.
- ✅ No Inventory Apply run (local or staging) — only the Preview endpoint was smoke-tested, exactly as instructed.
- ✅ No production import run.
- ✅ No price recalculation run.
- ✅ No production database accessed at any point (`crossover.proxy.rlwy.net:54308` never used; confirmed staging host `shinkansen.proxy.rlwy.net:41009` before every staging operation).
- ✅ No production migration run.
- ✅ No production deploy performed.
- ✅ No PR was merged.
- ✅ Staging test order-request rows were created only for this validation and fully cleaned up (id 4 deleted; counts confirmed returned to pre-test values).
- ✅ Maintenance mode left in its correct final state (**OFF**) on both local and staging after validation.
- ✅ `server/.env` (containing the staging credential) was never committed — it is gitignored and was restored to its local-only value after use.
- ✅ No temp scripts, workbooks, or logs were committed — the smoke-test workbook and token files were created in the session scratchpad (outside the repo) and/or removed after use.

### Production/deploy note (revalidation)

- No production deployment was performed.
- No production migration was performed or is required — unchanged from the original implementation; this revalidation confirmed the same holds true after the ISYNC-16 merge (ISYNC-16 itself required no new migration for this behavior either).
- No PR was merged as part of this revalidation, per the ticket's restrictions.
- **WEB-MAINT-02 is ready for merge/deploy approval**, contingent on the acceptance criteria below.

---

## Refresh after ISYNC-17 merge (2026-07-24) {#refresh-after-isync-17-merge-2026-07-24-2}

### Why

Before final validation/merge approval, ISYNC-17 was merged into `main` first and touched backend files (`server/server.js`, `server/dbQueries.js`, `server/inventoryParser.js`) — specifically Apply/import validation behavior. Since WEB-MAINT-02 also modifies `server/server.js`, the branch was refreshed with latest `main` and revalidated again before proceeding to final approval. This is a refresh/revalidation only — no new feature scope was added.

### Merge confirmation

| Item | Result |
|---|---|
| `main` commit merged into WEB-MAINT-02 | **`83f81e2`** — "Merge pull request #25 from NarlaSR/feature/ISYNC-17-apply-import-validation" |
| Was ISYNC-17 included in main? | **Yes**, confirmed before merging — `git log origin/main` showed `83f81e2` (merge) and `86d9aa6` ("ISYNC-17 apply import validation") at the tip, on top of the previously-merged ISYNC-16 commits |
| Merge sequence followed | `git checkout main` → `git pull origin main --ff-only` (fast-forwarded `53609ea` → `83f81e2`) → confirmed ISYNC-17 present → `git checkout feature/WEB-MAINT-02-block-order-requests-during-maintenance` → `git merge main` |
| Conflicts occurred | **No.** `git merge` completed automatically via the `ort` strategy (merge commit `e379168`) |
| Conflicting files | None — no manual conflict resolution was needed |
| Files changed by the merge | `server/server.js`, `server/dbQueries.js`, `server/inventoryParser.js`, `docs/inventory-sync/ISYNC-17-apply-import-validation-results.md` (new file, brought in from `main`) |

As with the ISYNC-16 merge, both changesets were independently verified intact post-merge — not just "no conflict markers":

- **WEB-MAINT-02 guard preserved, not broadened:** the maintenance-mode check is still the first statement inside `POST /api/order-requests` (`server/server.js:1936-1946`), byte-identical to before. Grepped every call site of `getMaintenanceMode()` in the merged file — it appears only at its own definition, the two pre-existing `GET /api/config/maintenance*` status endpoints (from WEB-MAINT-01), and the order-requests route. **It does not appear in any admin route** — confirming the guard was not broadened to admin routes, per the ticket's explicit restriction.
- **ISYNC-17 changes preserved:** `POST /api/admin/inventory-sync/apply` still contains ISYNC-17's Apply-level category resolution, batch error-blocking, and the transactional create/update logic; `server/dbQueries.js` still contains the new `updateArtworkFromInventoryById()` function (ISYNC-17's ID-based artwork lookup for Apply, as opposed to the legacy SKU-based lookup).
- **No overlap between the two changesets:** diffed `server/dbQueries.js` between `53609ea` (pre-ISYNC-17) and `83f81e2` (post-ISYNC-17) — the only change is the addition of `updateArtworkFromInventoryById()`, which is not called anywhere in the order-request code path (`createOrderRequest`, `getOrderRequestsAdmin`, `getOrderRequestById`, `updateOrderRequestStatus` are all untouched). WEB-MAINT-02 has never modified `dbQueries.js`, so there was nothing for ISYNC-17 to conflict with there.

### Local revalidation results

Backend started locally (`node server/server.js`) against local Postgres, branch at merge commit `e379168`.

| # | Test | Result |
|---|---|---|
| 1 | Syntax checks | `node --check server/server.js` → OK; `node --check server/dbQueries.js` → OK |
| 2 | Maintenance OFF — submit valid request (`art-1782445237565`, size 646) | `201`, order id 10 created |
| 3 | Maintenance ON via `PATCH /api/admin/settings/maintenance-mode` | `200`, confirmed via `GET /api/config/maintenance-mode` → `true` |
| 3b | Valid payload while ON | `503 { "error": "Site is temporarily under maintenance. Please try again later." }` |
| 3c | Invalid/empty payload (`{}`) while ON | Still `503` with the same message — **not** `400` — maintenance check confirmed to still run before validation after the ISYNC-17 merge |
| 3d | No new `order_requests`/`order_request_items` rows from blocked attempts | `GET /api/admin/order-requests` unchanged (still only ids 10, 7, 4) |
| 4 | Admin login reachable during maintenance | Wrong password → `401 "Invalid credentials"`, not `503` |
| 4b | Admin order request list | `200` |
| 4c | Admin order request detail (id 10) | `200` |
| 4d | Admin order request status update (id 10: `NEW` → `REVIEWING`) | `200` |
| 4e | Admin turns maintenance OFF | `200`, `{"maintenanceMode":false}` |
| 5 | **Confirm final maintenance state** | `GET /api/config/maintenance-mode` → **`{"maintenanceMode":false}`** ✅ |
| 6 | Maintenance OFF again — submit valid request | `201`, order id 11 created — confirms immediate recovery, no restart needed |
| 7 | Safety: artwork data unchanged | `GET /api/artworks/art-1782445237565` identical before/after (status, quantity, price_inr/usd, sku, category, show_on_website, updatedAt) |

**Local cleanup:** order request ids 10 and 11 (created during this refresh) were deleted from the local dev DB afterward. Pre-existing rows (id 7, id 4, from prior sessions) were left untouched.

### ISYNC Preview/Apply route smoke results

Per the ticket's restriction, Apply was never executed — only route accessibility/safety was smoke-tested for the Apply endpoint, and the Preview endpoint was smoke-tested normally (it is read-only by design).

**Preview route** (`POST /api/admin/inventory-sync/preview`) — full smoke test:
- Generated a minimal one-row test workbook (`Inventory_Import` sheet, one `CREATE` row) in the session scratchpad (not committed to the repo).
- Response: **`200`**, `sheetUsed: "Inventory_Import"` ✅, row correctly classified `CREATE` with zero errors, `summary.totalRows: 1`.
- Confirmed no write occurred: re-queried `GET /api/artworks` and found no artwork matching the smoke-test title.
- **Conclusion: Preview/parser behavior was not broken by the ISYNC-17 merge.**

**Apply route** (`POST /api/admin/inventory-sync/apply`) — accessibility/safety smoke only, Apply never executed:
- Captured artwork count **before**: `37`.
- Unauthenticated request → **`401` "Access token required"** — route requires admin auth, as expected.
- Authenticated request with no file → **`400` "No workbook uploaded..."** — route reachable and validates input before any parsing.
- Authenticated request with a **deliberately invalid** workbook (bad `Action` value) → **`422` "Batch blocked — fix all errors before applying."**, `createdCount: 0, updatedCount: 0, skippedCount: 0` — the row-validation block in the Apply handler runs and blocks the entire batch *before* the pricing-settings fetch, the transaction, or any write, exactly as designed. This is the safe way to exercise the route's reachability without ever reaching the write path.
- Captured artwork count **after**: `37` — **unchanged**, confirming no Apply write occurred.
- **No Apply was run. No data was imported. No artwork/inventory data was modified.**

### Test request cleanup status

| Environment | Test rows created | Cleaned up |
|---|---|---|
| Local | `order_requests` ids 10, 11 | ✅ Deleted; `order_request_items` cascade-deleted with them |

No staging validation was performed as part of this refresh (not requested in this ticket — only local revalidation was required).

### Safety confirmations (refresh)

- ✅ No artwork/category/pricing/SKU/inventory data changed — verified before/after via the artwork API (byte-identical snapshot) and artwork count (`37` → `37`, unchanged through the Apply safety smoke).
- ✅ No Inventory Apply run — the Apply route was only probed for reachability/auth/input-validation behavior; the one workbook submitted to it was deliberately invalid so it could never reach the write path.
- ✅ No production import run.
- ✅ No price recalculation run.
- ✅ No production database accessed.
- ✅ No production migration run.
- ✅ No production deploy performed.
- ✅ No PR was merged.
- ✅ Maintenance guard was **not** broadened to admin routes — confirmed by checking every `getMaintenanceMode()` call site in the merged file.
- ✅ WEB-MAINT-02's 503 maintenance guard was **not** removed or altered — byte-identical to its original implementation.
- ✅ ISYNC-17's Apply/import validation changes were **not** overwritten — confirmed present and functioning (batch-blocking on row errors) after the merge.
- ✅ `server/.env` was not modified this round (local DB only was used; no staging credentials involved in this refresh).
- ✅ No temp scripts, workbooks, or logs were committed — both smoke-test workbooks were created in the session scratchpad and removed from the repo directory immediately after use.
- ✅ Local test order-request rows (ids 10, 11) fully cleaned up.

### Production/deploy note (refresh)

- No production deployment was performed.
- No production migration was performed or is required.
- No PR was merged, per the ticket's restrictions.
- **WEB-MAINT-02 remains ready for final merge/deploy approval** — the branch is current with `main` through ISYNC-17 (`83f81e2`), both changesets are confirmed intact and non-overlapping, and all local validation passes.

---

## Railway staging validation after ISYNC-17 (2026-07-24) {#railway-staging-validation-after-isync-17-2026-07-24}

### Why

Local revalidation after the ISYNC-17 merge (above) passed. This section runs the required Railway staging validation before final merge/deploy approval, confirming the same behavior holds against the real staging database and staging admin account, not just local Postgres.

### Branch / merge confirmation

| Item | Result |
|---|---|
| Branch | `feature/WEB-MAINT-02-block-order-requests-during-maintenance` |
| Latest `main` merged (includes ISYNC-17) | ✅ Confirmed via `git merge-base --is-ancestor origin/main HEAD` → true. Latest main commit: `83f81e2` |
| Git status | Clean except pre-existing unrelated untracked files (inventory-sync/POST-ORD-QA-01 leftovers from earlier, unrelated sessions) |
| `server/.env` staged/committed | ✅ No — confirmed via `git status --short server/.env` (no output) and `git ls-files server/.env` (not tracked); gitignored per `.gitignore:57` |
| WEB-MAINT-02 guard present | ✅ Confirmed in `server/server.js` — `if (await getMaintenanceMode())` / `"Site is temporarily under maintenance..."` still the first statement in `POST /api/order-requests` |
| ISYNC-17 changes present | ✅ Confirmed — `/api/admin/inventory-sync/apply` route and `updateArtworkFromInventoryById()` in `server/dbQueries.js` both present |
| Syntax checks | `node --check server/server.js` → OK; `node --check server/dbQueries.js` → OK |

### Railway staging target

| Item | Value |
|---|---|
| Staging DB host:port | `shinkansen.proxy.rlwy.net:41009` |
| Confirmed NOT production | ✅ — host does not contain `crossover`; `crossover.proxy.rlwy.net:54308` was never used or connected to |
| Method | Local backend (this branch's code) run with `DATABASE_URL` pointed at the Railway staging Postgres, per this repo's established staging-validation convention |
| Credential handling | Staging connection string was already saved (from the prior ISYNC-16 staging round) in the local, gitignored `server/.env`, reactivated for this validation, and restored to the local-only value immediately after. Never printed in full, never committed, never written to any tracked file |
| Admin account used | `cks-admin` (documented staging admin, real login — not a minted token) |

### Staging before counts

| Table | Count |
|---|---|
| artworks | 67 |
| artwork_sizes | 68 |
| categories | 7 |
| order_requests | 0 |
| order_request_items | 0 |

**Baseline `maintenance_mode` value:** `false` (OFF) — no pre-existing ON state to record or restore; validation proceeded directly.

### Maintenance OFF validation

| Step | Result |
|---|---|
| Submit valid `POST /api/order-requests` (`web-maint-02-staging-test@example.com`, artwork `art-1783882548608`) | `201` — **test request ID = 5** |
| `order_requests` count | `0` → `1` (+1) ✅ |
| `order_request_items` count | `0` → `1` (+1, matches 1 submitted item) ✅ |
| Appears in admin list | `GET /api/admin/order-requests` → `200`, id 5 present |
| Admin detail loads | `GET /api/admin/order-requests/5` → `200`, full snapshot returned |
| Artwork data unchanged | `GET /api/artworks/art-1783882548608` identical before/after (price_inr, price_usd, sku, status, quantity, category all unchanged) |

### Maintenance ON validation

| Step | Result |
|---|---|
| Turn maintenance ON (`cks-admin`) | `200`, confirmed via `GET /api/config/maintenance-mode` → `true` |
| Valid `POST /api/order-requests` while ON | **`503` `{ "error": "Site is temporarily under maintenance. Please try again later." }`** |
| Invalid/empty payload (`{}`) while ON | Still **`503`**, same message — **not** `400` — confirms the maintenance check runs before normal validation on staging too |
| New `order_requests` rows from blocked attempts | `0` — count stayed at `1` (unchanged from the OFF-test row) |
| New `order_request_items` rows from blocked attempts | `0` — count stayed at `1` |

### Admin route validation (maintenance ON)

| Route | Result |
|---|---|
| Admin login (`cks-admin`) | `200` — reachable during maintenance |
| Admin order request list | `200` |
| Admin order request detail (id 5, the test request) | `200` |
| Admin order request status update — **test request id 5 only** (`NEW` → `REVIEWING`) | `200`. No other/real staging order request was touched |
| Admin turns maintenance OFF | `200`, `{"maintenanceMode":false}` |

### Maintenance OFF again

| Step | Result |
|---|---|
| Final `maintenance_mode` state | **`false` (OFF)** ✅ |
| `POST /api/order-requests` works again | `201` — **second test request ID = 6** (`web-maint-02-staging-test-off2@example.com`), created to confirm recovery, then cleaned up |

### ISYNC Preview smoke result

- Minimal one-row `CREATE` test workbook (`Inventory_Import` sheet) submitted to `POST /api/admin/inventory-sync/preview`.
- Response: **`200`**, `sheetUsed: "Inventory_Import"` ✅, row correctly classified `CREATE`, zero errors.
- Confirmed no write: artwork count (public list) unchanged (`39` before and after).
- **Preview/parser behavior confirmed working correctly on staging after the ISYNC-17 merge.**

### Apply route non-write safety smoke result

- Unauthenticated request → **`401` "Access token required"**.
- Authenticated request, no file → **`400` "No workbook uploaded..."**.
- Authenticated request, deliberately invalid workbook (bad `Action` value) → **`422` "Batch blocked — fix all errors before applying."**, `createdCount: 0, updatedCount: 0, skippedCount: 0` — batch rejected before the pricing-settings fetch, the transaction, or any write.
- Artwork count (DB row count) before and after: **`67` → `67`, unchanged**.
- **No Apply was executed. No data was imported.**

### Cleanup confirmation

| Item | Result |
|---|---|
| Test rows deleted | `order_requests` ids `5` (`web-maint-02-staging-test@example.com`) and `6` (`web-maint-02-staging-test-off2@example.com`) — both deleted via a targeted `DELETE ... WHERE customer_email IN (...)`, scoped only to these two test emails |
| `order_request_items` | Cascade-deleted along with their parent rows |
| Confirmed gone | Re-queried both ids after delete — neither present |
| Real staging order requests | None existed before this validation (baseline was `0`) and none were created or touched outside the two test rows above |

### Staging after counts

| Table | Before | After | Match |
|---|---|---|---|
| artworks | 67 | 67 | ✅ unchanged |
| artwork_sizes | 68 | 68 | ✅ unchanged |
| categories | 7 | 7 | ✅ unchanged |
| order_requests | 0 | 0 | ✅ back to baseline after cleanup |
| order_request_items | 0 | 0 | ✅ back to baseline after cleanup |

### Safety confirmations (staging validation)

- ✅ No artwork/category/pricing/SKU/inventory data changed — before/after counts identical for `artworks`, `artwork_sizes`, `categories`; test artwork's own fields unchanged throughout.
- ✅ No Inventory Apply run — only reachability/auth/input-validation was smoke-tested; the one workbook submitted to Apply was deliberately invalid so it could never reach the write path.
- ✅ No production import run.
- ✅ No price recalculation run.
- ✅ No production database accessed — confirmed `shinkansen.proxy.rlwy.net:41009` (staging) before every operation; `crossover.proxy.rlwy.net:54308` (production) never used.
- ✅ No production migration run.
- ✅ No production deploy performed.
- ✅ No PR was merged.
- ✅ Maintenance mode left **OFF** at the end (final state confirmed via `GET /api/config/maintenance-mode`).
- ✅ Only staging test order requests created during this validation were deleted (ids 5, 6, matched by test email); no real staging order requests existed or were touched.
- ✅ Admin status-update testing was performed only on the test request (id 5) created in this run — no real staging customer/order data was modified.
- ✅ `server/.env` was not committed — used only as a temporary local override, restored to the local-only value immediately after validation, and remains gitignored throughout.
- ✅ No temp scripts, workbooks, payload files, or logs were committed — both smoke-test workbooks were created in the session scratchpad and removed from the repo directory immediately after use; temp token files were deleted after use.
- ✅ No secrets were printed in full or written to any tracked file.

### Production/deploy note (staging validation)

- No production deployment was performed.
- No production migration was performed or is required.
- No production import was run.
- No price recalculation was run.
- No PR was merged, per the ticket's restrictions.
- **WEB-MAINT-02 has now passed local validation and Railway staging validation after both the ISYNC-16 and ISYNC-17 merges.** The branch is current with `main` (`83f81e2`), both the WEB-MAINT-02 maintenance guard and the ISYNC-16/ISYNC-17 Preview/Apply changes are confirmed intact and functioning correctly together, and all acceptance criteria for merge/deploy approval are met.
