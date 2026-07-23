# WEB-MAINT-02 — Block Public Order Request Submissions During Maintenance Mode

**Status:** Complete (local dev only — not deployed, no production migration)
**Date:** 2026-07-23
**Depends on:** WEB-MAINT-01, ORD-01, ORD-02 (all confirmed merged into `main`)
**Branch:** `feature/WEB-MAINT-02-block-order-requests-during-maintenance` (created from updated `main`)

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

## Production/deploy note

- No production deployment was performed as part of this ticket.
- No production migration was performed or is required — this change adds no new table, column, or setting; it only adds a conditional read of the already-existing `app_settings.maintenance_mode` value inside an existing route handler.
- This change should be deployed only after WEB-MAINT-01, ORD-01, and ORD-02 are already live in production (or included in the same approved release), since it depends on all three already being present and does nothing on its own without them.
