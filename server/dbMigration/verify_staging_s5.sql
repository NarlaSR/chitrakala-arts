-- ISYNC-11 Step S5 — Staging migration verification
-- Read-only. No writes. Safe to run against staging.

\echo '=== 1. inventory columns on artworks ==='
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'artworks'
  AND column_name IN ('sku','quantity','status','image_filename','notes')
ORDER BY column_name;

\echo '=== 2. indexes on artworks ==='
SELECT indexname
FROM pg_indexes
WHERE tablename = 'artworks'
  AND indexname IN ('idx_artworks_sku_unique','idx_artworks_status')
ORDER BY indexname;

\echo '=== 3. warli-art / mixed-art categories ==='
SELECT id, name, display_order
FROM categories
WHERE id IN ('warli-art','mixed-art')
ORDER BY display_order;

\echo '=== 4. null status count (expect 0) ==='
SELECT COUNT(*)
FROM artworks
WHERE status IS NULL;

\echo '=== 5. cks-2026-% count (expect 0) ==='
SELECT COUNT(*)
FROM artworks
WHERE id LIKE 'cks-2026-%';

\echo '=== 6. cks-cks-% count (expect 0) ==='
SELECT COUNT(*)
FROM artworks
WHERE id LIKE 'cks-cks-%';
