-- ISYNC-11 Step S9 — Post-publish verification
-- Read-only. No writes.

\echo '=== status breakdown of cks-2026-% rows ==='
SELECT status, COUNT(*)
FROM artworks
WHERE id LIKE 'cks-2026-%'
GROUP BY status
ORDER BY status;

\echo '=== published cks-2026-% rows (IN_STOCK) ==='
SELECT id, title, status, image_data IS NOT NULL AS has_image
FROM artworks
WHERE id LIKE 'cks-2026-%'
  AND status = 'IN_STOCK';
