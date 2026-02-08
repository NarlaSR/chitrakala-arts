# Category Images Setup

## Where to Add Category Images

You need to add **3 category images** to showcase each art category on the homepage.

### Required Images:

1. **Dot Mandala Art**
   - Path: `public/assets/images/categories/dot-mandala.png` (or .jpg)
   - Shows: Example of dot mandala artwork

2. **Lippan Art**
   - Path: `public/assets/images/categories/lippan-art.png` (or .jpg)
   - Shows: Example of lippan artwork

3. **Textile Art**
   - Path: `public/assets/images/categories/textile-design.png` (or .jpg)
   - Shows: Example of textile design

## Image Specifications

- **Format**: JPG, PNG, or WEBP (any common image format)
- **Recommended Size**: 800x600px or larger
- **Aspect Ratio**: 4:3 (landscape orientation works best)
- **Quality**: High resolution for best display
- **Content**: Representative example of each category

## How to Add Images

### Option 1: PNG Format (Recommended for Quality)

1. Save your images as:
   - `dot-mandala.png`
   - `lippan-art.png`
   - `textile-design.png`

2. Place them in: `public/assets/images/categories/`

### Option 2: JPG Format (Smaller File Size)

1. Save your images as:
   - `dot-mandala.jpg`
   - `lippan-art.jpg`
   - `textile-design.jpg`

2. Update `src/data/artData.js` to change `.png` to `.jpg` in the image paths

3. Place them in: `public/assets/images/categories/`

### Mixing Formats

You can use different formats for different categories! Just update the file extension in `src/data/artData.js` to match your actual file:

```javascript
{
  id: 'dot-mandala',
  name: 'Dot Mandala Art',
  image: '/assets/images/categories/dot-mandala.jpg'  // Change to .jpg, .png, etc.
}
```

## Temporary Placeholder

Until you add the images, the site will display:

- 🎨 Colorful gradient background
- Category name
- No broken image icon

This ensures your site looks professional even without images yet.

## Tips for Choosing Category Images

- Use your **best representative work** for each category
- Ensure images are **bright and colorful**
- **Clear focus** on the artwork
- Good lighting and professional quality
- Should make visitors want to click and explore

## Format Recommendations

- **PNG**: Best for artwork with fine details, no quality loss, but larger file size
- **JPG**: Good for photographs, smaller file size, slight compression
- **WEBP**: Modern format, smaller size with good quality (if browser supports)

Choose the format that works best for your needs - all common image formats are supported!
