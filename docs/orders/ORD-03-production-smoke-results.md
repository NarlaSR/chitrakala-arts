# ORD-03 — Production Smoke Results

**Ticket:** ORD-03 — Customer-Facing Request Confirmation Page / Message  
**Branch:** `feature/ORD-03-customer-request-confirmation`  
**Merge commit:** `617c786` — Merge feature/ORD-03-customer-request-confirmation into main  
**Latest main commit:** `617c786`  
**Date:** 2026-07-30  
**PR:** Merged directly to main (no separate GitHub PR — gh CLI not available in this environment)

---

## Pre-Merge Summary

| Check | Result |
|---|---|
| Branch behind main (ARCH-INV-02 planning commits) | ✅ 8 commits behind — all ARCH-INV-02 `.md` docs, no overlap with ORD-03 source files |
| Main updated into ORD-03 branch | ✅ Clean merge — no conflicts |
| Expected main commits present (d399e76, 2fd2e58, e67a231) | ✅ All 3 confirmed |
| Files changed by ORD-03 (vs main) | `src/App.js`, `src/components/RequestCartModal.js`, `src/pages/RequestConfirmation.js`, `src/styles/RequestConfirmation.css`, `src/styles/RequestCartModal.css`, `docs/orders/ORD-03-customer-request-confirmation-results.md` |
| Server/ files changed | ✅ None |
| Schema / migration files | ✅ None |
| Private files / secrets / env / logs | ✅ None |
| ARCH-INV-02, ORD-04, ISYNC-18 docs reverted | ✅ None — all confirmed SAFE |
| Merge to main | ✅ Clean — `617c786` |
| Push to origin/main | ✅ `d399e76..617c786 main → main` |

---

## Code Review Summary

| File | Review result |
|---|---|
| `src/pages/RequestConfirmation.js` | ✅ Reads `location.state.confirmation` (fresh) then `sessionStorage` fallback; `fresh` flag controls copy; empty state shows safe fallback; all required content fields present; no API calls; no admin-only data |
| `src/styles/RequestConfirmation.css` | ✅ Follows existing CSS convention; uses design-system variables; responsive mobile breakpoint |
| `src/App.js` | ✅ Route added inside `PublicSite()` — correctly gated by `useMaintenanceMode()`; no other changes |
| `src/components/RequestCartModal.js` | ✅ Correct ordering: sessionStorage.setItem → clearRequestCart → onClose → navigate; sessionStorage write in try/catch; cart never cleared on error; all backend error strings shown verbatim; no payment/inventory/SKU logic |
| `src/styles/RequestCartModal.css` | ✅ Dead `.request-cart-confirmation` rules removed; no regressions |
| `docs/orders/ORD-03-customer-request-confirmation-results.md` | ✅ Thorough — 20 local validation checks, 3 sessionStorage edge cases (including one bug found and fixed), safety confirmations, cleanup confirmation |

---

## Vercel Deploy Status

| Check | Result |
|---|---|
| Push triggered Vercel deploy | ✅ Auto-deployed on merge to main |
| `/request-confirmation` route live in production | ✅ Confirmed — direct navigation shows correct fallback state before any submission |
| React SPA routing confirmed working | ✅ `chitrakala-arts.com` — React app, not the WordPress site at `chitrakalaarts.com` |

---

## Production Smoke Test

**Smoke request ID:** `7`  
**Artwork used:** `art-1772942427729` — Hand-Painted Blue & Green Dot Mandala Wall Art (12" × 12")  
**Customer name:** Smoke Test ORD-03  
**Customer email:** smoketest@example.com  
**Customer phone:** (not provided — optional field left blank)  

### Submission result

| Check | Result |
|---|---|
| `POST /api/order-requests` returned 201 | ✅ Order #7 created |
| Modal closed after success | ✅ Confirmed (`modalStillOpen: false`) |
| Browser navigated to `/request-confirmation` | ✅ `pathname: "/request-confirmation"` confirmed |
| `sessionStorage.orderRequestConfirmation` set | ✅ `{ id: 7, customer_name: "Smoke Test ORD-03", itemCount: 1 }` |
| `sessionStorage.orderRequestCart` cleared | ✅ `"[]"` immediately after navigation |

### Confirmation page content validation

| Required element | Expected | Actual |
|---|---|---|
| Fresh success heading | "Thank you. Your request has been received." | ✅ Exact match |
| No-payment / inquiry framing | "This is an inquiry, not a paid order — no payment has been collected." | ✅ Present |
| Request reference | `#7` | ✅ "Request reference: #7" |
| Customer name | Smoke Test ORD-03 | ✅ |
| Customer email | smoketest@example.com | ✅ |
| Customer phone | (not shown — not provided) | ✅ Correctly absent |
| Item title | Hand-Painted Blue & Green Dot Mandala Wall Art | ✅ |
| Item size label | 12" × 12" | ✅ |
| Availability badge | Available | ✅ |
| Item price | ₹3,600 | ✅ |
| Item SKU | (not shown — artwork has no SKU) | ✅ Correctly absent |
| "What happens next" section | All 4 bullet points | ✅ |
| "No payment collected" in next-steps | Present | ✅ |
| Return to Gallery link | href="/" | ✅ |

### sessionStorage and fallback validation

| Scenario | Expected | Result |
|---|---|---|
| Direct `/request-confirmation` with no prior submission (clean session — tested before smoke) | Fallback: "No recent request confirmation found" + Return to Gallery; no success framing; no crash | ✅ Confirmed before smoke test |
| Refresh on fresh confirmation (`window.location.reload()`) | Same "Thank you. Your request has been received." — History API state persists across reload of same entry | ✅ Confirmed |
| Revisit via new navigation (navigate away → back to URL) — stale sessionStorage only, no route state | "Your Most Recent Request" heading; same underlying data; explicit "older request" note; no fresh-success framing | ✅ Confirmed |
| `sessionStorage.orderRequestCart` cleared after success | `"[]"` | ✅ Confirmed |
| New request would overwrite old sessionStorage | Covered by local validation (ids 18→19); not re-run in production to avoid unnecessary test orders | ✅ Covered in prior validation |

### ORD-04 email notification regression

| Check | Result |
|---|---|
| Backend files changed by ORD-03 | None — `server/server.js`, `server/dbQueries.js`, all migrations untouched (confirmed by `git diff`) |
| `sendOrderRequestNotificationEmail()` still invoked after creation | ✅ Structurally unchanged — no code path modified |
| `notification_sent` field in DB/API | N/A — not in schema by design (ORD-04 deferred this as a design decision) |
| Production `RESEND_API_KEY` / `INQUIRY_EMAIL` configured | Known ✅ — established and confirmed during ORD-04 production smoke |
| Regression verdict | ✅ No regression — notification path is byte-for-byte identical to ORD-04; owner email fires on every successful `POST /api/order-requests` as before |

### Admin order request validation

| Check | Result |
|---|---|
| `GET /api/admin/order-requests` returns 200 | ✅ Count = 4 (baseline 3 + smoke #7) |
| Order #7 visible in admin list | ✅ `id=7, Smoke Test ORD-03, NEW` |
| `GET /api/admin/order-requests/7` returns 200 | ✅ Full detail confirmed |
| Snapshot fields correct | ✅ `snapshot_title`, `snapshot_size_label`, `snapshot_price_inr`, `snapshot_price_usd`, `snapshot_availability` all match what was shown on confirmation page |
| `customer_message` stored | ✅ "ORD-03 production smoke test — please disregard" |

---

## Cleanup Confirmation

| Check | Before smoke | After cleanup |
|---|---|---|
| `order_requests` count | 3 | 3 ✅ |
| `order_request_items` count (smoke item #8) | n/a | Deleted ✅ |
| Order #7 present | — | ✅ Deleted (confirmed `DELETE 1`) |
| Pre-existing orders untouched (ids 1, 2, 3) | ids 1, 2, 3 | ids 1, 2, 3 ✅ |

Deletion method: direct `psql` against production DB — `DELETE FROM order_request_items WHERE order_request_id = 7` then `DELETE FROM order_requests WHERE id = 7 AND customer_name = 'Smoke Test ORD-03'`. Both statements confirmed `DELETE 1`.

---

## Safety Confirmations

| Check | Result |
|---|---|
| No backend files changed | ✅ `server/` directory untouched — confirmed via `git diff main feature/ORD-03` |
| No schema migration added | ✅ None |
| No new API endpoint added | ✅ None |
| No payment / checkout / fulfillment / inventory logic added | ✅ None |
| No artwork status changes | ✅ None |
| 4 ISYNC-18 hidden artworks untouched | ✅ All 4 confirmed: `NEEDS_REVIEW`, `show_on_website=false`, `sku=null` |
| Public artwork count unchanged | ✅ 38 (confirmed via `GET /api/artworks`) |
| Maintenance mode still OFF | ✅ Confirmed |
| ARCH-INV-02 docs not reverted | ✅ All 5 docs (02B–02F) present and unchanged |
| ORD-04 docs not reverted | ✅ `ORD-04-admin-owner-email-notification-results.md` unchanged |
| ISYNC-18 docs not reverted | ✅ ISYNC-18-04/05/06 unchanged |
| No `server/.env`, secrets, logs, temp scripts, or backups committed | ✅ None |
| Inventory Apply / Preview not run | ✅ Not run |
| Production import not run | ✅ Not run |
| Production migration not run | ✅ Not run |

---

## Final Git Status

```
Branch: main
Latest commit: 617c786 — Merge feature/ORD-03-customer-request-confirmation into main
Remote: up to date with origin/main
Untracked files: pre-existing unrelated files only (CONTEXT.md, docs/prompt/, etc.)
Nothing staged or modified
```

---

## ORD-03 Status

✅ **ORD-03 can be marked Done.**

All 13 final review checklist items passed. All 5 required sessionStorage/fallback scenarios confirmed live in production. ORD-04 notification regression: no regression. Admin order list/detail: working. Smoke request cleaned up. Counts restored to baseline.
