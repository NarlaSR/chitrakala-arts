# INV-01: Inventory Sync — Preview Endpoint

**Status:** Implemented (read-only preview only)  
**Branch:** `feature/inventory-sync-preview`

---

## Endpoint

```
POST /api/admin/inventory-sync/preview
```

- **Auth required:** Yes — `Authorization: Bearer <token>`
- **Content type:** `multipart/form-data`
- **Upload field name:** `file`
- **Accepted file types:** `.xlsx`, `.xls`
- **Maximum file size:** 10 MB
- **DB writes:** None — this endpoint is strictly read-only

---

## Expected Spreadsheet Columns

The parser matches columns by header name (case-insensitive, whitespace-trimmed), not by position.

| Column header      | Required | Notes |
|--------------------|----------|-------|
| Item description   | Yes      | Row identifier |
| Quantity           | Yes      | Must be a positive integer |
| Price per unit     | Yes      | INR value, must be > 0 |
| Art Work           | Yes      | Uppercased; unknown codes produce a warning |
| Size               | Yes      | Uppercased; unknown codes produce a warning |
| Year               | Yes      | 4-digit year |
| SKU                | No       | Auto-generated in preview if blank |
| Total              | No       | Parsed for reference only — never used for pricing |

**Known Art Work codes:** `DM`, `LA`, `MM`, `WA`, `TA`, `MW`  
**Known Size codes:** `SM`, `MD`, `LG`, `XL`

Unknown codes are not hard errors — they produce row-level warnings pending business confirmation.

---

## SKU Auto-Generation

If a row's SKU cell is blank, the preview generates one using:

```
CKS-[ArtWork]-[Size]-[Year]-[NNNN]
```

Example: `CKS-DM-LG-2026-0001`

The 4-digit counter restarts at `0001` for each unique Art Work code within the same upload batch. The generated SKU is only a preview — it is not written to the database.

---

## Sample `curl` Command

```bash
# 1. Obtain a token
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<password>"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# 2. Upload the inventory sheet
curl -X POST http://localhost:5000/api/admin/inventory-sync/preview \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@shipmentDetails_20260624.xlsx"
```

---

## Response Shape

```jsonc
{
  "summary": {
    "totalRows": 12,        // data rows parsed (blanks and totals excluded)
    "createCount": 9,       // CREATE or CREATE_CANDIDATE rows
    "updateCount": 0,       // UPDATE rows (0 until sku column exists in DB)
    "reviewCount": 2,       // REVIEW rows (valid but have warnings)
    "errorCount": 1         // ERROR rows (validation failures)
  },
  "rows": [
    {
      "rowNumber": 2,                  // Excel row number (1 = header)
      "itemDescription": "Dot Mandala Large 2026",
      "quantity": 5,
      "priceInr": 4500,
      "sku": "CKS-DM-LG-2026-0001",   // auto-generated if blank in sheet
      "skuGenerated": true,
      "artWorkCode": "DM",
      "sizeCode": "LG",
      "year": 2026,
      "originalTotal": 22500,          // from sheet, reference only
      "errors": [],
      "warnings": [],
      "classification": "CREATE_CANDIDATE"
    },
    {
      "rowNumber": 5,
      "itemDescription": "Unknown Art Form Medium",
      "quantity": 3,
      "priceInr": 3200,
      "sku": "CKS-XX-MD-2026-0001",
      "skuGenerated": true,
      "artWorkCode": "XX",
      "sizeCode": "MD",
      "year": 2026,
      "originalTotal": 9600,
      "errors": [],
      "warnings": ["Unknown Art Work code \"XX\" — business confirmation needed"],
      "classification": "REVIEW"
    },
    {
      "rowNumber": 8,
      "itemDescription": null,
      "quantity": null,
      "priceInr": null,
      "sku": null,
      "skuGenerated": false,
      "artWorkCode": "LA",
      "sizeCode": "SM",
      "year": 2026,
      "originalTotal": null,
      "errors": ["Missing Item description", "Missing Quantity", "Missing Price per unit"],
      "warnings": [],
      "classification": "ERROR"
    }
  ],
  "warnings": [
    "artworks table has no sku column — CREATE/UPDATE classification is not yet available. Valid rows are classified as CREATE_CANDIDATE. See docs/inventory-sync/INV-01-preview-endpoint.md for the recommended schema migration."
  ],
  "detectedColumns": ["Item description", "Quantity", "Price per unit", "Total", "SKU", "Art Work", "Size", "Year"],
  "missingColumns": []
}
```

### Row classification values

| Value | Meaning |
|-------|---------|
| `CREATE_CANDIDATE` | Valid row, no warnings. Used when `sku` column does not yet exist in DB. |
| `CREATE` | Valid row, SKU not found in DB (available once `sku` column exists). |
| `UPDATE` | Valid row, SKU already exists in DB (available once `sku` column exists). |
| `REVIEW` | Valid row but has warnings (unknown Art Work or Size code). |
| `ERROR` | Row has validation errors — will not be imported. |

---

## Schema Gaps

The `artworks` table is currently missing columns needed for full inventory sync. These must be added in the next ticket before implementing the apply/import endpoint.

**Recommended migration (do not run yet):**

```sql
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS sku VARCHAR(100) UNIQUE;
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;
ALTER TABLE artworks ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'IN_STOCK';
CREATE INDEX IF NOT EXISTS idx_artworks_sku ON artworks(sku);
```

Once the migration is applied, the preview endpoint will automatically:
- Query `artworks WHERE sku = ANY(...)` to detect existing records
- Reclassify rows as `CREATE` or `UPDATE` instead of `CREATE_CANDIDATE`

---

## What Is Out of Scope (this ticket)

- `POST /api/admin/inventory-sync/apply` — import endpoint not implemented
- Any database inserts or updates
- Schema migrations
- CSV file support (`.csv`) — marked TODO in `server/inventoryParser.js`
- Admin dashboard UI
- USD price calculation from spreadsheet values
- Shipments table, invoice generation, PDF export
- Art Work code → DB category mapping (needs business confirmation)
