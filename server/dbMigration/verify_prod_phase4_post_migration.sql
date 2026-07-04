-- ISYNC-13 Phase 4 — Post-migration verification
-- Read-only. No writes.

\echo '=== 1. Row counts (expected: artworks=38, artwork_sizes=91, categories=7) ==='
SELECT 'artworks'      AS "table", COUNT(*) FROM artworks
UNION ALL
SELECT 'artwork_sizes', COUNT(*) FROM artwork_sizes
UNION ALL
SELECT 'categories',   COUNT(*) FROM categories;

\echo ''
\echo '=== 2. New columns on artworks ==='
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'artworks'
  AND column_name IN ('sku', 'status', 'quantity', 'image_filename', 'notes')
ORDER BY column_name;

\echo ''
\echo '=== 3. Required indexes ==='
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'artworks'
  AND indexname IN ('idx_artworks_sku_unique', 'idx_artworks_status');

\echo ''
\echo '=== 4a. NULL status check (must be 0) ==='
SELECT COUNT(*) AS null_status_count FROM artworks WHERE status IS NULL;

\echo ''
\echo '=== 4b. Status distribution (all 38 should be IN_STOCK) ==='
SELECT status, COUNT(*) FROM artworks GROUP BY status ORDER BY status;

\echo ''
\echo '=== 5. Categories after migration (expected 7) ==='
SELECT id, name, display_order FROM categories ORDER BY display_order;

\echo ''
\echo '=== 6. Pricing settings ==='
SELECT key, value FROM pricing_settings ORDER BY key;

\echo ''
\echo '=== 7. Bad SKU check (all should be NULL, none should be cks-cks-) ==='
SELECT COUNT(*) AS total_with_sku     FROM artworks WHERE sku IS NOT NULL;
SELECT COUNT(*) AS bad_sku_cks_cks    FROM artworks WHERE sku LIKE 'cks-cks-%' OR sku LIKE 'CKS-CKS-%';

\echo ''
\echo '=== 8. Full artworks column list (confirm all expected columns present) ==='
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'artworks'
ORDER BY ordinal_position;
