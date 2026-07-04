# INV-06: Inventory Sync Image Matching and Upload

**Status:** Complete (local dev only — not deployed)  
**Date:** 2026-06-25  
**Depends on:** INV-01 through INV-05B

---

## Current Image Architecture (audit findings)

All image handling is centralised in a single pipeline:

| Step | Detail |
|------|--------|
| Upload middleware | `multer` with `memoryStorage()` (field: `image`) |
| Processing | `compressImage()` via **Sharp** — resize max 1920×1920 px, JPEG 85% quality (mozjpeg) |
| Storage | `db.storeArtworkImage(id, buffer, mimeType)` → writes to `artworks.image_data` (BYTEA) and `artworks.image_mime_type` |
| URL field | `artworks.image` = `${BASE_URL}/api/images/artworks/${id}` |
| Serving | `GET /api/images/artworks/:id` → reads `image_data` BYTEA from DB, sets `Content-Type`, streams it |
| Admin display | Uses `artwork.image` URL in `<img>` tags |
| Public display | Same `artwork.image` URL; only returned for `status = 'IN_STOCK'` artworks |

INV-06 **reuses** this exact pipeline for inventory-imported images. No second image system was created. No `artwork_images` table was added.

---

## New Upload Workflow

### Multipart fields

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `file` | Yes | `.xlsx` / `.xls` | Inventory workbook |
| `imageZip` | No | `.zip` | ZIP archive of artwork images |
| `images` | No | `.jpg/.jpeg/.png/.webp` (multi) | Individual image files |

Workbook-only import continues to work exactly as before.

### Accepted image extensions (inside ZIP or direct upload)

`.jpg`, `.jpeg`, `.png`, `.webp`

---

## Filename Matching Rules

1. **Workbook column** — `Image File Name` (also: `Image Filename`, `Image File`, `Image`)
2. **Strip directory prefix** — only the basename is used (`path/subdir/art.jpg` → `art.jpg`)
3. **Path traversal rejected** — values containing `..` or null bytes are ignored with a warning
4. **Case-insensitive match** — both workbook filename and uploaded filename are lowercased before comparison
5. **Duplicate uploaded filenames** — block with HTTP 400 (match would be ambiguous)
6. **Blank workbook filename** — treated as "no image expected" (`imageStatus = 'not_provided'`)

### ZIP security

- Zip-slip protection: entries with `..` or absolute paths (`/…`, `\…`) are rejected
- Directories inside ZIP are skipped
- Only files with accepted image extensions are extracted
- Duplicate basenames inside the ZIP are caught and block the request

---

## Preview Behavior

For each row the endpoint now returns `imageStatus`:

| Value | Meaning |
|-------|---------|
| `matched` | Workbook has `imageFilename` AND a matching uploaded file was found |
| `missing` | Workbook has `imageFilename` BUT no matching file was uploaded |
| `not_provided` | Workbook row has no `imageFilename` |

Preview **does not write** any image data.

### `imageSummary` in preview response

```json
{
  "imageSummary": {
    "rowsWithImageFilename": 12,
    "matched": 10,
    "missing": 2,
    "notProvided": 12,
    "unreferencedUploaded": 1
  }
}
```

**Missing images** produce a row-level `imageStatus = 'missing'` but do **not** block apply — imported rows land as `NEEDS_REVIEW` and images can be added later via the Review Queue.

**Unreferenced uploaded images** (uploaded but not referenced by any workbook row) produce a batch-level warning but do **not** block apply.

**Duplicate uploaded filenames** → HTTP 400, no preview or apply proceeds.

---

## Apply Behavior

1. Parse workbook (same validation as before — errors block the batch)
2. Extract uploaded images into memory map (duplicate filenames → HTTP 400)
3. INSERT CREATE rows / PATCH UPDATE rows (single transaction)
4. **After commit**, process matched images (**best-effort**, outside transaction):
   - Compress with `compressImage()` (Sharp, JPEG 85%, max 1920×1920)
   - Store via `db.storeArtworkImage(artworkId, buffer, 'image/jpeg')`
   - Set `artworks.image = ${BASE_URL}/api/images/artworks/${artworkId}`
5. Apply response includes `summary.imagesStored`

### Image update rules

| Situation | Outcome |
|-----------|---------|
| CREATE row with matched image | Image stored; `artworks.image` set |
| CREATE row without matched image | `artworks.image` stays null |
| UPDATE row with matched image | Existing image **replaced** |
| UPDATE row without matched image | Existing image **preserved** |
| Unreferenced uploaded image | Silently ignored |

Imported rows always land as `status = 'NEEDS_REVIEW'` regardless of image presence.

---

## Review Queue Behavior

- Image column now shows a **48×48 thumbnail** when `artwork.image` is a valid URL
- Shows a grey placeholder when no image is attached
- `image_filename` column shows the hint filename from the workbook
- After publishing (`IN_STOCK`), the artwork's thumbnail appears on the public website

---

## Inventory Sync UI Changes

- Added **optional ZIP file input** below the workbook picker
- Image match summary cards appear after preview (matched / missing / not provided / unreferenced)
- Row table includes an **Image** column with `✅ Matched`, `⚠ Missing`, or `—` status
- Stale-preview warning shown if image ZIP is changed after preview without re-running preview
- Apply sends both workbook and ZIP in the same multipart request

---

## Safety Rules

- Path traversal in workbook filenames → warning, filename ignored
- Path traversal in ZIP entries → rejected per entry
- Duplicate image filenames → HTTP 400 (prevents ambiguous matching)
- No image writes during preview
- Images processed best-effort after the DB transaction — a failed image store does not roll back row data
- Unreferenced images silently ignored (never stored)
- Do not overwrite existing image unless a matching upload is explicitly present in this request

---

## Dependency Added

`adm-zip ^0.5.16` in `server/package.json` — used for ZIP parsing only. No other image libraries were added.

---

## Local Test Results (2026-06-25)

All checks pass (26/26):

| Test | Result |
|------|--------|
| A: Workbook only — preview 0 errors, all `not_provided`, apply 24 created | ✅ |
| A cleanup: count restored to 38 | ✅ |
| B: No image filename column — 0 rows with image, 0 missing | ✅ |
| C1: ZIP with unreferenced image — preview 200, `unreferencedUploaded=1`, batch warning | ✅ |
| C2: Apply 24 rows — 24 NEEDS_REVIEW, public still 38 | ✅ |
| D: Publish one item — public 38→39, artwork visible publicly | ✅ |
| E: Re-upload without images — 24 updated, 0 created, count stable at 62 | ✅ |
| G: Duplicate image filename in ZIP — 400, clear error | ✅ |
| H: Apply with unreferenced image — still 200, count unchanged | ✅ |
| F cleanup: artworks=38, artwork_sizes=91, no imported rows, no bad IDs | ✅ |

---

## Cleanup Rule (safe pattern)

Always use ID pattern for cleanup (not SKU pattern — see INV-05B incident):

```sql
-- List first:
SELECT id, sku, title, status FROM artworks WHERE id LIKE 'cks-2026-%' ORDER BY sku;

-- Then delete:
DELETE FROM artworks WHERE id LIKE 'cks-2026-%';

-- Verify:
SELECT COUNT(*) FROM artworks;        -- expect 38
SELECT COUNT(*) FROM artwork_sizes;   -- expect 91
SELECT COUNT(*) FROM artworks WHERE id LIKE 'cks-2026-%';   -- expect 0
SELECT COUNT(*) FROM artworks WHERE id LIKE 'cks-cks-%';    -- expect 0
```

---

## Limitations

- One primary image per artwork only (as scoped)
- No multi-image gallery support
- No `artwork_images` table
- No bulk image ordering / reordering
- Image processing failure (Sharp error) is logged but does not roll back row data
- `Image File Name` in the test workbook is not populated — image matching requires updating the workbook to include filenames
- Thumbnails in Review Queue use the `artwork.image` URL directly; cross-origin images may require CORS config if served from production URL

---

## Out of Scope (this ticket)

- Multiple images per artwork
- `artwork_images` table
- Image ordering / gallery management
- Invoice/shipment generation
- AI description generation
- Production deployment
