# ORD-03 — Customer-Facing Request Confirmation Page / Message

**Status:** Complete — implemented, local validation fully passed
**Date:** 2026-07-29
**Depends on:** ORD-01, ORD-02 (complete); ORD-04 (complete, merged, deployed, production-smoked); ISYNC-18 (complete, closed)
**Branch:** `feature/ORD-03-customer-request-confirmation` (created from updated `main`)

## Preflight

| Check | Result |
|---|---|
| `git checkout main` / `git pull origin main --ff-only` | Fast-forwarded `27bc905` → `3654bba` |
| ORD-04 final confirmation commit `2fd2e58` in `main` | ✅ `git merge-base --is-ancestor 2fd2e58 origin/main` → true |
| ISYNC-18 final merge commit `e67a231` in `main` | ✅ `git merge-base --is-ancestor e67a231 origin/main` → true |
| Git status clean except unrelated untracked files | ✅ Confirmed — same pre-existing untracked leftovers as prior tickets, none touched |
| `server/.env` / secrets / logs / temp scripts staged | ✅ None — `server/.env` not tracked, gitignored |
| Branch created | `feature/ORD-03-customer-request-confirmation`, from `main` at `3654bba` |

## Investigation summary

Reviewed before writing any code:

- **Request cart context** (`src/context/RequestCartContext.js`) — `sessionStorage`-backed, `clearRequestCart()` already only called by the caller on success (not automatic).
- **Request details form** (`src/components/RequestDetailsForm.js`) — client-side validation, submit button already `disabled={submitting}`.
- **Submission handler** (`src/components/RequestCartModal.js`) — `handleSubmit` called `orderRequestsAPI.create()`, then `setSubmitted(true)` + `clearRequestCart()` on success (transient in-modal panel only, no dedicated page); cart preserved on error, generic-ish error messages.
- **API response shape** (`POST /api/order-requests`, confirmed via `server/server.js`) — on success, returns `{ message, orderRequest: { id, customer_name, customer_email, customer_phone, customer_message, status, created_at, updated_at, items: [{ id, artwork_id, artwork_size_id, quantity, snapshot_sku, snapshot_title, snapshot_category, snapshot_size_label, snapshot_price_inr, snapshot_price_usd, snapshot_image, snapshot_availability }] }}`. **This already contains everything ORD-03 needs to display** — no admin-only fields, no other customers' data, nothing that isn't already the customer's own submission or a public artwork snapshot already shown to them pre-submit.
- **Duplicate-submit handling** — submit button already disables while `submitting`; no other protection existed.
- **Routing** (`src/App.js`) — `react-router-dom` v6, public routes nested inside `PublicSite()`, itself gated by `useMaintenanceMode()` (polls once on mount, not tied to route changes).
- **Styling conventions** — per-page CSS files with a `.{page}-page` wrapper class, shared CSS custom properties (`--primary-color`, `--accent-color`, `--text-dark`, `--text-light`, `--white`), `.btn-primary`/`.btn-secondary` redefined per file rather than a global utility.
- **Admin order routes** (`GET /api/admin/order-requests`, `GET /api/admin/order-requests/:id`, `PATCH .../status`) — read-only investigation only, confirmed no code path in this ticket touches them.
- **Maintenance-mode guard** (WEB-MAINT-02) — confirmed still the first statement in `POST /api/order-requests`, returns `503` before validation/creation; untouched by this ticket.
- **ORD-04 notification behavior** — confirmed `sendOrderRequestNotificationEmail()` is called after successful creation, inside the same handler this ticket never touches; investigated only, not modified.

**No stop condition was triggered:** no schema migration needed, no new public API needed (the existing `POST /api/order-requests` response already carries everything required), no backend change of any kind was needed, no effect on request-creation/notification/maintenance-mode behavior, no secrets appeared, and email/phone display simply reuses data the customer already typed into the form.

## Files changed

- `src/pages/RequestConfirmation.js` — **new.** Dedicated public confirmation page.
- `src/styles/RequestConfirmation.css` — **new.** Styles for the confirmation page, following existing conventions.
- `src/App.js` — added the `RequestConfirmation` import and a `/request-confirmation` route inside `PublicSite()`'s `<Routes>` (so it's naturally hidden during maintenance mode, same as every other public page).
- `src/components/RequestCartModal.js` — `handleSubmit` now captures a confirmation snapshot, clears the cart, closes the modal, and navigates to `/request-confirmation` on success (replacing the old in-modal transient panel); widened the error-message pass-through so every backend-provided error string (including the maintenance-mode `503` message) is shown verbatim instead of only 4xx errors.
- `src/styles/RequestCartModal.css` — removed the now-unused `.request-cart-confirmation` rules (dead code from the removed in-modal panel).

**No backend file was changed.** `server/server.js`, `server/dbQueries.js`, and all migrations are untouched — confirmed via `git status` throughout implementation.

## Implementation summary

1. **Confirmation snapshot capture** — on a successful `POST /api/order-requests`, the full `orderRequest` object from the response is:
   - Written to `sessionStorage` under `orderRequestConfirmation` (durable across refresh/back navigation), wrapped in its own `try/catch` so a `sessionStorage` failure (private browsing, quota) can't break the flow — route state still carries the confirmation for that navigation.
   - Passed as React Router `location.state.confirmation` for the immediate navigation (freshest source).
2. **Ordering** — `sessionStorage.setItem(...)` → `clearRequestCart()` → `onClose()` → `navigate('/request-confirmation', ...)`, in that order, so the cart is only ever cleared after the confirmation data is safely captured, per the ticket's required ordering.
3. **Dedicated confirmation page** (`RequestConfirmation.js`) reads `location.state.confirmation` first, falling back to `sessionStorage` — so a hard refresh or a bookmarked/back-navigated visit still shows the same confirmation. If neither source has data (e.g. someone navigates to the URL directly with no prior submission), a friendly "No request found" state is shown instead of an error, with a link back to the gallery — no admin data, no API call, no crash.
4. **Content displayed**, matching the ticket's required list exactly: friendly success message, explicit "inquiry, not a paid order — no payment collected" framing, request reference (`#<id>`), customer name/email/phone (phone only if provided), per-item title/SKU (if available)/size/price-or-"Price on request"/availability label/quantity (only shown when >1, matching how the cart itself only ever sends quantity 1 today), a "What happens next" section (review, manual pricing/shipping confirmation, contact by email/phone, no payment collected), and a "Return to Gallery" link.
5. **Failure behavior unchanged in spirit, improved in clarity** — on any error, the modal stays open, the cart is preserved (never cleared), and the shown message is now the exact backend-provided string whenever one exists (previously, non-4xx errors like the maintenance `503` fell through to a generic "something went wrong" message even though the backend already provides a clear, customer-safe message).
6. **Duplicate-submission mitigation** — the existing `disabled={submitting}` guard on the submit button is unchanged. Additionally, on success the modal now closes and the app navigates to a different route entirely, so the submit form is fully unmounted the moment a request succeeds — there's no way to accidentally resubmit the same request after it succeeds, which is a stronger guarantee than the previous "modal stays open showing a success panel" behavior.

## Confirmation UX behavior

| Behavior | Result |
|---|---|
| Success message | "Thank you. Your request has been received." + explicit inquiry/no-payment framing |
| Request reference | Shown as `Request reference: #<id>` when `id` is present |
| Customer details | Name, email always shown; phone shown only if provided |
| Item summary | Title, SKU (if present), size/dimension, availability badge (Available/Made to Order), price or "Price on request", quantity (if >1) |
| Next steps | Review, manual pricing/shipping/availability confirmation, contact by email/phone, no payment collected — explicitly non-transactional language throughout |
| Return action | "Return to Gallery" link to `/` |
| Direct/stale visit (no confirmation data available) | Friendly "No request found" message with a link back to the gallery — no error, no crash, no data exposure |

## Request response data used

Only fields already present in the existing `POST /api/order-requests` success response are used: `id`, `customer_name`, `customer_email`, `customer_phone`, `status`, and each item's `id`, `quantity`, `snapshot_title`, `snapshot_sku`, `snapshot_size_label`, `snapshot_price_inr`, `snapshot_price_usd`, `snapshot_availability`. No new API call is made to fetch this data, no admin-only fields are read or displayed (`customer_message` was investigated but intentionally not displayed, to keep the page to exactly the ticket's specified content list).

## Duplicate-submission mitigation

- Submit button `disabled={submitting}` (pre-existing, unchanged).
- On success, the form/modal is unmounted entirely (navigation to a new route) — no lingering submit control to double-click after a request has already succeeded.
- Confirmation page navigation is a client-side route change (`useNavigate`), not a server-side redirect-after-POST — refreshing `/request-confirmation` re-renders from `sessionStorage` and never resubmits anything to the backend.

## Failure behavior

- Request cart is **never cleared** on any error path (validation error, item-no-longer-available, maintenance-mode `503`, network error, generic 500) — verified directly (see Local validation below).
- No confirmation page/snapshot is created or navigated to on any error path.
- The customer now sees the exact backend-provided error message in every case that has one (previously only for 4xx statuses) — validated directly for the maintenance-mode case, where the customer now sees "Site is temporarily under maintenance. Please try again later." instead of a generic fallback.

## Maintenance-mode compatibility result

✅ **Fully intact, unmodified in the backend; correctly respected in the frontend.** `getMaintenanceMode()` and the `503` guard in `POST /api/order-requests` were not touched. Verified live: submitting while maintenance mode is ON returns `503` with the exact required message, the cart is preserved, no confirmation is shown, and the app stays on the artwork page (no navigation to `/request-confirmation`). Turning maintenance mode back OFF and resubmitting the same (preserved) cart succeeds immediately and navigates to the confirmation page as expected.

## ORD-04 notification regression result

✅ **Tested, no regression.** After a successful submission during this validation, the server log showed the same ORD-04 notification behavior as before this ticket: `` "Order request #16: admin notification not sent — RESEND_API_KEY is not configured." `` — i.e. the notifier is still invoked after every successful creation, exactly as ORD-04 left it. This ticket makes no backend changes, so this is expected, and was confirmed live rather than assumed.

## Admin order validation result

✅ Confirmed via direct API calls with an admin token: `GET /api/admin/order-requests` → `200`, full list including the test requests created during this validation; `GET /api/admin/order-requests/:id` → `200`, full detail with correct snapshot data. No admin route or response shape was touched by this ticket.

## Local validation results

Ran against local Postgres + local backend/frontend dev servers, branch `feature/ORD-03-customer-request-confirmation`.

| # | Test | Result |
|---|---|---|
| 0 | Frontend build | `CI=true npm run build` → compiled successfully, no warnings |
| 0b | Backend untouched | `git status` confirmed zero changes to any `server/` file throughout; `node --check` on both `server.js`/`dbQueries.js` still pass |
| 1 | Submit a valid public artwork request successfully | `201`, browser navigated correctly, request id 15 created |
| 2 | Improved confirmation page/view appears | ✅ — full page rendered at `/request-confirmation`, not a modal |
| 3 | Request ID/reference appears | ✅ — "Request reference: #15" |
| 4 | Customer name/email/phone display correctly | ✅ — all three shown correctly for a submission that included a phone number |
| 5 | Requested artwork summary displays correctly | ✅ — title, size ("18\"x 18\""), availability ("Available"), price ("₹8,000") all correct. (SKU not shown for this item since it has none — confirmed the conditional correctly omits it) |
| 6 | Next-step language is clear, no payment/order implication | ✅ — explicit "This is an inquiry, not a paid order — no payment has been collected" plus a dedicated "What happens next" section |
| 7 | Return-to-gallery button works | ✅ — clicked, navigated to `/` |
| 8 | Cart clears only after successful submission | ✅ — `sessionStorage.orderRequestCart` was `"[]"` immediately after the successful navigation |
| 9 | Failed submission does not clear the cart | ✅ — tested by submitting while maintenance mode was ON; cart still contained the item afterward |
| 10 | Failed submission does not show success confirmation | ✅ — same test; page stayed on the artwork detail page, modal showed the error inline, no navigation occurred |
| 11 | Duplicate accidental submission reduced | ✅ — verified structurally (submit button disables while submitting; successful submission unmounts the form via navigation) |
| 12 | Admin order request list/detail still works | ✅ — both `200` via direct API calls |
| 13 | ORD-04 notification behavior still works / not broken | ✅ — confirmed via server log for the post-fix successful submission (request id 16) |
| 14 | Maintenance mode ON blocks submission before confirmation | ✅ — `503`, exact required message shown, no navigation |
| 15 | Maintenance mode ON does not show success confirmation | ✅ — same test as above |
| 16 | Maintenance mode OFF allows submission and confirmation | ✅ — turned OFF, resubmitted the same (preserved) cart, got `201` (request id 16) and navigated to the confirmation page correctly |
| 17 | Public artwork/request behavior unchanged except confirmation experience | ✅ — add-to-request, size selection, cart list/remove, and the request form itself all behaved identically to before; only the post-success behavior changed |
| 18 | No artwork/category/pricing/SKU/inventory data changes | ✅ — `GET /api/artworks/art-1782445237565` identical before/after all testing |
| 19 | Local test order requests cleaned up | ✅ — ids 15 and 16 deleted after validation; pre-existing rows (4, 7) confirmed untouched |
| 20 | Final git status clean except unrelated untracked files | ✅ — confirmed below |

Additional check performed beyond the required list: navigated directly to `/request-confirmation` via a hard page load (simulating a refresh) after a successful submission, and confirmed the same confirmation content re-rendered correctly from `sessionStorage` alone (no route state available on a hard load) — validating the "durable across refresh" requirement directly, not just by code inspection.

## Test data cleanup status

| Environment | Test rows created | Cleanup |
|---|---|---|
| Local | `order_requests` ids 15, 16 | ✅ Deleted; pre-existing ids 4, 7 confirmed untouched |

No staging validation was performed, per the ticket's explicit instruction that it isn't required for ORD-03.

## Safety confirmations

- ✅ No backend file changed — `server/server.js`, `server/dbQueries.js`, and all migrations confirmed untouched throughout.
- ✅ No schema migration — none needed, none proposed.
- ✅ No new public API endpoint added.
- ✅ Order request creation behavior unchanged — validation, snapshotting, and the `201` response shape are identical to before this ticket.
- ✅ ORD-04 notification behavior unchanged — confirmed via live log check, not just code inspection.
- ✅ Maintenance-mode behavior unchanged — guard untouched, verified blocking still happens before any confirmation/navigation.
- ✅ No artwork/category/pricing/SKU/inventory data touched — verified before/after.
- ✅ The 4 ISYNC-18 hidden `NEEDS_REVIEW` imported artworks were not referenced, queried, or touched in any way — this ticket's testing used only the pre-existing, already-public test artwork (`art-1782445237565`) used throughout prior order-request tickets.
- ✅ No Inventory Preview/Apply run.
- ✅ No production import run.
- ✅ No production migration run.
- ✅ No production deploy performed.
- ✅ `server/.env` never modified or committed.
- ✅ No secrets, temp scripts, payload files, or logs committed.
- ✅ No unrelated UI redesign — only the order-request confirmation flow was touched; no other page/component/style was modified.

## Screenshots note

Automated screenshot capture was unavailable in this session (the browser tool's screenshot action timed out consistently, appearing to be an unrelated tooling issue — page content, interaction, and navigation all worked correctly throughout via `read_page`/`get_page_text`/`javascript_tool` checks). All UI states described above were verified through the live accessibility tree and direct DOM/sessionStorage inspection rather than visual screenshots. If visual screenshots are needed for review, they can be captured manually by running `npm start` (frontend) and `node server.js` (backend) locally and visiting `/art/art-1782445237565` → add to request → submit.

## Ready for review (initial implementation)

✅ **Yes.** Implementation is complete, scoped to exactly the ticket's requirements, no backend changes, no stop conditions were hit, and all 20 required local validation checks passed.

---

## Reviewer follow-up: sessionStorage edge cases (2026-07-30)

Before PR/merge readiness, a reviewer specifically flagged three `sessionStorage`-related scenarios to verify on `RequestConfirmation.js`. All three were tested live (not just by code inspection); one required a small, frontend-only fix.

### 1. Direct visit to `/request-confirmation` without confirmation data

**Result: already correct, no fix needed.** Live test: cleared `sessionStorage` entirely, navigated directly to `/request-confirmation`. The page correctly rendered the safe fallback state — no success framing, no request data, just:

> "No recent request confirmation found — We couldn't find a recent request confirmation stored in this browser..."

with a "Return to Gallery" link. (The heading copy was tightened from "No request found" to "No recent request confirmation found" while touching this file for item 2 below, to match the reviewer's suggested phrasing more closely — purely a wording change, same fallback logic.)

### 2. Stale confirmation data — **fix applied**

**Result: confirmed bug, fixed.** Live test: after a successful submission, navigated away to the homepage and then directly to `/request-confirmation` again (no fresh navigation state — the realistic "customer revisits this URL later" scenario). Before the fix, the page incorrectly showed "Thank you. Your request has been received. We will review it and contact you soon." — identical wording to a just-submitted confirmation, with no indication the data was from an earlier visit. This could confuse a customer into thinking they'd just submitted a new request.

**Fix (frontend-only, `src/pages/RequestConfirmation.js`):** `readConfirmation()` now returns both the data and whether it came from fresh navigation state (`fresh: true`, i.e. arrived via `location.state.confirmation` immediately after a successful submit) or from the `sessionStorage` fallback only (`fresh: false`, i.e. a revisit). The page now renders different copy for each case:

- **Fresh:** unchanged — "Thank you. Your request has been received. We will review it and contact you soon..."
- **Revisit:** "Your Most Recent Request — This is the most recent request confirmation stored in this browser session. This is an inquiry, not a paid order — no payment has been collected. Checking on an older or different request? Please refer to our email reply or [contact us] directly."

Both cases still show the same underlying data (reference number, contact details, item summary, next steps) — only the framing/heading changes, so the customer is never told a new request "has been received" when they're actually looking at an older one.

**Note on browser behavior discovered during testing:** a same-page `window.location.reload()` on a freshly-shown confirmation still shows the "fresh" wording, because React Router's navigation state is stored in the browser's History API `state` object for that history entry, which persists across a reload of the same entry (confirmed directly via `window.history.state` inspection). This is correct, expected behavior, not a gap — reloading the page you just landed on after submitting is still the same visit. The "revisit" wording correctly triggers for the scenario the reviewer described: a genuinely new navigation to the URL (different tab, typed URL, bookmark, or return visit after navigating elsewhere) that carries no route state.

No backend, API, or schema changes were made or needed — this is presentational logic over data the page already had.

### 3. New successful request replaces old confirmation data

**Result: already correct, no fix needed.** Live test: submitted Request A (id 18, size "18\"x18\"", ₹8,000) — confirmed `sessionStorage.orderRequestConfirmation` held id 18. Without clearing storage, added a different size of the same artwork to the cart and submitted Request B (id 19, size "24\"x24\"", ₹12,000) — the confirmation page immediately showed Request B's data (not Request A's), and `sessionStorage.orderRequestConfirmation` was confirmed to hold id 19. `sessionStorage.setItem()` naturally overwrites the previous value under the same key, and each successful submission always supplies fresh route state, so there is no path by which an old confirmation can persist after a new one succeeds.

### Files changed (this follow-up)

- `src/pages/RequestConfirmation.js` — only file changed. No backend file touched.

### Validation performed

| Check | Result |
|---|---|
| Frontend build (`CI=true npm run build`) | ✅ Compiled successfully, no warnings |
| Direct visit, cleared `sessionStorage` → safe fallback, not success | ✅ |
| Revisit (stale data, no route state) → "Your Most Recent Request" wording, not "just received" | ✅ (fixed) |
| Fresh submission → "Thank you. Your request has been received." unchanged | ✅ (regression-checked after the fix) |
| New successful request replaces old in both UI and `sessionStorage` | ✅ |
| `git status` clean except unrelated untracked files | ✅ |
| Branch pushed to `origin` | ✅ (already tracking `origin/feature/ORD-03-customer-request-confirmation`; this follow-up commit pushed after) |
| No backend files changed | ✅ — `git status --short server/` empty throughout |
| No schema migration added | ✅ — none needed, none added |
| No new API endpoint added | ✅ |
| No `server/.env`, secrets, logs, temp scripts, or private files committed | ✅ |
| Local build passed | ✅ |
| Local validation passed | ✅ |
| Local test rows 15 and 16 cleaned up | ✅ — confirmed already absent from `order_requests` (cleaned up in the prior round); this round's new test rows (18, 19, 20) also deleted afterward |
| No artwork/category/pricing/SKU/inventory data changed | ✅ — verified before/after via direct DB query |

### Test data cleanup (this follow-up)

`order_requests` ids 18, 19, 20 (created during this review pass) were deleted after validation. Pre-existing rows (4, 7, and 17 — a pre-existing "Test Customer" row not created by this session) were left untouched, since only test data created during this validation round is safe to remove.

## Ready for review (after reviewer follow-up)

✅ **Yes.** All three reviewer-flagged sessionStorage scenarios were verified live; the one real gap (stale confirmation data reading as a fresh success) is fixed with a small, frontend-only, presentational-only change. No backend/API/schema changes were made. All pre-PR checks pass.
