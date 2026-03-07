-- Migration: Add currency pricing columns to artworks table
-- JIRA: CKA-14
-- Date: 2026-03-07

-- Add currency pricing columns to artworks table
ALTER TABLE artworks 
ADD COLUMN IF NOT EXISTS price_inr NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS price_usd NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS fx_rate_used NUMERIC(10,4),
ADD COLUMN IF NOT EXISTS multiplier_used NUMERIC(10,4);

-- Update existing artworks to set price_inr from existing price column
-- Assuming existing price is in INR
UPDATE artworks 
SET price_inr = price 
WHERE price_inr IS NULL AND price IS NOT NULL;

-- Add updated_at column if it doesn't exist
ALTER TABLE artworks 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create pricing_settings table for currency configuration
CREATE TABLE IF NOT EXISTS pricing_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default FX rate and USD multiplier
INSERT INTO pricing_settings (key, value) 
VALUES 
    ('fx_rate', '83'),
    ('usd_multiplier', '1.75')
ON CONFLICT (key) DO NOTHING;

-- Add comments for documentation
COMMENT ON COLUMN artworks.price_inr IS 'Base price in INR (Indian Rupees)';
COMMENT ON COLUMN artworks.price_usd IS 'Calculated price in USD (US Dollars)';
COMMENT ON COLUMN artworks.fx_rate_used IS 'Exchange rate used for USD calculation';
COMMENT ON COLUMN artworks.multiplier_used IS 'Multiplier used for USD calculation';
COMMENT ON TABLE pricing_settings IS 'Pricing configuration settings (FX rate, multipliers)';
