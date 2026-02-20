
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { artworksAPI } from '../services/api';
import '../styles/AdminDashboard.css';

// MULTISIZE TEST: This is a trivial change to force a redeploy and confirm the latest code is deployed.
console.log('MULTISIZE TEST: AdminDashboard.js loaded');

const AdminDashboard = () => {
        // Helper for description validation color
        const getDescriptionValidationColor = () => {
          const len = formData.description?.length || 0;
          if (len === 0) return '';
          if (len < 15) return 'desc-too-short';
          if (len <= 5000) return 'desc-valid';
          return 'desc-too-long';
        };
      // Validate a single field and update formErrors
      const validateField = (name, value) => {
        let error = '';
        if (name === 'title') {
          if (!value || value.trim().length < 2) error = 'Title must be at least 2 characters.';
        } else if (name === 'category') {
          if (!value || value.trim().length < 2) error = 'Category is required.';
        } else if (name === 'description') {
          if (!value || value.trim().length < 15) error = 'Description must be at least 15 characters.';
        } else if (name === 'price') {
          if (!value || isNaN(value) || Number(value) < 0) error = 'Price must be a valid number.';
        } else if (name === 'materials') {
          if (value && value.length > 255) error = 'Materials must be less than 255 characters.';
        }
        setFormErrors(prev => ({ ...prev, [name]: error }));
      };
    const [formErrors, setFormErrors] = useState({});
  const { logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [artworks, setArtworks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingArtwork, setEditingArtwork] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    category: 'dot-mandala',
    description: '',
    price: '',
    materials: '',
    featured: false,
    sizes: [{ size: '', price: '' }]
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');

  useEffect(() => {
    if (!isAdmin()) {
      navigate('/ckk-secure-admin');
      return;
    }
    loadArtworks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadArtworks = async () => {
    try {
      // Add timestamp to force fresh fetch
      const data = await artworksAPI.getAll(`?_ts=${Date.now()}`);
      console.log('Loaded artworks:', data);
      setArtworks(data);
    } catch (error) {
      console.error('Failed to load artworks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Handle size/price pair changes
  const handleSizeChange = (index, field, value) => {
    setFormData(prev => {
      const sizes = prev.sizes.map((s, i) =>
        i === index ? { ...s, [field]: value } : s
      );
      return { ...prev, sizes };
    });
  };

  const addSize = () => {
    setFormData(prev => ({
      ...prev,
      sizes: [...prev.sizes, { size: '', price: '' }]
    }));
  };

  const removeSize = (index) => {
    setFormData(prev => ({
      ...prev,
      sizes: prev.sizes.filter((_, i) => i !== index)
    }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Frontend validation
    const errors = {};
    if (!formData.title || formData.title.trim().length < 2) {
      errors.title = 'Title must be at least 2 characters.';
    }
    if (!formData.category || formData.category.trim().length < 2) {
      errors.category = 'Category is required.';
    }
    if (!formData.description || formData.description.trim().length < 15) {
      errors.description = 'Description must be at least 15 characters.';
    }
    if (!formData.price || isNaN(formData.price) || Number(formData.price) < 0) {
      errors.price = 'Price must be a valid number.';
    }
    if (formData.materials && formData.materials.length > 255) {
      errors.materials = 'Materials must be less than 255 characters.';
    }
    if (!formData.sizes || !Array.isArray(formData.sizes) || formData.sizes.some(s => !s.size || !s.price)) {
      errors.sizes = 'All sizes and prices must be filled.';
    }
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const data = new FormData();
    data.append('title', formData.title);
    data.append('category', formData.category);
    data.append('description', formData.description);
    data.append('price', formData.price); // Ensure price is sent
    data.append('materials', formData.materials);
    data.append('featured', formData.featured);
    // Send sizes array as JSON
    data.append('sizes', JSON.stringify(formData.sizes));
    if (imageFile) {
      data.append('image', imageFile);
    }
    try {
      if (editingArtwork) {
        await artworksAPI.update(editingArtwork.id, data);
      } else {
        await artworksAPI.create(data);
      }
      resetForm();
      loadArtworks();
    } catch (error) {
      console.error('Failed to save artwork:', error);
      alert('Failed to save artwork');
    }
  };

  const handleEdit = (artwork) => {
    console.log('Editing artwork:', artwork);
    setEditingArtwork(artwork);
    setFormData({
      title: artwork.title,
      category: artwork.category,
      description: artwork.description,
      price: artwork.price || '',
      materials: artwork.materials,
      featured: artwork.featured,
      sizes: Array.isArray(artwork.sizes) && artwork.sizes.length > 0
        ? artwork.sizes.map(sp => ({
            size: sp.size_label || '',
            price: sp.price || ''
          }))
        : [{ size: '', price: '' }]
    });
    setImagePreview(artwork.image || '');
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this artwork?')) {
      try {
        await artworksAPI.delete(id);
        loadArtworks();
      } catch (error) {
        console.error('Failed to delete artwork:', error);
        alert('Failed to delete artwork');
      }
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      category: 'dot-mandala',
      description: '',
      materials: '',
      featured: false,
      sizes: [{ size: '', price: '' }]
    });
    setImageFile(null);
    setImagePreview('');
    setEditingArtwork(null);
    setShowForm(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/ckk-secure-admin');
  };

  if (loading) {
    return <div className="admin-dashboard"><div className="loading">Loading...</div></div>;
  }

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <h1>Admin Dashboard</h1>
        <div className="admin-actions">
          <button onClick={() => navigate('/ckk-secure-admin/about')} className="btn-secondary">
            Edit About Page
          </button>
          <button onClick={() => navigate('/ckk-secure-admin/contact')} className="btn-secondary">
            Edit Contact Info
          </button>
          <button onClick={() => navigate('/ckk-secure-admin/settings')} className="btn-secondary">
            Site Settings
          </button>
          <button onClick={() => navigate('/')} className="btn-secondary">
            View Site
          </button>
          <button onClick={handleLogout} className="btn-logout">
            Logout
          </button>
        </div>
      </div>

      <div className="dashboard-content">
        <div className="dashboard-toolbar">
          <h2>Manage Artworks</h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="btn-primary"
          >
            {showForm ? 'Cancel' : '+ Add New Artwork'}
          </button>
        </div>

        {showForm && (
          <div className="artwork-form-container">
            <h3>{editingArtwork ? 'Edit Artwork' : 'Add New Artwork'}</h3>
            <form onSubmit={handleSubmit} className="artwork-form">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="title">Title *</label>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleInputChange}
                    onBlur={e => validateField('title', e.target.value)}
                    required
                  />
                  {formErrors.title && <div className="form-error">{formErrors.title}</div>}
                </div>

                <div className="form-group">
                  <label htmlFor="category">Category *</label>
                  <select
                    id="category"
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                    onBlur={e => validateField('category', e.target.value)}
                    required
                  >
                    <option value="dot-mandala">Dot Mandala Art</option>
                    <option value="lippan-art">Lippan Art</option>
                    <option value="textile-design">Textile Designing</option>
                  </select>
                  {formErrors.category && <div className="form-error">{formErrors.category}</div>}
                </div>
              </div>


              <div className="form-group">
                <label htmlFor="description">Description *</label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  onBlur={e => validateField('description', e.target.value)}
                  rows="3"
                  required
                  className={getDescriptionValidationColor()}
                ></textarea>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className={getDescriptionValidationColor()}>
                    {formData.description.length} / 5000
                  </span>
                  {formData.description.length > 0 && formData.description.length < 15 && (
                    <span className="form-error">Description must be at least 15 characters.</span>
                  )}
                  {formData.description.length > 5000 && (
                    <span className="form-error">Description must be less than 5000 characters.</span>
                  )}
                </div>
              </div>
              {/* Main price field for backend compatibility */}
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="price">Main Price (₹) *</label>
                  <input
                    type="number"
                    id="price"
                    name="price"
                    value={formData.price || ''}
                    onChange={handleInputChange}
                    onBlur={e => validateField('price', e.target.value)}
                    min="0"
                    step="0.01"
                    required
                  />
                  <small>Required for backend. Use the lowest or default price if multiple sizes.</small>
                  {formErrors.price && <div className="form-error">{formErrors.price}</div>}
                </div>
              </div>

              {/* Multiple sizes/prices UI */}
              <div className="form-group">
                <label>Sizes & Prices *</label>
                {console.log('Rendering sizes input:', formData.sizes)}
                {formData.sizes.map((sp, idx) => (
                  <div className="size-price-row" key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input
                      type="text"
                      placeholder={'Size (e.g., 12" x 12")'}
                      value={sp.size}
                      onChange={e => handleSizeChange(idx, 'size', e.target.value)}
                      required
                      style={{ flex: 2 }}
                    />
                    <input
                      type="number"
                      placeholder="Price (₹)"
                      value={sp.price}
                      onChange={e => handleSizeChange(idx, 'price', e.target.value)}
                      min="0"
                      step="0.01"
                      required
                      style={{ flex: 1 }}
                    />
                    {formData.sizes.length > 1 && (
                      <button type="button" className="btn-remove-size" onClick={() => removeSize(idx)} style={{ flex: 0 }}>
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" className="btn-add-size" onClick={addSize} style={{ marginTop: '8px' }}>
                  + Add Size/Price
                </button>
                {formErrors.sizes && <div className="form-error">{formErrors.sizes}</div>}
              </div>

              <div className="form-group">
                <label htmlFor="materials">Materials *</label>
                <input
                  type="text"
                  id="materials"
                  name="materials"
                  value={formData.materials}
                  onChange={handleInputChange}
                  onBlur={e => validateField('materials', e.target.value)}
                  placeholder="e.g., Acrylic on canvas"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="image">Image {editingArtwork ? '' : '*'}</label>
                <input
                  type="file"
                  id="image"
                  accept="image/*"
                  onChange={handleImageChange}
                  required={!editingArtwork}
                />
                {imagePreview && (
                  <div className="image-preview">
                    <img src={imagePreview} alt="Preview" />
                  </div>
                )}
              </div>

              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    name="featured"
                    checked={formData.featured}
                    onChange={handleInputChange}
                  />
                  <span>Featured Artwork</span>
                </label>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn-primary">
                  {editingArtwork ? 'Update Artwork' : 'Create Artwork'}
                </button>
                <button type="button" onClick={resetForm} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="artworks-table">
          <table>
            <thead>
              <tr>
                <th>Image</th>
                <th>Title</th>
                <th>Category</th>
                <th>Price</th>
                <th>Size</th>
                <th>Featured</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {artworks.length === 0 ? (
                <tr>
                  <td colSpan="7" className="no-data">
                    No artworks yet. Add your first artwork!
                  </td>
                </tr>
              ) : (
                artworks.map(artwork => (
                  <tr key={artwork.id}>
                    <td>
                      <img
                        src={artwork.image + (artwork.updatedAt ? `?t=${encodeURIComponent(artwork.updatedAt)}` : '')}
                        alt={artwork.title}
                        className="artwork-thumbnail"
                        onContextMenu={e => e.preventDefault()}
                        draggable={false}
                        style={{ userSelect: 'none', pointerEvents: 'none' }}
                      />
                    </td>
                    <td>{artwork.title}</td>
                    <td>{artwork.category}</td>
                    <td>₹{artwork.price.toLocaleString()}</td>
                    <td>{artwork.dimensions}</td>
                    <td>{artwork.featured ? '⭐ Yes' : 'No'}</td>
                    <td className="actions-cell">
                      <button
                        onClick={() => handleEdit(artwork)}
                        className="btn-edit"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(artwork.id)}
                        className="btn-delete"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
