-- ISYNC-11 Step S8 — Post-Apply verification
-- Read-only. No writes.

\echo '=== post-apply: total artworks count ==='
SELECT COUNT(*) FROM artworks;

\echo '=== post-apply: cks-2026-% count ==='
SELECT COUNT(*)
FROM artworks
WHERE id LIKE 'cks-2026-%';

\echo '=== post-apply: status breakdown of cks-2026-% rows ==='
SELECT status, COUNT(*)
FROM artworks
WHERE id LIKE 'cks-2026-%'
GROUP BY status
ORDER BY status;

\echo '=== post-apply: cks-2026-% rows with image_data ==='
SELECT COUNT(*)
FROM artworks
WHERE id LIKE 'cks-2026-%'
  AND image_data IS NOT NULL;

\echo '=== post-apply: bad cks-cks-% rows ==='
SELECT COUNT(*)
FROM artworks
WHERE id LIKE 'cks-cks-%';
