CREATE TABLE artwork_sizes (
    id SERIAL PRIMARY KEY,
    artwork_id VARCHAR(50) REFERENCES artworks(id) ON DELETE CASCADE,
    size_label VARCHAR(100) NOT NULL,
    price NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Optional: Add an index for faster lookups
CREATE INDEX idx_artwork_sizes_artwork_id ON artwork_sizes(artwork_id);