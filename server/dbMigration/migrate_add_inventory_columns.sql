-- Migration: Add inventory sync columns to artworks table
-- Ticket: INV-02
-- Date: 2026-06-25
-- Safe to run on existing data: columns are additive and indexes are IF NOT EXISTS.

ALTER TABLE artworks ADD COLUMN IF NOT EXISTS sku VARCHAR(100);
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'IN_STOCK';

-- Partial unique index: allows multiple NULL SKUs for existing rows while enforcing uniqueness
-- only for rows that have a SKU.
CREATE UNIQUE INDEX IF NOT EXISTS idx_artworks_sku_unique
  ON artworks(sku)
  WHERE sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_artworks_status
  ON artworks(status);
