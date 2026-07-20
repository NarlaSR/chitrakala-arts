const { pool }  = require('./db');
const { calculateUsdPrice } = require('./priceUtils');

// User functions
async function getUsers() {
  const result = await pool.query('SELECT * FROM users');
  return result.rows;
}

async function getUserByUsername(username) {
  const result = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username]);
  return result.rows[0];
}

async function createUser(id, username, password, role) {
  await pool.query(
    'INSERT INTO users (id, username, password, role) VALUES ($1, $2, $3, $4)',
    [id, username, password, role]
  );
}

// Category functions
async function getCategories() {
  const result = await pool.query('SELECT * FROM categories ORDER BY display_order ASC, name ASC');
  return result.rows;
}

// Returns only categories that have at least one public artwork
// (status IN_STOCK or MADE_TO_ORDER, show_on_website = true).
async function getPublicCategories() {
  const result = await pool.query(`
    SELECT DISTINCT c.*
    FROM categories c
    INNER JOIN artworks a ON a.category = c.id
    WHERE a.status IN ('IN_STOCK', 'MADE_TO_ORDER')
      AND a.show_on_website = true
    ORDER BY c.display_order ASC, c.name ASC
  `);
  return result.rows;
}

async function getCategoryById(id) {
  const result = await pool.query('SELECT * FROM categories WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function createCategory({ id, name, description, display_order, image }) {
  const result = await pool.query(
    `INSERT INTO categories (id, name, description, display_order, image)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [id, name, description || null, display_order || 0, image || null]
  );
  return result.rows[0];
}

async function updateCategory(id, { name, description, display_order, image }) {
  const result = await pool.query(
    `UPDATE categories
     SET name = $2, description = $3, display_order = $4, image = $5
     WHERE id = $1
     RETURNING *`,
    [id, name, description || null, display_order || 0, image || null]
  );
  return result.rows[0] || null;
}

async function deleteCategory(id) {
  // Prevent deletion if artworks reference this category
  const artworkCount = await pool.query(
    'SELECT COUNT(*) FROM artworks WHERE category = $1',
    [id]
  );
  if (parseInt(artworkCount.rows[0].count, 10) > 0) {
    const err = new Error('Cannot delete category — artworks are assigned to it');
    err.code = 'CATEGORY_IN_USE';
    throw err;
  }
  await pool.query('DELETE FROM categories WHERE id = $1', [id]);
}

// Artwork functions
// Artwork sizes functions
async function addArtworkSizes(artworkId, sizesArray) {
  if (!sizesArray || !Array.isArray(sizesArray) || sizesArray.length === 0) return;
  // Map sizes to correct format: {size_label, price}
  const mapped = sizesArray.map(s => ({
    size_label: s.size_label || s.size || '',
    price: s.price
  })).filter(s => s.size_label && s.price !== undefined && s.price !== null && s.price !== '');
  if (mapped.length === 0) return;
  const values = mapped.map(s => `('${artworkId}', '${s.size_label.replace(/'/g, "''")}', ${s.price})`).join(',');
  const query = `INSERT INTO artwork_sizes (artwork_id, size_label, price) VALUES ${values}`;
  await pool.query(query);
}

// `id` is included (not just size_label/price) so callers — including the
// public artwork API — can reference a specific size row as
// order_request_items.artwork_size_id (ORD-02).
async function getArtworkSizes(artworkId) {
  const result = await pool.query('SELECT id, size_label, price FROM artwork_sizes WHERE artwork_id = $1 ORDER BY price ASC', [artworkId]);
  return result.rows;
}

async function deleteArtworkSizes(artworkId) {
  await pool.query('DELETE FROM artwork_sizes WHERE artwork_id = $1', [artworkId]);
}

async function updateArtworkSizes(artworkId, sizesArray) {
  await deleteArtworkSizes(artworkId);
  await addArtworkSizes(artworkId, sizesArray);
}
// Shared enrichment: fetch sizes, calculate USD prices, normalise image URL.
async function enrichArtworkRows(rows) {
  const pricingSettings = await getPricingSettings();
  const fxRate     = parseFloat(pricingSettings.fx_rate       || 83);
  const multiplier = parseFloat(pricingSettings.usd_multiplier || 1.75);
  return Promise.all(rows.map(async (artwork) => {
    const artFxRate     = artwork.fx_rate_used    ? parseFloat(artwork.fx_rate_used)    : fxRate;
    const artMultiplier = artwork.multiplier_used ? parseFloat(artwork.multiplier_used) : multiplier;
    artwork.sizes = await getArtworkSizes(artwork.id);
    artwork.sizes = artwork.sizes.map(size => ({
      ...size,
      price_usd: calculateUsdPrice(size.price, artFxRate, artMultiplier),
    }));
    if (artwork.image && /^https?:\/\//.test(artwork.image)) {
      // already an absolute URL — leave as-is
    } else if (artwork.image_data) {
      // real stored image data exists — point at the serving endpoint
      artwork.image = `/api/images/artworks/${artwork.id}`;
    } else {
      // no real image data — don't fabricate a URL that will 404
      artwork.image = null;
    }
    if (!artwork.price_usd && artwork.price_inr) {
      artwork.price_usd = calculateUsdPrice(artwork.price_inr, artFxRate, artMultiplier);
    }
    return artwork;
  }));
}

// Public-facing: only artworks that are IN_STOCK or MADE_TO_ORDER AND enabled by admin.
async function getArtworks() {
  const result = await pool.query(
    "SELECT * FROM artworks WHERE status IN ('IN_STOCK', 'MADE_TO_ORDER') AND show_on_website = true ORDER BY created_at DESC"
  );
  return enrichArtworkRows(result.rows);
}

// Admin-facing: returns all artworks regardless of status.
async function getArtworksAdmin() {
  const result = await pool.query('SELECT * FROM artworks ORDER BY created_at DESC');
  return enrichArtworkRows(result.rows);
}

// publicOnly = true → returns null if the artwork is not publicly visible (used by public API).
// publicOnly = false (default) → returns any artwork by id (used by admin routes).
async function getArtworkById(id, publicOnly = false) {
  const query = publicOnly
    ? "SELECT * FROM artworks WHERE id = $1 AND status IN ('IN_STOCK', 'MADE_TO_ORDER') AND show_on_website = true"
    : 'SELECT * FROM artworks WHERE id = $1';
  const result = await pool.query(query, [id]);
  const artwork = result.rows[0];
  if (!artwork) return null;
  const [enriched] = await enrichArtworkRows([artwork]);
  return enriched;
}

async function createArtwork(artwork) {
  const result = await pool.query(
    `INSERT INTO artworks (id, title, category, price, price_inr, price_usd, fx_rate_used, multiplier_used, description, dimensions, materials, image, featured, status, show_on_website, sku)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, COALESCE($14, 'IN_STOCK'), COALESCE($15, false), $16)
     RETURNING *`,
    [artwork.id, artwork.title, artwork.category, artwork.price, artwork.price_inr, artwork.price_usd,
     artwork.fx_rate_used, artwork.multiplier_used, artwork.description,
     artwork.dimensions, artwork.materials, artwork.image, artwork.featured,
     artwork.status ?? null,
     artwork.show_on_website != null ? Boolean(artwork.show_on_website) : null,
     artwork.sku ?? null]
  );
  // Add sizes if provided
  if (artwork.sizes && Array.isArray(artwork.sizes)) {
    await addArtworkSizes(result.rows[0].id, artwork.sizes);
  }
  result.rows[0].sizes = await getArtworkSizes(result.rows[0].id);
  return result.rows[0];
}

async function updateArtwork(id, artwork) {
  const result = await pool.query(
    `UPDATE artworks
     SET title = $2, category = $3, price = $4, price_inr = $5, price_usd = $6,
         fx_rate_used = $7, multiplier_used = $8, description = $9,
         dimensions = $10, materials = $11, image = $12, featured = $13,
         status          = $14,
         quantity        = $15,
         sku             = $16,
         image_filename  = $17,
         notes           = $18,
         show_on_website = COALESCE($19, show_on_website),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [id, artwork.title, artwork.category, artwork.price, artwork.price_inr, artwork.price_usd,
     artwork.fx_rate_used, artwork.multiplier_used, artwork.description,
     artwork.dimensions, artwork.materials, artwork.image, artwork.featured,
     artwork.status         ?? null,
     artwork.quantity       ?? null,
     artwork.sku            ?? null,
     artwork.image_filename ?? null,
     artwork.notes          ?? null,
     artwork.show_on_website != null ? Boolean(artwork.show_on_website) : null]
  );
  if (artwork.sizes && Array.isArray(artwork.sizes)) {
    await updateArtworkSizes(id, artwork.sizes);
  }
  result.rows[0].sizes = await getArtworkSizes(id);
  return result.rows[0];
}

// Update only the status field — used by the admin review queue publish/archive actions.
async function updateArtworkStatus(id, status) {
  const ALLOWED = new Set(['NEEDS_REVIEW', 'IN_STOCK', 'MADE_TO_ORDER', 'OUT_OF_STOCK', 'SOLD', 'ARCHIVED']);
  if (!ALLOWED.has(status)) throw new Error(`Invalid status: ${status}`);
  const result = await pool.query(
    'UPDATE artworks SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
    [id, status]
  );
  return result.rows[0] || null;
}

// Assign a SKU to an artwork that has none. The WHERE sku IS NULL guard makes this a no-op
// if a SKU was already assigned concurrently, preventing accidental overwrites.
async function updateArtworkSku(id, sku) {
  const result = await pool.query(
    'UPDATE artworks SET sku = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND sku IS NULL RETURNING *',
    [id, sku]
  );
  return result.rows[0] || null;
}

async function deleteArtwork(id) {
  await pool.query('DELETE FROM artworks WHERE id = $1', [id]);
}

// ── Inventory import helpers ──────────────────────────────────────────────────

// Look up an artwork by SKU. Used by the apply endpoint to classify CREATE vs UPDATE.
async function getArtworkBySku(sku) {
  const result = await pool.query('SELECT id, sku, status FROM artworks WHERE sku = $1', [sku]);
  return result.rows[0] || null;
}

// Insert a new artwork row from an inventory import.
// `client` is a pg transaction client; pass pool to run outside a transaction.
async function createArtworkFromInventory(data, client) {
  const q = client || pool;
  const result = await q.query(
    `INSERT INTO artworks (
       id, title, category, price, price_inr, price_usd,
       fx_rate_used, multiplier_used, description, dimensions,
       materials, image, featured, sku, quantity, status,
       image_filename, notes, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10,
       $11, NULL, false, $12, $13, 'NEEDS_REVIEW',
       $14, $15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
     ) RETURNING id, title, sku, status`,
    [
      data.id, data.title, data.category,
      data.priceInr,          // price (legacy — same as priceInr)
      data.priceInr,          // price_inr
      data.priceUsd,          // price_usd
      data.fxRateUsed, data.multiplierUsed,
      data.description, data.dimensions,
      data.materials,
      data.sku, data.quantity,
      data.imageFilename, data.notes,
    ]
  );
  return result.rows[0];
}

// Patch an existing artwork by SKU from an inventory import.
// Only updates fields that are provided (non-null). Never changes sku, title, category, image, featured, status, id.
// `client` is a pg transaction client; pass pool to run outside a transaction.
async function updateArtworkFromInventory(sku, data, client) {
  const q      = client || pool;
  const params = [sku];

  // Always-updated fields
  params.push(data.quantity);      const qIdx       = params.length; // $2
  params.push(data.priceInr);      const priceIdx    = params.length; // $3
  params.push(data.priceUsd);      const priceUsdIdx = params.length; // $4
  params.push(data.fxRateUsed);    const fxIdx       = params.length; // $5
  params.push(data.multiplierUsed); const multIdx    = params.length; // $6

  const sets = [
    `quantity        = $${qIdx}`,
    `price           = $${priceIdx}`,
    `price_inr       = $${priceIdx}`,
    `price_usd       = $${priceUsdIdx}`,
    `fx_rate_used    = $${fxIdx}`,
    `multiplier_used = $${multIdx}`,
    'updated_at = CURRENT_TIMESTAMP',
  ];

  // Conditionally-updated fields (only when the uploaded row supplied a value)
  const optionals = [
    ['description',    data.description],
    ['dimensions',     data.dimensions],
    ['materials',      data.materials],
    ['image_filename', data.imageFilename],
    ['notes',          data.notes],
  ];
  for (const [col, val] of optionals) {
    if (val !== null && val !== undefined) {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    }
  }

  const result = await q.query(
    `UPDATE artworks SET ${sets.join(', ')} WHERE sku = $1 RETURNING id, title, sku, status`,
    params
  );
  return result.rows[0] || null;
}

// About page functions
async function getAbout() {
  const aboutResult = await pool.query('SELECT * FROM about WHERE id = 1');
  const artFormsResult = await pool.query('SELECT * FROM art_forms ORDER BY display_order');
  
  if (aboutResult.rows.length === 0) return null;
  
  const about = aboutResult.rows[0];
  return {
    story: {
      title: about.story_title,
      paragraphs: about.story_paragraphs,
      image: about.story_image
    },
    artForms: artFormsResult.rows.map(form => ({
      id: form.id,
      title: form.title,
      description: form.description
    })),
    process: {
      title: about.process_title,
      text: about.process_text
    },
    commitment: {
      title: about.commitment_title,
      text: about.commitment_text
    }
  };
}

async function updateAbout(aboutData) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Update about table
    await client.query(
      `INSERT INTO about (id, story_title, story_paragraphs, story_image, process_title, process_text, commitment_title, commitment_text)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         story_title = $1, story_paragraphs = $2, story_image = $3,
         process_title = $4, process_text = $5,
         commitment_title = $6, commitment_text = $7,
         updated_at = CURRENT_TIMESTAMP`,
      [
        aboutData.story?.title,
        aboutData.story?.paragraphs || [],
        aboutData.story?.image || '',
        aboutData.process?.title,
        aboutData.process?.text,
        aboutData.commitment?.title,
        aboutData.commitment?.text
      ]
    );
    
    // Update art forms
    if (aboutData.artForms && Array.isArray(aboutData.artForms)) {
      for (let i = 0; i < aboutData.artForms.length; i++) {
        const form = aboutData.artForms[i];
        await client.query(
          `INSERT INTO art_forms (id, title, description, display_order)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET
             title = $2, description = $3, display_order = $4`,
          [form.id, form.title, form.description || '', i]
        );
      }
    }
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Contact functions
async function getContact() {
  const result = await pool.query('SELECT * FROM contact WHERE id = 1');
  if (result.rows.length === 0) return null;
  
  const contact = result.rows[0];
  return {
    emails: contact.emails,
    phone: contact.phone,
    address: {
      street: contact.address_street,
      city: contact.address_city,
      state: contact.address_state,
      zip: contact.address_zip
    },
    hours: {
      weekdays: contact.hours_weekdays,
      weekend: contact.hours_weekend
    },
    social: {
      facebook: contact.social_facebook,
      instagram: contact.social_instagram,
      pinterest: contact.social_pinterest,
      twitter: contact.social_twitter
    },
    showHours: contact.show_hours,
    showAddress: contact.show_address,
    showSocial: contact.show_social
  };
}

async function updateContact(contactData) {
  await pool.query(
    `INSERT INTO contact (id, emails, phone, address_street, address_city, address_state, address_zip,
      hours_weekdays, hours_weekend, social_facebook, social_instagram, social_pinterest, social_twitter,
      show_hours, show_address, show_social)
     VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT (id) DO UPDATE SET
       emails = $1, phone = $2, address_street = $3, address_city = $4, address_state = $5, address_zip = $6,
       hours_weekdays = $7, hours_weekend = $8, social_facebook = $9, social_instagram = $10,
       social_pinterest = $11, social_twitter = $12, show_hours = $13, show_address = $14, show_social = $15,
       updated_at = CURRENT_TIMESTAMP`,
    [
      contactData.emails || [],
      contactData.phone || '',
      contactData.address?.street || '',
      contactData.address?.city || '',
      contactData.address?.state || '',
      contactData.address?.zip || '',
      contactData.hours?.weekdays || '',
      contactData.hours?.weekend || '',
      contactData.social?.facebook || '',
      contactData.social?.instagram || '',
      contactData.social?.pinterest || '',
      contactData.social?.twitter || '',
      contactData.showHours !== false,
      contactData.showAddress !== false,
      contactData.showSocial || false
    ]
  );
}

// Settings functions
async function getSettings() {
  const result = await pool.query('SELECT * FROM settings WHERE id = 1');
  if (result.rows.length === 0) return null;
  
  const settings = result.rows[0];
  return {
    siteName: settings.site_name,
    tagline: settings.tagline,
    copyright: settings.copyright,
    social: {
      facebook: settings.social_facebook,
      instagram: settings.social_instagram,
      pinterest: settings.social_pinterest,
      twitter: settings.social_twitter,
      youtube: settings.social_youtube
    },
    developer: {
      name: settings.developer_name,
      logo: settings.developer_logo,
      website: settings.developer_website,
      showCredit: settings.developer_show_credit
    },
    showSocial: settings.show_social
  };
}

async function updateSettings(settingsData) {
  await pool.query(
    `INSERT INTO settings (id, site_name, tagline, copyright, social_facebook, social_instagram,
      social_pinterest, social_twitter, social_youtube, developer_name, developer_logo, developer_website,
      developer_show_credit, show_social)
     VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (id) DO UPDATE SET
       site_name = $1, tagline = $2, copyright = $3, social_facebook = $4, social_instagram = $5,
       social_pinterest = $6, social_twitter = $7, social_youtube = $8, developer_name = $9,
       developer_logo = $10, developer_website = $11, developer_show_credit = $12, show_social = $13,
       updated_at = CURRENT_TIMESTAMP`,
    [
      settingsData.siteName || '',
      settingsData.tagline || '',
      settingsData.copyright || '',
      settingsData.social?.facebook || '',
      settingsData.social?.instagram || '',
      settingsData.social?.pinterest || '',
      settingsData.social?.twitter || '',
      settingsData.social?.youtube || '',
      settingsData.developer?.name || '',
      settingsData.developer?.logo || '',
      settingsData.developer?.website || '',
      settingsData.developer?.showCredit !== false,
      settingsData.showSocial !== false
    ]
  );
}

// Image data functions
async function storeArtworkImage(artworkId, imageBuffer, mimeType) {
  await pool.query(
    'UPDATE artworks SET image_data = $2, image_mime_type = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
    [artworkId, imageBuffer, mimeType]
  );
}

async function getArtworkImage(artworkId) {
  const result = await pool.query(
    'SELECT image_data, image_mime_type FROM artworks WHERE id = $1',
    [artworkId]
  );
  return result.rows[0];
}

async function storeAboutImage(imageBuffer, mimeType) {
  await pool.query(
    'UPDATE about SET story_image_data = $1, story_image_mime_type = $2 WHERE id = 1',
    [imageBuffer, mimeType]
  );
}

async function getAboutImage() {
  const result = await pool.query(
    'SELECT story_image_data, story_image_mime_type FROM about WHERE id = 1'
  );
  return result.rows[0];
}

async function storeLogoImage(imageBuffer, mimeType) {
  await pool.query(
    'UPDATE settings SET logo_data = $1, logo_mime_type = $2 WHERE id = 1',
    [imageBuffer, mimeType]
  );
}

async function getLogoImage() {
  const result = await pool.query(
    'SELECT logo_data, logo_mime_type FROM settings WHERE id = 1'
  );
  return result.rows[0];
}

// Pricing Settings functions
async function getPricingSetting(key) {
  const result = await pool.query(
    'SELECT value FROM pricing_settings WHERE key = $1',
    [key]
  );
  return result.rows[0]?.value;
}

async function getPricingSettings() {
  const result = await pool.query('SELECT key, value FROM pricing_settings');
  const settings = {};
  result.rows.forEach(row => {
    settings[row.key] = row.value;
  });
  return settings;
}

async function updatePricingSetting(key, value) {
  await pool.query(
    `INSERT INTO pricing_settings (key, value, updated_at) 
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT (key) 
     DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
    [key, value]
  );
}

async function updatePricingSettings(settings) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [key, value] of Object.entries(settings)) {
      await client.query(
        `INSERT INTO pricing_settings (key, value, updated_at) 
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (key) 
         DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
        [key, value]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Update only the USD price (admin override)
async function updateArtworkPriceUsd(id, priceUsd, fxRateUsed = null, multiplierUsed = null) {
  const result = await pool.query(
    `UPDATE artworks SET price_usd = $2, fx_rate_used = COALESCE($3, fx_rate_used), multiplier_used = COALESCE($4, multiplier_used), updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
    [id, priceUsd, fxRateUsed, multiplierUsed]
  );
  if (result.rows[0]) {
    result.rows[0].sizes = await getArtworkSizes(id);
  }
  return result.rows[0];
}

// ── Order Requests (ORD-01) ─────────────────────────────────────────────────

// Confirms a given artwork_size_id actually belongs to the given artwork_id.
async function getArtworkSizeForArtwork(sizeId, artworkId) {
  const result = await pool.query(
    'SELECT * FROM artwork_sizes WHERE id = $1 AND artwork_id = $2',
    [sizeId, artworkId]
  );
  return result.rows[0] || null;
}

// Creates an order request and its line items in a single transaction.
// `items` must already contain validated artwork/size references and
// resolved snapshot_* fields — this function only persists them.
async function createOrderRequest({ customer_name, customer_email, customer_phone, customer_message, items }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `INSERT INTO order_requests (customer_name, customer_email, customer_phone, customer_message)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [customer_name, customer_email, customer_phone || null, customer_message || null]
    );
    const orderRequest = orderResult.rows[0];

    const insertedItems = [];
    for (const item of items) {
      const itemResult = await client.query(
        `INSERT INTO order_request_items (
           order_request_id, artwork_id, artwork_size_id, quantity,
           snapshot_sku, snapshot_title, snapshot_category, snapshot_size_label,
           snapshot_price_inr, snapshot_price_usd, snapshot_image, snapshot_availability
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          orderRequest.id,
          item.artwork_id,
          item.artwork_size_id || null,
          item.quantity,
          item.snapshot_sku || null,
          item.snapshot_title,
          item.snapshot_category || null,
          item.snapshot_size_label || null,
          item.snapshot_price_inr,
          item.snapshot_price_usd,
          item.snapshot_image || null,
          item.snapshot_availability || null,
        ]
      );
      insertedItems.push(itemResult.rows[0]);
    }

    await client.query('COMMIT');
    orderRequest.items = insertedItems;
    return orderRequest;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Admin-facing: list requests with item counts, optionally filtered by status.
async function getOrderRequestsAdmin(status = null) {
  const query = status
    ? `SELECT o.*, COUNT(i.id)::int AS item_count
       FROM order_requests o
       LEFT JOIN order_request_items i ON i.order_request_id = o.id
       WHERE o.status = $1
       GROUP BY o.id
       ORDER BY o.created_at DESC`
    : `SELECT o.*, COUNT(i.id)::int AS item_count
       FROM order_requests o
       LEFT JOIN order_request_items i ON i.order_request_id = o.id
       GROUP BY o.id
       ORDER BY o.created_at DESC`;
  const result = await pool.query(query, status ? [status] : []);
  return result.rows;
}

// Admin-facing: full detail for one request, including its line items.
async function getOrderRequestById(id) {
  const orderResult = await pool.query('SELECT * FROM order_requests WHERE id = $1', [id]);
  const orderRequest = orderResult.rows[0];
  if (!orderRequest) return null;

  const itemsResult = await pool.query(
    'SELECT * FROM order_request_items WHERE order_request_id = $1 ORDER BY id ASC',
    [id]
  );
  orderRequest.items = itemsResult.rows;
  return orderRequest;
}

async function updateOrderRequestStatus(id, status) {
  const result = await pool.query(
    `UPDATE order_requests SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
    [id, status]
  );
  return result.rows[0] || null;
}

module.exports = {
  getUsers,
  getUserByUsername,
  createUser,
  getCategories,
  getPublicCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  getArtworks,
  getArtworksAdmin,
  getArtworkById,
  createArtwork,
  updateArtwork,
  deleteArtwork,
  getAbout,
  updateAbout,
  getContact,
  updateContact,
  getSettings,
  updateSettings,
  storeArtworkImage,
  getArtworkImage,
  storeAboutImage,
  getAboutImage,
  storeLogoImage,
  getLogoImage,
  getPricingSetting,
  getPricingSettings,
  updatePricingSetting,
  updatePricingSettings,
  updateArtworkPriceUsd,
  getArtworkBySku,
  createArtworkFromInventory,
  updateArtworkFromInventory,
  updateArtworkStatus,
  updateArtworkSku,
  getArtworkSizeForArtwork,
  createOrderRequest,
  getOrderRequestsAdmin,
  getOrderRequestById,
  updateOrderRequestStatus,
};
