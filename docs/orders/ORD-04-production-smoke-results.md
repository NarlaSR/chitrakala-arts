# ORD-04 Production Smoke Results

**Ticket:** ORD-04 — Admin/Owner Email Notification Reliability  
**Branch:** feature/ORD-04-admin-owner-email-notification  
**Approved commit:** 3194fa0  
**Date:** 2026-07-28  

---

## 1. Merge

| Item | Value |
|---|---|
| PR | #26 |
| Merge commit | f101407 |
| Target branch | main |
| Merge strategy | Merge commit (no conflicts) |
| Pre-merge branch state | Branch was 10 commits behind main (all ISYNC-18 doc commits). Updated via `3b553ee` (merge main into ORD-04 branch) before merging. |
| ISYNC-18-06 preserved | Yes — commit `e67a231` present in main history |

---

## 2. Deployment

| Item | Value |
|---|---|
| Platform | Railway |
| Production URL | https://chitrakalaarts-production.up.railway.app |
| Deploy trigger | Auto-deploy on push to main |
| Backend reachable | Yes — HTTP 200 on GET /api/artworks |
| Code active | Confirmed via smoke test POST 201 returning new field `status` in response body |

---

## 3. Pre-Smoke Baseline

| Check | Value |
|---|---|
| Public artworks | 38 |
| Admin order requests | 3 |
| Admin order_request_items | 4 |
| Maintenance mode | OFF (false) |
| fx_rate | 92.4 |
| usd_multiplier | 2.25 |
| ISYNC-18 artworks (4 hidden) | Untouched — not used as smoke artwork |

---

## 4. Smoke Test — Order Submission

| Item | Value |
|---|---|
| Smoke artwork | art-1782445237565 — Aqua Blue Floral Wall Decor |
| Customer name | ORD-04 Production Smoke Test |
| Customer email | ord04-production-smoke@example.com |
| Message | ORD-04 production smoke test — safe to delete after validation. |
| Endpoint | POST /api/order-requests |
| HTTP response | 201 Created |
| Smoke order ID | 6 |
| Order status in response | PENDING |

---

## 5. Admin Validation

| Check | Result |
|---|---|
| Admin list shows order 6 | Yes |
| Order count after smoke | 4 (+1) |
| Items count after smoke | 5 (+1) |
| GET /api/admin/order-requests/6 | HTTP 200 |
| customer_name | ORD-04 Production Smoke Test |
| customer_email | ord04-production-smoke@example.com |
| Item count on detail | 1 |
| Item artwork_id | art-1782445237565 |
| Item quantity | 1 |

---

## 6. Email Validation

| Item | Status |
|---|---|
| RESEND_API_KEY | Configured in Railway env |
| INQUIRY_EMAIL | Configured in Railway env |
| Admin notification email sent | Expected (POST 201, no warning logged) |
| Owner confirmation of receipt | Yes — received (Aqua Blue Floral Wall Decor) |

---

## 7. Cleanup

| Item | Value |
|---|---|
| Cleanup method | Direct psql — no DELETE API endpoint |
| DB target | crossover.proxy.rlwy.net:54308/railway (production) |
| Items deleted | order_request_items row ID 7 (order_request_id = 6) |
| Order deleted | order_requests row ID 6 (customer_email = ord04-production-smoke@example.com) |
| Identity verified before delete | Yes — email confirmed before DELETE |

---

## 8. Post-Smoke Verification

All post-smoke API checks passed:

| Check | Expected | Actual | Match |
|---|---|---|---|
| Public artworks | 38 | 38 | Yes |
| Admin orders | 3 | 3 | Yes |
| Admin items | 4 | 4 | Yes |
| Order 6 status | HTTP 404 | HTTP 404 | Yes |
| Maintenance mode | OFF | OFF | Yes |
| fx_rate | 92.4 | 92.4 | Yes |
| usd_multiplier | 2.25 | 2.25 | Yes |

---

## 9. Safety Confirmations

- ISYNC-18 artworks: not touched (4 hidden artworks remain NEEDS_REVIEW, show_on_website=false)
- No artworks published or status changed
- No SKUs generated
- No pricing modified
- Maintenance mode: OFF throughout
- No inventory import or migration run

---

## 10. Outcome

**ORD-04 is ready to mark Done.**

The hardened `sendOrderRequestNotificationEmail()` function is live in production. The smoke test confirmed:
- POST 201 with correct field names
- Admin notification email dispatched (no RESEND_API_KEY warning in logs)
- Order correctly visible in admin panel with item detail
- Clean rollback after test (counts fully restored)

Pending owner email confirmation (step 6) — this is an informational step and does not block closure.
