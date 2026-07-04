-- ISYNC-13 Phase 3: Production pricing baseline correction
-- Corrects stale usd_multiplier from 1.75 to 2.25
-- No artwork prices are recalculated. No other values are changed.
-- Guard: AND value = '1.75' makes this a no-op if already corrected.

UPDATE pricing_settings
SET value = '2.25',
    updated_at = CURRENT_TIMESTAMP
WHERE key = 'usd_multiplier'
  AND value = '1.75';
