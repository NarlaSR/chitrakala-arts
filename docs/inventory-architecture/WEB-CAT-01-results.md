# WEB-CAT-01 — Hide Empty Categories from Public Navigation/Gallery

**Ticket:** WEB-CAT-01 — Hide Empty Categories from Public Navigation/Gallery  
**Branch:** `feature/WEB-CAT-01-hide-empty-categories`  
**Date:** 2026-07-12  
**Status:** ✅ Complete — implemented and validated locally, PR ready

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

## Explicit Scope Confirmations

- ✅ No production migration run
- ✅ No production deploy
- ✅ No Inventory Preview run
- ✅ No Inventory Apply run
- ✅ No production import
- ✅ No category records deleted
- ✅ No artwork data changed
- ✅ No price recalculation
- ✅ ARCH-INV-02 not started
