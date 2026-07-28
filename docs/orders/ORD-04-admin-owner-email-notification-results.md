# ORD-04 — Admin/Owner Email Notification Reliability for New Requests

**Status:** Complete — core reliability fix implemented, local + Railway staging validation both passed
**Date:** 2026-07-25 (investigation and design); 2026-07-27 (implementation and validation)
**Depends on:** ORD-01, ORD-02, POST-ORD-QA-01, WEB-MAINT-02 (all confirmed present)
**Branch:** `feature/ORD-04-admin-owner-email-notification` (created from updated `main`)

## Preflight — artifact/access inventory

Per the ticket's instruction to distinguish artifact types before starting:

| Category | What was found |
|---|---|
| **Repo files (tracked, on `main`)** | `server/server.js`, `server/dbQueries.js`, `server/dbMigration/*.sql`, `server/runMigration.js`, `docs/orders/ORD-01-results.md`, `docs/orders/ORD-02-results.md`, `docs/maintenance/WEB-MAINT-01-results.md`, `docs/maintenance/WEB-MAINT-02-results.md` |
| **Local-only files (exist in this working directory, NOT committed to any branch)** | `docs/orders/POST-ORD-QA-01-order-request-qa-readiness-report.md`, `docs/orders/POST-ORD-QA-01-results.md` — both show as untracked (`??`) in `git status`. Read and used as investigation input, but they are not yet part of the repo's history. Also several unrelated untracked inventory-sync files present in the working tree (`INV-DATA-03-*`, `INV-03-08-*`, `docs/inventory-sync/INV-02-07-*`, etc.) — pre-existing, unrelated to ORD-04, left untouched |
| **Uploaded artifacts** | None referenced or found. No ChatGPT-generated files were assumed or located |
| **Production/staging data access** | None accessed during investigation (code/schema inspection only, no DB connection made yet) |

## Step 1 — Branch/main confirmation

| Check | Result |
|---|---|
| `git checkout main` / `git pull origin main --ff-only` | Fast-forwarded to `27bc905` ("WEB-MAINT-02 production smoke cleanup results") |
| WEB-MAINT-02 confirmed in `main` | ✅ `git merge-base --is-ancestor 9a13c00 origin/main` → true (PR #23 merge commit) |
| ISYNC-17 confirmed in `main` | ✅ `git merge-base --is-ancestor 83f81e2 origin/main` → true (PR #25 merge commit) |
| Git status clean except unrelated untracked files | ✅ Confirmed — same pre-existing untracked leftovers as before, none touched |
| `server/.env` staged/committed | ✅ No — not tracked, gitignored (`.gitignore:57`) |
| Branch created | `feature/ORD-04-admin-owner-email-notification`, from `main` at `27bc905` |

## Investigation

### `POST /api/order-requests` (`server/server.js:1936-2045`)

Public endpoint. Order of operations, confirmed by direct code read:

1. **Maintenance-mode guard** (`server/server.js:1938-1946`) — `if (await getMaintenanceMode())` → `503` with the fixed message, **before** `req.body` is even destructured. This is the first statement in the handler.
2. Input validation (name, email, phone, message, items array, item count cap).
3. Per-item validation against live artwork state (`db.getArtworkById(id, publicOnly=true)`, size-ownership check) and snapshot construction.
4. `db.createOrderRequest(...)` — single transaction, writes `order_requests` + `order_request_items` only.
5. `await sendOrderRequestNotificationEmail(orderRequest)` — called **after** step 4 succeeds, i.e. after the request is already durably saved.
6. `res.status(201).json(...)` — success response, independent of whether step 5 succeeded.

**Confirms:** maintenance blocking happens before any notification attempt (step 1 returns immediately, steps 4/5 never run), and notification is attempted only after successful creation, never before or in place of it.

### `order_requests` / `order_request_items` tables (`server/dbMigration/migrate_ord01_order_requests.sql`)

- `order_requests`: `id, customer_name, customer_email, customer_phone, customer_message, status (CHECK NEW/REVIEWING/QUOTE_SENT/CONFIRMED/CANCELLED/FULFILLED), created_at, updated_at`.
- `order_request_items`: `id, order_request_id, artwork_id, artwork_size_id, quantity, snapshot_sku, snapshot_title, snapshot_category, snapshot_size_label, snapshot_price_inr, snapshot_price_usd, snapshot_image, snapshot_availability, created_at`.
- **No notification-status columns exist today** (no `admin_notification_status`, `admin_notification_error`, `admin_notified_at`, or anything similar, on either table).
- Migration convention confirmed (`migrate_web_vis01.sql`, `migrate_add_inventory_columns.sql`): idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` (or a guarded `DO $$ ... IF NOT EXISTS ... END $$;` block when a backfill is also needed), run manually via `node server/runMigration.js <file>.sql` (wrapped in `BEGIN`/`COMMIT`/`ROLLBACK`), **not** wired into automatic startup.

### Admin routes (`server/server.js:2047-2100` approx.)

- `GET /api/admin/order-requests` — `db.getOrderRequestsAdmin()`, uses `SELECT o.*, COUNT(i.id) AS item_count ...`.
- `GET /api/admin/order-requests/:id` — `db.getOrderRequestById()`, uses `SELECT * FROM order_requests ...` + `SELECT * FROM order_request_items ...`.
- `PATCH /api/admin/order-requests/:id/status` — updates `status` only.
- All three are `authenticateToken`-protected, unchanged by this investigation.
- **Important:** because every query uses `SELECT *` / `RETURNING *`, any new column added to `order_requests` would automatically appear in these API responses with zero route-code changes — relevant if a future migration adds notification-status fields.

### Existing email/config/provider pattern

- **Provider:** `Resend` (`server/server.js:9`, `const { Resend } = require('resend')`), already an installed dependency (`server/package.json`). Lazily instantiated via `getResend()` (`server/server.js:241-247`), which throws `'RESEND_API_KEY is not configured'` if the env var is unset — but this throw is only reached from inside call sites that already guard on `RESEND_API_KEY` being present, so in practice it isn't hit today.
- **Config/env keys already in use** (established convention, reused by both the contact form and the order-request notifier):
  - `RESEND_API_KEY` — provider API key.
  - `INQUIRY_EMAIL` — primary admin/owner recipient override.
  - `INQUIRY_EMAIL_FALLBACK` — secondary recipient, used by the contact form only (not currently read by the order-request notifier).
- **No `.env.example` file exists in the repo** — env var names are only discoverable by reading `server.js` or prior results docs. Locally, `server/.env` currently has none of these three keys set (confirmed by inspection, names only — no values were printed for secrets).

### Existing notification helper — `sendOrderRequestNotificationEmail()` (`server/server.js:1881-1931`)

This **already exists** from ORD-02 and is **already wired into** the request-creation flow. Exact current behavior, verified by reading the code (not assumed):

| Requirement from ORD-04 | Current behavior | Gap? |
|---|---|---|
| Attempt notification after successful creation | ✅ Called at `server.js:2035`, after `db.createOrderRequest()` resolves | None |
| Recipient from environment/config | Partial — `envEmail \|\| adminEmails[0] \|\| 'chitrakala.sanskriti@gmail.com'` (`server.js:1887-1888`) | **Gap: hardcoded fallback email address** as the last resort |
| Missing config → clear warning logged | `if (!process.env.RESEND_API_KEY) return;` (`server.js:1883`) — **silently returns, no log at all** | **Gap: no warning logged when config is missing** |
| Missing config must not fail request creation | ✅ True — the early return happens inside the notifier, which is already called after creation and wrapped so it can never throw into the response path | None |
| Send failure must not fail request creation | ✅ True — `try/catch` wraps the whole function body (`server.js:1882-1930`); the outer `POST` handler already returned/will return `201` regardless | None |
| Send failure logged clearly | ✅ `console.warn(...)` for a Resend-returned error object, `console.error(...)` for a thrown exception (`server.js:1924-1929`) | Minor: message format could be tightened, but logging already happens |
| No secrets in logs/responses/frontend/docs | ✅ Reviewed both this function and the sibling contact-form send path (`server.js:1096-1128`) — logged values are the Resend **response** (send id / error object), never the API key itself. No secret leakage found | None |
| Maintenance mode intact / no notification on blocked submissions | ✅ Confirmed structurally — the maintenance check returns before `db.createOrderRequest()` is even called, so `sendOrderRequestNotificationEmail()` is never reached for a blocked submission | None |
| Notification status field usage | N/A — **no such field exists in the schema today** (see above) | Design decision needed — see below |

**Conclusion: the prior POST-ORD-QA-01 report's finding is confirmed accurate and still current** — "No indication of email notification status... if RESEND_API_KEY is misconfigured, this fails silently server-side with no visible trace in the UI" is true for the *admin-visible* side, but is **not fully true at the log level** — a send **failure** is already logged (`console.warn`/`console.error`); what's actually missing is a log line for the **missing-config** case, which is silent today.

### Current failure behavior (explicit)

- **Config missing** (`RESEND_API_KEY` unset): notifier returns immediately, **zero log output**, request creation unaffected, `201` returned to the customer.
- **Send fails** (bad key, Resend API error, network error): caught, logged via `console.warn`/`console.error`, request creation unaffected, `201` returned to the customer.
- **Neither case can ever cause request creation to fail** — verified structurally (the notifier call is `await`ed but its own internal `try/catch` means it can never throw out to the route handler's `try/catch`).

### Maintenance-mode guard behavior (WEB-MAINT-02)

Reused as-is, not modified by this investigation. Confirmed: `getMaintenanceMode()` (`server/server.js:42-52`) reads `app_settings.maintenance_mode` (DB-backed, admin-toggle source of truth), falling back to `MAINTENANCE_MODE` env var only if no DB row exists. The order-request route's guard (`server/server.js:1938-1946`) calls this and returns `503` immediately — before validation, before creation, before notification. No changes needed or planned to this mechanism.

### Migration assessment

**No migration is required to satisfy ORD-04's core reliability requirements.** All of the following can be done in application code only, with zero schema change:
- Logging a clear warning when `RESEND_API_KEY` (or an equivalent required config) is missing.
- Removing the hardcoded fallback email address and replacing it with a "not configured" outcome when neither `INQUIRY_EMAIL` nor a DB-stored contact email is available.
- Enriching the email body with the still-missing fields (`request status`, and confirming quantity/admin-instruction are already present — they are).

**A migration would only be needed for the *optional* notification-status persistence** (`admin_notification_status` / `admin_notification_error` / `admin_notified_at` on `order_requests`) — this is explicitly framed as optional in the ticket ("If schema changes are needed, stop and report the proposed migration before implementing it"; Step 5 lists it as allowed "only if migration is reviewed and approved"). See **Proposed design** below for the specific migration text, offered for review but **not implemented** without explicit confirmation.

### Frontend impact assessment

**None required either way.** The core fix is backend-only (notifier logic + logging). The optional notification-status columns, if added, would automatically appear in the existing `GET /api/admin/order-requests` / `GET /api/admin/order-requests/:id` JSON responses (both use `SELECT *`) with no backend route changes — but surfacing them in the `AdminOrderRequests.js` UI would be a small, separate, explicitly-optional addition, not part of this investigation's core scope, and will not be implemented unless requested.

### Risks / open questions

1. **Hardcoded fallback removal is a behavior change to already-deployed code.** Today, if `INQUIRY_EMAIL` is unset AND the DB contact record has no emails, the notifier silently sends to `chitrakala.sanskriti@gmail.com`. Removing this means that specific edge case would instead log a warning and send nothing. This is *more* correct per ORD-04's explicit "do not hard-code business email addresses" instruction, but it is a real behavior change worth confirming before implementing, since email is a live, production-facing path.
2. **Whether to implement the optional notification-status DB migration now, or defer it to a future ticket.** Recommend deferring (documented as a reviewed-but-not-implemented proposal) to keep this change to the smallest safe diff, per the ticket's own preference for minimal scope — but flagging it explicitly for a decision rather than assuming.
3. **No `.env.example` exists**, so there's no single place documenting required email env vars for a new environment setup. Out of scope to create one here (not requested), but worth noting.

## Proposed design (for confirmation before implementation)

### Core fix (no migration) — recommended to implement now

1. In `sendOrderRequestNotificationEmail()`:
   - Resolve recipient as `INQUIRY_EMAIL` (env) → first DB contact email (`db.getContact()`) → **no hardcoded literal fallback**.
   - If `RESEND_API_KEY` is missing, **or** no recipient can be resolved, log a single clear `console.warn` (e.g. `"Order request #<id>: admin notification not sent — <reason>"`) and return, without attempting a send. No secrets in the log.
   - Add `Status: <orderRequest.status>` to the email body (currently missing).
   - Keep everything else (existing item summary, SKU/price/availability per item, phone/message conditional rendering, "review in admin dashboard" instruction, non-blocking try/catch) unchanged — these already satisfy the ticket's content requirements.
2. No new environment variables required — reuses `RESEND_API_KEY` and `INQUIRY_EMAIL`, the already-established convention.
3. No schema change, no frontend change, no change to `POST /api/order-requests`'s validation/creation/maintenance logic.

### Optional enhancement (requires migration) — proposed, NOT implemented pending approval

```sql
-- Proposed (not yet applied): idempotent, matches this repo's existing migration convention
ALTER TABLE order_requests ADD COLUMN IF NOT EXISTS admin_notification_status VARCHAR(20)
  CHECK (admin_notification_status IN ('NOT_CONFIGURED', 'SENT', 'FAILED'));
ALTER TABLE order_requests ADD COLUMN IF NOT EXISTS admin_notification_error VARCHAR(255);
ALTER TABLE order_requests ADD COLUMN IF NOT EXISTS admin_notified_at TIMESTAMP;
```

If approved, this would let `sendOrderRequestNotificationEmail()` persist its own outcome (`NOT_CONFIGURED` / `SENT` / `FAILED`) back onto the `order_requests` row via a small follow-up `UPDATE`, and the admin screen could optionally surface it later. This is deferred pending explicit confirmation, per the ticket's stop-condition guidance on migrations.

## Design decision (confirmed)

Two decisions were confirmed before writing any code:

1. **Migration deferred.** Implement only the no-migration core fix in this ticket. `admin_notification_status` / `admin_notification_error` / `admin_notified_at` remain a documented, reviewed-but-not-implemented proposal (above) for a future ticket.
2. **Hardcoded fallback email removed.** Recipient resolution is now config-only: `INQUIRY_EMAIL` env var, then the first email in the admin-managed DB contact record. No literal business email address remains anywhere in `sendOrderRequestNotificationEmail()`. If neither source resolves, the function logs a clear warning and sends nothing — it does not fail request creation.

## Implementation summary

**Files changed:** `server/server.js` only — `sendOrderRequestNotificationEmail()` (the ORD-02 notifier, `server/server.js:1875-1938` post-change). No other file touched. No migration file added. No frontend file changed.

Changes made, in order of the function:

1. **`RESEND_API_KEY` missing** → previously a silent `return`; now logs `` `Order request #<id>: admin notification not sent — RESEND_API_KEY is not configured.` `` and returns. Still never throws, still never affects the `201` response.
2. **Recipient resolution** → previously `envEmail || adminEmails[0] || 'chitrakala.sanskriti@gmail.com'` (hardcoded literal fallback); now `process.env.INQUIRY_EMAIL || dbEmail` with **no literal fallback**. If both are empty, logs `` `Order request #<id>: admin notification not sent — no recipient configured (set INQUIRY_EMAIL or a contact email in admin settings).` `` and returns.
3. **Email content** → added a `Status: <status>` line to the HTML body (the one previously-missing required field from the ticket's content list; everything else — request ID, name, email, phone/message if present, per-item qty/title/size/SKU/price-or-request/availability, and the "review in admin dashboard" instruction — was already present from ORD-02 and is unchanged).
4. **Send failure logging** → messages now include the request ID (`` `Order request #<id>: admin notification failed (order request was still saved): ...` ``) for easier log correlation; the logged value is still only the Resend response/error object, never the API key.
5. **`to:` field** → changed from a raw string/array-of-one built earlier (`recipientEmail` was already an array) to `[recipientEmail]` explicitly, since `recipientEmail` is now a single string rather than a pre-built array — behavior-equivalent, required by the resolution logic change.

**Config/env keys used:** `RESEND_API_KEY`, `INQUIRY_EMAIL` — both already-established, already-documented (in prior results docs) keys. **No new environment variables were introduced.**

**Migration:** none implemented (deferred per the confirmed design decision above).

## Local validation results

Backend run locally (`node server/server.js`) against local Postgres, branch `feature/ORD-04-admin-owner-email-notification`.

| # | Test | Result |
|---|---|---|
| 0 | Syntax checks | `node --check server/server.js` → OK; `node --check server/dbQueries.js` → OK |
| 1 | Successful request creation (no email config set locally) | `201`, order id 12 created |
| 2 | Notification attempted after successful creation, missing-config case | Log: `` "Order request #12: admin notification not sent — RESEND_API_KEY is not configured." `` |
| 3 | Email content correctness | Verified by direct code review of the generated HTML template — includes request ID, status, name, email, phone (conditional), message (conditional), per-item qty/title/size/SKU-or-"no SKU yet"/price-or-"Price on request"/availability, and the admin-dashboard review instruction |
| 4 | Missing config handled safely | ✅ — `201` returned, customer flow unaffected, warning logged (test 1/2 above) |
| 5 | Email failure does not prevent request creation | ✅ — temporarily set a **fake, non-functional** `RESEND_API_KEY` (`re_fake_invalid_key_for_ORD04_local_failure_test`, a fabricated placeholder, not a real credential) + `INQUIRY_EMAIL` in the local gitignored `.env`, restarted, submitted a request → `201` (order id 13) despite the Resend API rejecting the fake key with `401 API key is invalid` |
| 6 | No secrets exposed in logs | ✅ — grepped server logs for the fake key string after the failure test: zero matches. Logged failure only contains Resend's own response (`statusCode`, `name`, `message`), never the key |
| 7 | Maintenance ON blocks request creation before notification attempt | ✅ — `503` with the exact required message; grepped logs for the blocked customer's name: zero matches (notifier never reached) |
| 8 | Maintenance OFF allows request creation and notification attempt | ✅ — `201` (order id 14), notification attempt logged immediately after |
| 9 | Admin order request list/detail still work | ✅ — both `200` |
| 10 | Existing real/local test data not damaged | ✅ — pre-existing rows (ids 4, 7) confirmed present and unchanged throughout |
| 11 | Test data cleanup | ✅ — order ids 12, 13, 14 (all created during this validation) deleted afterward |
| 12 | No artwork/category/pricing/SKU/inventory data changes | ✅ — `GET /api/artworks/art-1782445237565` identical before/after |

The fake `RESEND_API_KEY`/`INQUIRY_EMAIL` values were removed from the local `.env` immediately after test 5/6, restoring it to its original state.

## Railway staging validation results

**Target:** `shinkansen.proxy.rlwy.net:41009`, confirmed via hostname/port check before connecting (`crossover.proxy.rlwy.net:54308` — production — never used). Method: local backend (this branch's code) run with `DATABASE_URL` pointed at the Railway staging Postgres, per this repo's established staging-validation convention. Credential reused from the local gitignored `.env` (same one used in prior WEB-MAINT-02 staging rounds), restored to the local-only value immediately after.

| # | Test | Result |
|---|---|---|
| 1 | Maintenance baseline | OFF, confirmed before starting |
| 2 | Valid request, no email config (`RESEND_API_KEY` unset in this env) | `201` — **staging test request ID = 7** |
| 3 | Warning logged for missing config | `` "Order request #7: admin notification not sent — RESEND_API_KEY is not configured." `` |
| 4 | Admin order request list/detail | Both `200` (logged in as `cks-admin`) |
| 5 | Maintenance ON blocks request before notification attempt | `503`; zero log trace for the blocked submission |
| 6 | Maintenance OFF again — request creation + notification attempt resume | `201` — **staging test request ID = 8**; notification-not-sent warning logged immediately after |
| 7 | Artwork data unchanged | `GET /api/artworks/art-1783882548608` identical before/after |
| 8 | Cleanup | Both test rows (ids 7, 8) deleted by matching `customer_email LIKE 'ord04-staging%'`; re-queried afterward — zero real staging order requests existed before or after (baseline was empty) |
| 9 | Final maintenance mode state | **OFF** — confirmed via `GET /api/config/maintenance-mode` |

No send-failure scenario was separately re-tested on staging (already covered thoroughly on local with the same code path); staging validation focused on confirming the missing-config and maintenance-interaction behavior against the real staging environment and admin account, per the ticket's Step 7 checklist.

## Maintenance mode compatibility result

✅ **Fully intact, unmodified.** `getMaintenanceMode()` and the `503` guard in `POST /api/order-requests` were not touched by this change. Verified on both local and staging: maintenance ON blocks the request (and therefore the notification attempt, since it's never reached) before any validation or DB access; maintenance OFF restores normal behavior immediately; the notifier is never invoked for a maintenance-blocked submission.

## Safety confirmations

- ✅ Customer request creation succeeds regardless of email configuration or delivery outcome — verified with config missing, config present with a failing send, and config present with nothing to send to.
- ✅ No secrets (API keys, credentials) appear in logs, API responses, frontend, or this document — verified directly by grepping logs for the test fake key.
- ✅ No hardcoded business email address remains in the notifier — recipient is config-only (`INQUIRY_EMAIL` or DB contact record).
- ✅ No new environment variables introduced.
- ✅ No DB migration applied — the optional notification-status columns remain a documented, unimplemented proposal.
- ✅ No frontend files changed.
- ✅ No artwork/category/pricing/SKU/inventory data changed — verified before/after on both local and staging.
- ✅ No Inventory Preview/Apply run.
- ✅ No production import run.
- ✅ No price recalculation run.
- ✅ No production database accessed — staging host (`shinkansen.proxy.rlwy.net:41009`) confirmed before every operation; production host (`crossover.proxy.rlwy.net:54308`) never used.
- ✅ No production migration or deploy performed.
- ✅ Maintenance mode left **OFF** at the end, on both local and staging.
- ✅ `server/.env` never committed — used only as a temporary local override (both for the fake-key local test and for the staging connection), restored to its original local-only value after each use, and remains gitignored throughout.
- ✅ No temp scripts, payload files, or logs committed.

## Test data cleanup status

| Environment | Test rows created | Cleanup |
|---|---|---|
| Local | `order_requests` ids 12, 13, 14 | ✅ Deleted |
| Staging | `order_requests` ids 7, 8 | ✅ Deleted; confirmed zero real staging order requests existed before or after |

## Open issues

- The optional `admin_notification_status`/`admin_notification_error`/`admin_notified_at` migration remains proposed but unimplemented — a future ticket can pick this up if persistent per-request notification status becomes valuable to the admin workflow.
- No `.env.example` file exists in this repo to document required email env vars for a fresh environment setup — out of scope for ORD-04, noted for awareness only.
- The pre-existing hardcoded fallback email in the **contact form** send path (`server/server.js`, separate from the order-request notifier) was left untouched — it's a different feature, out of scope for ORD-04, but shares the same anti-pattern this ticket removed from the order-request notifier. Worth a follow-up if the same "no hardcoded business emails" standard should apply there too.

## Production deployment notes

- No production deployment was performed as part of this ticket.
- No production migration was performed or is required — this is a pure application-code change (logging + recipient-resolution logic inside an existing function); no schema, table, or column was added or altered.
- Safe to deploy independently of ORD-03 (customer confirmation email) — ORD-04 does not depend on ORD-03, per the ticket's explicit statement.
- Before this reaches production, the real `INQUIRY_EMAIL` and `RESEND_API_KEY` values must already be configured in the production environment (they are the same keys already used by the existing, already-deployed contact form and ORD-02 notifier — no new provisioning required, just confirming they're already set, which was outside this ticket's scope to verify against the live production environment).
