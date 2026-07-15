# WEB-MAINT-01 — Public Website Maintenance Mode Toggle

## Summary

Public-site maintenance mode is now controlled from the **admin UI**, persisted
in the database, and takes effect immediately for public visitors — no code
change, environment variable edit, or redeploy required. When enabled, public
visitors see a friendly maintenance message instead of the homepage,
gallery/catalog, or artwork detail pages. Admin login, the admin dashboard,
and backend health/config endpoints are unaffected in both states.

The original implementation (env-var-only) is superseded by this
DB-backed toggle per PR review feedback: an env/config-only switch isn't
practical for business use, since the site owner would need a code/env change
and redeploy just to turn it on or off. The `MAINTENANCE_MODE` env var is now
only a fallback/default, not the primary control.

## Files changed (this update)

- [server/db.js](../../server/db.js)
  - Added an idempotent migration: `CREATE TABLE IF NOT EXISTS app_settings
    (key, value, updated_at, updated_by)` plus a seed `INSERT ... ON CONFLICT
    (key) DO NOTHING` for `maintenance_mode = 'false'`. Runs automatically via
    the existing `initializeDatabase()` call on every server start — same
    pattern already used for `pricing_settings`.
- [server/dbQueries.js](../../server/dbQueries.js)
  - Added `getAppSetting(key)` / `setAppSetting(key, value, updatedBy)`,
    mirroring the existing `getPricingSetting` / `updatePricingSetting`
    pattern.
- [server/server.js](../../server/server.js)
  - Replaced the hardcoded `MAINTENANCE_MODE` env constant with
    `getMaintenanceMode()`: reads `app_settings.maintenance_mode` first, falls
    back to `process.env.MAINTENANCE_MODE === 'true'` if no DB value exists or
    the DB read fails.
  - `GET /api/config/maintenance-mode` (new) — public-safe, returns
    `{ maintenanceMode }` for the frontend to poll.
  - `GET /api/config/maintenance` — kept as a deprecated alias returning the
    same shape, for backward compatibility.
  - `GET /api/admin/settings/maintenance-mode` (new, `authenticateToken`) —
    returns `{ maintenanceMode, updatedAt, updatedBy }`.
  - `PATCH /api/admin/settings/maintenance-mode` (new, `authenticateToken`) —
    validates `{ maintenanceMode: boolean }`, persists it via
    `setAppSetting`, stamps `updated_by` with the authenticated admin's
    username, returns the updated state.
- [src/hooks/useMaintenanceMode.js](../../src/hooks/useMaintenanceMode.js)
  - Now polls `GET /api/config/maintenance-mode` (new endpoint name). Still
    fails open (`maintenanceMode: false`) on error.
- [src/pages/AdminSettingsPage.js](../../src/pages/AdminSettingsPage.js)
  - Added a "Maintenance Mode" section (Site Settings page) with a toggle
    switch showing current state, a confirmation prompt when turning ON, and
    a "Last changed" timestamp/admin username. Calls the new admin API on
    toggle; the change is live for public visitors immediately.

No artwork, category, order, or inventory data/logic was touched. No
Inventory Preview/Apply was run. No prices were recalculated.

## How it works now

- **Source of truth:** `app_settings` table, key `maintenance_mode`, value
  `'true'` / `'false'`.
- **Read order:** DB value (if the row exists) → `process.env.MAINTENANCE_MODE
  === 'true'` (fallback/default only, e.g. before any admin has toggled it,
  or if the DB read throws) → `false`.
- **Write path:** Admin logs into `/ckk-secure-admin` → Site Settings →
  Maintenance Mode toggle → `PATCH /api/admin/settings/maintenance-mode` →
  row upserted with `updated_at` / `updated_by`.
- **No redeploy needed:** the backend re-reads the DB value on every request
  to the config endpoints; the frontend re-polls on each page load. Toggling
  takes effect for the next request/page load with no server restart.
- **Admin routes are never gated.** `PublicSite` (the maintenance-aware
  wrapper) only wraps the public route branch in `src/App.js`; admin routes
  (`/ckk-secure-admin*`, `/debug-env`) are declared as separate top-level
  routes and never call `useMaintenanceMode`.
- **Backend API routes are not gated,** for the same reason as the original
  implementation: several read endpoints are shared between public and admin
  pages, and gating them at the API layer would risk breaking the admin
  dashboard.

## Manual validation performed

Tested locally: backend on `http://localhost:5000` (local Postgres via
`DATABASE_URL`), frontend (CRA dev server) on `http://localhost:3000`.

### Idempotent migration

- Restarted the backend twice against the same local database; both times
  logged `✅ Database schema initialized successfully` with no errors, and
  the existing `maintenance_mode` row (once set) was left untouched by the
  seed `INSERT ... ON CONFLICT DO NOTHING`.

### Backend API

| Call | Result |
|---|---|
| `GET /api/health` | `{"status":"ok"}` ✅ |
| `GET /api/config/maintenance-mode` (off) | `{"maintenanceMode":false}` ✅ |
| `GET /api/config/maintenance` (deprecated alias) | Same response as above ✅ |
| `GET /api/admin/settings/maintenance-mode`, no token | `401` ✅ |
| `PATCH /api/admin/settings/maintenance-mode`, no token | `401` ✅ |
| `GET /api/admin/settings/maintenance-mode`, valid admin token | `{"maintenanceMode":false,"updatedAt":...,"updatedBy":null}` ✅ |
| `PATCH ... {"maintenanceMode":true}`, valid admin token | `{"maintenanceMode":true,"updatedAt":...,"updatedBy":"admin"}` ✅ |
| `GET /api/config/maintenance-mode` (immediately after, same running server) | `{"maintenanceMode":true}` ✅ — no restart |
| `GET /api/health` (while ON) | `{"status":"ok"}` ✅ still accessible |
| `PATCH ... {"maintenanceMode":"yes"}` (invalid type) | `400` ✅ rejected |
| `PATCH ... {"maintenanceMode":false}` | `{"maintenanceMode":false,...}` ✅ |
| `GET /api/categories` (shared read endpoint) | `200 OK` throughout ✅ |

### Admin UI (Site Settings page)

- Logged into `/ckk-secure-admin` as `admin`, navigated to Site Settings.
- Maintenance Mode section showed current state and last-changed
  timestamp/username, matching the API.
- Clicked the toggle to turn it **ON**: confirmation prompt shown, confirmed,
  state persisted, success message shown, section updated to "ON" with a new
  timestamp.
- Clicked the toggle to turn it **OFF**: no confirmation prompt (only
  required when turning on), state persisted, success message shown, section
  updated to "OFF".

### Public site (separate browser tab, same running app, no restart)

| Route | Maintenance ON | Maintenance OFF |
|---|---|---|
| `/` (homepage) | Maintenance message, no catalog content ✅ | Loads normally (categories, featured artworks) ✅ |
| `/category/dot-mandala` | Maintenance message ✅ | Loads normally ✅ |
| `/art/:id` | Maintenance message (verified in the original env-based test; gating logic unchanged) ✅ | Loads normally ✅ |

### Admin access while maintenance mode is ON

- Logged into `/ckk-secure-admin` (fresh sign-in via the login form) while
  maintenance mode was ON: dashboard loaded normally with full artwork table,
  category management, and Site Settings all reachable and functional.
- Note: a full hard-reload (typing a raw admin URL directly, bypassing the
  SPA) can momentarily bounce to the login screen due to a pre-existing
  client-side auth-hydration timing race in `AuthContext`/`AdminDashboard`
  (unrelated to maintenance mode — admin routes are never gated by it, and
  this same race is reproducible with maintenance mode OFF too). Signing in
  through the app, or navigating client-side, works reliably. This is a
  pre-existing condition, out of scope for WEB-MAINT-01.

## Confirmations

- ✅ Admin can turn maintenance mode ON/OFF from the admin UI (Site Settings).
- ✅ Change persists (`app_settings` table in Postgres).
- ✅ Change takes effect without code changes.
- ✅ Change takes effect without redeploy or server restart.
- ✅ Public site shows the maintenance page when ON, behaves normally when
  OFF.
- ✅ Admin login and admin dashboard remain accessible when maintenance mode
  is ON.
- ✅ Health (`/api/health`) and config (`/api/config/maintenance-mode`)
  endpoints remain accessible in both states.
- ✅ `MAINTENANCE_MODE` env var remains only as a fallback/default, not the
  primary control.
- ✅ Migration is idempotent (`CREATE TABLE IF NOT EXISTS`, `INSERT ... ON
  CONFLICT DO NOTHING`) and runs automatically via the existing
  `initializeDatabase()` startup path — no manual migration step needed, and
  it was **not** run against production as part of this change.
- ✅ No artwork, category, order, inventory, or pricing data/logic was
  changed.
- ✅ No Inventory Preview or Inventory Apply was run.
- ✅ No checkout/order functionality was added.
- ✅ No production deploy was performed.
