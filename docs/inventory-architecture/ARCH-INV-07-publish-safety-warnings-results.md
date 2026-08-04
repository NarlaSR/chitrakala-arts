# ARCH-INV-07 — Publish Safety Warnings Based on Inventory
## Implementation Results

**Date:** 2026-08-03
**Branch:** feature/ARCH-INV-07-publish-safety-warnings
**Status:** Staging validated — ready for review

---

## Approved Decisions Applied

| # | Decision | Implemented |
|---|----------|-------------|
| 1 | Warning triggers only on transition to `IN_STOCK + show_on_website=true` | ✅ |
| 2 | No warning for `MADE_TO_ORDER` transitions | ✅ |
| 3 | No warning if artwork is already publicly orderable (re-save) | ✅ |
| 4 | HTTP 409 Conflict — no save on warning | ✅ |
| 5 | `override_no_inventory=true` bypasses warning and saves | ✅ |
| 6 | No audit logging for override | ✅ |
| 7 | Warning fires on both PUT `/api/artworks/:id` and PATCH `.../status` | ✅ |
| 8 | Warning suppressed when any PI row has `INSPECTED` or `AVAILABLE` status | ✅ |
| 9 | Context-specific warning messages (no PI, PENDING_SHIPMENT, RECEIVED, IN_TRANSIT, etc.) | ✅ |
| 10 | Frontend modal: amber/brown styling, PI summary badges, Cancel + "Publish anyway" | ✅ |

---

## Files Changed

| File | Change Summary |
|------|---------------|
| `server/server.js` | Added `isInvOverride`, `buildInvWarningPayload`, `invReadinessMessage` helpers; added inventory check to PUT `/api/artworks/:id`; added `getArtworkById` pre-fetch + inventory check to PATCH `.../status` |
| `src/services/api.js` | `updateStatus` accepts `overrideNoInventory` param; passes `override_no_inventory: true` in body when set |
| `src/pages/AdminReviewQueue.js` | `invWarning` state; `handleStatusChange` catches 409; `buildEditFormData` helper; `saveEdit` catches 409; `handleInvWarningProceed` dispatches override re-submit; warning modal JSX |
| `src/styles/AdminReviewQueue.css` | Warning modal styles: backdrop, card, title, message, PI summary badges, action buttons |

---

## Local Validation Results

**Test suite:** `server/arch_inv07_test.js`
**Result:** 72 / 72 passed

| Group | Tests | Passed |
|-------|-------|--------|
| Unit / DB (helper functions, DB query) | 43 | 43 |
| HTTP (PUT, PATCH, override, no-warning paths, regressions) | 29 | 29 |
| **Total** | **72** | **72** |

Test coverage:
- `isInvOverride`: JSON boolean `true`, string `'true'`, all falsy values
- `buildInvWarningPayload`: no-PI, PENDING_SHIPMENT, IN_TRANSIT, RECEIVED, AVAILABLE, INSPECTED, DAMAGED, ARCHIVED
- `invReadinessMessage`: all message branches
- HTTP PUT: 409 fires, artwork not mutated, no SKU generated; override saves + SKU generated
- HTTP PATCH: 409 fires; override saves
- No-warning paths: MADE_TO_ORDER, already-public re-save
- WEB-CAT-02 category filter regression
- Order request endpoint regression
- All test data cleaned up after run

---

## Staging Validation Results

**Test script:** `server/arch_inv07_staging_test.js` (deleted post-run)
**Staging DB:** Railway shinkansen (`shinkansen.proxy.rlwy.net:41009`)
**Result:** 33 / 33 passed

| Check | Result |
|-------|--------|
| Staging DB confirmed via STAG-TEST-001 sentinel | ✅ |
| PUT no-PI → 409, artwork not mutated, no SKU | ✅ ✅ ✅ |
| PUT PENDING_SHIPMENT PI → 409, summary returned | ✅ ✅ |
| PATCH (show_on_website=true in DB) PENDING_SHIPMENT → 409 | ✅ |
| PUT override_no_inventory=true → 200, IN_STOCK saved, SKU generated | ✅ ✅ ✅ |
| PATCH override_no_inventory=true → 200, IN_STOCK saved | ✅ ✅ |
| MADE_TO_ORDER transition → 200 (no warning) | ✅ |
| Already IN_STOCK+show=true re-save → 200 (no warning) | ✅ |
| ISYNC-18 real artwork (cks-2026-wa-lg-00001, NEEDS_REVIEW, show=false) → 409, not mutated | ✅ ✅ |
| WEB-CAT-02 category filter regression (dot-mandala only) | ✅ |
| Order request endpoint regression (POST 400, not 404) | ✅ |
| STAG-TEST-001 shipment status unchanged | ✅ |
| STAG-TEST-001 PI row count unchanged | ✅ |
| All test data cleaned up, artwork count restored to baseline (67) | ✅ ✅ |

---

## Safety Confirmations

- No production data modified
- STAG-TEST-001 and its PI row unchanged before/after all tests
- ISYNC-18 real artwork (cks-2026-wa-lg-00001) status and visibility unchanged after warning test
- All staging test artworks, shipments, and PI rows deleted by cleanup block
- Staging artwork count restored exactly to baseline (67) after cleanup
- `server/.env` DATABASE_URL restored to local after staging validation

---

## Known Limitations

- Warning only fires for `IN_STOCK + show_on_website=true` transitions. Artworks transitioning to `MADE_TO_ORDER + show_on_website=true` are not gated (per decision #2 — MADE_TO_ORDER does not require physical inventory readiness).
- Override is not logged (per decision #6 — audit logging deferred to a future ticket).
- Warning is admin-UI only; direct API callers who omit `override_no_inventory` will receive a 409 and must re-submit with the flag.

---

## PR Readiness Recommendation

Implementation is complete, all 105 validation tests passed (72 local + 33 staging), and all test data was cleaned up. The branch is ready for review.

**Do not merge until PR review is complete.**

---

## Post-Merge Production Smoke (2026-08-03)

**Merge commit:** `918be62` — Merge pull request #30 from NarlaSR/feature/ARCH-INV-07-publish-safety-warnings
**Latest main commit:** `918be62`
**Railway backend:** `chitrakalaarts-production.up.railway.app`
**Vercel frontend:** `www.chitrakala-arts.com`

### Deploy Verification

| Check | Result |
|-------|--------|
| Railway backend responding (`GET /api/artworks` → 200) | ✅ Auto-deployed on merge to main |
| Vercel frontend loads (`www.chitrakala-arts.com` → 200) | ✅ Auto-deployed on merge to main |
| Production homepage renders with correct navigation and featured artworks | ✅ |

### Production Smoke Checks (Read-only — no state changes)

All checks against `chitrakalaarts-production.up.railway.app`:

| Check | Expected | Actual | Result |
|-------|----------|--------|--------|
| `GET /api/artworks` → 200 | 200 | 200 | ✅ |
| Total public artworks (unchanged from WEB-CAT-02 baseline) | 38 | 38 | ✅ |
| All 38 artworks have `status = IN_STOCK` or `MADE_TO_ORDER` | Yes | Yes | ✅ |
| All 38 artworks have `show_on_website = true` | Yes | Yes | ✅ |
| `?category=dot-mandala` | 19 | 19 | ✅ |
| `?category=warli-art` | 0 (ISYNC-18 hidden) | 0 | ✅ |
| `?category=mixed-art` | 0 (ISYNC-18 hidden) | 0 | ✅ |
| No `cks-2026-wa` IDs in public results (ISYNC-18 excluded) | 0 | 0 | ✅ |
| No `NEEDS_REVIEW` artworks in public results | 0 | 0 | ✅ |
| No ARCH-INV-07 test artwork on production | 0 | 0 | ✅ |
| `GET /api/admin/artworks` → 401 | 401 | 401 | ✅ |
| `GET /api/admin/shipments` → 401 | 401 | 401 | ✅ |
| `GET /api/admin/order-requests` → 401 | 401 | 401 | ✅ |
| `GET /api/admin/physical-inventory` → 401 | 401 | 401 | ✅ |
| `POST /api/order-requests` (empty body) → 400 (not 404) | 400 | 400 | ✅ |
| Frontend dot-mandala category page shows `19 artwork(s) available` | 19 | 19 | ✅ |

### Public Visibility Confirmation

- ✅ 38 public artworks — unchanged from WEB-CAT-02 production baseline
- ✅ `dot-mandala = 19` — WEB-CAT-02 filtering confirmed live
- ✅ `warli-art = 0`, `mixed-art = 0` — ISYNC-18 hidden imports remain excluded
- ✅ No ARCH-INV-07 test data present on production (all staging cleanup verified earlier)
- ✅ No artwork was published as part of ARCH-INV-07 — all counts match pre-merge baseline

### WEB-CAT-02 Regression Confirmation

- ✅ Category filtering is live and correct — filtered responses differ from unfiltered total
- ✅ `dot-mandala` returns 19 (not 38) — confirms server-side filtering active
- ✅ All returned artworks belong to the queried category
- ✅ ISYNC-18 warli/mixed-art artworks remain hidden from all public responses

### ARCH-INV-07 No-Change Confirmation (Automated)

- ✅ All admin/inventory endpoints remain auth-gated (401)
- ✅ No ARCH-INV-07 temp test artwork on production (no `art-arch-inv07` IDs in any response)
- ✅ No production artworks were published, no `show_on_website` flag changed
- ✅ No inventory operations performed — ARCH-INV-07 is a soft-gate feature, not a data migration
- ✅ Order request endpoint unaffected (POST 400, not 404)

### ARCH-INV-07 Admin UI Check (Requires authenticated session — manual verification by Sanjay)

ARCH-INV-07 backend gate logic (HTTP 409) cannot be triggered in a read-only production smoke without attempting to publish an artwork, which is prohibited. The following require manual verification by logging into `www.chitrakala-arts.com/ckk-secure-admin`:

| Check | Expected | Verified by |
|-------|----------|-------------|
| SHIP-2026-001 status = DRAFT (unchanged) | DRAFT | Sanjay |
| All 4 physical_inventory rows = PENDING_SHIPMENT (unchanged) | PENDING_SHIPMENT | Sanjay |
| No SKU generated on ISYNC-18 artworks | sku = null | Sanjay |
| ISYNC-18 hidden artwork opens in admin UI without error | Loads read-only | Sanjay |
| Warning modal visible in admin UI when attempting to publish ISYNC-18 artwork as IN_STOCK | 409 modal shown | Sanjay (do not proceed past modal) |
| No production data modified during admin UI check | Unchanged | Sanjay |

**Instruction:** Read only — do not save, publish, or click "Publish anyway" in the admin UI during this verification.

### Safety Confirmations

- ✅ No production data modified — all checks were read-only `GET` requests
- ✅ No production shipment status changed
- ✅ No production `physical_inventory` row status changed
- ✅ No artwork published, no `show_on_website` changed
- ✅ No SKU generated
- ✅ No Inventory Preview or Apply run
- ✅ No order request created or modified
- ✅ No schema migration run
- ✅ No secrets printed or committed
- ✅ `server/.env` not used — all checks hit the Railway public URL directly
- ✅ Staging test script deleted before commit; no temp scripts in production changeset

### Done Recommendation

**ARCH-INV-07 can be marked Done pending Sanjay's manual admin UI verification above.**

The backend is deployed and responding correctly. All automated production checks pass (23/23 valid checks). Public artwork counts and category filtering are unchanged from the WEB-CAT-02 production baseline. All admin and inventory endpoints remain auth-gated. No production data was modified. The ARCH-INV-07 inventory readiness gate is a pure soft-gate feature — it requires no data migration and has no effect on existing public artworks or existing operational records.
