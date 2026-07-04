-- ISYNC-13 Phase 1 — Production read-only inspection
-- READ ONLY: no INSERT, UPDATE, DELETE, ALTER, CREATE
-- Run via: psql "$PROD_DB_URL" -f verify_prod_phase1_readonly.sql

\echo '=== 1. Baseline row counts ==='
SELECT 'artworks'      AS "table", COUNT(*) AS count FROM artworks
UNION ALL
SELECT 'artwork_sizes', COUNT(*) FROM artwork_sizes
UNION ALL
SELECT 'categories',   COUNT(*) FROM categories;

\echo ''
\echo '=== 2. Current categories ==='
SELECT id, name, display_order
FROM categories
ORDER BY display_order;

\echo ''
\echo '=== 3. Pricing settings ==='
SELECT key, value
FROM pricing_settings
ORDER BY key;

\echo ''
\echo '=== 4. Inventory columns on artworks (via information_schema) ==='
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'artworks'
  AND column_name IN ('sku', 'status', 'quantity', 'image_filename', 'notes')
ORDER BY column_name;

\echo ''
\echo '=== 5. Inventory indexes on artworks ==='
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'artworks'
  AND indexname IN ('idx_artworks_sku_unique', 'idx_artworks_status');

\echo ''
\echo '=== 6a. Status column check — only if status column exists ==='
SELECT CASE
  WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'artworks' AND column_name = 'status'
  )
  THEN 'status column EXISTS'
  ELSE 'status column DOES NOT EXIST (expected before migration)'
END AS status_column_present;

\echo ''
\echo '=== 6b. Bad SKU pattern check — only if sku column exists ==='
SELECT CASE
  WHEN NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'artworks' AND column_name = 'sku'
  )
  THEN 'sku column does not exist yet — skip bad-SKU check'
  ELSE (
    SELECT CASE
      WHEN COUNT(*) = 0 THEN 'No bad SKU patterns found'
      ELSE COUNT(*)::text || ' rows with bad SKU pattern (cks-cks- or similar)'
    END
    FROM artworks
    WHERE sku IS NOT NULL
      AND (
        LOWER(sku) LIKE 'cks-cks-%'
        OR sku NOT LIKE 'CKS-%'
      )
  )
END AS bad_sku_check;

\echo ''
\echo '=== 7. All columns on artworks (for full picture) ==='
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'artworks'
ORDER BY ordinal_position;
