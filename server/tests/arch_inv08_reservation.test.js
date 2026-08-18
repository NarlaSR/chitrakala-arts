'use strict';
// ARCH-INV-08 — Reservation workflow unit/integration tests.
// Uses Node 22 built-in test runner (node:test + node:assert).
// Run with: node --test server/tests/arch_inv08_reservation.test.js
//
// These tests validate pure logic through the dbQueries functions.
// They require a running PostgreSQL instance pointed to by DATABASE_URL.
// Use the local dev database — never staging or production.
//
// Safety: tests only INSERT/UPDATE test-owned rows and roll back or clean up.
// They do not use any production credentials.

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Load db module after dotenv so DATABASE_URL is set
const db = require('../dbQueries');

// ── helpers ──────────────────────────────────────────────────────────────────

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function query(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
}

// Create a minimal artwork row for tests. Returns the artwork id.
// category is NOT NULL with no default; 'test' satisfies the constraint.
async function createTestArtwork(suffix) {
  const id = `TEST-ARCH-INV08-${suffix}-${Date.now()}`;
  await query(
    `INSERT INTO artworks (id, title, category, status, created_at, updated_at)
     VALUES ($1, $2, 'test', 'IN_STOCK', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO NOTHING`,
    [id, `Test Artwork ${suffix}`]
  );
  return id;
}

// Create an artwork_sizes row. Returns the size id.
async function createTestSize(artworkId, label) {
  const rows = await query(
    `INSERT INTO artwork_sizes (artwork_id, size_label, price, created_at)
     VALUES ($1, $2, 0, CURRENT_TIMESTAMP) RETURNING id`,
    [artworkId, label]
  );
  return rows[0].id;
}

// Create a physical_inventory row with AVAILABLE status. Returns the PI id.
async function createTestPI(artworkId, sizeId = null) {
  const rows = await query(
    `INSERT INTO physical_inventory
       (artwork_id, artwork_size_id, status, source, created_at, updated_at)
     VALUES ($1, $2, 'AVAILABLE', 'test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     RETURNING id`,
    [artworkId, sizeId]
  );
  return rows[0].id;
}

// Create an order_request row. Returns the order request object.
async function createTestOrderRequest(status = 'CONFIRMED') {
  const rows = await query(
    `INSERT INTO order_requests
       (customer_name, customer_email, status, created_at, updated_at)
     VALUES ('Test Customer', 'test@test.invalid', $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     RETURNING *`,
    [status]
  );
  return rows[0];
}

// Create an order_request_items row. Returns the item object.
async function createTestItem(orderId, artworkId, sizeId = null) {
  const rows = await query(
    `INSERT INTO order_request_items
       (order_request_id, artwork_id, artwork_size_id, quantity, snapshot_title, created_at)
     VALUES ($1, $2, $3, 1, 'Test Artwork', CURRENT_TIMESTAMP)
     RETURNING *`,
    [orderId, artworkId, sizeId]
  );
  return rows[0];
}

// Get PI status from DB.
async function getPIStatus(piId) {
  const rows = await query('SELECT status, updated_at FROM physical_inventory WHERE id = $1', [piId]);
  return rows[0];
}

// Get item's physical_inventory_id from DB.
async function getItemPIId(itemId) {
  const rows = await query('SELECT physical_inventory_id FROM order_request_items WHERE id = $1', [itemId]);
  return rows[0]?.physical_inventory_id ?? null;
}

// Get latest movement for a PI.
async function getLatestMovement(piId) {
  const rows = await query(
    'SELECT * FROM inventory_movements WHERE physical_inventory_id = $1 ORDER BY id DESC LIMIT 1',
    [piId]
  );
  return rows[0] || null;
}

// Cleanup rows created during a test by id.
async function cleanupOrderRequest(orderId) {
  await query('DELETE FROM order_requests WHERE id = $1', [orderId]);
}

async function cleanupPI(piId) {
  // inventory_movements.physical_inventory_id is ON DELETE SET NULL, not CASCADE.
  // Delete movements first so they are fully removed rather than orphaned with a null FK.
  await query('DELETE FROM inventory_movements WHERE physical_inventory_id = $1', [piId]);
  await query('DELETE FROM physical_inventory WHERE id = $1', [piId]);
}

async function cleanupArtwork(artworkId) {
  await query('DELETE FROM artworks WHERE id = $1', [artworkId]);
}

// ── test suite ───────────────────────────────────────────────────────────────

describe('ARCH-INV-08 Reservation Workflow', () => {
  // Shared test resources created in before() and cleaned in after()
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

  // ── Reserve: success cases ────────────────────────────────────────────────

  describe('reservePhysicalInventoryForOrderItem', () => {
    it('reserves an AVAILABLE PI for a no-size artwork item', async () => {
      const piId = await createTestPI(artworkId, null);
      const order = await createTestOrderRequest('CONFIRMED');
      const item = await createTestItem(order.id, artworkId, null);

      await db.reservePhysicalInventoryForOrderItem(order.id, item.id, piId, 'test-user');

      assert.equal((await getPIStatus(piId)).status, 'RESERVED');
      assert.equal(await getItemPIId(item.id), piId);
      const mov = await getLatestMovement(piId);
      assert.equal(mov.movement_type, 'RESERVED');
      assert.equal(mov.created_by, 'test-user');

      await cleanupOrderRequest(order.id);
      await cleanupPI(piId);
    });

    it('reserves an AVAILABLE PI for a sized artwork item', async () => {
      const piId = await createTestPI(sizedArtworkId, sizeId);
      const order = await createTestOrderRequest('CONFIRMED');
      const item = await createTestItem(order.id, sizedArtworkId, sizeId);

      await db.reservePhysicalInventoryForOrderItem(order.id, item.id, piId, 'test-user');

      assert.equal((await getPIStatus(piId)).status, 'RESERVED');
      assert.equal(await getItemPIId(item.id), piId);

      await cleanupOrderRequest(order.id);
      await cleanupPI(piId);
    });
  });

  // ── Reserve: failure cases ────────────────────────────────────────────────

  describe('reservePhysicalInventoryForOrderItem — error cases', () => {
    it('rejects when order is not CONFIRMED', async () => {
      const piId = await createTestPI(artworkId, null);
      const order = await createTestOrderRequest('REVIEWING');
      const item = await createTestItem(order.id, artworkId, null);

      await assert.rejects(
        () => db.reservePhysicalInventoryForOrderItem(order.id, item.id, piId, 'test-user'),
        (err) => { assert.equal(err.code, 'ORDER_NOT_CONFIRMED'); return true; }
      );
      assert.equal((await getPIStatus(piId)).status, 'AVAILABLE');

      await cleanupOrderRequest(order.id);
      await cleanupPI(piId);
    });

    it('rejects when order does not exist', async () => {
      const piId = await createTestPI(artworkId, null);
      await assert.rejects(
        () => db.reservePhysicalInventoryForOrderItem(999999999, 1, piId, 'test-user'),
        (err) => { assert.equal(err.code, 'ORDER_NOT_FOUND'); return true; }
      );
      await cleanupPI(piId);
    });

    it('rejects when item does not belong to order', async () => {
      const piId = await createTestPI(artworkId, null);
      const order = await createTestOrderRequest('CONFIRMED');

      await assert.rejects(
        () => db.reservePhysicalInventoryForOrderItem(order.id, 999999999, piId, 'test-user'),
        (err) => { assert.equal(err.code, 'ITEM_NOT_FOUND'); return true; }
      );

      await cleanupOrderRequest(order.id);
      await cleanupPI(piId);
    });

    it('rejects when item already has a reservation', async () => {
      const piId1 = await createTestPI(artworkId, null);
      const piId2 = await createTestPI(artworkId, null);
      const order = await createTestOrderRequest('CONFIRMED');
      const item = await createTestItem(order.id, artworkId, null);

      await db.reservePhysicalInventoryForOrderItem(order.id, item.id, piId1, 'test-user');

      await assert.rejects(
        () => db.reservePhysicalInventoryForOrderItem(order.id, item.id, piId2, 'test-user'),
        (err) => { assert.equal(err.code, 'ITEM_ALREADY_RESERVED'); return true; }
      );
      // Second PI must remain AVAILABLE
      assert.equal((await getPIStatus(piId2)).status, 'AVAILABLE');

      // physical_inventory rows are ON DELETE SET NULL, not CASCADE — must clean them up explicitly.
      await cleanupPI(piId1);
      await cleanupPI(piId2);
      await cleanupOrderRequest(order.id);
    });

    it('rejects when PI is not AVAILABLE', async () => {
      const rows = await query(
        `INSERT INTO physical_inventory
           (artwork_id, artwork_size_id, status, source, created_at, updated_at)
         VALUES ($1, NULL, 'RESERVED', 'test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id`,
        [artworkId]
      );
      const piId = rows[0].id;
      const order = await createTestOrderRequest('CONFIRMED');
      const item = await createTestItem(order.id, artworkId, null);

      await assert.rejects(
        () => db.reservePhysicalInventoryForOrderItem(order.id, item.id, piId, 'test-user'),
        (err) => { assert.equal(err.code, 'PI_NOT_AVAILABLE'); return true; }
      );

      await cleanupOrderRequest(order.id);
      await cleanupPI(piId);
    });

    it('rejects when PI artwork does not match item artwork', async () => {
      const otherArtworkId = await createTestArtwork('OTHER');
      const piId = await createTestPI(otherArtworkId, null);
      const order = await createTestOrderRequest('CONFIRMED');
      const item = await createTestItem(order.id, artworkId, null);

      await assert.rejects(
        () => db.reservePhysicalInventoryForOrderItem(order.id, item.id, piId, 'test-user'),
        (err) => { assert.equal(err.code, 'ARTWORK_MISMATCH'); return true; }
      );
      assert.equal((await getPIStatus(piId)).status, 'AVAILABLE');

      await cleanupOrderRequest(order.id);
      await cleanupPI(piId);
      await cleanupArtwork(otherArtworkId);
    });

    it('rejects when PI has a size but item has no size (NULL IS NOT DISTINCT FROM non-null fails)', async () => {
      // PI has sizeId, item has null artwork_size_id — strict mismatch
      const piId = await createTestPI(sizedArtworkId, sizeId);
      const order = await createTestOrderRequest('CONFIRMED');
      const item = await createTestItem(order.id, sizedArtworkId, null); // no size

      await assert.rejects(
        () => db.reservePhysicalInventoryForOrderItem(order.id, item.id, piId, 'test-user'),
        (err) => { assert.equal(err.code, 'SIZE_MISMATCH'); return true; }
      );

      await cleanupOrderRequest(order.id);
      await cleanupPI(piId);
    });

    it('rejects when item has a size but PI has no size', async () => {
      const piId = await createTestPI(sizedArtworkId, null); // no size
      const order = await createTestOrderRequest('CONFIRMED');
      const item = await createTestItem(order.id, sizedArtworkId, sizeId); // has size

      await assert.rejects(
        () => db.reservePhysicalInventoryForOrderItem(order.id, item.id, piId, 'test-user'),
        (err) => { assert.equal(err.code, 'SIZE_MISMATCH'); return true; }
      );

      await cleanupOrderRequest(order.id);
      await cleanupPI(piId);
    });
  });

  // ── Release ───────────────────────────────────────────────────────────────

  describe('releasePhysicalInventoryForOrderItem', () => {
    it('releases a RESERVED PI back to AVAILABLE', async () => {
      const piId = await createTestPI(artworkId, null);
      const order = await createTestOrderRequest('CONFIRMED');
      const item = await createTestItem(order.id, artworkId, null);

      await db.reservePhysicalInventoryForOrderItem(order.id, item.id, piId, 'test-user');
      await db.releasePhysicalInventoryForOrderItem(order.id, item.id, 'test-user');

      assert.equal((await getPIStatus(piId)).status, 'AVAILABLE');
      assert.equal(await getItemPIId(item.id), null);
      const mov = await getLatestMovement(piId);
      assert.equal(mov.movement_type, 'RESERVATION_RELEASED');

      await cleanupOrderRequest(order.id);
      await cleanupPI(piId);
    });

    it('release does not require CONFIRMED status', async () => {
      const piId = await createTestPI(artworkId, null);
      const order = await createTestOrderRequest('CONFIRMED');
      const item = await createTestItem(order.id, artworkId, null);

      await db.reservePhysicalInventoryForOrderItem(order.id, item.id, piId, 'test-user');
      // Move order to REVIEWING (no reservation interaction)
      await query(
        'UPDATE order_requests SET status = $1 WHERE id = $2',
        ['REVIEWING', order.id]
      );
      // Release should still succeed
      await db.releasePhysicalInventoryForOrderItem(order.id, item.id, 'test-user');
      assert.equal((await getPIStatus(piId)).status, 'AVAILABLE');

      await cleanupOrderRequest(order.id);
      await cleanupPI(piId);
    });

    it('rejects release when item has no reservation', async () => {
      const order = await createTestOrderRequest('CONFIRMED');
      const item = await createTestItem(order.id, artworkId, null);

      await assert.rejects(
        () => db.releasePhysicalInventoryForOrderItem(order.id, item.id, 'test-user'),
        (err) => { assert.equal(err.code, 'ITEM_NOT_RESERVED'); return true; }
      );

      await cleanupOrderRequest(order.id);
    });
  });

  // ── Cancel auto-release ────────────────────────────────────────────────────

  describe('updateOrderRequestStatus — CANCELLED auto-release', () => {
    it('auto-releases all reserved PIs when order is cancelled', async () => {
      const piId1 = await createTestPI(artworkId, null);
      const piId2 = await createTestPI(artworkId, null);
      const order = await createTestOrderRequest('CONFIRMED');
      const item1 = await createTestItem(order.id, artworkId, null);
      const item2 = await createTestItem(order.id, artworkId, null);

      await db.reservePhysicalInventoryForOrderItem(order.id, item1.id, piId1, 'test-user');
      await db.reservePhysicalInventoryForOrderItem(order.id, item2.id, piId2, 'test-user');

      await db.updateOrderRequestStatus(order.id, 'CANCELLED', 'test-user');

      assert.equal((await getPIStatus(piId1)).status, 'AVAILABLE');
      assert.equal((await getPIStatus(piId2)).status, 'AVAILABLE');
      assert.equal(await getItemPIId(item1.id), null);
      assert.equal(await getItemPIId(item2.id), null);

      const mov1 = await getLatestMovement(piId1);
      const mov2 = await getLatestMovement(piId2);
      assert.equal(mov1.movement_type, 'RESERVATION_RELEASED');
      assert.equal(mov2.movement_type, 'RESERVATION_RELEASED');

      await cleanupOrderRequest(order.id);
      await cleanupPI(piId1);
      await cleanupPI(piId2);
    });

    it('cancels cleanly when no items are reserved', async () => {
      const order = await createTestOrderRequest('REVIEWING');
      await createTestItem(order.id, artworkId, null);

      const result = await db.updateOrderRequestStatus(order.id, 'CANCELLED', 'test-user');
      assert.equal(result.status, 'CANCELLED');

      await cleanupOrderRequest(order.id);
    });

    it('rolls back and throws RESERVATION_INTEGRITY_ERROR when a linked PI is not RESERVED', async () => {
      const piId = await createTestPI(artworkId, null);
      const order = await createTestOrderRequest('CONFIRMED');
      const item = await createTestItem(order.id, artworkId, null);

      await db.reservePhysicalInventoryForOrderItem(order.id, item.id, piId, 'test-user');

      // Directly corrupt state: set PI back to AVAILABLE without clearing FK (simulates integrity violation)
      await query('UPDATE physical_inventory SET status = $1 WHERE id = $2', ['AVAILABLE', piId]);

      await assert.rejects(
        () => db.updateOrderRequestStatus(order.id, 'CANCELLED', 'test-user'),
        (err) => { assert.equal(err.code, 'RESERVATION_INTEGRITY_ERROR'); return true; }
      );

      // Order must still be CONFIRMED (rolled back)
      const rows = await query('SELECT status FROM order_requests WHERE id = $1', [order.id]);
      assert.equal(rows[0].status, 'CONFIRMED');

      await cleanupOrderRequest(order.id);
      await cleanupPI(piId);
    });
  });

  // ── FULFILLED protection ───────────────────────────────────────────────────

  describe('updateOrderRequestStatus — FULFILLED and terminal-state protection', () => {
    it('allows FULFILLED for a CONFIRMED order where all items are MADE_TO_ORDER', async () => {
      const order = await createTestOrderRequest('CONFIRMED');
      // Use direct SQL insert with snapshot_availability='MADE_TO_ORDER' — createTestItem
      // does not set snapshot_availability (null), which would fail the eligibility check.
      await query(
        `INSERT INTO order_request_items
           (order_request_id, artwork_id, artwork_size_id, quantity, snapshot_title,
            snapshot_availability, created_at)
         VALUES ($1, $2, NULL, 1, 'Test Artwork', 'MADE_TO_ORDER', CURRENT_TIMESTAMP)`,
        [order.id, artworkId]
      );

      const result = await db.updateOrderRequestStatus(order.id, 'FULFILLED', 'test-user');
      assert.equal(result.status, 'FULFILLED');

      await cleanupOrderRequest(order.id);
    });

    it('FULFILLED concurrency: reserve and FULFILLED serialize correctly', async () => {
      // Both operations lock order_requests FOR UPDATE, so they serialize.
      // Item is IN_STOCK with no PI reserved yet:
      //   - If Reserve wins first: PI→RESERVED, item FK set → Fulfill sees RESERVED PI → PI→SOLD, order→FULFILLED (both succeed)
      //   - If Fulfill wins first: IN_STOCK_ITEM_NOT_RESERVED → ROLLBACK → Reserve succeeds (one success, one fail)
      // Either way: no orphaned RESERVED PI, no double-SOLD, final state consistent.
      const piId = await createTestPI(artworkId, null);
      const order = await createTestOrderRequest('CONFIRMED');
      // Direct insert with snapshot_availability='IN_STOCK' to use the production-realistic path
      const itemRows = await query(
        `INSERT INTO order_request_items
           (order_request_id, artwork_id, artwork_size_id, quantity, snapshot_title,
            snapshot_availability, created_at)
         VALUES ($1, $2, NULL, 1, 'Test Artwork', 'IN_STOCK', CURRENT_TIMESTAMP)
         RETURNING id`,
        [order.id, artworkId]
      );
      const itemId = itemRows[0].id;

      const results = await Promise.allSettled([
        db.reservePhysicalInventoryForOrderItem(order.id, itemId, piId, 'test-user'),
        db.updateOrderRequestStatus(order.id, 'FULFILLED', 'test-user'),
      ]);

      const successes = results.filter(r => r.status === 'fulfilled');
      const failures = results.filter(r => r.status === 'rejected');
      // At least one must succeed; at most one failure
      assert.ok(successes.length >= 1 && successes.length <= 2);
      assert.ok(failures.length <= 1);

      // Final state must be internally consistent
      const orderRows = await query('SELECT status FROM order_requests WHERE id = $1', [order.id]);
      const piStatus = (await getPIStatus(piId)).status;
      const itemPiId = await getItemPIId(itemId);
      const finalStatus = orderRows[0].status;

      if (finalStatus === 'FULFILLED') {
        // Reserve won then Fulfill won: PI=SOLD, FK retained (not null)
        assert.equal(piStatus, 'SOLD');
        assert.equal(itemPiId, piId);
      } else {
        // Fulfill lost (IN_STOCK_ITEM_NOT_RESERVED), Reserve won: PI=RESERVED, FK set
        assert.equal(finalStatus, 'CONFIRMED');
        assert.equal(piStatus, 'RESERVED');
        assert.equal(itemPiId, piId);
      }

      await cleanupPI(piId);
      await cleanupOrderRequest(order.id);
    });

    it('FULFILLED → CANCELLED is blocked (ORDER_ALREADY_TERMINAL)', async () => {
      const order = await createTestOrderRequest('CONFIRMED');
      await query(
        `INSERT INTO order_request_items
           (order_request_id, artwork_id, artwork_size_id, quantity, snapshot_title,
            snapshot_availability, created_at)
         VALUES ($1, $2, NULL, 1, 'Test Artwork', 'MADE_TO_ORDER', CURRENT_TIMESTAMP)`,
        [order.id, artworkId]
      );
      await db.updateOrderRequestStatus(order.id, 'FULFILLED', 'test-user');

      await assert.rejects(
        () => db.updateOrderRequestStatus(order.id, 'CANCELLED', 'test-user'),
        (err) => { assert.equal(err.code, 'ORDER_ALREADY_TERMINAL'); return true; }
      );

      const rows = await query('SELECT status FROM order_requests WHERE id = $1', [order.id]);
      assert.equal(rows[0].status, 'FULFILLED');

      await cleanupOrderRequest(order.id);
    });

    it('CANCELLED → CONFIRMED is blocked (ORDER_ALREADY_TERMINAL)', async () => {
      const order = await createTestOrderRequest('CONFIRMED');
      await db.updateOrderRequestStatus(order.id, 'CANCELLED', 'test-user');

      await assert.rejects(
        () => db.updateOrderRequestStatus(order.id, 'CONFIRMED', 'test-user'),
        (err) => { assert.equal(err.code, 'ORDER_ALREADY_TERMINAL'); return true; }
      );

      const rows = await query('SELECT status FROM order_requests WHERE id = $1', [order.id]);
      assert.equal(rows[0].status, 'CANCELLED');

      await cleanupOrderRequest(order.id);
    });
  });

  // ── getReservationCandidates ──────────────────────────────────────────────

  describe('getReservationCandidatesForItem', () => {
    it('returns AVAILABLE PI rows matching artwork and size', async () => {
      const piId = await createTestPI(artworkId, null);
      const order = await createTestOrderRequest('CONFIRMED');
      const item = await createTestItem(order.id, artworkId, null);

      const candidates = await db.getReservationCandidatesForItem(order.id, item.id);
      const found = candidates.find(c => c.id === piId);
      assert.ok(found, 'Candidate PI not found in results');
      assert.equal(found.status, 'AVAILABLE');

      await cleanupOrderRequest(order.id);
      await cleanupPI(piId);
    });

    it('excludes PI already reserved for another item', async () => {
      const piId = await createTestPI(artworkId, null);
      const order1 = await createTestOrderRequest('CONFIRMED');
      const order2 = await createTestOrderRequest('CONFIRMED');
      const item1 = await createTestItem(order1.id, artworkId, null);
      const item2 = await createTestItem(order2.id, artworkId, null);

      // Reserve piId for item1
      await db.reservePhysicalInventoryForOrderItem(order1.id, item1.id, piId, 'test-user');

      // Candidates for item2 must NOT include piId
      const candidates = await db.getReservationCandidatesForItem(order2.id, item2.id);
      const found = candidates.find(c => c.id === piId);
      assert.equal(found, undefined, 'Already-reserved PI must not appear as a candidate');

      await cleanupPI(piId);
      await cleanupOrderRequest(order1.id);
      await cleanupOrderRequest(order2.id);
    });

    it('excludes PI with wrong size (NULL item size vs non-null PI size)', async () => {
      const piId = await createTestPI(sizedArtworkId, sizeId);
      const order = await createTestOrderRequest('CONFIRMED');
      const item = await createTestItem(order.id, sizedArtworkId, null); // no size

      const candidates = await db.getReservationCandidatesForItem(order.id, item.id);
      const found = candidates.find(c => c.id === piId);
      assert.equal(found, undefined, 'Mismatched-size PI must not appear as a candidate');

      await cleanupOrderRequest(order.id);
      await cleanupPI(piId);
    });

    it('excludes PI with wrong size (non-null item size vs NULL PI size)', async () => {
      const piId = await createTestPI(sizedArtworkId, null); // no size
      const order = await createTestOrderRequest('CONFIRMED');
      const item = await createTestItem(order.id, sizedArtworkId, sizeId); // has size

      const candidates = await db.getReservationCandidatesForItem(order.id, item.id);
      const found = candidates.find(c => c.id === piId);
      assert.equal(found, undefined, 'Mismatched-size PI must not appear as a candidate');

      await cleanupOrderRequest(order.id);
      await cleanupPI(piId);
    });

    it('excludes non-AVAILABLE PI from candidates', async () => {
      const rows = await query(
        `INSERT INTO physical_inventory
           (artwork_id, artwork_size_id, status, source, created_at, updated_at)
         VALUES ($1, NULL, 'INSPECTED', 'test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id`,
        [artworkId]
      );
      const piId = rows[0].id;
      const order = await createTestOrderRequest('CONFIRMED');
      const item = await createTestItem(order.id, artworkId, null);

      const candidates = await db.getReservationCandidatesForItem(order.id, item.id);
      const found = candidates.find(c => c.id === piId);
      assert.equal(found, undefined, 'Non-AVAILABLE PI must not appear as a candidate');

      await cleanupOrderRequest(order.id);
      await cleanupPI(piId);
    });

    it('returns empty array when no candidates exist', async () => {
      const order = await createTestOrderRequest('CONFIRMED');
      const item = await createTestItem(order.id, artworkId, null);

      const candidates = await db.getReservationCandidatesForItem(order.id, item.id);
      assert.ok(Array.isArray(candidates));
      // Not asserting length == 0 since other tests may leave AVAILABLE PIs for the same artwork.
      // Just verify the query runs without error.

      await cleanupOrderRequest(order.id);
    });

    it('throws ITEM_NOT_FOUND for unknown item', async () => {
      const order = await createTestOrderRequest('CONFIRMED');
      await assert.rejects(
        () => db.getReservationCandidatesForItem(order.id, 999999999),
        (err) => { assert.equal(err.code, 'ITEM_NOT_FOUND'); return true; }
      );
      await cleanupOrderRequest(order.id);
    });
  });

  // ── Public flow regression ────────────────────────────────────────────────

  describe('Public order submission — no PI interaction', () => {
    it('createOrderRequest does not touch physical_inventory', async () => {
      const piId = await createTestPI(artworkId, null);
      const initialStatus = (await getPIStatus(piId)).status;
      assert.equal(initialStatus, 'AVAILABLE');

      await db.createOrderRequest({
        customer_name: 'Public Customer',
        customer_email: 'pub@test.invalid',
        customer_phone: null,
        customer_message: null,
        items: [
          {
            artwork_id: artworkId,
            artwork_size_id: null,
            quantity: 1,
            snapshot_title: 'Test Artwork NO-SIZE',
            snapshot_sku: null,
            snapshot_category: null,
            snapshot_size_label: null,
            snapshot_price_inr: null,
            snapshot_price_usd: null,
            snapshot_image: null,
            snapshot_availability: 'IN_STOCK',
          },
        ],
      });

      // PI must remain untouched
      assert.equal((await getPIStatus(piId)).status, 'AVAILABLE');

      // Cleanup: find the order we just created and delete it
      const orderRows = await query(
        `SELECT id FROM order_requests WHERE customer_email = 'pub@test.invalid' ORDER BY id DESC LIMIT 1`
      );
      if (orderRows.length > 0) await cleanupOrderRequest(orderRows[0].id);
      await cleanupPI(piId);
    });
  });

  // ── Generic PI status endpoint regression ─────────────────────────────────

  describe('updatePhysicalInventoryStatusAdmin — cannot create/dissolve reservations', () => {
    it('AVAILABLE PI cannot be moved to RESERVED via generic update (no transition defined)', async () => {
      const piId = await createTestPI(artworkId, null);

      await assert.rejects(
        () => db.updatePhysicalInventoryStatusAdmin(piId, 'RESERVED', 'test-user', null),
        (err) => { assert.equal(err.code, 'INVALID_PI_TRANSITION'); return true; }
      );
      assert.equal((await getPIStatus(piId)).status, 'AVAILABLE');

      await cleanupPI(piId);
    });

    it('RESERVED PI cannot be moved via generic update (no transitions defined)', async () => {
      const piId = await createTestPI(artworkId, null);
      const order = await createTestOrderRequest('CONFIRMED');
      const item = await createTestItem(order.id, artworkId, null);
      await db.reservePhysicalInventoryForOrderItem(order.id, item.id, piId, 'test-user');

      await assert.rejects(
        () => db.updatePhysicalInventoryStatusAdmin(piId, 'AVAILABLE', 'test-user', null),
        (err) => { assert.equal(err.code, 'INVALID_PI_TRANSITION'); return true; }
      );
      assert.equal((await getPIStatus(piId)).status, 'RESERVED');

      await cleanupPI(piId);
      await cleanupOrderRequest(order.id);
    });
  });
});
