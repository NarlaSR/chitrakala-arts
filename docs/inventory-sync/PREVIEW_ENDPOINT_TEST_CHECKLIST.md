# Inventory Sync Preview Endpoint Manual Test Checklist

This file documents manual validation steps for the Phase 1 inventory sync preview endpoint.

## Endpoint

`POST /api/admin/inventory-sync/preview`

## Requirements

- Admin JWT auth required
- Accepts `multipart/form-data` upload
- Uses file field name `file`
- Parses `Inventory_Master` worksheet only
- Supports only `NO_CHANGE`, `UPDATE`, and `REVIEW`
- Blocks `CREATE` and `ARCHIVE`
- Does not write to the database

## Manual Test Steps

1. Start the backend server

```powershell
cd c:\Development\Projects\chitrakala-arts\server
npm start
```

2. Obtain an admin JWT token

- Use the existing admin login endpoint: `POST /api/auth/login`
- Send credentials from your environment or default env setup

Example request body:

```json
{
  "username": "admin",
  "password": "admin123"
}
```

3. Test valid cleaned workbook upload

- Upload `docs/inventory-sync/Chitrakala_Inventory_Sync_v2_ReadyForCodingAgent_Cleaned.xlsx`
- Use `Authorization: Bearer <token>` header

Example `curl`:

```bash
curl -X POST http://localhost:5000/api/admin/inventory-sync/preview \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@docs/inventory-sync/Chitrakala_Inventory_Sync_v2_ReadyForCodingAgent_Cleaned.xlsx"
```

Expected behavior:
- Response JSON contains `summary`, `updates`, `reviewRows`, `blockedRows`, and `warnings`
- `summary.totalRows` matches worksheet row count excluding blank rows
- `summary.toUpdate`, `summary.reviewOnly`, and `summary.noChange` reflect workbook actions
- No database changes are made

4. Test missing worksheet

- Upload a workbook without `Inventory_Master`
- Expect HTTP 400 and error message: `Required worksheet 'Inventory_Master' not found`

5. Test missing required header

- Upload workbook with a missing `Inventory_Master` header
- Expect HTTP 400 and missing header error list

6. Test invalid Sync Action

- Use workbook row with `Sync Action` set to `INVALID`
- Expect row-level error in `blockedRows`

7. Test `UPDATE` row with no supported corrected fields

- Use workbook row with `Sync Action` = `UPDATE` and no supported `Corrected_*` values
- Expect row-level error: `UPDATE rows must contain at least one supported corrected field`

8. Test `NO_CHANGE` with corrected values populated

- Use workbook row with `Sync Action` = `NO_CHANGE` and any supported `Corrected_*` values
- Expect a warning that corrected fields are populated

9. Test invalid category slug

- Use workbook row with `Corrected category_slug` set to a nonexistent category ID
- Expect warning on that row and blocked/validation behavior as appropriate

10. Test invalid price

- Use workbook row with `Corrected price_inr` = `-10` or `abc`
- Expect warning: `Corrected price_inr must be numeric and greater than 0`

11. Test invalid featured value

- Use workbook row with `Corrected featured` = `maybe`
- Expect warning: `Corrected featured must be TRUE, FALSE, 1, 0, yes, or no`

12. Test stale workbook data detection

- Modify workbook DB fields (e.g. `DB title`) to differ from live DB
- Expect `staleData` entries in the row result and warning: `Workbook data is stale compared to live DB`

13. Test blocked `CREATE` and `ARCHIVE`

- Use workbook rows with `Sync Action` = `CREATE` or `ARCHIVE`
- Expect those rows to appear in `blockedRows` with clear messages

## Notes

- The endpoint should never call any database write methods.
- Prices in preview should recompute `price_usd` using backend pricing logic when `Corrected price_inr` is supplied.
- `Corrected image` should not be applied; it should generate a warning only.
