const XLSX = require('xlsx');
const { calculateUsdPrice } = require('./priceUtils');

const REQUIRED_HEADERS = [
  'Sync Action',
  'DB id',
  'DB title',
  'DB category_slug',
  'DB description',
  'DB materials',
  'DB price_inr',
  'DB price_usd',
  'DB fx_rate_used',
  'DB multiplier_used',
  'DB featured',
  'DB image',
  'Corrected title',
  'Corrected category_slug',
  'Corrected description',
  'Corrected materials',
  'Corrected price_inr',
  'Corrected featured',
  'Corrected image'
];

const SUPPORTED_SYNC_ACTIONS = ['NO_CHANGE', 'UPDATE', 'REVIEW', 'CREATE', 'ARCHIVE'];
const SUPPORTED_UPDATE_FIELDS = [
  'Corrected title',
  'Corrected category_slug',
  'Corrected description',
  'Corrected materials',
  'Corrected price_inr',
  'Corrected featured'
];
const SUPPORTED_BOOLEAN_TRUE = new Set(['TRUE', 'true', '1', 'YES', 'Yes', 'yes', 'Y', 'y', 'T', 't', 1, true]);
const SUPPORTED_BOOLEAN_FALSE = new Set(['FALSE', 'false', '0', 'NO', 'No', 'no', 'N', 'n', 'F', 'f', 0, false]);

function normalizeHeader(header) {
  if (header === undefined || header === null) return '';
  return String(header).trim();
}

function normalizeCell(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value.trim();
  return value;
}

function parseBooleanValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  const normalized = String(value).trim();
  if (SUPPORTED_BOOLEAN_TRUE.has(normalized)) return true;
  if (SUPPORTED_BOOLEAN_FALSE.has(normalized)) return false;
  return null;
}

function parseNumberValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function buildRowObject(headers, rowValues) {
  const row = {};
  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index];
    if (!header) continue;
    row[header] = normalizeCell(rowValues[index]);
  }
  return row;
}

function validateRequiredHeaders(headers) {
  const normalized = headers.map(normalizeHeader);
  const missing = REQUIRED_HEADERS.filter(required => {
    return !normalized.some(header => header.toLowerCase() === required.toLowerCase());
  });
  return missing;
}

function parseInventoryMasterWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  const sheetName = 'Inventory_Master';
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    return {
      errors: [`Required worksheet '${sheetName}' not found`],
      rows: []
    };
  }

  const rawRows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: null,
    raw: false
  });

  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return {
      errors: ['Inventory_Master worksheet is empty'],
      rows: []
    };
  }

  const headers = rawRows[0].map(normalizeHeader);
  const missingHeaders = validateRequiredHeaders(headers);
  if (missingHeaders.length > 0) {
    return {
      errors: [`Missing required headers: ${missingHeaders.join(', ')}`],
      rows: []
    };
  }

  const rows = rawRows.slice(1).map((rowValues, rowIndex) => {
    const rowNumber = rowIndex + 2;
    return {
      rowNumber,
      data: buildRowObject(headers, rowValues)
    };
  });

  return {
    errors: [],
    rows
  };
}

function isRowEmpty(rowData) {
  return Object.values(rowData).every(value => value === null || value === undefined || String(value).trim() === '');
}

function normalizeString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizePrice(value) {
  const parsed = parseNumberValue(value);
  return parsed === null ? null : parsed;
}

function isSupportedCorrectionValuePopulated(value) {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

function compareNormalized(valueA, valueB, type) {
  if (type === 'boolean') {
    return parseBooleanValue(valueA) === parseBooleanValue(valueB);
  }
  if (type === 'number') {
    const a = parseNumberValue(valueA);
    const b = parseNumberValue(valueB);
    return a === b;
  }
  return normalizeString(valueA) === normalizeString(valueB);
}

function buildStaleComparison(workbookValue, liveValue, field, type = 'string') {
  const differs = !compareNormalized(workbookValue, liveValue, type);
  if (!differs) return null;
  return {
    type: 'STALE_WORKBOOK_DATA',
    field,
    workbookValue: workbookValue === null || workbookValue === undefined ? null : workbookValue,
    liveDbValue: liveValue === null || liveValue === undefined ? null : liveValue
  };
}

function buildSupportedUpdates(rowData, liveArtwork, categoriesById, pricingSettings) {
  const changes = [];
  const warnings = [];
  let hasSupportedField = false;

  const correctedTitle = normalizeString(rowData['Corrected title']);
  if (correctedTitle !== '') {
    hasSupportedField = true;
    if (!compareNormalized(correctedTitle, liveArtwork.title, 'string')) {
      changes.push({ field: 'title', from: liveArtwork.title || '', to: correctedTitle });
    }
  }

  const correctedCategory = normalizeString(rowData['Corrected category_slug']);
  if (correctedCategory !== '') {
    hasSupportedField = true;
    if (!categoriesById.has(correctedCategory)) {
      warnings.push({ field: 'Corrected category_slug', message: `Category slug '${correctedCategory}' not found in live categories` });
    } else if (!compareNormalized(correctedCategory, liveArtwork.category, 'string')) {
      changes.push({ field: 'category', from: liveArtwork.category || '', to: correctedCategory });
    }
  }

  const correctedDescription = normalizeString(rowData['Corrected description']);
  if (correctedDescription !== '') {
    hasSupportedField = true;
    if (!compareNormalized(correctedDescription, liveArtwork.description, 'string')) {
      changes.push({ field: 'description', from: liveArtwork.description || '', to: correctedDescription });
    }
  }

  const correctedMaterials = normalizeString(rowData['Corrected materials']);
  if (correctedMaterials !== '') {
    hasSupportedField = true;
    if (!compareNormalized(correctedMaterials, liveArtwork.materials, 'string')) {
      changes.push({ field: 'materials', from: liveArtwork.materials || '', to: correctedMaterials });
    }
  }

  const correctedPriceInrValue = rowData['Corrected price_inr'];
  const correctedPriceInr = normalizePrice(correctedPriceInrValue);
  if (correctedPriceInrValue !== null && correctedPriceInrValue !== undefined && correctedPriceInrValue !== '') {
    hasSupportedField = true;
    if (correctedPriceInr === null || correctedPriceInr <= 0) {
      warnings.push({ field: 'Corrected price_inr', message: 'Corrected price_inr must be numeric and greater than 0' });
    } else {
      if (!compareNormalized(correctedPriceInr, liveArtwork.price_inr, 'number')) {
        changes.push({ field: 'price_inr', from: liveArtwork.price_inr || 0, to: correctedPriceInr });
        warnings.push({
          field: 'price_inr',
          message: 'USD price is recalculated by the backend and will be handled in a future commit phase.'
        });
      }
    }
  }

  const correctedFeaturedValue = rowData['Corrected featured'];
  if (correctedFeaturedValue !== null && correctedFeaturedValue !== undefined && correctedFeaturedValue !== '') {
    hasSupportedField = true;
    const parsedFeatured = parseBooleanValue(correctedFeaturedValue);
    if (parsedFeatured === null) {
      warnings.push({ field: 'Corrected featured', message: 'Corrected featured must be TRUE, FALSE, 1, 0, yes, or no' });
    } else if (!compareNormalized(parsedFeatured, liveArtwork.featured, 'boolean')) {
      changes.push({ field: 'featured', from: liveArtwork.featured || false, to: parsedFeatured });
    }
  }

  const correctedImage = normalizeString(rowData['Corrected image']);
  if (correctedImage !== '') {
    warnings.push({ field: 'Corrected image', message: 'Corrected image is not applied in Phase 1 preview' });
  }

  return { changes, warnings, hasSupportedField };
}

function hasSupportedCorrections(rowData) {
  return SUPPORTED_UPDATE_FIELDS.some(field => isSupportedCorrectionValuePopulated(rowData[field]));
}

module.exports = {
  parseInventoryMasterWorkbook,
  isRowEmpty,
  buildStaleComparison,
  parseBooleanValue,
  parseNumberValue,
  normalizeString,
  normalizePrice,
  hasSupportedCorrections,
  REQUIRED_HEADERS,
  SUPPORTED_SYNC_ACTIONS,
  SUPPORTED_UPDATE_FIELDS,
  buildSupportedUpdates
};
