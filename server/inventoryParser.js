const XLSX = require('xlsx');
const path = require('path');
const { CATEGORY_BY_ARTCODE, ARTCODE_MAP, isPublicOrderable } = require('./skuUtils');

// Preferred sheet name for inventory imports (multi-sheet workbooks like INV-03-10 template).
// Falls back to the first sheet so single-sheet uploads still work.
const INVENTORY_IMPORT_SHEET = 'Inventory_Import';

// Artwork codes recognised by the system. Keep in sync with ARTCODE_MAP in skuUtils.js.
const KNOWN_ARTWORK_CODES = new Set(['DM', 'LA', 'MM', 'WA', 'TA', 'MA', 'TD']);

// Category slugs derived from the canonical ARTCODE_MAP.
const KNOWN_CATEGORY_SLUGS = new Set(Object.keys(ARTCODE_MAP));

// Valid inventory statuses accepted by the importer.
const ALLOWED_STATUSES = new Set([
  'NEEDS_REVIEW', 'IN_STOCK', 'MADE_TO_ORDER', 'OUT_OF_STOCK', 'SOLD', 'ARCHIVED',
]);

// Valid row actions.
const ALLOWED_ACTIONS = new Set(['CREATE', 'UPDATE', 'NO_CHANGE']);

// Maps normalised (trimmed, lowercased) header text → canonical field name.
// New workbook column names (INV-03-10 / ISYNC-16 format) take precedence.
// Legacy column names are kept as aliases so older single-sheet workbooks remain parseable.
const HEADER_MAP = {
  // --- New workbook format (INV-03-10 / ISYNC-16) ---
  'action':                                'action',
  'existing artwork id':                   'existingArtworkId',
  'sku':                                   'sku',
  'item description':                      'itemDescription',
  'category':                              'category',
  'artcode':                               'artWorkCode',
  'dimension':                             'dimensions',
  'size label':                            'sizeLabel',
  'materials':                             'materials',
  'inventory status':                      'inventoryStatus',
  'quantity':                              'quantity',
  'show_on_website':                       'showOnWebsite',
  'price inr':                             'priceInr',
  'price usd':                             'priceUsd',
  'price on request':                      'priceOnRequest',
  'image file name':                       'imageFilename',
  'image filename':                        'imageFilename',
  'featured':                              'featured',
  'owner review needed':                   'ownerReviewNeeded',
  'notes':                                 'notes',
  // --- Legacy aliases (old single-sheet workbook format) ---
  'art work':                              'artWorkCode',
  'artwork':                               'artWorkCode',
  'size':                                  'sizeLabel',
  'price per unit':                        'priceInr',
  'dimensions':                            'dimensions',
  'long description':                      'notes',
  'image file':                            'imageFilename',
  'image':                                 'imageFilename',
  'public visibility / review status':     'ownerReviewNeeded',
  'public visibility':                     'ownerReviewNeeded',
  'review status':                         'ownerReviewNeeded',
};

// Minimum number of HEADER_MAP matches for a row to be treated as the header row.
const MIN_HEADER_MATCHES = 3;

// ArtCode → category slug (re-exported for callers that need it).
const ARTWORK_CATEGORY_MAP = CATEGORY_BY_ARTCODE;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Return the sheet to parse.
 * Prefers 'Inventory_Import' by name; falls back to the first sheet.
 */
function findImportSheet(workbook) {
  if (workbook.Sheets[INVENTORY_IMPORT_SHEET]) {
    return { sheet: workbook.Sheets[INVENTORY_IMPORT_SHEET], sheetName: INVENTORY_IMPORT_SHEET };
  }
  const name = workbook.SheetNames[0];
  return { sheet: workbook.Sheets[name], sheetName: name };
}

/**
 * Scan the first `scanRows` rows of rawData to find the header row.
 * A row qualifies if it contains at least MIN_HEADER_MATCHES recognised column names.
 * Returns the 0-based row index, or 0 as a safe default.
 */
function detectHeaderRowIndex(rawData, scanRows = 10) {
  for (let i = 0; i < Math.min(scanRows, rawData.length); i++) {
    const row = rawData[i];
    if (!row) continue;
    const matches = row.filter(
      h => h !== null && HEADER_MAP[String(h).trim().toLowerCase()] !== undefined
    ).length;
    if (matches >= MIN_HEADER_MATCHES) return i;
  }
  return 0;
}

/**
 * Parse a boolean-like cell value (TRUE/FALSE, true/false, 1/0, Yes/No).
 * Returns true, false, or null if the value is absent or unrecognised.
 */
function parseBool(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toUpperCase();
  if (s === 'TRUE'  || s === '1' || s === 'YES') return true;
  if (s === 'FALSE' || s === '0' || s === 'NO')  return false;
  return null;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Parse an inventory Excel buffer and return structured row objects.
 *
 * Key behaviours (ISYNC-16 aligned):
 *  - Reads 'Inventory_Import' sheet by name; falls back to first sheet.
 *  - Auto-detects header row by scanning for recognised column names
 *    (supports workbooks where row 1 is a template warning and row 2 is the real header).
 *  - Recognises new workbook column names AND legacy aliases.
 *  - Never generates SKUs — SKU in the workbook is reference-only.
 *  - NO_CHANGE rows are silently skipped (informational only).
 *  - Validates Action, Inventory Status, Price INR, and Existing Artwork ID per action.
 *  - Flags size-level Price on Request as an error (not yet supported, see INV-PRICE-01).
 *  - Computes publicOrderable flag for informational purposes only; never writes to DB.
 *
 * @param {Buffer} buffer    - Raw file buffer (from multer memoryStorage)
 * @param {string} _filename - Original filename (reserved for future dispatch)
 * @returns {{ rows, detectedColumns, missingColumns, sheetUsed }}
 */
function parseInventoryBuffer(buffer, _filename) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const { sheet, sheetName } = findImportSheet(workbook);

  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  if (!rawData || rawData.length === 0) {
    return {
      rows: [],
      detectedColumns: [],
      missingColumns: ['Action', 'Item Description', 'Inventory Status', 'Quantity'],
      sheetUsed: sheetName,
    };
  }

  // Detect header row (supports template-warning rows before the real header)
  const headerRowIndex = detectHeaderRowIndex(rawData);
  const headerRow      = rawData[headerRowIndex].map(h => (h !== null ? String(h).trim() : ''));
  const detectedColumns = headerRow.filter(h => h !== '');

  // Build column index map (canonical field → column index in this workbook)
  const columnIndex = {};
  headerRow.forEach((h, idx) => {
    const canonical = HEADER_MAP[h.toLowerCase()];
    if (canonical && !(canonical in columnIndex)) {
      columnIndex[canonical] = idx;
    }
  });

  // Report any required fields whose columns are absent from the header
  const requiredFields = {
    action:          'Action',
    itemDescription: 'Item Description',
    quantity:        'Quantity',
    inventoryStatus: 'Inventory Status',
  };
  const missingColumns = Object.entries(requiredFields)
    .filter(([canonical]) => !(canonical in columnIndex))
    .map(([, displayName]) => displayName);

  // ---------------------------------------------------------------------------
  // Row parsing
  // ---------------------------------------------------------------------------
  const rows = [];

  for (let i = headerRowIndex + 1; i < rawData.length; i++) {
    const rawRow = rawData[i];

    // Skip completely blank rows
    if (!rawRow || rawRow.every(v => v === null || v === undefined || String(v).trim() === '')) {
      continue;
    }

    const getCell = (canonical) => {
      const idx = columnIndex[canonical];
      if (idx === undefined) return null;
      const v = rawRow[idx];
      return v !== null && v !== undefined ? String(v).trim() : null;
    };

    const rawAction       = getCell('action');
    const action          = rawAction ? rawAction.toUpperCase() : null;
    const existingId      = getCell('existingArtworkId') || null;
    const sku             = getCell('sku')               || null;
    const itemDescription = getCell('itemDescription')   || null;
    const category        = getCell('category')          || null;
    const rawArtCode      = getCell('artWorkCode');
    const artWorkCode     = rawArtCode ? rawArtCode.toUpperCase() : null;
    const dimensions      = getCell('dimensions')        || null;
    const sizeLabel       = getCell('sizeLabel')         || null;
    const materials       = getCell('materials')         || null;
    const rawStatus       = getCell('inventoryStatus');
    const inventoryStatus = rawStatus ? rawStatus.toUpperCase() : null;
    const rawShow         = getCell('showOnWebsite');
    const showOnWebsite   = parseBool(rawShow);
    const rawPoR          = getCell('priceOnRequest');
    const priceOnRequest  = parseBool(rawPoR) === true;
    const rawPriceInr     = getCell('priceInr');
    const rawPriceUsd     = getCell('priceUsd');
    const rawFeatured     = getCell('featured');
    const featured        = parseBool(rawFeatured);
    const rawOwnerReview  = getCell('ownerReviewNeeded');
    const ownerReviewNeeded = parseBool(rawOwnerReview);
    const rawImageFilename  = getCell('imageFilename');
    const notes           = getCell('notes') || null;

    const errors   = [];
    const warnings = [];
    let   isReview = false;

    // --- Action validation ---
    if (!action) {
      errors.push('Missing Action (must be CREATE, UPDATE, or NO_CHANGE)');
    } else if (!ALLOWED_ACTIONS.has(action)) {
      errors.push(`Invalid Action "${rawAction}" — must be CREATE, UPDATE, or NO_CHANGE`);
    }

    // NO_CHANGE: informational only — skip without adding to output rows
    if (action === 'NO_CHANGE') continue;

    // --- Item Description ---
    if (!itemDescription) {
      errors.push('Missing Item Description');
    }

    // --- Action-specific validation ---
    if (action === 'CREATE') {
      if (existingId) {
        isReview = true;
        warnings.push(
          `CREATE row has a value in Existing Artwork ID ("${existingId}") — this field should be blank for CREATE rows`
        );
      }
      if (sku) {
        isReview = true;
        warnings.push(
          `CREATE row has SKU "${sku}" — SKU should be blank for CREATE rows (app generates it on first admin save when public/orderable)`
        );
      }
    } else if (action === 'UPDATE') {
      if (!existingId) {
        errors.push('UPDATE row is missing Existing Artwork ID — required to identify which artwork to update');
      }
    }

    // --- Quantity ---
    let quantity = null;
    const rawQty = getCell('quantity');
    if (!rawQty) {
      errors.push('Missing Quantity');
    } else {
      const parsed = Number(rawQty);
      if (!Number.isInteger(parsed) || parsed < 0) {
        errors.push(`Quantity must be a non-negative integer (got: ${rawQty})`);
      } else {
        quantity = parsed;
      }
    }

    // --- Inventory Status ---
    if (!inventoryStatus) {
      errors.push('Missing Inventory Status');
    } else if (!ALLOWED_STATUSES.has(inventoryStatus)) {
      errors.push(
        `Invalid Inventory Status "${rawStatus}" — must be one of: ${[...ALLOWED_STATUSES].join(', ')}`
      );
    }

    // --- show_on_website ---
    if (rawShow !== null && showOnWebsite === null) {
      warnings.push(`show_on_website value "${rawShow}" is not recognised — expected TRUE or FALSE`);
    }

    // --- Category ---
    if (category) {
      const slug = category.toLowerCase();
      if (!KNOWN_CATEGORY_SLUGS.has(slug)) {
        warnings.push(
          `Category "${category}" is not in the approved list — verify slug matches production categories`
        );
      }
    }

    // --- ArtCode ---
    if (artWorkCode && !KNOWN_ARTWORK_CODES.has(artWorkCode)) {
      warnings.push(
        `ArtCode "${artWorkCode}" is not a known code — verify against production rules (see skuUtils.js ARTCODE_MAP)`
      );
    }

    // --- Price ---
    let priceInr = null;
    if (priceOnRequest) {
      // Artwork-level Price on Request — blank Price INR is acceptable
      if (rawPriceInr) {
        warnings.push(
          `Price on Request is TRUE but Price INR is also set (${rawPriceInr}) — Price INR will be ignored`
        );
      }
      // Size-level PoR is not supported
      if (sizeLabel) {
        errors.push(
          `Size-level Price on Request is not supported (Size Label: "${sizeLabel}"). ` +
          'Price INR must be a numeric value for size-based artworks. ' +
          'Size-level Price on Request is deferred to INV-PRICE-01.'
        );
      }
    } else {
      if (!rawPriceInr) {
        errors.push('Missing Price INR — required when Price on Request is not TRUE');
      } else {
        const parsed = parseFloat(rawPriceInr);
        if (isNaN(parsed) || parsed < 0) {
          errors.push(`Price INR must be a non-negative number (got: ${rawPriceInr})`);
        } else {
          priceInr = parsed;
        }
      }
    }

    const priceUsd = rawPriceUsd ? (parseFloat(rawPriceUsd) || null) : null;

    // --- Image filename ---
    let imageFilename = null;
    if (rawImageFilename) {
      const trimmed = rawImageFilename.trim();
      if (
        trimmed.includes('/')  ||
        trimmed.includes('\\') ||
        trimmed.includes('..')  ||
        trimmed.includes('\0')
      ) {
        errors.push(
          `Image filename "${trimmed}" must be a plain filename with no folder path ` +
          '(e.g. "artwork.jpg" not "folder/artwork.jpg").'
        );
      } else if (trimmed) {
        imageFilename = trimmed;
      }
    }

    // --- Compute public/orderable flag (informational only — no SKU generation, no DB write) ---
    const publicOrderable = (inventoryStatus && showOnWebsite !== null)
      ? isPublicOrderable(inventoryStatus, showOnWebsite)
      : null;

    rows.push({
      rowNumber: i + 1,          // Excel row number (1-indexed; row 1 is always the first spreadsheet row)
      action,
      existingArtworkId: existingId,
      sku,                        // reference only — never generated or overwritten by parser
      itemDescription,
      category,
      artWorkCode,
      dimensions,
      sizeLabel,
      materials,
      inventoryStatus,
      showOnWebsite,
      quantity,
      priceInr,
      priceUsd,                   // reference only
      priceOnRequest,
      featured,
      ownerReviewNeeded,
      imageFilename,
      notes,
      publicOrderable,
      errors,
      warnings,
      isReview,
    });
  }

  return { rows, detectedColumns, missingColumns, sheetUsed: sheetName };
}

module.exports = { parseInventoryBuffer, ARTWORK_CATEGORY_MAP };
