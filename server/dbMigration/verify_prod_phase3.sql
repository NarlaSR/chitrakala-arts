-- ISYNC-13 Phase 3 post-correction verification
-- Read-only. No writes.

\echo '=== pricing_settings after correction ==='
SELECT key, value, updated_at
FROM pricing_settings
ORDER BY key;

\echo ''
\echo '=== baseline row counts (must be unchanged: 38 / 91 / 5) ==='
SELECT 'artworks'      AS "table", COUNT(*) FROM artworks
UNION ALL
SELECT 'artwork_sizes', COUNT(*) FROM artwork_sizes
UNION ALL
SELECT 'categories',   COUNT(*) FROM categories;

\echo ''
\echo '=== artwork price sample (confirm no recalculation occurred) ==='
SELECT id, price, price_inr, price_usd, fx_rate_used, multiplier_used
FROM artworks
ORDER BY id
LIMIT 5;
