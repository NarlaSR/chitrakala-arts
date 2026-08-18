'use strict';
// ARCH-INV-09 — Order Fulfillment / SOLD Lifecycle tests.
// Uses Node 22 built-in test runner (node:test + node:assert).
// Run with: node --test server/tests/arch_inv09_fulfillment.test.js
//
// Tests run against the local dev database (DATABASE_URL from server/.env).
// NEVER run against staging or production.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('../dbQueries');

// ── helpers ──────────────────────────────────────────────────────────────────

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function query(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
}

async function createTestArtwork(suffix) {
  const id = `TEST-ARCH-INV09-${suffix}-${Date.now()}`;
  await query(
    `INSERT INTO artworks (id, title, category, status, created_at, updated_at)
     VALUES ($1, $2, 'test', 'IN_STOCK', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO NOTHING`,
    [id, `Test Artwork ${suffix}`]
  );
  return id;
}

async function createTestSize(artworkId, label) {
  const rows = await query(
    `INSERT INTO artwork_sizes (artwork_id, size_label, price, created_at)
     VALUES ($1, $2, 0, CURRENT_TIMESTAMP) RETURNING id`,
    [artworkId, label]
  );
  return rows[0].id;
}

async function createTestOrderRequest(status = 'CONFIRMED') {
  const rows = await query(
    `INSERT INTO order_requests
       (customer_name, customer_email, status, created_at, updated_at)
     VALUES ('Test Customer', 'test09@test.invalid', $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     RETURNING *`,
    [status]
  );
  return rows[0];
}

// Insert an item with explicit snapshot_availability.
async function createTestItemWithAvailability(orderId, artworkId, sizeId, availability) {
  const rows = await query(
    `INSERT INTO order_request_items
       (order_request_id, artwork_id, artwork_size_id, quantity, snapshot_title,
        snapshot_availability, created_at)
     VALUES ($1, $2, $3, 1, 'Test Artwork', $4, CURRENT_TIMESTAMP)
     RETURNING *`,
    [orderId, artworkId, sizeId, availability]
  );
  return rows[0];
}

// Insert a PI with a specific status.
async function createTestPIWithStatus(artworkId, sizeId, status) {
  const rows = await query(
    `INSERT INTO physical_inventory
       (artwork_id, artwork_size_id, status, source, created_at, updated_at)
     VALUES ($1, $2, $3, 'test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     RETURNING id`,
    [artworkId, sizeId, status]
  );
  return rows[0].id;
}

async function getPIStatus(piId) {
  const rows = await query('SELECT status FROM physical_inventory WHERE id = $1', [piId]);
  return rows[0];
}

async function getItemRow(itemId) {
  const rows = await query('SELECT * FROM order_request_items WHERE id = $1', [itemId]);
  return rows[0];
}

async function getOrderStatus(orderId) {
  const rows = await query('SELECT status FROM order_requests WHERE id = $1', [orderId]);
  return rows[0]?.status ?? null;
}

async function getMovementsForPI(piId) {
  return query(
    'SELECT * FROM inventory_movements WHERE physical_inventory_id = $1 ORDER BY id ASC',
    [piId]
  );
}

async function cleanupOrderRequest(orderId) {
  await query('DELETE FROM order_requests WHERE id = $1', [orderId]);
}

async function cleanupPI(piId) {
  await query('DELETE FROM inventory_movements WHERE physical_inventory_id = $1', [piId]);
  await query('DELETE FROM physical_inventory WHERE id = $1', [piId]);
}

async function cleanupArtwork(artworkId) {
  await query('DELETE FROM artworks WHERE id = $1', [artworkId]);
}

// Reserve a PI for an item directly via SQL (bypasses reservePhysicalInventoryForOrderItem
// to avoid cross-test dependency; mimics a post-ARCH-INV-08 reservation).
async function directReserve(piId, itemId) {
  await query(
    'UPDATE physical_inventory SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    ['RESERVED', piId]
  );
  await query(
    'UPDATE order_request_items SET physical_inventory_id = $1 WHERE id = $2',
    [piId, itemId]
  );
}

// ── test suite ────────────────────────────────────────────────────────────────

describe('ARCH-INV-09 Order Fulfillment', () => {
  let artworkId;
  let sizedArtworkId;
  let sizeId;

  before(async () => {
    artworkId = await createTestArtwork('NO-SIZE');
    sizedArtworkId = await createTestArtwork('SIZED');
    sizeId = await createTestSize(sizedArtworkId, '12x16 inches');
  });

  after(async () => {
    await cleanupArtwork(artworkId);
    await cleanupArtwork(sizedArtworkId);
    await pool.end();
  });

  // ── Suite A: Core success ─────────────────────────────────────────────────

  describe('Suite A — Core fulfillment success', () => {
    it('A1: single PI-backed item — PI→SOLD, FK retained, movement written, order→FULFILLED', async () => {
      const order = await createTestOrderRequest('CONFIRMED');
      const piId = await createTestPIWithStatus(artworkId, null, 'AVAILABLE');
      const item = await createTestItemWithAvailability(order.id, artworkId, null, 'IN_STOCK');
      await directReserve(piId, item.id);

      const result = await db.fulfillOrderRequest(order.id, 'test-admin');

      assert.equal(result.status, 'FULFILLED');
      assert.equal(await getOrderStatus(order.id), 'FULFILLED');
      assert.equal((await getPIStatus(piId)).status, 'SOLD');

      // FK must be RETAINED (not cleared)
      const itemRow = await getItemRow(item.id);
      assert.equal(itemRow.physical_inventory_id, piId);

      // SOLD movement written
      const movements = await getMovementsForPI(piId);
      const soldMov = movements.find(m => m.movement_type === 'SOLD');
      assert.ok(soldMov, 'SOLD movement must exist');
      assert.equal(soldMov.quantity_change, 0);
      assert.equal(soldMov.reference_type, 'order_request');
      assert.equal(soldMov.reference_id, String(order.id));
      assert.equal(soldMov.created_by, 'test-admin');

      await cleanupPI(piId);
      await cleanupOrderRequest(order.id);
    });

    it('A2: all MADE_TO_ORDER items — no PI interaction, order→FULFILLED', async () => {
      const order = await createTestOrderRequest('CONFIRMED');
      await createTestItemWithAvailability(order.id, artworkId, null, 'MADE_TO_ORDER');
      await createTestItemWithAvailability(order.id, artworkId, null, 'MADE_TO_ORDER');

      const result = await db.fulfillOrderRequest(order.id, 'test-admin');

      assert.equal(result.status, 'FULFILLED');
      assert.equal(await getOrderStatus(order.id), 'FULFILLED');

      await cleanupOrderRequest(order.id);
    });

    it('A3: mixed — one PI-backed, one MADE_TO_ORDER — PI→SOLD, order→FULFILLED', async () => {
      const order = await createTestOrderRequest('CONFIRMED');
      const piId = await createTestPIWithStatus(artworkId, null, 'AVAILABLE');
      const item1 = await createTestItemWithAvailability(order.id, artworkId, null, 'IN_STOCK');
      await createTestItemWithAvailability(order.id, artworkId, null, 'MADE_TO_ORDER');
      await directReserve(piId, item1.id);

      const result = await db.fulfillOrderRequest(order.id, 'test-admin');

      assert.equal(result.status, 'FULFILLED');
      assert.equal((await getPIStatus(piId)).status, 'SOLD');

      await cleanupPI(piId);
      await cleanupOrderRequest(order.id);
    });

    it('A4: multiple PI-backed items — all PI→SOLD, all FKs retained', async () => {
      const order = await createTestOrderRequest('CONFIRMED');
      const pi1 = await createTestPIWithStatus(artworkId, null, 'AVAILABLE');
      const pi2 = await createTestPIWithStatus(artworkId, null, 'AVAILABLE');
      const item1 = await createTestItemWithAvailability(order.id, artworkId, null, 'IN_STOCK');
      const item2 = await createTestItemWithAvailability(order.id, artworkId, null, 'IN_STOCK');
      await directReserve(pi1, item1.id);
      await directReserve(pi2, item2.id);

      await db.fulfillOrderRequest(order.id, 'test-admin');

      assert.equal((await getPIStatus(pi1)).status, 'SOLD');
      assert.equal((await getPIStatus(pi2)).status, 'SOLD');
      assert.equal((await getItemRow(item1.id)).physical_inventory_id, pi1);
      assert.equal((await getItemRow(item2.id)).physical_inventory_id, pi2);

      await cleanupPI(pi1);
      await cleanupPI(pi2);
      await cleanupOrderRequest(order.id);
    });

    it('A5: sized PI-backed item — null-safe size match succeeds', async () => {
      const order = await createTestOrderRequest('CONFIRMED');
      const piId = await createTestPIWithStatus(sizedArtworkId, sizeId, 'AVAILABLE');
      const item = await createTestItemWithAvailability(order.id, sizedArtworkId, sizeId, 'IN_STOCK');
      await directReserve(piId, item.id);

      const result = await db.fulfillOrderRequest(order.id, 'test-admin');

      assert.equal(result.status, 'FULFILLED');
      assert.equal((await getPIStatus(piId)).status, 'SOLD');

      await cleanupPI(piId);
      await cleanupOrderRequest(order.id);
    });
  });

  // ── Suite B: Blocking and rollback ───────────────────────────────────────

  describe('Suite B — Fulfillment blocking and rollback', () => {
    it('B1: IN_STOCK item with no PI → IN_STOCK_ITEM_NOT_RESERVED, order stays CONFIRMED', async () => {
      const order = await createTestOrderRequest('CONFIRMED');
      await createTestItemWithAvailability(order.id, artworkId, null, 'IN_STOCK');

      await assert.rejects(
        () => db.fulfillOrderRequest(order.id, 'test-admin'),
        (err) => { assert.equal(err.code, 'IN_STOCK_ITEM_NOT_RESERVED'); return true; }
      );
      assert.equal(await getOrderStatus(order.id), 'CONFIRMED');

      await cleanupOrderRequest(order.id);
    });

    it('B2: null snapshot_availability with no PI → FULFILLMENT_ITEM_TYPE_UNRESOLVED', async () => {
      const order = await createTestOrderRequest('CONFIRMED');
      // Insert item with NULL snapshot_availability (default when createTestItem is used without explicit value)
      await query(
        `INSERT INTO order_request_items
           (order_request_id, artwork_id, artwork_size_id, quantity, snapshot_title, created_at)
         VALUES ($1, $2, NULL, 1, 'Test Artwork', CURRENT_TIMESTAMP)`,
        [order.id, artworkId]
      );

      await assert.rejects(
        () => db.fulfillOrderRequest(order.id, 'test-admin'),
        (err) => { assert.equal(err.code, 'FULFILLMENT_ITEM_TYPE_UNRESOLVED'); return true; }
      );
      assert.equal(await getOrderStatus(order.id), 'CONFIRMED');

      await cleanupOrderRequest(order.id);
    });

    it('B3: unrecognized snapshot_availability with no PI → FULFILLMENT_ITEM_TYPE_UNRESOLVED', async () => {
      const order = await createTestOrderRequest('CONFIRMED');
      await createTestItemWithAvailability(order.id, artworkId, null, 'SPECIAL_ORDER');

      await assert.rejects(
        () => db.fulfillOrderRequest(order.id, 'test-admin'),
        (err) => { assert.equal(err.code, 'FULFILLMENT_ITEM_TYPE_UNRESOLVED'); return true; }
      );
      assert.equal(await getOrderStatus(order.id), 'CONFIRMED');

      await cleanupOrderRequest(order.id);
    });

    it('B4: non-CONFIRMED order → ORDER_NOT_CONFIRMED_FOR_FULFILLMENT', async () => {
      const order = await createTestOrderRequest('REVIEWING');
      await createTestItemWithAvailability(order.id, artworkId, null, 'MADE_TO_ORDER');

      await assert.rejects(
        () => db.fulfillOrderRequest(order.id, 'test-admin'),
        (err) => { assert.equal(err.code, 'ORDER_NOT_CONFIRMED_FOR_FULFILLMENT'); return true; }
      );
      assert.equal(await getOrderStatus(order.id), 'REVIEWING');

      await cleanupOrderRequest(order.id);
    });

    it('B5: PI not in RESERVED status → FULFILLMENT_INTEGRITY_ERROR, full rollback', async () => {
      const order = await createTestOrderRequest('CONFIRMED');
      // PI is AVAILABLE (not RESERVED) but item FK is set directly — simulates integrity violation
      const piId = await createTestPIWithStatus(artworkId, null, 'AVAILABLE');
      const item = await createTestItemWithAvailability(order.id, artworkId, null, 'IN_STOCK');
      // Set FK without setting PI to RESERVED — integrity violation scenario
      await query('UPDATE order_request_items SET physical_inventory_id = $1 WHERE id = $2', [piId, item.id]);

      await assert.rejects(
        () => db.fulfillOrderRequest(order.id, 'test-admin'),
        (err) => { assert.equal(err.code, 'FULFILLMENT_INTEGRITY_ERROR'); return true; }
      );
      // Full rollback: order stays CONFIRMED, PI stays AVAILABLE
      assert.equal(await getOrderStatus(order.id), 'CONFIRMED');
      assert.equal((await getPIStatus(piId)).status, 'AVAILABLE');

      await cleanupPI(piId);
      await cleanupOrderRequest(order.id);
    });

    it('B6: PI artwork mismatch → FULFILLMENT_INTEGRITY_ERROR', async () => {
      const otherArtworkId = await createTestArtwork('MISMATCH');
      const order = await createTestOrderRequest('CONFIRMED');
      // PI belongs to otherArtworkId but item is for artworkId
      const piId = await createTestPIWithStatus(otherArtworkId, null, 'RESERVED');
      const item = await createTestItemWithAvailability(order.id, artworkId, null, 'IN_STOCK');
      await query('UPDATE order_request_items SET physical_inventory_id = $1 WHERE id = $2', [piId, item.id]);

      await assert.rejects(
        () => db.fulfillOrderRequest(order.id, 'test-admin'),
        (err) => { assert.equal(err.code, 'FULFILLMENT_INTEGRITY_ERROR'); return true; }
      );
      assert.equal(await getOrderStatus(order.id), 'CONFIRMED');
      assert.equal((await getPIStatus(piId)).status, 'RESERVED');

      await cleanupPI(piId);
      await cleanupOrderRequest(order.id);
      await cleanupArtwork(otherArtworkId);
    });

    it('B7: PI size mismatch (PI has size, item has null) → FULFILLMENT_INTEGRITY_ERROR', async () => {
      const order = await createTestOrderRequest('CONFIRMED');
      const piId = await createTestPIWithStatus(sizedArtworkId, sizeId, 'RESERVED');
      // Item has null size but PI has sizeId — mismatch
      const item = await createTestItemWithAvailability(order.id, sizedArtworkId, null, 'IN_STOCK');
      await query('UPDATE order_request_items SET physical_inventory_id = $1 WHERE id = $2', [piId, item.id]);

      await assert.rejects(
        () => db.fulfillOrderRequest(order.id, 'test-admin'),
        (err) => { assert.equal(err.code, 'FULFILLMENT_INTEGRITY_ERROR'); return true; }
      );
      assert.equal(await getOrderStatus(order.id), 'CONFIRMED');

      await cleanupPI(piId);
      await cleanupOrderRequest(order.id);
    });

    it('B8: PI size mismatch (PI has null, item has size) → FULFILLMENT_INTEGRITY_ERROR', async () => {
      const order = await createTestOrderRequest('CONFIRMED');
      const piId = await createTestPIWithStatus(sizedArtworkId, null, 'RESERVED');
      // Item has sizeId but PI has null size — mismatch
      const item = await createTestItemWithAvailability(order.id, sizedArtworkId, sizeId, 'IN_STOCK');
      await query('UPDATE order_request_items SET physical_inventory_id = $1 WHERE id = $2', [piId, item.id]);

      await assert.rejects(
        () => db.fulfillOrderRequest(order.id, 'test-admin'),
        (err) => { assert.equal(err.code, 'FULFILLMENT_INTEGRITY_ERROR'); return true; }
      );
      assert.equal(await getOrderStatus(order.id), 'CONFIRMED');

      await cleanupPI(piId);
      await cleanupOrderRequest(order.id);
    });

    it('B9: multi-item — second item blocked → full rollback, first PI stays RESERVED', async () => {
      const order = await createTestOrderRequest('CONFIRMED');
      const pi1 = await createTestPIWithStatus(artworkId, null, 'AVAILABLE');
      const item1 = await createTestItemWithAvailability(order.id, artworkId, null, 'IN_STOCK');
      await directReserve(pi1, item1.id);
      // Second item is IN_STOCK with no PI — will block fulfillment
      await createTestItemWithAvailability(order.id, artworkId, null, 'IN_STOCK');

      await assert.rejects(
        () => db.fulfillOrderRequest(order.id, 'test-admin'),
        (err) => { assert.equal(err.code, 'IN_STOCK_ITEM_NOT_RESERVED'); return true; }
      );
      // Full rollback: first PI must still be RESERVED (not SOLD)
      assert.equal((await getPIStatus(pi1)).status, 'RESERVED');
      assert.equal(await getOrderStatus(order.id), 'CONFIRMED');

      await cleanupPI(pi1);
      await cleanupOrderRequest(order.id);
    });
  });

  // ── Suite C: Terminal state protection ────────────────────────────────────

  describe('Suite C — Terminal state protection', () => {
    it('C1: FULFILLED → CANCELLED is blocked (ORDER_ALREADY_TERMINAL)', async () => {
      const order = await createTestOrderRequest('CONFIRMED');
      await createTestItemWithAvailability(order.id, artworkId, null, 'MADE_TO_ORDER');
      await db.fulfillOrderRequest(order.id, 'test-admin');

      await assert.rejects(
        () => db.updateOrderRequestStatus(order.id, 'CANCELLED', 'test-admin'),
        (err) => { assert.equal(err.code, 'ORDER_ALREADY_TERMINAL'); return true; }
      );
      assert.equal(await getOrderStatus(order.id), 'FULFILLED');

      await cleanupOrderRequest(order.id);
    });

    it('C2: FULFILLED → CONFIRMED is blocked (ORDER_ALREADY_TERMINAL)', async () => {
      const order = await createTestOrderRequest('CONFIRMED');
      await createTestItemWithAvailability(order.id, artworkId, null, 'MADE_TO_ORDER');
      await db.fulfillOrderRequest(order.id, 'test-admin');

      await assert.rejects(
        () => db.updateOrderRequestStatus(order.id, 'CONFIRMED', 'test-admin'),
        (err) => { assert.equal(err.code, 'ORDER_ALREADY_TERMINAL'); return true; }
      );
      assert.equal(await getOrderStatus(order.id), 'FULFILLED');

      await cleanupOrderRequest(order.id);
    });

    it('C3: FULFILLED → REVIEWING is blocked (ORDER_ALREADY_TERMINAL)', async () => {
      const order = await createTestOrderRequest('CONFIRMED');
      await createTestItemWithAvailability(order.id, artworkId, null, 'MADE_TO_ORDER');
      await db.fulfillOrderRequest(order.id, 'test-admin');

      await assert.rejects(
        () => db.updateOrderRequestStatus(order.id, 'REVIEWING', 'test-admin'),
        (err) => { assert.equal(err.code, 'ORDER_ALREADY_TERMINAL'); return true; }
      );

      await cleanupOrderRequest(order.id);
    });

    it('C4: CANCELLED → FULFILLED is blocked (ORDER_ALREADY_TERMINAL)', async () => {
      const order = await createTestOrderRequest('CONFIRMED');
      await db.updateOrderRequestStatus(order.id, 'CANCELLED', 'test-admin');

      await assert.rejects(
        () => db.updateOrderRequestStatus(order.id, 'FULFILLED', 'test-admin'),
        (err) => { assert.equal(err.code, 'ORDER_ALREADY_TERMINAL'); return true; }
      );
      assert.equal(await getOrderStatus(order.id), 'CANCELLED');

      await cleanupOrderRequest(order.id);
    });

    it('C5: CANCELLED → CONFIRMED is blocked (ORDER_ALREADY_TERMINAL)', async () => {
      const order = await createTestOrderRequest('CONFIRMED');
      await db.updateOrderRequestStatus(order.id, 'CANCELLED', 'test-admin');

      await assert.rejects(
        () => db.updateOrderRequestStatus(order.id, 'CONFIRMED', 'test-admin'),
        (err) => { assert.equal(err.code, 'ORDER_ALREADY_TERMINAL'); return true; }
      );
      assert.equal(await getOrderStatus(order.id), 'CANCELLED');

      await cleanupOrderRequest(order.id);
    });

    it('C6: repeated fulfillment → ORDER_NOT_CONFIRMED_FOR_FULFILLMENT, no duplicate SOLD movement', async () => {
      const order = await createTestOrderRequest('CONFIRMED');
      const piId = await createTestPIWithStatus(artworkId, null, 'AVAILABLE');
      const item = await createTestItemWithAvailability(order.id, artworkId, null, 'IN_STOCK');
      await directReserve(piId, item.id);

      await db.fulfillOrderRequest(order.id, 'test-admin');

      await assert.rejects(
        () => db.fulfillOrderRequest(order.id, 'test-admin'),
        (err) => { assert.equal(err.code, 'ORDER_NOT_CONFIRMED_FOR_FULFILLMENT'); return true; }
      );

      // Only one SOLD movement must exist
      const movements = await getMovementsForPI(piId);
      const soldMovements = movements.filter(m => m.movement_type === 'SOLD');
      assert.equal(soldMovements.length, 1);
      assert.equal((await getPIStatus(piId)).status, 'SOLD');

      await cleanupPI(piId);
      await cleanupOrderRequest(order.id);
    });
  });

  // ── Suite D: Concurrency ─────────────────────────────────────────────────

  describe('Suite D — Concurrency safety', () => {
    it('D1: Fulfill vs Release — consistent final state', async () => {
      // Fulfill locks order → items → PI; Release also locks order → item → PI.
      // Whoever wins: no orphaned RESERVED PI, no SOLD PI with cleared FK.
      const order = await createTestOrderRequest('CONFIRMED');
      const piId = await createTestPIWithStatus(artworkId, null, 'AVAILABLE');
      const item = await createTestItemWithAvailability(order.id, artworkId, null, 'IN_STOCK');
      await directReserve(piId, item.id);

      const results = await Promise.allSettled([
        db.fulfillOrderRequest(order.id, 'test-admin'),
        db.releasePhysicalInventoryForOrderItem(order.id, item.id, 'test-admin'),
      ]);

      const finalOrderStatus = await getOrderStatus(order.id);
      const finalPIStatus = (await getPIStatus(piId)).status;
      const finalItemFK = (await getItemRow(item.id)).physical_inventory_id;

      if (finalOrderStatus === 'FULFILLED') {
        // Fulfill won: PI=SOLD, FK retained
        assert.equal(finalPIStatus, 'SOLD');
        assert.equal(finalItemFK, piId);
      } else {
        // Release won: PI=AVAILABLE, FK cleared, order stays CONFIRMED
        assert.equal(finalOrderStatus, 'CONFIRMED');
        assert.equal(finalPIStatus, 'AVAILABLE');
        assert.equal(finalItemFK, null);
      }

      await cleanupPI(piId);
      await cleanupOrderRequest(order.id);
    });

    it('D2: Fulfill vs CANCELLED — exactly one succeeds', async () => {
      const order = await createTestOrderRequest('CONFIRMED');
      const piId = await createTestPIWithStatus(artworkId, null, 'AVAILABLE');
      const item = await createTestItemWithAvailability(order.id, artworkId, null, 'IN_STOCK');
      await directReserve(piId, item.id);

      const results = await Promise.allSettled([
        db.fulfillOrderRequest(order.id, 'test-admin'),
        db.updateOrderRequestStatus(order.id, 'CANCELLED', 'test-admin'),
      ]);

      const successes = results.filter(r => r.status === 'fulfilled');
      assert.equal(successes.length, 1, 'Exactly one of Fulfill/CANCELLED must succeed');

      const finalStatus = await getOrderStatus(order.id);
      assert.ok(finalStatus === 'FULFILLED' || finalStatus === 'CANCELLED');

      if (finalStatus === 'CANCELLED') {
        // CANCELLED auto-released: PI=AVAILABLE, FK cleared
        assert.equal((await getPIStatus(piId)).status, 'AVAILABLE');
      } else {
        // Fulfilled: PI=SOLD, FK retained
        assert.equal((await getPIStatus(piId)).status, 'SOLD');
      }

      await cleanupPI(piId);
      await cleanupOrderRequest(order.id);
    });

    it('D3: Fulfill vs Fulfill — exactly one succeeds, PI not double-SOLD', async () => {
      const order = await createTestOrderRequest('CONFIRMED');
      const piId = await createTestPIWithStatus(artworkId, null, 'AVAILABLE');
      const item = await createTestItemWithAvailability(order.id, artworkId, null, 'IN_STOCK');
      await directReserve(piId, item.id);

      const results = await Promise.allSettled([
        db.fulfillOrderRequest(order.id, 'test-admin'),
        db.fulfillOrderRequest(order.id, 'test-admin'),
      ]);

      const successes = results.filter(r => r.status === 'fulfilled');
      assert.equal(successes.length, 1, 'Exactly one concurrent fulfillment must succeed');
      assert.equal(await getOrderStatus(order.id), 'FULFILLED');
      assert.equal((await getPIStatus(piId)).status, 'SOLD');

      // Only one SOLD movement
      const sold = (await getMovementsForPI(piId)).filter(m => m.movement_type === 'SOLD');
      assert.equal(sold.length, 1);

      await cleanupPI(piId);
      await cleanupOrderRequest(order.id);
    });

    it('D4: Reserve vs Fulfill — consistent final state, no orphaned RESERVED PI', async () => {
      const order = await createTestOrderRequest('CONFIRMED');
      const piId = await createTestPIWithStatus(artworkId, null, 'AVAILABLE');
      const item = await createTestItemWithAvailability(order.id, artworkId, null, 'IN_STOCK');
      // Item has no reservation yet — Reserve and Fulfill race

      const results = await Promise.allSettled([
        db.reservePhysicalInventoryForOrderItem(order.id, item.id, piId, 'test-admin'),
        db.fulfillOrderRequest(order.id, 'test-admin'),
      ]);

      const finalOrderStatus = await getOrderStatus(order.id);
      const finalPIStatus = (await getPIStatus(piId)).status;
      const finalItemFK = (await getItemRow(item.id)).physical_inventory_id;

      if (finalOrderStatus === 'FULFILLED') {
        // Reserve won then Fulfill won (both succeeded): PI=SOLD, FK retained
        assert.equal(finalPIStatus, 'SOLD');
        assert.equal(finalItemFK, piId);
      } else {
        // Fulfill won first (IN_STOCK_ITEM_NOT_RESERVED) then Reserve won:
        // order=CONFIRMED, PI=RESERVED, FK set
        assert.equal(finalOrderStatus, 'CONFIRMED');
        assert.equal(finalPIStatus, 'RESERVED');
        assert.equal(finalItemFK, piId);
      }

      await cleanupPI(piId);
      await cleanupOrderRequest(order.id);
    });
  });

  // ── Suite E: Post-fulfillment PI invariants ───────────────────────────────

  describe('Suite E — Post-fulfillment PI invariants', () => {
    it('E1: SOLD PI does not appear in reservation candidates', async () => {
      const order = await createTestOrderRequest('CONFIRMED');
      const piId = await createTestPIWithStatus(artworkId, null, 'AVAILABLE');
      const item = await createTestItemWithAvailability(order.id, artworkId, null, 'IN_STOCK');
      await directReserve(piId, item.id);
      await db.fulfillOrderRequest(order.id, 'test-admin');

      // New order to check candidates
      const order2 = await createTestOrderRequest('CONFIRMED');
      const item2 = await createTestItemWithAvailability(order2.id, artworkId, null, 'IN_STOCK');
      const candidates = await db.getReservationCandidatesForItem(order2.id, item2.id);
      const found = candidates.find(c => c.id === piId);
      assert.equal(found, undefined, 'SOLD PI must not appear as a reservation candidate');

      await cleanupPI(piId);
      await cleanupOrderRequest(order.id);
      await cleanupOrderRequest(order2.id);
    });

    it('E2: generic PI status API cannot transition RESERVED → SOLD', async () => {
      const order = await createTestOrderRequest('CONFIRMED');
      const piId = await createTestPIWithStatus(artworkId, null, 'AVAILABLE');
      const item = await createTestItemWithAvailability(order.id, artworkId, null, 'IN_STOCK');
      await directReserve(piId, item.id);

      await assert.rejects(
        () => db.updatePhysicalInventoryStatusAdmin(piId, 'SOLD', 'test-admin', null),
        (err) => { assert.equal(err.code, 'INVALID_PI_TRANSITION'); return true; }
      );
      assert.equal((await getPIStatus(piId)).status, 'RESERVED');

      await cleanupPI(piId);
      await cleanupOrderRequest(order.id);
    });

    it('E3: generic PI status API cannot transition SOLD → AVAILABLE', async () => {
      const order = await createTestOrderRequest('CONFIRMED');
      const piId = await createTestPIWithStatus(artworkId, null, 'AVAILABLE');
      const item = await createTestItemWithAvailability(order.id, artworkId, null, 'IN_STOCK');
      await directReserve(piId, item.id);
      await db.fulfillOrderRequest(order.id, 'test-admin');

      await assert.rejects(
        () => db.updatePhysicalInventoryStatusAdmin(piId, 'AVAILABLE', 'test-admin', null),
        (err) => { assert.equal(err.code, 'INVALID_PI_TRANSITION'); return true; }
      );
      assert.equal((await getPIStatus(piId)).status, 'SOLD');

      await cleanupPI(piId);
      await cleanupOrderRequest(order.id);
    });
  });
});
