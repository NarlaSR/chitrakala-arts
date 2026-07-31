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

## Final git status

Clean except pre-existing, unrelated untracked files (inventory-sync leftovers, `POST-ORD-QA-01` docs from an earlier, unrelated session) — none touched or committed.

## Ready for PR review

✅ **Yes.** Root cause identified and fixed with the smallest possible diff (2 files, ~20 lines), no stop conditions were hit, all required local validation passed, and every adjacent system (admin endpoints, order requests, ORD-03, ORD-04) was verified live to be unaffected.
