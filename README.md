# Chitrakala Arts - Interactive Full-Stack Application

A beautiful and responsive React web application with admin capabilities to manage an art portfolio. Features secure authentication, image uploads, and full CRUD operations for artwork management.

**Live Site:** https://chitrakala-arts.vercel.app

## Features

- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices
- **Category Browsing**: Browse artwork by three distinct categories
- **Detailed Art Pages**: View individual artwork with descriptions, prices, and specifications
- **Featured Artworks**: Highlighted collection on the home page
- **Contact Form**: Get in touch for inquiries or custom orders
- **About Page**: Learn about the art forms and the artist's story

## Project Structure

```
chitrakala_arts/
├── public/
│   └── index.html
├── src/
│   ├── components/
│   │   ├── Header.js
│   │   ├── Footer.js
│   │   ├── ArtCard.js
│   │   └── CategoryCard.js
│   ├── pages/
│   │   ├── Home.js
│   │   ├── CategoryPage.js
│   │   ├── ArtDetails.js
│   │   ├── About.js
│   │   └── Contact.js
│   ├── data/
│   │   └── artData.js
│   ├── styles/
│   │   ├── index.css
│   │   ├── App.css
│   │   ├── Header.css
│   │   ├── Footer.css
│   │   ├── ArtCard.css
│   │   ├── CategoryCard.css
│   │   ├── Home.css
│   │   ├── CategoryPage.css
│   │   ├── ArtDetails.css
│   │   ├── About.css
│   │   └── Contact.css
│   ├── App.js
│   └── index.js
├── package.json
├── .gitignore
└── README.md
```

## Installation

1. Clone or navigate to the project directory:
```bash
cd chitrakala_arts
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

The application will open in your browser at `http://localhost:3000`

## Art Categories

### 1. Dot Mandala Art
Intricate dot patterns creating beautiful mandala designs that bring harmony and balance to your space.

### 2. Lippan Art
Traditional mirror and clay work art from Gujarat, featuring geometric patterns and reflective beauty.

### 3. Textile Designing
Hand-painted and designed textile pieces that blend traditional techniques with contemporary aesthetics.

## Adding New Artwork

To add new artwork to the portfolio:

1. Open `src/data/artData.js`
2. Add a new object to the `artworks` array with the following structure:

```javascript
{
  id: 'unique-id',
  title: 'Artwork Title',
  category: 'dot-mandala' | 'lippan-art' | 'textile-design',
  description: 'Description of the artwork',
  price: 2500,
  size: '12" x 12"',
  materials: 'Materials used',
  image: '/assets/images/artworks/image.jpg',
  featured: true | false
}
```

3. Place the artwork image in the `public/assets/images/artworks/` directory

## Customization

### Colors
Modify the color scheme by updating CSS variables in `src/styles/index.css`:

```css
:root {
  --primary-color: #8B4513;
  --secondary-color: #D4AF37;
  --accent-color: #C19A6B;
  /* ... other colors */
}
```

### Navigation
Update navigation links in `src/components/Header.js`

### Footer
Customize footer content and links in `src/components/Footer.js`

## Build for Production

To create a production build:

```bash
npm run build
```

The optimized files will be in the `build/` directory.

## Technologies Used

- React 18
- React Router DOM 6
- CSS3 with CSS Variables
- Responsive Design

## Future Enhancements

- Shopping cart functionality
- User authentication
- Admin panel for managing artwork
- Image gallery with lightbox
- Search and filter functionality
- Newsletter subscription
- Blog section

## License

This project is created for portfolio purposes.

## Contact

For inquiries about the artwork or custom orders, please use the contact form on the website or reach out directly.

---

Made with ❤️ for Chitrakala Arts
