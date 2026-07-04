-- ISYNC-11 Step S2 — Staging DB identity, baseline, schema, existing import rows, pricing verification
-- Read-only. No writes. Safe to run against staging.

\echo '=== 1. artworks count ==='
SELECT COUNT(*) FROM artworks;

\echo '=== 2. artwork_sizes count ==='
SELECT COUNT(*) FROM artwork_sizes;

\echo '=== 3. categories count ==='
SELECT COUNT(*) FROM categories;

\echo '=== 4. category list ==='
SELECT id, name
FROM categories
ORDER BY display_order;

\echo '=== 5. inventory sync columns present on artworks ==='
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'artworks'
  AND column_name IN ('sku','quantity','status','image_filename','notes')
ORDER BY column_name;

\echo '=== 6. existing cks-2026-% rows ==='
SELECT COUNT(*)
FROM artworks
WHERE id LIKE 'cks-2026-%';

\echo '=== 7. bad cks-cks-% rows ==='
SELECT COUNT(*)
FROM artworks
WHERE id LIKE 'cks-cks-%';

\echo '=== 8. pricing_settings ==='
SELECT key, value
FROM pricing_settings
ORDER BY key;

\echo '=== 9. public visibility baseline (only valid if status column exists) ==='
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'artworks' AND column_name = 'status'
    )
    THEN (SELECT COUNT(*)::text FROM artworks WHERE status = 'IN_STOCK' OR status IS NULL)
    ELSE 'SKIPPED: status column does not exist yet'
  END AS visibility_baseline;
