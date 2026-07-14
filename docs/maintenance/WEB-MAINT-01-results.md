# WEB-MAINT-01 — Public Website Maintenance Mode Toggle

## Summary

Added a public-site maintenance mode that can be toggled with a single
environment variable. When enabled, public visitors see a friendly
maintenance message instead of the homepage, gallery/catalog, or artwork
detail pages. Admin login, the admin dashboard, and backend health/status
endpoints are unaffected in both states.

## Files changed

- [server/server.js](../../server/server.js)
  - Added `MAINTENANCE_MODE` config, read from `process.env.MAINTENANCE_MODE`.
  - Added `GET /api/health` — simple status endpoint (didn't previously exist).
  - Added `GET /api/config/maintenance` — returns `{ "maintenanceMode": boolean }`
    for the frontend to poll. No secrets are exposed.
- [src/App.js](../../src/App.js)
  - Extracted the public route tree into a `PublicSite` component.
  - `PublicSite` calls `useMaintenanceMode()` and renders the `Maintenance`
    page instead of `Header` / public `Routes` / `Footer` when enabled.
  - Admin routes (`/ckk-secure-admin*`, `/debug-env`) are declared outside
    `PublicSite` and are never gated by maintenance mode.
- [src/hooks/useMaintenanceMode.js](../../src/hooks/useMaintenanceMode.js) (new)
  - Fetches `GET /api/config/maintenance` once on mount.
  - Fails open (`maintenanceMode: false`) if the request errors, so a backend
    hiccup doesn't accidentally lock out the whole public site.
- [src/pages/Maintenance.js](../../src/pages/Maintenance.js) (new)
  - Simple branded maintenance page with the required message:
    "Chitrakala Arts is temporarily under maintenance. Please check back soon."
- [src/styles/Maintenance.css](../../src/styles/Maintenance.css) (new)
  - Lightweight styling using the site's existing CSS variables
    (`--primary-color`, `--secondary-color`, `--text-light`, `--white`).

No other files were touched. No database migration, artwork/category data,
pricing logic, or checkout/order functionality was added or modified.

## Configuration

- Environment variable: `MAINTENANCE_MODE`
- Set on the backend (Railway/server environment), e.g. `MAINTENANCE_MODE=true`.
- Parsing rule (in `server/server.js`):
  ```js
  const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE === 'true';
  ```
- Only the exact string `"true"` enables maintenance mode. Missing, empty,
  `"false"`, or any other value is treated as disabled.
- **Default: OFF** (disabled) when the variable is unset.
- The frontend has no build-time flag — it reads the live value from
  `GET /api/config/maintenance` at runtime, so toggling the backend env var
  and restarting the backend is enough; no frontend rebuild/redeploy needed.

## How gating works

- The frontend and backend are deployed separately (frontend on Vercel-style
  static hosting, backend as an Express API). Maintenance mode is enforced
  entirely on the frontend router:
  - The public route branch (`/`, `/category/:categoryId`, `/art/:artId`,
    `/about`, `/contact`) is rendered by a single `PublicSite` component that
    checks maintenance status before rendering anything else, so no partial
    catalog content (cards, "Loading...", API errors) is shown before the
    maintenance page appears.
  - Admin routes (`/ckk-secure-admin`, `/ckk-secure-admin/dashboard`, etc.)
    and `/debug-env` are declared as separate top-level routes in `App.js`
    and are unconditionally rendered — they never call `useMaintenanceMode`.
  - Backend API routes are **not** gated. Public and admin pages share several
    read endpoints (e.g. `GET /api/artworks`, `GET /api/categories`), so
    blocking them at the API layer would risk breaking the admin dashboard.
    Restricting the gate to the frontend router avoids touching that shared
    logic, per the ticket's guidance to change route-gating logic only if
    "absolutely necessary."

## Manual validation performed

Tested locally: backend on `http://localhost:5050`, frontend (CRA dev server)
on `http://localhost:3000` with `REACT_APP_API_URL=http://localhost:5050`.

### A. `MAINTENANCE_MODE=false` (default/off)

| Route | Result |
|---|---|
| `GET /api/health` | `{"status":"ok"}` ✅ |
| `GET /api/config/maintenance` | `{"maintenanceMode":false}` ✅ |
| `GET /api/artworks`, `GET /api/categories` | 200 OK ✅ |
| `/` (public homepage) | Loads normally — categories + featured artworks sections render ✅ |
| `/category/dot-mandala` | Loads normally (CategoryPage renders, fetches data) ✅ |
| `/ckk-secure-admin` (admin login) | Loads normally ✅ |

### B. `MAINTENANCE_MODE=true` (on)

| Route | Result |
|---|---|
| `GET /api/health` | `{"status":"ok"}` ✅ still accessible |
| `GET /api/config/maintenance` | `{"maintenanceMode":true}` ✅ |
| `POST /api/auth/login` | Reachable (returns validation error for bad test creds, not blocked) ✅ |
| `/` (public homepage) | Shows maintenance message, no catalog content ✅ |
| `/category/dot-mandala` | Shows maintenance message ✅ |
| `/art/12345` | Shows maintenance message ✅ |
| `/ckk-secure-admin` (admin login) | Loads normally — login form renders, not gated ✅ |
| `/ckk-secure-admin/dashboard` (unauthenticated) | Client-side auth guard redirects to login, as it does with maintenance off — not replaced by the maintenance page ✅ |
| `/ckk-secure-admin` → log in → dashboard (authenticated) | Full admin dashboard loaded after login: artwork table with real data, Add/Edit/Delete actions, "Manage Categories" sub-page navigated to successfully and listed all 5 categories. No console errors. ✅ |

## Confirmations

- ✅ Admin routes (`/ckk-secure-admin*`) remain accessible in both modes.
- ✅ Backend health/status endpoint (`/api/health`) and config endpoint
  (`/api/config/maintenance`) remain accessible in both modes.
- ✅ No database migration was created or run.
- ✅ No artwork, category, pricing, workbook, or inventory sync data or logic
  was changed.
- ✅ No checkout/order functionality was added.
- ✅ Default behavior (unset `MAINTENANCE_MODE`) is OFF.
