-- ISYNC-11 Step S2.5 — Staging-only baseline correction
-- Approved writes: usd_multiplier fix, missing categories (canonical values), textile-design reorder.
-- Staging only. Not a production script. Not part of the inventory sync migration.

BEGIN;

-- 1. Correct USD multiplier
UPDATE pricing_settings
SET value = '2.25', updated_at = CURRENT_TIMESTAMP
WHERE key = 'usd_multiplier';

-- 2. Add missing categories using canonical values (matches local/production)
INSERT INTO categories (id, name, description, display_order, image)
VALUES
  ('mirror-mosaic', 'Mirror Mosaic', 'Carefully arranged mirrored elements that catch and scatter light, adding depth, texture, and a subtle shimmer to any space. ', 3, '/assets/images/categories/mirror-mosaic.png'),
  ('texture-art', 'Texture Art', 'Handcrafted pieces where dimension meets design, with layered details, soft depth, and tactile finishes that bring walls to life.', 4, '/assets/images/categories/texture-art.png')
ON CONFLICT (id) DO NOTHING;

-- 3. Align textile category ordering with canonical production-like order
UPDATE categories
SET display_order = 5
WHERE id = 'textile-design';

COMMIT;

\echo '=== Verification: pricing_settings ==='
SELECT key, value
FROM pricing_settings
WHERE key IN ('fx_rate', 'usd_multiplier')
ORDER BY key;

\echo '=== Verification: categories ==='
SELECT id, name, description, display_order, image
FROM categories
ORDER BY display_order;

\echo '=== Verification: categories count ==='
SELECT COUNT(*)
FROM categories;
