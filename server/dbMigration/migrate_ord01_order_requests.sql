-- Migration: ORD-01 — Public Artwork Inquiry / Order Request Foundation
-- Ticket: ORD-01
-- Date: 2026-07-16
--
-- Adds storage for customer order/inquiry requests and their line items.
-- This is a foundation for admin review only — no checkout, payment,
-- shipping, tax, or fulfillment flow is introduced by this migration.
--
-- IDEMPOTENCY: every statement uses IF NOT EXISTS, so re-running this file
-- against a database that already has these tables is a safe no-op.
--
-- This migration does NOT alter the artworks, artwork_sizes, or categories
-- tables in any way — it only adds two new, independent tables.

CREATE TABLE IF NOT EXISTS order_requests (
  id SERIAL PRIMARY KEY,
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(254) NOT NULL,
  customer_phone VARCHAR(50),
  customer_message TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'NEW'
    CHECK (status IN ('NEW', 'REVIEWING', 'QUOTE_SENT', 'CONFIRMED', 'CANCELLED', 'FULFILLED')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_requests_status ON order_requests(status);
CREATE INDEX IF NOT EXISTS idx_order_requests_created_at ON order_requests(created_at);

-- Line items. artwork_id / artwork_size_id are kept as live references for admin
-- convenience (e.g. linking back to the current artwork), but every field an
-- admin needs to review the request is duplicated into snapshot_* columns at
-- request time so the request record stays meaningful even if the artwork is
-- later edited, unpublished, or deleted.
--
-- ON DELETE SET NULL (not CASCADE) on both artwork references: deleting an
-- artwork must never delete order request history — only detach the live
-- reference, leaving the snapshot intact.
CREATE TABLE IF NOT EXISTS order_request_items (
  id SERIAL PRIMARY KEY,
  order_request_id INTEGER NOT NULL REFERENCES order_requests(id) ON DELETE CASCADE,
  artwork_id VARCHAR(50) REFERENCES artworks(id) ON DELETE SET NULL,
  artwork_size_id INTEGER REFERENCES artwork_sizes(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),

  -- Request-time snapshot fields (immutable after creation)
  snapshot_sku VARCHAR(100),
  snapshot_title VARCHAR(255) NOT NULL,
  snapshot_category VARCHAR(50),
  snapshot_size_label VARCHAR(100),
  snapshot_price_inr NUMERIC(10,2),
  snapshot_price_usd NUMERIC(10,2),
  snapshot_image VARCHAR(255),
  snapshot_availability VARCHAR(30),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_request_items_order_request_id ON order_request_items(order_request_id);
CREATE INDEX IF NOT EXISTS idx_order_request_items_artwork_id ON order_request_items(artwork_id);
