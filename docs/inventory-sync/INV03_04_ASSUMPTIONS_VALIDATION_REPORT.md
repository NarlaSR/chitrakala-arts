# INV-03-04 Assumptions Validation Report

## Summary

INV-03-04 reviewed the current financial assumptions behind the inventory pricing model.

Result: **Analysis complete, but several assumptions require business-owner confirmation before the workbook can be considered fully pricing-final.**

Confirmed:

- Current active multiplier: **2.25**
- Previous multiplier `1.75` should be treated as outdated / historical.
- Current workbook/export baseline FX rate appears to be **92.40 INR/USD**.
- No database writes were performed.
- No backend code was changed.

Pending business confirmation:

- Whether to continue using FX rate `92.40` or update to a current live INR/USD rate.
- Invoice/purchase-price support for the 9 UPDATE rows.
- Customs cost assumption.
- Shipping cost assumption.
- Overhead cost assumption.
- Minimum acceptable margin floor.

## Workbook Assumptions Found

The current inventory/export data contains pricing-related values such as:

- `price_inr`
- `price_usd`
- `fx_rate_used`
- `multiplier_used`
- `Corrected price_inr`
- `Final price_inr`

Known workbook/export baseline:

- FX rate used: `92.40`
- Previously stored/exported multiplier values may reflect older assumptions.
- Current confirmed business multiplier for INV-03 onward: `2.25`

## FX Rate Validation

The workbook/export baseline FX rate is:

- `92.40 INR/USD`

Live FX was not independently confirmed in this run.

Recommendation:

- Business owner should confirm whether to continue using `92.40` or update to a current live INR/USD rate before any final pricing commit workflow is built.

## Multiplier Validation

Business owner confirmed:

- Current active pricing multiplier = `2.25`

Therefore:

- Use `2.25` for current pricing validation.
- Treat `1.75` as outdated / previous assumption.
- Any workbook/docs/UI references to `1.75` should be reviewed and updated or clearly marked historical.

## UPDATE Row Price Validation

The workbook has 9 UPDATE rows from prior validation.

INV-03-02 already confirmed:

- All 9 UPDATE rows have at least one supported `Corrected_*` field populated.
- `Corrected_price_inr` is populated only where expected.
- `Corrected_price_inr` is numeric and greater than 0.
- `Corrected_image` is blank.
- No unsupported Phase 1 fields are used in update changes.
- Preview endpoint returns 9 update candidates.

Invoice/purchase-price support was not found in the workbook data reviewed.

Therefore, invoice validation status is:

- **Needs business confirmation**

## Customs / Shipping / Overhead Inputs

No confirmed customs, shipping, or overhead cost inputs were found in the reviewed workbook data.

Status:

- Customs assumption: **Needs business input**
- Shipping assumption: **Needs business input**
- Overhead assumption: **Needs business input**

Recommendation:

- Define these assumptions before building any final commit/pricing workflow.

## Margin Floor Review

A defensible margin floor was not found in the reviewed workbook data.

Status:

- Margin-floor validation is **blocked pending business owner definition of minimum acceptable margin**.

Recommendation:

- Define a minimum acceptable margin floor before automated pricing changes are committed to DB.

## Business Owner Decisions Needed

- Confirm whether to continue using FX rate `92.40` or update to current live INR/USD rate.
- Confirm invoice/purchase-price support for the 9 UPDATE rows.
- Confirm customs cost assumption.
- Confirm shipping cost assumption.
- Confirm overhead cost assumption.
- Define minimum acceptable margin floor.
- Confirm workbook/docs/UI references to `1.75` should be updated to `2.25` or marked historical.

## Conclusion

INV-03-04 is complete from an analysis/reporting perspective.

However, final pricing assumptions are not fully business-final until the following are confirmed:

- FX rate
- invoice/purchase costs
- customs/shipping/overhead inputs
- margin floor

No workbook values were modified.
No database writes were performed.
No backend code was changed.
