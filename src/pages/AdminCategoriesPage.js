import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { categoriesAPI } from '../services/api';
import '../styles/AdminCategories.css';

const EMPTY_FORM = { id: '', name: '', description: '', display_order: 0, image: '' };

const AdminCategoriesPage = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Edit state — stores category id being edited + its form data
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const loadCategories = useCallback(async () => {
    try {
      const data = await categoriesAPI.getAll();
      setCategories(data);
    } catch (err) {
      setError('Failed to load categories.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin()) {
      navigate('/ckk-secure-admin');
      return;
    }
    loadCategories();
  }, [isAdmin, navigate, loadCategories]);

  const flash = (msg, isError = false) => {
    if (isError) {
      setError(msg);
      setSuccess('');
    } else {
      setSuccess(msg);
      setError('');
    }
    setTimeout(() => { setError(''); setSuccess(''); }, 4000);
  };

  // ── Add ─────────────────────────────────────────────────────────────────────

  const handleAddChange = (e) => {
    const { name, value } = e.target;
    setAddForm(prev => ({ ...prev, [name]: name === 'display_order' ? Number(value) : value }));
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!addForm.id.trim() || !addForm.name.trim()) {
      flash('Slug and name are required.', true);
      return;
    }
    setSaving(true);
    try {
      await categoriesAPI.create(addForm);
      setAddForm(EMPTY_FORM);
      setShowAddForm(false);
      await loadCategories();
      flash('Category created successfully.');
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to create category.';
      flash(msg, true);
    } finally {
      setSaving(false);
    }
  };

  // ── Edit ─────────────────────────────────────────────────────────────────────

  const startEdit = (cat) => {
    setEditingId(cat.id);
    setEditForm({
      name: cat.name,
      description: cat.description || '',
      display_order: cat.display_order ?? 0,
      image: cat.image || ''
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditForm(prev => ({ ...prev, [name]: name === 'display_order' ? Number(value) : value }));
  };

  const handleEditSubmit = async (e, id) => {
    e.preventDefault();
    if (!editForm.name.trim()) {
      flash('Name is required.', true);
      return;
    }
    setSaving(true);
    try {
      await categoriesAPI.update(id, editForm);
      setEditingId(null);
      await loadCategories();
      flash('Category updated successfully.');
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to update category.';
      flash(msg, true);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────────

  const handleDelete = async (cat) => {
    if (!window.confirm(`Delete "${cat.name}"? This cannot be undone.`)) return;
    try {
      await categoriesAPI.delete(cat.id);
      await loadCategories();
      flash('Category deleted.');
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to delete category.';
      flash(msg, true);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="admin-categories-page">
        <div className="admin-container">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-categories-page">
      <div className="admin-container">
        <div className="admin-header">
          <h1>Manage Categories</h1>
          <div className="admin-nav">
            <button className="btn-secondary" onClick={() => navigate('/ckk-secure-admin/dashboard')}>
              ← Back to Dashboard
            </button>
          </div>
        </div>

        {error && <div className="admin-error">{error}</div>}
        {success && <div className="admin-success">{success}</div>}

        {/* Category list */}
        <div className="categories-list">
          {categories.length === 0 ? (
            <p className="no-categories">No categories yet. Add one below.</p>
          ) : (
            <table className="categories-table">
              <thead>
                <tr>
                  <th>Slug (ID)</th>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Order</th>
                  <th>Image</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map(cat => (
                  <tr key={cat.id}>
                    {editingId === cat.id ? (
                      // Inline edit row
                      <>
                        <td><code>{cat.id}</code></td>
                        <td>
                          <input
                            name="name"
                            value={editForm.name}
                            onChange={handleEditChange}
                            className="inline-input"
                            required
                          />
                        </td>
                        <td>
                          <textarea
                            name="description"
                            value={editForm.description}
                            onChange={handleEditChange}
                            className="inline-textarea"
                            rows={2}
                          />
                        </td>
                        <td>
                          <input
                            name="display_order"
                            type="number"
                            value={editForm.display_order}
                            onChange={handleEditChange}
                            className="inline-input inline-input--narrow"
                          />
                        </td>
                        <td>
                          <input
                            name="image"
                            value={editForm.image}
                            onChange={handleEditChange}
                            className="inline-input"
                            placeholder="/assets/images/categories/my-cat.png"
                          />
                        </td>
                        <td className="actions">
                          <button
                            className="btn-save"
                            onClick={(e) => handleEditSubmit(e, cat.id)}
                            disabled={saving}
                          >
                            Save
                          </button>
                          <button className="btn-cancel" onClick={cancelEdit}>
                            Cancel
                          </button>
                        </td>
                      </>
                    ) : (
                      // Display row
                      <>
                        <td><code>{cat.id}</code></td>
                        <td>{cat.name}</td>
                        <td className="description-cell">{cat.description || '—'}</td>
                        <td>{cat.display_order}</td>
                        <td className="image-cell">
                          {cat.image
                            ? <img src={cat.image} alt={cat.name} className="cat-thumb" />
                            : <span className="no-image">—</span>}
                        </td>
                        <td className="actions">
                          <button className="btn-edit" onClick={() => startEdit(cat)}>Edit</button>
                          <button className="btn-delete" onClick={() => handleDelete(cat)}>Delete</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Add category */}
        <div className="add-section">
          {!showAddForm ? (
            <button className="btn-primary" onClick={() => setShowAddForm(true)}>
              + Add Category
            </button>
          ) : (
            <form className="add-form" onSubmit={handleAddSubmit}>
              <h2>New Category</h2>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="add-id">Slug (ID) *</label>
                  <input
                    id="add-id"
                    name="id"
                    value={addForm.id}
                    onChange={handleAddChange}
                    placeholder="e.g. watercolours"
                    pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                    title="Lowercase letters, numbers, and hyphens only"
                    required
                  />
                  <small>Lowercase letters, numbers, and hyphens only. Cannot be changed later.</small>
                </div>
                <div className="form-group">
                  <label htmlFor="add-name">Name *</label>
                  <input
                    id="add-name"
                    name="name"
                    value={addForm.name}
                    onChange={handleAddChange}
                    placeholder="e.g. Watercolours"
                    required
                  />
                </div>
                <div className="form-group form-group--narrow">
                  <label htmlFor="add-order">Display Order</label>
                  <input
                    id="add-order"
                    name="display_order"
                    type="number"
                    value={addForm.display_order}
                    onChange={handleAddChange}
                    min={0}
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="add-desc">Description</label>
                <textarea
                  id="add-desc"
                  name="description"
                  value={addForm.description}
                  onChange={handleAddChange}
                  rows={3}
                  placeholder="Short description shown on the category card / page"
                />
              </div>
              <div className="form-group">
                <label htmlFor="add-image">Image Path</label>
                <input
                  id="add-image"
                  name="image"
                  value={addForm.image}
                  onChange={handleAddChange}
                  placeholder="/assets/images/categories/my-category.png"
                />
                <small>Place the image file in <code>public/assets/images/categories/</code> first, then enter the path above.</small>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Create Category'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => { setShowAddForm(false); setAddForm(EMPTY_FORM); }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminCategoriesPage;
