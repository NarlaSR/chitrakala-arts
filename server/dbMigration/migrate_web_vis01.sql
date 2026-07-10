-- Migration: WEB-VIS-01 — Website Artwork Visibility and Availability Controls
-- Ticket: WEB-VIS-01
-- Date: 2026-07-08
--
-- IDEMPOTENCY: The backfill UPDATE runs ONLY when the column is being newly added.
-- Subsequent re-runs of this migration are a no-op — the DO block exits after
-- detecting the column already exists, so admin-set show_on_website=false values
-- are never overwritten.
--
-- artwork_sizes.price is NOT NULL (DB constraint), so "Price on request" is bounded
-- to artworks without sizes. The artworks.price column is nullable — no change needed.

DO $$
BEGIN
  -- Only proceed if the column does not already exist
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'artworks'
      AND column_name = 'show_on_website'
  ) THEN

    -- Add column — defaults to false so new imports are hidden until admin approves
    ALTER TABLE artworks
      ADD COLUMN show_on_website BOOLEAN NOT NULL DEFAULT false;

    -- Backfill: existing IN_STOCK artworks were already visible before this migration,
    -- so grant them the new flag on first run only.
    UPDATE artworks
    SET show_on_website = true
    WHERE status = 'IN_STOCK';

  END IF;
END $$;
