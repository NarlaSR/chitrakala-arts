export const categories = [
  {
    id: 'dot-mandala',
    name: 'Dot Mandala Art',
    description: 'Intricate dot patterns creating beautiful mandala designs that bring harmony and balance to your space.',
    image: '/assets/images/categories/dot-mandala.png'
  },
  {
    id: 'lippan-art',
    name: 'Lippan Art',
    description: 'Traditional mirror and clay work art from Gujarat, featuring geometric patterns and reflective beauty.',
    image: '/assets/images/categories/lippan-art.png'
  },
  {
    id: 'textile-design',
    name: 'Textile Art',
    description: 'Hand-painted and designed textile pieces that blend traditional techniques with contemporary aesthetics.',
    image: '/assets/images/categories/textile-design.png'
  }
];

export const artworks = [
  // Dot Mandala Art
  {
    id: 'dm-001',
    title: 'Celestial Harmony',
    category: 'dot-mandala',
    description: 'A stunning dot mandala featuring cosmic patterns in blues and purples, representing universal harmony and peace.',
    price: 2500,
    size: '12" x 12"',
    materials: 'Acrylic on canvas',
    image: '/assets/images/artworks/dm-001.jpg',
    featured: true
  },
  {
    id: 'dm-002',
    title: 'Golden Sunrise',
    category: 'dot-mandala',
    description: 'Warm golden and orange tones create a radiant mandala that captures the essence of a beautiful sunrise.',
    price: 2200,
    size: '10" x 10"',
    materials: 'Acrylic on canvas',
    image: '/assets/images/artworks/dm-002.jpg',
    featured: false
  },
  {
    id: 'dm-003',
    title: 'Ocean Depths',
    category: 'dot-mandala',
    description: 'Deep blues and turquoise dots create a mesmerizing pattern inspired by the ocean\'s mysteries.',
    price: 2800,
    size: '14" x 14"',
    materials: 'Acrylic on canvas',
    image: '/assets/images/artworks/dm-003.jpg',
    featured: true
  },
  {
    id: 'dm-004',
    title: 'Cherry Blossom',
    category: 'dot-mandala',
    description: 'Delicate pink and white dots form a floral mandala inspired by cherry blossoms in full bloom.',
    price: 2400,
    size: '12" x 12"',
    materials: 'Acrylic on canvas',
    image: '/assets/images/artworks/dm-004.jpg',
    featured: false
  },

  // Lippan Art
  {
    id: 'la-001',
    title: 'Royal Peacock',
    category: 'lippan-art',
    description: 'Traditional Gujarati Lippan art featuring a majestic peacock with intricate mirror work and clay detailing.',
    price: 3500,
    size: '16" x 20"',
    materials: 'Clay, mirrors, and acrylic colors on wood',
    image: '/assets/images/artworks/la-001.jpg',
    featured: true
  },
  {
    id: 'la-002',
    title: 'Geometric Dreams',
    category: 'lippan-art',
    description: 'Contemporary geometric patterns with traditional Lippan technique, featuring vibrant colors and mirror accents.',
    price: 3200,
    size: '14" x 14"',
    materials: 'Clay, mirrors, and acrylic colors on wood',
    image: '/assets/images/artworks/la-002.jpg',
    featured: false
  },
  {
    id: 'la-003',
    title: 'Floral Radiance',
    category: 'lippan-art',
    description: 'Beautiful floral motifs enhanced with mirror work, creating a stunning play of light and reflection.',
    price: 4000,
    size: '18" x 24"',
    materials: 'Clay, mirrors, and acrylic colors on wood',
    image: '/assets/images/artworks/la-003.jpg',
    featured: true
  },
  {
    id: 'la-004',
    title: 'Village Heritage',
    category: 'lippan-art',
    description: 'Traditional village scene depicted through authentic Lippan art techniques passed down through generations.',
    price: 3800,
    size: '16" x 20"',
    materials: 'Clay, mirrors, and acrylic colors on wood',
    image: '/assets/images/artworks/la-004.jpg',
    featured: false
  },

  // Textile Designing
  {
    id: 'td-001',
    title: 'Bohemian Dreams',
    category: 'textile-design',
    description: 'Hand-painted textile piece with bohemian patterns and earthy tones, perfect for contemporary interiors.',
    price: 1800,
    size: '20" x 30"',
    materials: 'Fabric paint on cotton canvas',
    image: '/assets/images/artworks/td-001.jpg',
    featured: true
  },
  {
    id: 'td-002',
    title: 'Tribal Echoes',
    category: 'textile-design',
    description: 'Bold tribal patterns inspired by indigenous art, featuring strong geometric designs and vibrant colors.',
    price: 2000,
    size: '24" x 36"',
    materials: 'Fabric paint on cotton canvas',
    image: '/assets/images/artworks/td-002.jpg',
    featured: false
  },
  {
    id: 'td-003',
    title: 'Modern Ethnic',
    category: 'textile-design',
    description: 'Contemporary take on traditional ethnic motifs, blending modern aesthetics with cultural heritage.',
    price: 2200,
    size: '20" x 30"',
    materials: 'Fabric paint on cotton canvas',
    image: '/assets/images/artworks/td-003.jpg',
    featured: true
  },
  {
    id: 'td-004',
    title: 'Nature\'s Palette',
    category: 'textile-design',
    description: 'Nature-inspired textile design featuring botanical elements and organic flowing patterns.',
    price: 1900,
    size: '22" x 32"',
    materials: 'Fabric paint on cotton canvas',
    image: '/assets/images/artworks/td-004.jpg',
    featured: false
  }
];

export const getCategoryById = (categoryId) => {
  return categories.find(cat => cat.id === categoryId);
};

export const getArtworkById = (artId) => {
  return artworks.find(art => art.id === artId);
};

export const getArtworksByCategory = (categoryId) => {
  return artworks.filter(art => art.category === categoryId);
};

export const getFeaturedArtworks = () => {
  return artworks.filter(art => art.featured);
};
