-- Migration: ARCH-INV-03 — Shipment and Physical Inventory Schema Foundation
-- Ticket: ARCH-INV-03
-- Date: 2026-07-30
--
-- Adds four new tables and one new nullable FK column to support physical
-- inventory tracking for artworks shipped from India to the US.
--
-- Tables added:
--   shipments            — batch shipment records (India → USA)
--   shipment_items       — expected line items per shipment manifest
--   physical_inventory   — one row per physical piece (individual unit tracking, D3)
--   inventory_movements  — append-only audit log of physical inventory state changes
--
-- Column added:
--   order_request_items.physical_inventory_id  — nullable FK → physical_inventory(id)
--
-- IDEMPOTENCY: every statement uses IF NOT EXISTS, so re-running against a
-- database that already has these objects is a safe no-op.
--
-- ADDITIVE ONLY: no existing tables, columns, data, or constraints are removed
-- or altered. Existing artworks, artwork_sizes, order_requests, and
-- order_request_items records are untouched. No backfill occurs.
--
-- D1: inventory_movements included in this Phase 1 migration (not deferred).
-- D2: physical_inventory_id added to order_request_items in this Phase 1 migration.
-- D3: physical_inventory tracks individual units — no quantity column.
--
-- Source-of-truth for schema decisions:
--   shipments status values          → ARCH-INV-02F Section 6.1 (final)
--   physical_inventory status values → ARCH-INV-02F Section 6.2 (final)
--   inventory_movements types        → ARCH-INV-02D Section 13 (authoritative)
--   physical_inventory structure     → ARCH-INV-02B Section 7, minus quantity (D3)
--
-- Rollback (reverse order):
--   DROP TABLE IF EXISTS inventory_movements;
--   DROP TABLE IF EXISTS physical_inventory;
--   DROP TABLE IF EXISTS shipment_items;
--   DROP TABLE IF EXISTS shipments;
--   ALTER TABLE order_request_items DROP COLUMN IF EXISTS physical_inventory_id;

-- ============================================================
-- 1. shipments
-- Tracks batches of artworks traveling from a source location
-- to a destination. Status lifecycle (ARCH-INV-02F Section 6.1):
--   DRAFT → READY_TO_SHIP → SHIPPED → IN_TRANSIT → CUSTOMS → DELIVERED → CLOSED
--   At any point before DELIVERED: → CANCELLED
-- ============================================================

CREATE TABLE IF NOT EXISTS shipments (
  id                   SERIAL PRIMARY KEY,
  reference_number     VARCHAR(100) UNIQUE,         -- e.g., "SHIP-2026-001"
  source_location      VARCHAR(255),                -- e.g., "India - Sonu's Studio, Ahmedabad"
  destination_location VARCHAR(255),                -- e.g., "USA"
  carrier              VARCHAR(100),                -- e.g., "India Post", "FedEx International"
  tracking_number      VARCHAR(255),
  status               VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN (
      'DRAFT',          -- being assembled; artworks being added
      'READY_TO_SHIP',  -- packed and ready for carrier handoff
      'SHIPPED',        -- handed to carrier; physical_inventory items → IN_TRANSIT
      'IN_TRANSIT',     -- in transit to destination
      'CUSTOMS',        -- held at customs
      'DELIVERED',      -- arrived at destination; physical_inventory items → RECEIVED
      'CLOSED',         -- all receiving/inspection complete
      'CANCELLED'       -- shipment cancelled before delivery
    )),
  expected_ship_date   DATE,
  shipped_date         DATE,
  delivered_date       DATE,
  notes                TEXT,
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shipments_status
  ON shipments(status);

-- reference_number UNIQUE already creates an index; no separate one needed.

-- ============================================================
-- 2. shipment_items
-- Line items within a shipment manifest: what was expected to
-- be included when the shipment was assembled. quantity here is
-- the manifest count, not per-piece tracking (per-piece tracking
-- is in physical_inventory per D3).
-- ON DELETE CASCADE: if a shipment is deleted, its manifest items
-- have no meaning — delete them too.
-- ON DELETE RESTRICT on artwork_id: do not allow an artwork to be
-- deleted while it appears on a shipment manifest.
-- ============================================================

CREATE TABLE IF NOT EXISTS shipment_items (
  id              SERIAL PRIMARY KEY,
  shipment_id     INTEGER NOT NULL
    REFERENCES shipments(id) ON DELETE CASCADE,
  artwork_id      VARCHAR(50) NOT NULL
    REFERENCES artworks(id) ON DELETE RESTRICT,
  artwork_size_id INTEGER
    REFERENCES artwork_sizes(id) ON DELETE SET NULL,
  quantity        INTEGER NOT NULL DEFAULT 1
    CHECK (quantity > 0),
  notes           TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shipment_items_shipment_id
  ON shipment_items(shipment_id);

CREATE INDEX IF NOT EXISTS idx_shipment_items_artwork_id
  ON shipment_items(artwork_id);

-- ============================================================
-- 3. physical_inventory
-- One row per physical piece (individual unit tracking, D3).
-- No quantity column — each unit is its own row.
--
-- Status lifecycle (ARCH-INV-02F Section 6.2):
--   PENDING_SHIPMENT → IN_TRANSIT → RECEIVED → INSPECTION_REQUIRED
--   → INSPECTED → AVAILABLE → RESERVED → SOLD
--   Also: DAMAGED (at any post-receipt stage), ARCHIVED (retired)
--
-- AVAILABLE means the piece is physically ready for sale internally.
-- AVAILABLE does NOT mean the artwork is public (see two-gate rule:
-- artworks.status IN_STOCK + show_on_website=true is still required).
-- Neither gate automatically sets the other (A3, A4, A5, A6 in 02F).
--
-- ON DELETE RESTRICT on artwork_id: a physical piece is a real-world
-- artifact — deleting the catalog record while pieces are tracked
-- must be an explicit cleanup, not a silent cascade.
-- ============================================================

CREATE TABLE IF NOT EXISTS physical_inventory (
  id               SERIAL PRIMARY KEY,
  artwork_id       VARCHAR(50) NOT NULL
    REFERENCES artworks(id) ON DELETE RESTRICT,
  artwork_size_id  INTEGER
    REFERENCES artwork_sizes(id) ON DELETE SET NULL,
  status           VARCHAR(30) NOT NULL DEFAULT 'PENDING_SHIPMENT'
    CHECK (status IN (
      'PENDING_SHIPMENT',    -- catalog record exists; piece not yet shipped
      'IN_TRANSIT',          -- dispatched; not yet received at destination
      'RECEIVED',            -- physically arrived; not yet inspected
      'INSPECTION_REQUIRED', -- admin flagged for inspection
      'INSPECTED',           -- inspected; not yet marked available
      'AVAILABLE',           -- ready internally (does not auto-publish artwork)
      'RESERVED',            -- linked to a confirmed order request (Phase 6)
      'SOLD',                -- fulfilled; delivered to customer (Phase 7)
      'DAMAGED',             -- damaged in transit or post-receipt
      'ARCHIVED'             -- retired from active tracking
    )),
  source           VARCHAR(255),    -- e.g., "India - Artist Studio"
  shipment_id      INTEGER
    REFERENCES shipments(id) ON DELETE SET NULL,
  received_date    TIMESTAMP,       -- when physically received at destination
  inspected_date   TIMESTAMP,       -- when owner-inspected
  condition_notes  TEXT,            -- inspector notes on condition
  notes            TEXT,            -- other admin notes
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_physical_inventory_artwork_id
  ON physical_inventory(artwork_id);

CREATE INDEX IF NOT EXISTS idx_physical_inventory_status
  ON physical_inventory(status);

CREATE INDEX IF NOT EXISTS idx_physical_inventory_shipment_id
  ON physical_inventory(shipment_id);

-- ============================================================
-- 4. inventory_movements
-- Append-only audit log of physical inventory state changes.
-- Rows are never updated or deleted; corrections use ADJUSTED.
--
-- Movement types (ARCH-INV-02D Section 13 — authoritative):
--   CREATED, SHIPPED, RECEIVED, INSPECTED, PUBLISHED,
--   REQUEST_CREATED, RESERVED, RESERVATION_RELEASED, SOLD,
--   RETURNED, ADJUSTED, DAMAGED, ARCHIVED
--
-- physical_inventory_id is nullable: REQUEST_CREATED rows are
-- written before any physical unit is reserved (physical_inventory_id
-- = null links the audit to the artwork only, for audit purposes).
-- ============================================================

CREATE TABLE IF NOT EXISTS inventory_movements (
  id                    SERIAL PRIMARY KEY,
  physical_inventory_id INTEGER
    REFERENCES physical_inventory(id) ON DELETE SET NULL,
  artwork_id            VARCHAR(50) NOT NULL, -- denormalized for query convenience
  movement_type         VARCHAR(30) NOT NULL
    CHECK (movement_type IN (
      'CREATED',               -- physical_inventory row first created
      'SHIPPED',               -- shipment dispatched from source
      'RECEIVED',              -- physically arrived at destination
      'INSPECTED',             -- owner-inspected and confirmed
      'PUBLISHED',             -- artwork set to IN_STOCK + show_on_website=true
      'REQUEST_CREATED',       -- order request submitted (informational; no unit reserved)
      'RESERVED',              -- unit allocated to a confirmed order (Phase 6)
      'RESERVATION_RELEASED',  -- reservation cancelled; unit returns to AVAILABLE
      'SOLD',                  -- unit fulfilled and delivered to customer (Phase 7)
      'RETURNED',              -- unit returned after sale
      'ADJUSTED',              -- manual correction with explanatory notes
      'DAMAGED',               -- damage recorded
      'ARCHIVED'               -- unit retired from active tracking
    )),
  quantity_change       INTEGER NOT NULL DEFAULT 0, -- +N added, -N consumed/allocated
  reference_type        VARCHAR(50),   -- 'shipment', 'order_request', 'manual'
  reference_id          VARCHAR(100),  -- ID of the referenced record
  notes                 TEXT,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by            VARCHAR(100)   -- admin username who recorded this event
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_physical_inventory_id
  ON inventory_movements(physical_inventory_id);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_artwork_id
  ON inventory_movements(artwork_id);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_movement_type
  ON inventory_movements(movement_type);

-- ============================================================
-- 5. order_request_items.physical_inventory_id (D2)
-- Nullable FK linking a confirmed order item to the specific
-- physical unit that was reserved or fulfilled for that order.
-- Set by an explicit admin action at CONFIRMED status (Phase 6).
-- ON DELETE SET NULL: if the physical_inventory row is archived
-- or removed, the order history is preserved with FK cleared.
-- ============================================================

ALTER TABLE order_request_items
  ADD COLUMN IF NOT EXISTS physical_inventory_id INTEGER
    REFERENCES physical_inventory(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_order_request_items_physical_inventory_id
  ON order_request_items(physical_inventory_id);
