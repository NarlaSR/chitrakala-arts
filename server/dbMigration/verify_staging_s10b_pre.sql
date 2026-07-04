-- ISYNC-11 Step S10B — Pre-Apply verification (no-ZIP reupload)
-- Read-only. No writes.

\echo '=== pre-apply: total artworks count ==='
SELECT COUNT(*) FROM artworks;

\echo '=== pre-apply: status breakdown of cks-2026-% rows ==='
SELECT status, COUNT(*)
FROM artworks
WHERE id LIKE 'cks-2026-%'
GROUP BY status
ORDER BY status;

\echo '=== pre-apply: published row (cks-2026-la-lg-00001) ==='
SELECT id, status, image_data IS NOT NULL AS has_image
FROM artworks
WHERE id = 'cks-2026-la-lg-00001';

\echo '=== pre-apply: cks-2026-% rows with image_data ==='
SELECT COUNT(*)
FROM artworks
WHERE id LIKE 'cks-2026-%'
  AND image_data IS NOT NULL;
