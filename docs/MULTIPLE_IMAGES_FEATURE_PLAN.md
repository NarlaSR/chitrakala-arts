# MULTIPLE IMAGES PER ARTWORK FEATURE PLAN

## Overview

Enable support for uploading, storing, and displaying multiple images for each artwork. All images will be managed in PostgreSQL for consistency with current architecture.

---

## 1. Database Changes (PostgreSQL)

- **Add artwork_images table:**
  - `id` (PK)
  - `artwork_id` (FK to artworks)
  - `image_url` (string)
  - `img_order` (integer, optional for display order)

```sql
CREATE TABLE artwork_images (
  id SERIAL PRIMARY KEY,
  artwork_id INTEGER REFERENCES artworks(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  img_order INTEGER DEFAULT 0
);
```

- **Migration:**
  - Move existing single image from artworks table to artwork_images (as first image).

---

## 2. Backend/API Changes

- **Upload Endpoint:**
  - Accept multiple image files for each artwork (e.g., `multer.array('images')`).
  - Store each image in artwork_images table with correct artwork_id and order.
- **GET Endpoint:**
  - Return all images for each artwork (as array).
- **Admin Endpoints:**
  - Allow adding/removing/reordering images for an artwork.

---

## 3. Admin Dashboard (Frontend)

- **Artwork Form:**
  - Allow uploading multiple images (input type="file" with `multiple`).
  - Show previews of all selected images.
  - On edit, display all current images with options to remove or reorder.
- **Submission:**
  - Send all images to backend.

---

## 4. Art Details Page (Frontend)

- **Display:**
  - Show all images for an artwork (carousel/gallery/thumbnails).
  - Allow users to click thumbnails for larger view.

---

## 5. Migration/Legacy Handling

- For existing artworks, migrate the single image to artwork_images as the first image.

---

## 6. Robustness & Best Practices

- Validate image types and sizes on frontend and backend.
- Ensure atomic updates (all images saved or none).
- Clean up removed images from storage/server.

---

## Summary Table

| Layer       | Change                                                             |
| ----------- | ------------------------------------------------------------------ |
| Database    | Add artwork_images table, migrate single images                    |
| Backend API | Accept multiple images, return all images, support CRUD for images |
| Admin UI    | Multi-image upload, preview, remove, reorder                       |
| Art Details | Display all images (carousel/gallery)                              |

---

## Next Steps

- Start with database migration and backend API changes.
- Update admin dashboard for multi-image upload.
- Update art details page for multi-image display.
