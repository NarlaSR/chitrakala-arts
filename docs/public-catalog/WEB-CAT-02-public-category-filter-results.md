# WEB-CAT-02 — Fix Public Artworks Category Query Filtering

**Status:** Complete — implemented, local validation fully passed
**Date:** 2026-07-31
**Depends on:** ORD-03 (merged, deployed, production-smoked), ORD-04 (complete, production-smoked), ISYNC-18 (complete, closed), ARCH-INV-02 planning (merged)
**Branch:** `feature/WEB-CAT-02-public-category-filter` (created from updated `main`)

## Preflight

| Check | Result |
|---|---|
| `git checkout main` / `git pull origin main --ff-only` | Fast-forwarded `3654bba` → `99bc015` |
| ORD-03 merged into `main` | ✅ `617c786` "Merge feature/ORD-03-customer-request-confirmation into main" |
| ORD-03 deployed and production-smoked | ✅ `608ef1c` "ORD-03 production smoke results" — confirmed present, reviewed content directly (`docs/orders/ORD-03-production-smoke-results.md`) |
| ORD-04 in `main` and production-smoked | ✅ `f101407` merge + `2fd2e58` "ORD-04 smoke results: owner email confirmed" |
| ISYNC-18 in `main` and closed | ✅ `e67a231` "Merge feature/ISYNC-18-06-next-batch-architecture-readiness into main" |
| ARCH-INV-02 planning merged | ✅ `d399e76` "Merge feature/ARCH-INV-02-planning into main" |
| Git status clean except unrelated untracked files | ✅ Confirmed — same pre-existing untracked leftovers as prior tickets, none touched |
| `server/.env` / secrets / logs / temp scripts staged | ✅ None — `server/.env` not tracked, gitignored |
| Branch created | `feature/WEB-CAT-02-public-category-filter`, from `main` at `99bc015` |

Note: `main` had also advanced with ARCH-INV-03 schema/migration work (`910e4e2`, `99bc015`) by the time this branch was created. That work is unrelated to WEB-CAT-02 and was not touched, per the ticket's explicit "Do not start ARCH-INV-03" restriction.

## Files inspected

- `server/server.js` — `GET /api/artworks` (public), `GET /api/artworks/:id` (public), `GET /api/admin/artworks` (admin), `PATCH /api/admin/artworks/:id/status` (admin), `POST /api/order-requests` (order request creation), `sendOrderRequestNotificationEmail()` (ORD-04 notifier) — read only, to confirm scope of change and non-impact on admin/order-request/ORD-04 code.
- `server/dbQueries.js` — `getArtworks()`, `getArtworksAdmin()`, `getArtworkById()`, `getCategories()`, `getPublicCategories()` — to find the query logic and confirm which functions are shared vs. independent.
- `src/pages/CategoryPage.js` — public category page, to see how it currently fetches/filters artworks.
- `src/services/api.js` — `artworksAPI` — to see whether the frontend ever sends a `category` query param today.
- Local Postgres schema (`information_schema` query) — to confirm whether `artworks.category` has a foreign-key constraint to `categories.id`, and to inspect actual data present locally.

## Bug / root cause summary

`GET /api/artworks` (`server/server.js:518`, before this fix) **never read `req.query.category` at all** — it unconditionally called `db.getArtworks()` with no arguments. `db.getArtworks()` (`server/dbQueries.js:143`, before this fix) had **zero category-awareness**: a fixed, parameterless query returning every public artwork, full stop. Any `?category=<slug>` sent by a client was silently ignored — the API returned the same full public list regardless of the query string, which matches exactly the bug reported during ISYNC-18/ARCH-INV-02A validation.

### Additional finding: the frontend never sends `category=<slug>` today

`src/services/api.js`'s `artworksAPI.getAll()` calls `GET /artworks` with **no query parameters at all**. `src/pages/CategoryPage.js` fetches the full public artwork list and filters **client-side**: `artworksData.filter(art => art.category === categoryId)`. So the frontend was never relying on server-side category filtering to begin with — it works around the bug by filtering in the browser. This is not "the frontend sends the wrong query parameter name" (a stop condition in the ticket); it's that the frontend doesn't send the parameter at all, and doesn't need to for its own current behavior to keep working. Per the ticket's actual goal ("fix the public artworks API so category filtering works correctly on the server side") and its validation checklist (which tests the API directly via `?category=<slug>`, not frontend integration), **no frontend change was required or made** — this is a pure backend contract fix. `CategoryPage.js` continues to work exactly as before (verified live, see Public category page validation below), unaffected by this change either way.

### Schema/data facts confirmed during investigation

- `artworks.category` stores the category **slug** (e.g. `'dot-mandala'`), matching `categories.id` — confirmed via the existing `getPublicCategories()` join (`a.category = c.id`).
- `artworks.category` has **no foreign-key constraint** to `categories.id` (confirmed via `information_schema.table_constraints`) — it's a free-text column, so an artwork can reference a category slug (e.g. `warli-art`, `mixed-art`) even if no matching row exists yet in `categories`.
- Local dev DB categories present: `dot-mandala`, `lippan-art`, `mirror-mosaic`, `texture-art`, `textile-design`. **`warli-art` and `mixed-art` do not exist as category rows locally**, and **zero `NEEDS_REVIEW` artworks exist locally** — the real ISYNC-18 Warli/Mixed Art imports only exist in staging/production, not in this local dev database. This is expected and was accounted for in validation (see below).
- Public visibility filter already existed and is unchanged: `status IN ('IN_STOCK', 'MADE_TO_ORDER') AND show_on_website = true`.
- Admin artwork routes use a completely separate function, `getArtworksAdmin()` (`SELECT * FROM artworks ORDER BY created_at DESC`, no visibility filter, no category param) — confirmed the only caller of `getArtworks()` besides the public route is a one-off, non-request-path utility script (`server/migrateImages.js`), which calls it with zero arguments and is unaffected by the new optional parameter.

## Files changed

- `server/dbQueries.js` — `getArtworks()` now accepts an optional `categorySlug` parameter.
- `server/server.js` — `GET /api/artworks` now reads `req.query.category` and passes it through.

No other file was changed. No migration file added. No frontend file changed.

## Implementation summary

**`server/dbQueries.js`** — `getArtworks(categorySlug = null)`:
- When `categorySlug` is falsy (omitted/`null`): runs the **exact same query, byte-for-byte**, as before this change — no behavior change for the no-category path.
- When `categorySlug` is provided: runs the same visibility-filtered query with an additional `AND category = $1` clause, using a parameterized query (`pool.query(sql, [categorySlug])`) — never string-concatenated into the SQL.

**`server/server.js`** — `GET /api/artworks`:
- Reads `req.query.category`; only treated as a filter if it's a non-empty string after trimming. Anything else (omitted, empty string, non-string) resolves to `null`, preserving the exact prior no-category behavior.
- Passes the resolved value straight through to `db.getArtworks(categorySlug)`.

No schema change, no migration, no change to `getArtworksAdmin()`, `getArtworkById()`, the order-request route, or the ORD-04 notifier.

## Query/filtering behavior

| Request | Behavior |
|---|---|
| `GET /api/artworks` | Unchanged — all public artworks (`status IN ('IN_STOCK','MADE_TO_ORDER') AND show_on_website = true`), same query as before |
| `GET /api/artworks?category=<slug>` | Same visibility filter, plus `AND category = $1` (parameterized) |
| `GET /api/artworks?category=` (empty) | Treated as no filter — same as omitted |
| `GET /api/artworks?category=<malicious string>` | Parameterized query treats it as a literal value — no injection risk, simply matches zero rows if nothing has that literal category value |

## Visibility safety validation

Verified live, not just by code inspection. Inserted a temporary local test artwork (`webcat02-test-warli-hidden`, `status='NEEDS_REVIEW'`, `show_on_website=false`, `category='warli-art'`) to properly exercise the exclusion logic (since no real `NEEDS_REVIEW`/hidden data exists in this local DB):

| Check | Result |
|---|---|
| `GET /api/artworks?category=warli-art` with the hidden test row present | `200`, `count: 0` — test row correctly excluded |
| `GET /api/artworks` (unfiltered) with the hidden test row present | `200`, `count: 37` (unchanged), test row not present |
| `GET /api/admin/artworks` with the hidden test row present | `200`, `count: 38`, test row **present** with correct `status`/`category`/`show_on_website` — confirms admin visibility is unaffected |
| Comprehensive invariant check across unfiltered + all 7 category values (`dot-mandala`, `lippan-art`, `texture-art`, `mirror-mosaic`, `textile-design`, `warli-art`, `mixed-art`) | Every single returned artwork satisfies `status IN ('IN_STOCK','MADE_TO_ORDER')` and `show_on_website === true`; zero `NEEDS_REVIEW` items in any response |
| SQL injection attempt (`category=x'; DROP TABLE artworks; --`) | `200`, `[]` — treated as a literal string value, no error, `artworks` table confirmed intact (still 37 rows) afterward |

Test artwork deleted immediately after validation (see Test data cleanup below).

## Category API validation results

| Slug | Expected | Actual (local) |
|---|---|---|
| *(none)* | All public artworks | `37` — unchanged from pre-fix baseline |
| `dot-mandala` | Only public dot-mandala artworks | `19`, all correctly categorized |
| `lippan-art` | Only public lippan-art artworks | `8`, all correctly categorized |
| `texture-art` | Only public texture-art artworks | `1`, correctly categorized |
| `mirror-mosaic` *(bonus, not explicitly required)* | Only public mirror-mosaic artworks | `3`, correctly categorized |
| `textile-design` *(bonus)* | Only public textile-design artworks | `6`, correctly categorized |
| `warli-art` | `0` (imported Warli items are hidden `NEEDS_REVIEW`) | `0` locally (no local data for this slug at all — the exclusion mechanism itself was separately verified with a temporary local test row, see above, since the real ISYNC-18 Warli import only exists in staging/production) |
| `mixed-art` | `0` (imported Mixed Art item is hidden `NEEDS_REVIEW`) | `0` locally (same caveat as `warli-art`) |

`19 + 8 + 1 + 3 + 6 = 37`, matching the unfiltered total exactly — confirms no artwork is double-counted or missed across categories.

## Public category page validation results

Live-tested `/category/dot-mandala` in the browser: rendered "19 artwork(s) available" with all 19 items listed correctly, matching the API count exactly. Confirms the category page continues to work correctly — it was never dependent on the fixed query parameter (client-side filtering), so this is a pure non-regression confirmation, not a new capability being exercised by the frontend.

## Admin endpoint regression result

✅ **No regression.** `GET /api/admin/artworks` (JWT-protected) still returns every artwork regardless of status/visibility, including the temporary hidden `NEEDS_REVIEW` test row created for validation — confirmed live. `getArtworksAdmin()` was not touched by this change; it remains a fully independent function from the modified `getArtworks()`.

## Order request regression result

✅ **No regression.** Live-tested end-to-end: added a public artwork (`art-1782445237565`) to the request cart, submitted a request with test contact details → `201`, order request `#21` created successfully with correct snapshot data. `POST /api/order-requests` and its underlying `db.getArtworkById()`/`db.createOrderRequest()` calls were not touched by this change.

## ORD-03 confirmation regression result

✅ **No regression.** The same live submission above correctly navigated to `/request-confirmation` and displayed the full expected confirmation content (reference `#21`, contact details, item summary, next-step language, "Return to Gallery"). `src/pages/RequestConfirmation.js` and `src/components/RequestCartModal.js` were not touched by this ticket.

## ORD-04 notification impact confirmation

✅ **Confirmed unaffected — verified live, not just by file inspection.** After the same live order-request submission above, the server log showed: `` "Order request #21: admin notification not sent — RESEND_API_KEY is not configured." `` — identical behavior/message pattern to every prior ticket's validation of this notifier. `sendOrderRequestNotificationEmail()` and its call site were not touched by this change; confirmed via `git diff` that only `GET /api/artworks` and `getArtworks()` were modified.

## Tests added / manual validation explanation

**No backend test framework exists in this repository** — confirmed via search: no `*.test.js`/`*.spec.js` files anywhere outside `node_modules`, no Jest/Mocha/Supertest/Chai dependency in either `package.json`. The only `test` script (`react-scripts test`) is CRA's frontend component-test runner, not applicable to backend API testing. Introducing a new backend test harness from scratch was judged out of scope for "the smallest safe change" this ticket calls for, and isn't required by the ticket's own fallback instruction ("If no practical test harness exists: Document manual/API validation commands and results in the results doc").

**Manual/API validation performed** (all commands run against the local dev backend on `http://localhost:5000`, results captured above):
```
curl -s http://localhost:5000/api/artworks
curl -s "http://localhost:5000/api/artworks?category=dot-mandala"
curl -s "http://localhost:5000/api/artworks?category=lippan-art"
curl -s "http://localhost:5000/api/artworks?category=texture-art"
curl -s "http://localhost:5000/api/artworks?category=warli-art"
curl -s "http://localhost:5000/api/artworks?category=mixed-art"
curl -s "http://localhost:5000/api/artworks?category=x%27%3B%20DROP%20TABLE%20artworks%3B%20--"
curl -s http://localhost:5000/api/admin/artworks -H "Authorization: Bearer <token>"
```
plus a Node script performing a comprehensive invariant check (status/visibility/NEEDS_REVIEW) across every category value and the unfiltered path in one pass, and a full browser-driven order-request submission through to the ORD-03 confirmation page.

## Test data cleanup

| Item | Result |
|---|---|
| Temporary hidden `NEEDS_REVIEW` test artwork (`webcat02-test-warli-hidden`) | ✅ Deleted immediately after the visibility-safety check; confirmed `0` remaining rows with that id |
| Test order request (`#21`, "WEB-CAT-02 Regression Test") | ✅ Deleted after the order-request/ORD-03/ORD-04 regression check |
| Final artwork count | `37` — identical to the pre-change baseline |
| Final category count | `5` — unchanged |

## Safety confirmations

- ✅ No production data modified — all testing was against local Postgres only.
- ✅ No production migration run.
- ✅ No Inventory Preview run.
- ✅ No Inventory Apply run.
- ✅ No artwork published, no SKU generated.
- ✅ The 4 ISYNC-18 hidden imported artworks were not touched — they don't exist in this local database at all (real import only ran in staging/production); the exclusion mechanism was instead verified with a temporary, clearly-labeled local test row that was deleted immediately after use.
- ✅ Order request creation behavior unchanged — verified live, `201` and correct snapshot data.
- ✅ ORD-03 confirmation behavior unchanged — verified live.
- ✅ ORD-04 notification behavior unchanged — verified live via server log, and confirmed via `git diff` that no ORD-04 code was touched.
- ✅ ARCH-INV-03 (already in `main` ahead of this branch) was not touched, started, or extended.
- ✅ No artwork/category/pricing/SKU/inventory data changed — confirmed via before/after counts and direct inspection.
- ✅ Admin endpoints unchanged — confirmed via live regression test.
- ✅ Parameterized SQL used throughout; no string-built SQL from request input; SQL-injection attempt verified harmless.
- ✅ No schema changes, no migration file added.
- ✅ `server/.env` never modified or committed.
- ✅ No secrets, temp scripts, payload files, or logs committed.

## Final git status (initial implementation)

Clean except pre-existing, unrelated untracked files (inventory-sync leftovers, `POST-ORD-QA-01` docs from an earlier, unrelated session) — none touched or committed.

## Ready for PR review (initial implementation)

✅ **Yes.** Root cause identified and fixed with the smallest possible diff (2 files, ~20 lines), no stop conditions were hit, all required local validation passed, and every adjacent system (admin endpoints, order requests, ORD-03, ORD-04) was verified live to be unaffected.

---

## Pre-merge safety refresh after ARCH-INV-03/04/05/06 (2026-08-03)

### Why

By the time this PR was ready to merge, `main` had advanced significantly with ARCH-INV-03 (shipment/physical-inventory schema), ARCH-INV-04 (admin read-only inventory views), ARCH-INV-05 (shipment creation/item assignment), and ARCH-INV-06 (receiving/inspection workflow) — all touching `server/server.js` and `server/dbQueries.js`, the same two files WEB-CAT-02 modifies. This refresh confirms the branch is current with `main`, the merge introduced no unintended changes in either direction, and every adjacent system (ARCH-INV admin endpoints, order requests, ORD-03, ORD-04, admin auth) still works correctly.

### Branch update against latest main

| Step | Result |
|---|---|
| `git fetch origin` | New branches/commits fetched, including `feature/ARCH-INV-06-receiving-inspection-workflow` and `main` advancing `99bc015..cdf7422` |
| `git checkout main && git pull origin main --ff-only` | Fast-forwarded 16 commits, `99bc015` → `cdf7422` |
| Latest main commit | `cdf7422` — "ARCH-INV-06 production smoke results" |

**Dependency commit confirmations** (`git merge-base --is-ancestor <sha> origin/main`):

| Commit | Description | Present in `origin/main`? |
|---|---|---|
| `cf8100a` | ARCH-INV-05 merge commit | ✅ |
| `5bc43a3` | ARCH-INV-05 production smoke/results | ✅ |
| `2a1934d` | ARCH-INV-05 Phase 2 (first shipment production setup) results | ✅ |
| `42db397` | ARCH-INV-04 merge commit | ✅ |
| `99bc015` | ARCH-INV-03 production results | ✅ |
| `608ef1c` | ORD-03 production smoke results | ✅ |

### Was the branch behind main?

**Yes — 16 commits behind.** `git rev-list --count HEAD..origin/main` → `16`.

### How latest main was merged into the branch

```
git checkout feature/WEB-CAT-02-public-category-filter
git merge origin/main -m "Merge latest main (ARCH-INV-04/05/06) into WEB-CAT-02"
```

**Conflicts: none.** Git reported `Auto-merging server/dbQueries.js` and `Auto-merging server/server.js` with no conflict markers. Per the ticket's explicit instruction not to silently trust an auto-merge on these two files, the result was independently verified rather than assumed correct (see below).

### Careful diff review — `server/server.js` and `server/dbQueries.js`

The most rigorous check performed: `git diff origin/main HEAD -- server/server.js server/dbQueries.js`. Since ARCH-INV-03/04/05/06 are already fully present in `origin/main`, this diff isolates **exactly** what the WEB-CAT-02 branch contributes on top of current `main` — and the output was **byte-identical to WEB-CAT-02's original, pre-refresh diff** (the same `getArtworks(categorySlug = null)` change in `dbQueries.js` and the same `req.query.category` read in `server.js`, nothing more, nothing less). This is conclusive proof the merge neither dropped anything from `main` nor introduced anything beyond the original WEB-CAT-02 fix.

Additionally spot-checked directly in the merged file content:

| Item | Verified present/unchanged |
|---|---|
| WEB-CAT-02 category filter fix (route + `getArtworks()`) | ✅ Intact, byte-identical to original |
| ARCH-INV admin shipment endpoints (`POST/GET/PATCH /api/admin/shipments`, `POST/DELETE .../items`) | ✅ All present, all `authenticateToken`-protected |
| ARCH-INV physical inventory endpoints (`GET /api/admin/physical-inventory`, `.../summary`, `PATCH .../:id/status`) | ✅ All present |
| ARCH-INV forward-only shipment transition guard (`SHIPMENT_TRANSITION_MAP`) | ✅ Present, unmodified |
| ARCH-INV query functions in `dbQueries.js` (`createShipmentAdmin`, `updateShipmentAdmin`, `addShipmentItemAdmin`, `removeShipmentItemAdmin`, `getShipmentsAdmin`, `getShipmentByIdAdmin`, `getPhysicalInventoryAdmin`, `updatePhysicalInventoryStatusAdmin`, `getPhysicalInventorySummaryForArtwork`, `getInventoryMovementsAdmin`) | ✅ All present in `dbQueries.js` and in `module.exports` |
| Order request creation (`POST /api/order-requests`), including WEB-MAINT-02 maintenance guard as the first statement | ✅ Unchanged |
| Admin order request routes (list/detail/status) | ✅ Unchanged, all `authenticateToken`-protected |
| ORD-03 confirmation route/files (`/request-confirmation`, `RequestConfirmation.js`, `RequestCartModal.js` navigation) | ✅ Unchanged |
| ORD-04 notifier (`sendOrderRequestNotificationEmail`, config-only recipient resolution, clear warnings) | ✅ Unchanged, still called after successful creation |
| Admin auth (`authenticateToken` middleware) | ✅ Unchanged |
| Every `/api/admin/*` route has `authenticateToken` applied | ✅ Confirmed via `grep` — zero unprotected admin routes |
| No admin data exposed on a public route | ✅ `getArtworks()` (public) remains structurally separate from `getArtworksAdmin()` (admin); confirmed only 2 callers of `getArtworks()` exist in the codebase (the public route and an unrelated one-off script), both unaffected by the new optional parameter |

### WEB-CAT-02 functional review (post-merge)

All confirmed unchanged/correct after the merge:
- `/api/artworks` (no category) still returns all public artworks, same query as before.
- `/api/artworks?category=<slug>` still filters server-side via a parameterized `AND category = $1` clause.
- Public visibility rule (`status IN ('IN_STOCK','MADE_TO_ORDER') AND show_on_website = true`) still applied in both branches.
- Hidden `NEEDS_REVIEW` artworks never returned publicly (re-verified with both a temporary local test row and, on staging, real ISYNC-18 data — see below).
- Unknown/invalid category slug returns `[]`, not all artworks.
- SQL-injection-like input treated as a literal value, zero unintended rows, table intact.

### Local re-validation results

| Check | Result |
|---|---|
| `node --check server/server.js` | ✅ OK |
| `node --check server/dbQueries.js` | ✅ OK |
| `CI=true npm run build` (frontend changed via the merge — ARCH-INV admin pages) | ✅ Compiled successfully, no warnings |
| `/api/artworks` (no category) | `37` (unchanged baseline) |
| `?category=dot-mandala` | `19` ✅ |
| `?category=lippan-art` | `8` ✅ |
| `?category=texture-art` | `1` ✅ |
| `?category=warli-art` | `0` — **local limitation**: no real ISYNC-18 Warli data exists in this local DB; verified the actual exclusion mechanism instead with a temporary local `NEEDS_REVIEW`/hidden test artwork (`webcat02-refresh-test-warli-hidden`, `category='warli-art'`) — correctly excluded from both `?category=warli-art` (`0`) and the unfiltered list (`37`, unchanged), while correctly visible via `GET /api/admin/artworks` (`38`, includes the test row). Deleted immediately after |
| `?category=mixed-art` | `0` (no local data, same limitation as above) |
| Unknown category slug | `0`, `[]` |
| SQL-injection-like input | `200`, `[]`, table intact (`37` before/after) |
| Visibility invariants (status/show_on_website/no NEEDS_REVIEW) across unfiltered + all 8 category values | ✅ All hold |
| Admin artwork list | ✅ `200`, unchanged, includes hidden test row during that check |
| Admin order-requests list | ✅ `200` |
| **ARCH-INV admin shipments/physical-inventory — local limitation** | `GET /api/admin/shipments` and `GET /api/admin/physical-inventory` both returned `500` locally — root cause confirmed via server log: `relation "shipments" does not exist`. The ARCH-INV-03 schema migration was never applied to this local dev database (same manual-migration convention as other tickets). **This is a local environment gap, not a code regression** — the routes are correctly registered, auth-protected, and call the correct functions; the `AdminShipments`/`AdminPhysicalInventory` frontend pages were confirmed to render correctly and fail gracefully (no crash, clear "Failed to load..." message) rather than breaking. Full regression validated on staging instead (see below), where the real schema and data exist |
| Public category page (`/category/dot-mandala`) | ✅ "19 artwork(s) available", matches API exactly |
| Public artwork detail page | ✅ Loads correctly, "Add to Request" works |
| Request cart | ✅ Add/remove/list work correctly |
| Order request submission | ✅ `201`, request id 22 created |
| ORD-03 confirmation page | ✅ Full expected content rendered after submission |
| ORD-04 notification | ✅ Log: `"Order request #22: admin notification not sent — RESEND_API_KEY is not configured."` — unchanged behavior |
| Test data cleanup | ✅ Temp artwork + order request #22 deleted; final artwork count `37` |

### Staging validation

**Target confirmed:** `shinkansen.proxy.rlwy.net:41009` (staging) — confirmed via hostname/port check before connecting; `crossover.proxy.rlwy.net:54308` (production) never used. Method: local backend run with `DATABASE_URL` pointed at the Railway staging Postgres, per this repo's established convention.

**Credential note:** the previously-documented staging admin password (`cks-admin` / prior password) had been rotated and returned `401`. The user provided the current password directly in chat for this session's use only; it was never printed in full in any tool output or committed to any file, and `server/.env` (which held only the DB connection string, not the admin login password) remained gitignored throughout.

**Staging baseline:** `67` artworks, `7` categories, `0` order_requests (before testing). **Real ISYNC-18 hidden data confirmed present**: 2 `NEEDS_REVIEW`/hidden `warli-art` artworks (`cks-2026-wa-md-00001`, `cks-2026-wa-lg-00001`) and 1 `NEEDS_REVIEW`/hidden `mixed-art` artwork (`cks-2026-ma-md-00001`), plus additional hidden items across other categories.

| Category slug | Result | Notes |
|---|---|---|
| *(none)* | `39` | Baseline |
| `dot-mandala` | `20` | |
| `lippan-art` | `10` | |
| `texture-art` | `0` | All 3 existing `texture-art` artworks are currently `NEEDS_REVIEW`/hidden on staging (confirmed by direct query) — `0` is the **correct** result for the current data state, not a bug |
| `warli-art` | `1` | **Not the naively-expected `0`** — investigated and confirmed correct: staging has 3 `warli-art` artworks total — 2 are the real ISYNC-18 hidden imports (correctly excluded) and 1 is a separate, legitimately public pre-existing artwork (`art-1783882549002`, "SKU-STAG-TEST S12b", `MADE_TO_ORDER`, `show_on_website=true`, unrelated to ISYNC-18). The filter correctly includes the 1 genuinely public item and excludes the 2 hidden ones — this is a stronger, more discriminating validation than a flat `0` would have been |
| `mixed-art` | `0` | Matches expectation — the 1 `mixed-art` artwork on staging is the hidden ISYNC-18 import |
| Unknown slug | `0`, `[]` | |
| `20+10+0+0+8+1+0 = 39` | Sum matches unfiltered total exactly | Confirms no double-count/miss across categories (includes `mirror-mosaic: 0`, `textile-design: 8`) |
| SQL-injection-like input | `200`, `[]`, artworks table intact (`39` before/after) | |
| Visibility invariants across unfiltered + all category values | ✅ All hold — zero `NEEDS_REVIEW` items in any response |

**Hidden ISYNC-18 artwork visibility check (staging, real data):** ✅ Confirmed directly — the 2 hidden `warli-art` and 1 hidden `mixed-art` ISYNC-18 imports never appeared in any public API response (filtered or unfiltered) throughout all staging testing.

**ARCH-INV admin regression (staging, real schema/data):**

| Check | Result |
|---|---|
| `GET /api/admin/shipments` | ✅ `200` — returns `STAG-TEST-001` (id 3, `DELIVERED`, `item_count: 1`) |
| `GET /api/admin/physical-inventory` | ✅ `200` — returns the associated `DAMAGED` physical inventory row (id 3) |
| `SHIP-2026-001` | **Not present in staging** — only `STAG-TEST-001` exists (a pre-existing staging test shipment from earlier ARCH-INV validation). Snapshotted this record and its physical_inventory row before and after all testing — **byte-identical**, confirming nothing was touched |

**Order request / ORD-03 / ORD-04 regression (staging):**

| Check | Result |
|---|---|
| Order request submission (direct API) | ✅ `201`, request id 9 created with correct snapshot data (including the ARCH-INV-integrated `physical_inventory_id: null` field, confirming that integration is intact and unaffected) |
| Admin order-requests list/detail | ✅ `200`/`200`, request id 9 visible with correct data |
| ORD-04 notification | ✅ Log: `"Order request #9: admin notification not sent — RESEND_API_KEY is not configured."` — unchanged |
| ORD-03 confirmation — **live browser test** | ✅ Added a real staging artwork to the cart via the UI, submitted via the actual form, confirmation page rendered correctly with reference `#10` and full expected content |
| ORD-04 notification (browser submission) | ✅ Log: `"Order request #10: admin notification not sent — RESEND_API_KEY is not configured."` |

**Staging cleanup:** order requests id 9 and 10 deleted; `order_requests` count confirmed back to `0` (baseline). No artwork/category/pricing/SKU/inventory data touched — final artwork count `67`, unchanged. `STAG-TEST-001` and its physical_inventory record confirmed unchanged (see above). `server/.env` restored to the local-only value immediately after.

### Safety confirmations (refresh)

- ✅ Branch is current with latest `main` (`cdf7422`).
- ✅ Only intended WEB-CAT-02 changes remain — proven via `git diff origin/main HEAD` isolating exactly the original fix, nothing more.
- ✅ No ARCH-INV changes reverted — every ARCH-INV-03/04/05/06 endpoint, function, and guard confirmed present and working (locally where schema allowed, fully on staging).
- ✅ No ORD-03/ORD-04/order-request behavior reverted — confirmed live on both local and staging.
- ✅ No schema migration added.
- ✅ No production data touched — staging host confirmed before every operation; production host never used.
- ✅ No Inventory Preview or Apply run.
- ✅ No artwork published, no SKU generated.
- ✅ No secrets committed — the staging admin password was used only in-memory for this session's `curl`/API calls, never written to any file, never printed in full in committed content.
- ✅ `SHIP-2026-001`/`STAG-TEST-001` and physical_inventory records confirmed unchanged before/after.
- ✅ The 4 ISYNC-18 hidden imported artworks (staging) were only ever read, never modified.

### Final git status (after refresh)

Clean except pre-existing, unrelated untracked files (same set as before this refresh) — none touched or committed. Merge commit + this results-doc update are the only new commits on the branch.

### Ready for PR review / merge (after refresh)

✅ **Yes.** The branch is fully current with `main` through ARCH-INV-06, the merge was conflict-free and independently verified to be lossless in both directions, and every required regression check — local and staging — passed, including two initially-surprising-but-correct staging results (`texture-art: 0`, `warli-art: 1`) that were investigated and confirmed to reflect the actual current data state rather than a bug.
