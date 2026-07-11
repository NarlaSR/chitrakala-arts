// Centralized ArtCode mapping — the single source of truth for category↔ArtCode relationships.
//
// To add a future category:
//   1. Business owner approves the category slug and ArtCode (must be unique, 2-3 chars).
//   2. Developer adds it here (ARTCODE_MAP) and in inventoryParser.js KNOWN_ARTWORK_CODES.
//   3. Developer updates VALID_SKU_PATTERN in server.js to include the new ArtCode.
//   4. Developer validates SKU generation locally and in staging before deploying.
const ARTCODE_MAP = {
  'dot-mandala':    'DM',
  'lippan-art':     'LA',
  'mirror-mosaic':  'MM',
  'warli-art':      'WA',
  'texture-art':    'TA',
  'mixed-art':      'MA',
  'textile-design': 'TD',
};

// Inverse: ArtCode → category slug. Used by inventory parser to resolve category from workbook rows.
const CATEGORY_BY_ARTCODE = Object.fromEntries(
  Object.entries(ARTCODE_MAP).map(([cat, code]) => [code, cat])
);

const PUBLIC_ORDERABLE_STATUSES = new Set(['IN_STOCK', 'MADE_TO_ORDER']);

function isPublicOrderable(status, show_on_website) {
  return PUBLIC_ORDERABLE_STATUSES.has(status) && show_on_website === true;
}

// Returns the next SKU string for the given category and year.
// Uses a regex to match ONLY the new format (CKS-YYYY-ArtCode-NNNNN) so old inventory-format
// SKUs (CKS-2026-DM-LG-00001) don't corrupt the counter.
async function _nextSku(pool, category, year) {
  const artCode = ARTCODE_MAP[category];
  if (!artCode) {
    throw new Error(
      `No approved ArtCode for category "${category}". ` +
      'To add a new category ArtCode: (1) get business owner approval for the category slug and ArtCode, ' +
      '(2) add it to ARTCODE_MAP in server/skuUtils.js and KNOWN_ARTWORK_CODES in server/inventoryParser.js, ' +
      '(3) update VALID_SKU_PATTERN in server/server.js, ' +
      '(4) validate locally and in staging before deploying.'
    );
  }
  // Pattern matches only new-format SKUs: CKS-YYYY-ArtCode-NNNNN (5-digit suffix, no size code).
  const pattern = `^CKS-${year}-${artCode}-\\d{5}$`;
  const { rows } = await pool.query(
    `SELECT sku FROM artworks WHERE sku ~ $1 ORDER BY sku DESC LIMIT 1`,
    [pattern]
  );
  let next = 1;
  if (rows.length > 0) {
    const prefix = `CKS-${year}-${artCode}-`;
    const n = parseInt(rows[0].sku.slice(prefix.length), 10);
    if (!isNaN(n)) next = n + 1;
  }
  return `CKS-${year}-${artCode}-${String(next).padStart(5, '0')}`;
}

// Returns:
//   - existingSku unchanged if the artwork already has one (SKU is immutable once assigned)
//   - a newly generated SKU if the artwork is now public/orderable and has no SKU yet
//   - null if the artwork is not yet public/orderable
// Throws if category has no approved ArtCode and generation is needed.
async function maybeGenerateSku(pool, { category, status, show_on_website, existingSku }) {
  if (existingSku) return existingSku;
  if (!isPublicOrderable(status, show_on_website)) return null;
  return _nextSku(pool, category, new Date().getFullYear());
}

module.exports = { ARTCODE_MAP, CATEGORY_BY_ARTCODE, isPublicOrderable, maybeGenerateSku };
