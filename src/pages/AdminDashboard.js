import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { artworksAPI } from '../services/api';
import '../styles/AdminDashboard.css';

const AdminDashboard = () => {
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
    size: '',
    materials: '',
    featured: false
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
    
    const data = new FormData();
    data.append('title', formData.title);
    data.append('category', formData.category);
    data.append('description', formData.description);
    data.append('price', formData.price);
    data.append('size', formData.size);
    data.append('materials', formData.materials);
    data.append('featured', formData.featured);
    
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
    setEditingArtwork(artwork);
    setFormData({
      title: artwork.title,
      category: artwork.category,
      description: artwork.description,
      price: artwork.price,
      size: artwork.size,
      materials: artwork.materials,
      featured: artwork.featured
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
      price: '',
      size: '',
      materials: '',
      featured: false
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
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="category">Category *</label>
                  <select
                    id="category"
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="dot-mandala">Dot Mandala Art</option>
                    <option value="lippan-art">Lippan Art</option>
                    <option value="textile-design">Textile Designing</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="description">Description *</label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows="3"
                  required
                ></textarea>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="price">Price (₹) *</label>
                  <input
                    type="number"
                    id="price"
                    name="price"
                    value={formData.price}
                    onChange={handleInputChange}
                    min="0"
                    step="0.01"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="size">Size *</label>
                  <input
                    type="text"
                    id="size"
                    name="size"
                    value={formData.size}
                    onChange={handleInputChange}
                    placeholder='e.g., 12" x 12"'
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="materials">Materials *</label>
                <input
                  type="text"
                  id="materials"
                  name="materials"
                  value={formData.materials}
                  onChange={handleInputChange}
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
