# Image Assets

This folder contains image assets for the Chitrakala Arts portfolio website.

## Directory Structure

### categories/
Contains category images for:
- `dot-mandala.jpg` - Dot Mandala Art category image
- `lippan-art.jpg` - Lippan Art category image
- `textile-design.jpg` - Textile Designing category image

### artworks/
Contains individual artwork images:
- `dm-001.jpg` through `dm-004.jpg` - Dot Mandala artworks
- `la-001.jpg` through `la-004.jpg` - Lippan Art artworks
- `td-001.jpg` through `td-004.jpg` - Textile Design artworks

## Image Guidelines

- **Format**: JPG or PNG
- **Recommended Size**: 
  - Category images: 800x600px minimum
  - Artwork images: 1200x1200px minimum
- **Optimization**: Compress images for web to maintain fast loading times
- **Naming**: Use lowercase with hyphens, matching the IDs in artData.js

## Adding New Images

1. Add your image to the appropriate folder
2. Update the image path in `src/data/artData.js`
3. Ensure the filename matches the path specified in the data file

## Placeholder Images

Currently, the application uses placeholder image paths. Replace these with your actual artwork images to see them displayed on the website.
