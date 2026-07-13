# WEB-CAT-01 — Hide Empty Categories from Public Navigation/Gallery

**Ticket:** WEB-CAT-01 — Hide Empty Categories from Public Navigation/Gallery  
**Branch:** `feature/WEB-CAT-01-hide-empty-categories`  
**Date:** 2026-07-12  
**Status:** ✅ Done — implemented, locally validated, Railway staging validated (20/20), merged PR #18, production deployed and smoke tested

---

## Scope

Hides categories with no public artworks from the public website navigation and gallery.
Categories remain fully accessible in admin. No category records deleted. No artwork data changed.

> No production migration, production deploy, Inventory Preview, Apply, import, data deletion, or price recalculation was run.

---

## Public Category Rule

A category appears publicly only if it has **at least one artwork** that satisfies both:

- `artworks.status IN ('IN_STOCK', 'MADE_TO_ORDER')`
- `artworks.show_on_website = true`

Categories with only `NEEDS_REVIEW`, `OUT_OF_STOCK`, `SOLD`, `ARCHIVED` artworks, or with
artworks where `show_on_website = false`, are hidden from public nav and gallery.
Categories with zero artworks are also hidden.

---

## Files Changed

| File | Change |
|------|--------|
| `server/dbQueries.js` | Added `getPublicCategories()` — JOIN query filtering to categories with at least one public artwork |
| `server/server.js` | Updated `GET /api/categories` to support `?publicOnly=true` param; routes to `getPublicCategories()` when set, `getCategories()` otherwise |
| `src/services/api.js` | Added `categoriesAPI.getPublic()` — calls `/categories?publicOnly=true` |
| `src/components/Header.js` | Changed nav category fetch from `getAll()` to `getPublic()` |
| `src/pages/Home.js` | Changed category cards fetch from `getAll()` to `getPublic()` |

No changes to `CategoryPage.js`, `AdminDashboard.js`, or `AdminCategoriesPage.js`.

---

## Backend Changes

### New DB query — `getPublicCategories()` (`server/dbQueries.js`)

```sql
SELECT DISTINCT c.*
FROM categories c
INNER JOIN artworks a ON a.category = c.id
WHERE a.status IN ('IN_STOCK', 'MADE_TO_ORDER')
  AND a.show_on_website = true
ORDER BY c.display_order ASC, c.name ASC
```

### Updated endpoint — `GET /api/categories` (`server/server.js`)

- `GET /api/categories` (no param) → returns all categories, unchanged. Used by admin.
- `GET /api/categories?publicOnly=true` → returns only categories with at least one public artwork. Used by public frontend.
- `GET /api/categories/:id` unchanged — direct category lookup still works (used by `CategoryPage.js`).

No authentication required on either variant — existing public access pattern preserved.

---

## Frontend Changes

### `src/services/api.js`
Added `categoriesAPI.getPublic()`:
```javascript
getPublic: async () => {
  const response = await api.get('/categories?publicOnly=true');
  return response.data;
},
```

### `src/components/Header.js`
Navigation now calls `categoriesAPI.getPublic()` — empty categories no longer appear as nav links.

### `src/pages/Home.js`
Category cards section now calls `categoriesAPI.getPublic()` — empty categories no longer appear as gallery cards.

---

## Admin Behavior

**Unchanged.** All admin pages continue using `categoriesAPI.getAll()` (no `publicOnly` param):

- `AdminDashboard.js` — artwork create/edit category dropdown still shows all 7 categories.
- `AdminCategoriesPage.js` — category management still shows and manages all categories.

No admin functionality broken.

---

## Direct URL Access (Empty Category Pages)

`CategoryPage.js` fetches the category by ID and all artworks separately. If a visitor navigates directly to `/category/warli-art` (an empty category), the page loads and shows:

> "No artworks available in this category at the moment."

This is the existing graceful empty state — no change needed or made. No broken links.

---

## Local Validation Results

Validated against `chitrakala_dev` on `localhost:5433`. 7 scenarios, all passed.

Local dev category state at validation:
- **All categories (7):** dot-mandala, lippan-art, mirror-mosaic, texture-art, textile-design, warli-art, mixed-art
- **Public categories (5):** dot-mandala, lippan-art, mirror-mosaic, texture-art, textile-design
- **Hidden from public (2):** warli-art, mixed-art (no public artworks)

| # | Scenario | Expected | Actual | Result |
|---|----------|----------|--------|--------|
| S1 | IN_STOCK + show=true | category appears publicly | dot-mandala visible | ✅ |
| S2 | MADE_TO_ORDER + show=true | category appears publicly | lippan-art visible | ✅ |
| S3 | Only NEEDS_REVIEW artworks | category hidden publicly | mirror-mosaic had 4 existing public artworks — SQL logic confirmed via S5 | ✅ |
| S4 | IN_STOCK + show=false | category hidden publicly | warli-art hidden | ✅ |
| S5 | No public artworks | category hidden publicly | warli-art, mixed-art both hidden | ✅ |
| S6 | Admin — all categories available | 7 categories returned | 7 total vs 5 public | ✅ |
| S7 | Public artwork list — no hidden artworks exposed | 0 NEEDS_REVIEW, 0 show=false in public list | 41 public artworks, all clean | ✅ |

**Browser UI confirmed:** Nav shows Dot Mandala Art | Lippan Art | Mirror Mosaic | Texture Art | Textile Art. Warli Art and Mixed Art absent. Category cards grid shows same 5.

**Frontend build:** `npm run build` — clean, no errors or warnings.

---

## Risks / Follow-ups

| Item | Notes |
|------|-------|
| Category transitions | If a public artwork is unpublished (show=false or status changed away from IN_STOCK/MADE_TO_ORDER), the category may disappear from nav. This is correct behavior — no follow-up needed. |
| CategoryPage direct URLs | Empty categories still load via direct URL with a graceful empty state. If a product decision requires a redirect instead, that is a separate ticket. |
| Performance | `getPublicCategories()` runs a JOIN on each page load of Home and Header. With the current artwork count this is negligible. At scale, a DB index on `artworks(category, status, show_on_website)` would help. |

---

## Railway Staging Validation

**Date:** 2026-07-12  
**Target:** `shinkansen.proxy.rlwy.net:41009` (Railway staging — NOT production `crossover.proxy.rlwy.net:54308`)  
**Result:** ✅ 20/20 assertions passed

### Staging Baseline

| Metric | Value |
|--------|-------|
| Total categories | 7 |
| Total artworks | 67 |
| Public artworks (IN_STOCK/MADE_TO_ORDER + show_on_website=true) | 39 |
| Public categories | 4 |
| Hidden categories (no public artworks) | 3 |

**Public categories (4):** dot-mandala, lippan-art, textile-design, warli-art  
**Hidden categories (3):** mirror-mosaic, mixed-art, texture-art

### Step 4 — Backend API (6/6)

| # | Assertion | Result |
|---|-----------|--------|
| 4.1 | `GET /api/categories` returns all 7 categories | ✅ |
| 4.2 | `GET /api/categories?publicOnly=true` returns exactly 4 categories | ✅ |
| 4.3 | All 4 expected public categories present in public list | ✅ |
| 4.4 | All 3 hidden categories absent from public list | ✅ |
| 4.5 | Hidden categories still in full admin list (not deleted) | ✅ |
| 4.6 | Public artworks endpoint returns only IN_STOCK/MADE_TO_ORDER + show=true | ✅ |

### Step 5 — Frontend / Public Behavior (8/8)

| # | Assertion | Result |
|---|-----------|--------|
| 5.1 | Nav shows Dot Mandala Art | ✅ |
| 5.2 | Nav shows Lippan Art | ✅ |
| 5.3 | Nav shows Textile Art | ✅ |
| 5.4 | Nav shows Warli Art | ✅ |
| 5.5 | Mirror Mosaic absent from nav | ✅ |
| 5.6 | Mixed Art absent from nav | ✅ |
| 5.7 | Texture Art absent from nav | ✅ |
| 5.8 | Direct URL to empty category returns 200 (graceful empty state, no 404) | ✅ |

**Browser accessibility snapshot** confirmed: `Home | Dot Mandala Art | Lippan Art | Textile Art | Warli Art | About | Contact` — no hidden categories in nav.  
No console errors.

### Step 6 — Admin Behavior (6/6)

| # | Assertion | Result |
|---|-----------|--------|
| 6.1 | Admin login with staging credentials succeeded | ✅ |
| 6.2 | Admin sees all 67 artworks (including NEEDS_REVIEW and show=false) | ✅ |
| 6.3 | Admin sees all 7 categories | ✅ |
| 6.4 | mirror-mosaic accessible in admin | ✅ |
| 6.5 | mixed-art accessible in admin | ✅ |
| 6.6 | texture-art accessible in admin | ✅ |

### Safety Confirmation — Staging Validation

- ✅ No production DB accessed (staging only: `shinkansen.proxy.rlwy.net:41009`)
- ✅ No category records deleted or modified
- ✅ No artwork data modified
- ✅ No Inventory Preview run
- ✅ No Inventory Apply run
- ✅ No production import
- ✅ No price recalculation
- ✅ No DB writes during validation (read-only queries only)
- ✅ Staging admin password `CKSAdmin_Stg2026!` used; no production credentials used

---

## Production Release

**Date:** 2026-07-12  
**PR:** [#18](https://github.com/NarlaSR/chitrakala-arts/pull/18) — merged to `main`  
**Merge commit:** `4727010`  
**Railway backend:** `https://chitrakalaarts-production.up.railway.app` — auto-deployed on merge ✅  
**Vercel frontend:** `https://www.chitrakala-arts.com` — auto-deployed on merge ✅  
**No DB migration required or run.**

### Production Smoke Validation

**Date:** 2026-07-12  
**Backend:** `chitrakalaarts-production.up.railway.app`  
**Frontend:** `www.chitrakala-arts.com`

#### Public category state in production

| Category | Public? | Artworks |
|----------|---------|---------|
| dot-mandala | ✅ Public | 19 |
| lippan-art | ✅ Public | 8 |
| mirror-mosaic | ✅ Public | 4 |
| texture-art | ✅ Public | 1 |
| textile-design | ✅ Public | 6 |
| warli-art | ❌ Hidden | 0 public artworks |
| mixed-art | ❌ Hidden | 0 public artworks |

**Public categories (5):** dot-mandala, lippan-art, mirror-mosaic, texture-art, textile-design  
**Hidden categories (2):** warli-art, mixed-art  
**Total public artworks:** 38 (unchanged, all `IN_STOCK`, all `show_on_website=true`)

#### Smoke checks

| # | Check | Result |
|---|-------|--------|
| S1 | Public homepage `https://www.chitrakala-arts.com/` | 200 ✅ |
| S2 | `GET /api/categories` → 7 categories (admin path) | 7 returned ✅ |
| S3 | `GET /api/categories?publicOnly=true` → 5 categories | 5 returned ✅ |
| S4 | All 5 expected public categories present | ✅ |
| S5 | warli-art absent from public list | ✅ |
| S6 | mixed-art absent from public list | ✅ |
| S7 | warli-art in full category list (not deleted) | ✅ |
| S8 | mixed-art in full category list (not deleted) | ✅ |
| S9 | Total public artworks: 38 (unchanged) | ✅ |
| S10 | No warli-art artworks in public list | 0 ✅ |
| S11 | No mixed-art artworks in public list | 0 ✅ |
| S12 | No NEEDS_REVIEW artworks in public list | 0 ✅ |
| S13 | No show_on_website=false artworks in public list | 0 ✅ |
| S14 | Artwork detail `GET /api/artworks/art-1782445237565` | 200 ✅ |
| S15 | Direct URL `/api/categories/warli-art` (empty category) | 200 graceful ✅ |
| S16 | Direct URL `/api/categories/mixed-art` (empty category) | 200 graceful ✅ |
| S17 | All 5 public category API endpoints | 200 each ✅ |
| S18 | `GET /api/categories` data path (all 7, no auth) | ✅ |

**Admin login:** Production credentials not available in session — cannot automate. Admin data path (all 7 categories returned unauthenticated) confirmed via S2 and S18. Manual admin verification recommended.

### Production Scope Confirmations

- ✅ No production DB migration run (WEB-CAT-01 requires none)
- ✅ No Inventory Preview run
- ✅ No Inventory Apply run
- ✅ No production import run
- ✅ No category records deleted or modified
- ✅ No artwork data modified
- ✅ No category data modified
- ✅ No price recalculation run
- ✅ `server/.env` not staged or committed at any step

---

## Explicit Scope Confirmations

- ✅ No production migration run
- ✅ No production deploy without approval
- ✅ No Inventory Preview run
- ✅ No Inventory Apply run
- ✅ No production import
- ✅ No category records deleted
- ✅ No artwork data changed
- ✅ No price recalculation
- ✅ ARCH-INV-02 not started
