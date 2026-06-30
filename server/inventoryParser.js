// TODO: add CSV support when csv-parse is installed

const XLSX = require('xlsx');
const path = require('path');

// Valid Art Work codes. MA = Mixed Art (replaces legacy MW going forward).
// MW is intentionally absent — workbooks containing MW will get a warning.
const KNOWN_ARTWORK_CODES = new Set(['DM', 'LA', 'MM', 'WA', 'TA', 'MA']);
const KNOWN_SIZE_CODES    = new Set(['SM', 'MD', 'LG', 'XL']);

// Maps Art Work code → categories.id in the database
const ARTWORK_CATEGORY_MAP = {
  'DM': 'dot-mandala',
  'LA': 'lippan-art',
  'MM': 'mirror-mosaic',
  'WA': 'warli-art',
  'TA': 'texture-art',
  'MA': 'mixed-art',
};

// Detects the old SKU format (e.g. CKS-DM-SM-2026-0001) so we can flag it as an error.
// New format is CKS-2026-DM-SM-00001.
const OLD_SKU_PATTERN = /^CKS-[A-Z]+-[A-Z]+-\d{4}-\d{4}$/i;

// Maps normalized (trimmed, lowercased) header text to a canonical field name.
const HEADER_MAP = {
  // Required fields
  'item description':              'itemDescription',
  'quantity':                      'quantity',
  'price per unit':                'priceInr',
  'total':                         'originalTotal',
  'sku':                           'sku',
  'art work':                      'artWorkCode',
  'artwork':                       'artWorkCode',
  'size':                          'sizeCode',
  'year':                          'year',
  // Optional fields added in INV-03A
  'long description':              'longDescription',
  'dimensions':                    'dimensions',
  'materials':                     'materials',
  'image file name':               'imageFilename',
  'image filename':                'imageFilename',
  'image file':                    'imageFilename',
  'image':                         'imageFilename',
  'public visibility / review status': 'reviewStatus',
  'public visibility':             'reviewStatus',
  'review status':                 'reviewStatus',
  'notes':                         'notes',
};

const REQUIRED_DISPLAY_NAMES = {
  itemDescription: 'Item description',
  quantity:        'Quantity',
  priceInr:        'Price per unit',
  artWorkCode:     'Art Work',
  sizeCode:        'Size',
  year:            'Year',
};

// SKU format: CKS-[Year]-[ArtWorkCode]-[SizeCode]-[NNNNN]
// Example: CKS-2026-DM-LG-00001
// Counter resets per Year+ArtWorkCode+SizeCode within the same upload batch.
function generateSku(year, artWorkCode, sizeCode, counter) {
  return `CKS-${year}-${artWorkCode}-${sizeCode}-${String(counter).padStart(5, '0')}`;
}

/**
 * Parse an inventory Excel buffer and return structured row objects.
 *
 * @param {Buffer} buffer       - Raw file buffer from multer memoryStorage
 * @param {string} _filename    - Original filename (reserved for future CSV dispatch)
 * @returns {{ rows, detectedColumns, missingColumns }}
 */
function parseInventoryBuffer(buffer, _filename) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Raw 2-D array; defval:null so empty cells are null, not undefined
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  if (!rawData || rawData.length === 0) {
    return {
      rows: [],
      detectedColumns: [],
      missingColumns: Object.values(REQUIRED_DISPLAY_NAMES),
    };
  }

  // --- Build column index map from header row ---
  const headerRow = rawData[0].map(h => (h !== null ? String(h).trim() : ''));
  const detectedColumns = headerRow.filter(h => h !== '');

  const columnIndex = {}; // canonical field → column index
  headerRow.forEach((h, idx) => {
    const canonical = HEADER_MAP[h.toLowerCase()];
    if (canonical && !(canonical in columnIndex)) {
      columnIndex[canonical] = idx;
    }
  });

  const missingColumns = Object.entries(REQUIRED_DISPLAY_NAMES)
    .filter(([canonical]) => !(canonical in columnIndex))
    .map(([, displayName]) => displayName);

  // --- Parse data rows ---
  // Counter resets per Year+ArtWorkCode+SizeCode within this upload batch.
  const skuCounters = {};
  const rows = [];

  for (let i = 1; i < rawData.length; i++) {
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

    const itemDescription = getCell('itemDescription');
    const rawQty          = getCell('quantity');
    const rawPrice        = getCell('priceInr');
    const rawTotal        = getCell('originalTotal');
    const rawSku          = getCell('sku');
    const rawArt          = getCell('artWorkCode');
    const rawSize         = getCell('sizeCode');
    const rawYear         = getCell('year');

    // Skip rows where all required inventory fields are absent
    // (e.g. a totals-only row: [null, null, null, 74100, null, null, null, null])
    if (!itemDescription && !rawQty && !rawPrice && !rawArt && !rawSize && !rawYear) {
      continue;
    }

    // Skip text-label summary rows ("Total", "Subtotal", "Grand Total")
    const descLower = (itemDescription || '').toLowerCase();
    if (descLower === 'total' || descLower === 'subtotal' || descLower === 'grand total') {
      continue;
    }

    const errors   = [];
    const warnings = [];

    // --- Validate required fields ---
    if (!itemDescription) {
      errors.push('Missing Item description');
    }

    let quantity = null;
    if (!rawQty) {
      errors.push('Missing Quantity');
    } else {
      const parsed = Number(rawQty);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        errors.push(`Quantity must be a positive integer (got: ${rawQty})`);
      } else {
        quantity = parsed;
      }
    }

    let priceInr = null;
    if (!rawPrice) {
      errors.push('Missing Price per unit');
    } else {
      const parsed = parseFloat(rawPrice);
      if (isNaN(parsed) || parsed <= 0) {
        errors.push(`Price per unit must be a positive number (got: ${rawPrice})`);
      } else {
        priceInr = parsed;
      }
    }

    const artWorkCode = rawArt ? rawArt.toUpperCase() : null;
    if (!artWorkCode) {
      errors.push('Missing Art Work code');
    } else if (!KNOWN_ARTWORK_CODES.has(artWorkCode)) {
      warnings.push(`Unknown Art Work code "${artWorkCode}" — business confirmation needed. If this was "MW", use "MA" for Mixed Art.`);
    }

    const sizeCode = rawSize ? rawSize.toUpperCase() : null;
    if (!sizeCode) {
      errors.push('Missing Size code');
    } else if (!KNOWN_SIZE_CODES.has(sizeCode)) {
      warnings.push(`Unknown Size code "${sizeCode}" — business confirmation needed`);
    }

    let year = null;
    if (!rawYear) {
      errors.push('Missing Year');
    } else {
      const parsed = parseInt(rawYear, 10);
      if (isNaN(parsed) || parsed < 1000 || parsed > 9999) {
        errors.push(`Year must be a 4-digit number (got: ${rawYear})`);
      } else {
        year = parsed;
      }
    }

    // --- SKU: validate explicit value or generate preview SKU ---
    let sku = rawSku || null;
    let skuGenerated = false;

    // Pattern used to extract counter from a new-format explicit SKU so the
    // auto-generator can reserve that slot and avoid collisions within the batch.
    const NEW_SKU_EXTRACT = /^CKS-(\d{4})-([A-Z]+)-([A-Z]+)-(\d{5})$/i;

    if (sku) {
      // Detect old-format SKUs like CKS-DM-SM-2026-0001 and flag as error.
      // New format is CKS-2026-DM-SM-00001.
      if (OLD_SKU_PATTERN.test(sku)) {
        errors.push(
          `Old SKU format detected (${sku}). Expected format: CKS-YYYY-CODE-SIZE-00001. ` +
          'Please update the workbook to use the new SKU format before importing.'
        );
      } else {
        // Valid new-format explicit SKU: reserve its counter slot so auto-generated
        // SKUs in the same batch don't collide with it.
        const m = sku.toUpperCase().match(NEW_SKU_EXTRACT);
        if (m) {
          const key = `${m[1]}-${m[2]}-${m[3]}`;
          const n   = parseInt(m[4], 10);
          if ((skuCounters[key] || 1) <= n) {
            skuCounters[key] = n + 1;
          }
        }
      }
    } else if (errors.length === 0 && artWorkCode && sizeCode && year) {
      // Only auto-generate if no errors and all SKU components are valid.
      const counterKey = `${year}-${artWorkCode}-${sizeCode}`;
      if (!skuCounters[counterKey]) skuCounters[counterKey] = 1;
      sku = generateSku(year, artWorkCode, sizeCode, skuCounters[counterKey]++);
      skuGenerated = true;
    }

    // originalTotal is stored for reference only — never used for pricing
    const originalTotal = rawTotal !== null ? (parseFloat(rawTotal) || null) : null;

    // Optional fields (no errors if absent)
    const longDescription = getCell('longDescription') || null;
    const dimensions      = getCell('dimensions')      || null;
    const materials       = getCell('materials')       || null;
    const reviewStatus    = getCell('reviewStatus')    || null;
    const notes           = getCell('notes')           || null;

    // Image filename: must be a plain filename with no directory path.
    // Values containing '/', '\', '..', or null bytes are rejected as errors so
    // the admin fixes the workbook before importing (not silently normalised).
    let imageFilename = null;
    const rawImageFilename = getCell('imageFilename');
    if (rawImageFilename) {
      const trimmed = rawImageFilename.trim();
      if (
        trimmed.includes('/') ||
        trimmed.includes('\\') ||
        trimmed.includes('..') ||
        trimmed.includes('\0')
      ) {
        errors.push(
          `Image filename "${trimmed}" must be a plain filename with no folder path ` +
          `(e.g. use "artwork.jpg" not "folder/artwork.jpg" or "../artwork.jpg"). ` +
          `Remove the directory prefix from the workbook cell.`
        );
      } else if (trimmed) {
        imageFilename = trimmed;
      }
    }

    // plannedStatus reflects what status the row would receive on import.
    // Valid rows always land as NEEDS_REVIEW — admin must approve before public visibility.
    const plannedStatus = errors.length === 0 ? 'NEEDS_REVIEW' : null;

    rows.push({
      rowNumber: i + 1, // Excel row number (1-indexed, row 1 = header)
      itemDescription: itemDescription || null,
      quantity,
      priceInr,
      sku,
      skuGenerated,
      artWorkCode,
      sizeCode,
      year,
      originalTotal,
      longDescription,
      dimensions,
      materials,
      imageFilename,
      reviewStatus,
      notes,
      plannedStatus,
      errors,
      warnings,
    });
  }

  return { rows, detectedColumns, missingColumns };
}

module.exports = { parseInventoryBuffer, ARTWORK_CATEGORY_MAP };
