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
