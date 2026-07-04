-- ISYNC-11 Step S8 — Pre-Apply verification
-- Read-only. No writes.

\echo '=== pre-apply: total artworks count (expect 35) ==='
SELECT COUNT(*) FROM artworks;

\echo '=== pre-apply: cks-2026-% count (expect 0) ==='
SELECT COUNT(*)
FROM artworks
WHERE id LIKE 'cks-2026-%';
