import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/CategoryCard.css';

const CategoryCard = ({ category }) => {
  const [imageError, setImageError] = useState(false);

  return (
    <div className="category-card">
      <Link to={`/category/${category.id}`} className="category-card-link">
        <div className="category-card-image">
          {!imageError ? (
            <img 
              src={category.image} 
              alt={category.name}
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="category-placeholder">
              <div className="category-placeholder-icon">🎨</div>
              <p>{category.name}</p>
            </div>
          )}
          <div className="category-card-overlay">
            <h3>{category.name}</h3>
          </div>
        </div>
        <div className="category-card-content">
          <p>{category.description}</p>
          <span className="category-card-cta">Explore Collection →</span>
        </div>
      </Link>
    </div>
  );
};

export default CategoryCard;
