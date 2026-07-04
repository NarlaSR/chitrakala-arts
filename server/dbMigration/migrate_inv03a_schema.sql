-- Migration: INV-03A schema prep for inventory import
-- Ticket: INV-03A
-- Date: 2026-06-25
-- Safe to re-run: all statements use IF NOT EXISTS / ON CONFLICT DO NOTHING.

-- Normalize any NULL statuses to IN_STOCK so the public filter can use a strict equality check.
-- (All existing rows already have IN_STOCK from the production backup; this is idempotent.)
UPDATE artworks
SET status = 'IN_STOCK'
WHERE status IS NULL;

-- Store the image filename hint from inventory sheet for future image matching.
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS image_filename VARCHAR(255);

-- Store internal/admin notes from inventory sheet.
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add Warli Art category (Art Work code: WA)
INSERT INTO categories (id, name, description, display_order)
VALUES ('warli-art', 'Warli Art', 'Traditional tribal art from Maharashtra using simple geometric forms and folk-art patterns.', 6)
ON CONFLICT (id) DO NOTHING;

-- Add Mixed Art category (Art Work code: MA — replaces MW going forward)
INSERT INTO categories (id, name, description, display_order)
VALUES ('mixed-art', 'Mixed Art', 'Artworks combining multiple techniques, materials, or styles.', 7)
ON CONFLICT (id) DO NOTHING;
