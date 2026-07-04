import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { artworksAPI } from '../services/api';
import '../styles/AdminReviewQueue.css';

const STATUS_OPTIONS = ['NEEDS_REVIEW', 'IN_STOCK', 'OUT_OF_STOCK', 'SOLD', 'ARCHIVED'];
const FILTER_LABELS  = { ALL: 'All', ...Object.fromEntries(STATUS_OPTIONS.map(s => [s, s.replace('_', ' ')])) };

const STATUS_COLORS = {
  NEEDS_REVIEW: 'rq-status-review',
  IN_STOCK:     'rq-status-instock',
  OUT_OF_STOCK: 'rq-status-oos',
  SOLD:         'rq-status-sold',
  ARCHIVED:     'rq-status-archived',
};

const EMPTY_EDIT = {
  title: '', description: '', dimensions: '', materials: '',
  quantity: '', price: '', notes: '', status: '',
};

const AdminReviewQueue = () => {
  const { logout, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [artworks,     setArtworks]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [filter,       setFilter]       = useState('NEEDS_REVIEW');
  const [editingId,    setEditingId]    = useState(null);
  const [editForm,     setEditForm]     = useState(EMPTY_EDIT);
  const [editSaving,   setEditSaving]   = useState(false);
  const [editError,    setEditError]    = useState('');
  const [actionMsg,    setActionMsg]    = useState('');
  const [brokenImageIds, setBrokenImageIds] = useState(() => new Set());

  useEffect(() => {
    if (!authLoading && !isAdmin()) navigate('/ckk-secure-admin');
  }, [authLoading, isAdmin, navigate]);

  const loadArtworks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await artworksAPI.getAllAdmin();
      setArtworks(Array.isArray(data) ? data : []);
    } catch {
      setArtworks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isAdmin()) loadArtworks();
  }, [authLoading, isAdmin, loadArtworks]);

  // ── Derived data ────────────────────────────────────────────────────────────
  const counts = STATUS_OPTIONS.reduce((acc, s) => {
    acc[s] = artworks.filter(a => a.status === s).length;
    return acc;
  }, { ALL: artworks.length });

  const filtered = filter === 'ALL'
    ? artworks
    : artworks.filter(a => a.status === filter);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const flash = (msg) => { setActionMsg(msg); setTimeout(() => setActionMsg(''), 3000); };

  const handleStatusChange = async (artwork, newStatus) => {
    const label = newStatus === 'IN_STOCK'
      ? 'This will make the artwork visible on the public website. Continue?'
      : `Change status to ${newStatus.replace('_', ' ')}?`;
    if (!window.confirm(label)) return;
    try {
      await artworksAPI.updateStatus(artwork.id, newStatus);
      flash(`"${artwork.title}" → ${newStatus.replace('_', ' ')}`);
      loadArtworks();
    } catch (err) {
      flash(`Error: ${err.response?.data?.error || 'Status update failed'}`);
    }
  };

  const startEdit = (artwork) => {
    setEditingId(artwork.id);
    setEditForm({
      title:        artwork.title        || '',
      description:  artwork.description  || '',
      dimensions:   artwork.dimensions   || '',
      materials:    artwork.materials    || '',
      quantity:     artwork.quantity     != null ? String(artwork.quantity) : '',
      price:        artwork.price_inr    != null ? String(artwork.price_inr) : '',
      notes:        artwork.notes        || '',
      status:       artwork.status       || '',
    });
    setEditError('');
  };

  const cancelEdit = () => { setEditingId(null); setEditForm(EMPTY_EDIT); setEditError(''); };

  const saveEdit = async (artwork) => {
    setEditSaving(true);
    setEditError('');
    try {
      const fd = new FormData();
      if (editForm.title)       fd.append('title',       editForm.title.trim());
      if (editForm.description) fd.append('description', editForm.description.trim());
      if (editForm.dimensions)  fd.append('size',        editForm.dimensions.trim());
      if (editForm.materials)   fd.append('materials',   editForm.materials.trim());
      if (editForm.quantity)    fd.append('quantity',    editForm.quantity);
      if (editForm.price)       fd.append('price',       editForm.price);
      if (editForm.notes)       fd.append('notes',       editForm.notes.trim());
      if (editForm.status && editForm.status !== artwork.status)
                                fd.append('status',      editForm.status);
      await artworksAPI.update(artwork.id, fd);
      flash(`"${editForm.title || artwork.title}" saved`);
      cancelEdit();
      loadArtworks();
    } catch (err) {
      setEditError(err.response?.data?.error || 'Save failed');
    } finally {
      setEditSaving(false);
    }
  };

  const handleLogout = () => { logout(); navigate('/ckk-secure-admin'); };

  if (loading) {
    return (
      <div className="admin-review-queue">
        <div className="admin-header">
          <h1>Review Queue</h1>
          <div className="admin-actions">
            <button onClick={() => navigate('/ckk-secure-admin/dashboard')} className="btn-secondary">← Dashboard</button>
            <button onClick={handleLogout} className="btn-logout">Logout</button>
          </div>
        </div>
        <div className="rq-loading">Loading artworks…</div>
      </div>
    );
  }

  return (
    <div className="admin-review-queue">
      {/* Header */}
      <div className="admin-header">
        <h1>Review Queue</h1>
        <div className="admin-actions">
          <button onClick={() => navigate('/ckk-secure-admin/inventory-sync')} className="btn-secondary">
            Inventory Sync
          </button>
          <button onClick={() => navigate('/ckk-secure-admin/dashboard')} className="btn-secondary">
            ← Dashboard
          </button>
          <button onClick={() => navigate('/')} className="btn-secondary">View Site</button>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </div>

      <div className="rq-content">

        {/* Flash message */}
        {actionMsg && <div className="rq-flash">{actionMsg}</div>}

        {/* Summary counts */}
        <div className="rq-summary">
          {[['ALL', counts.ALL], ...STATUS_OPTIONS.map(s => [s, counts[s]])].map(([key, n]) => (
            <button
              key={key}
              className={`rq-count-card${filter === key ? ' rq-count-active' : ''}`}
              onClick={() => setFilter(key)}
            >
              <span className="rq-count-num">{n}</span>
              <span className="rq-count-lbl">{FILTER_LABELS[key]}</span>
            </button>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="rq-filter-tabs">
          {Object.entries(FILTER_LABELS).map(([key, label]) => (
            <button
              key={key}
              className={`rq-tab${filter === key ? ' rq-tab-active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
              <span className="rq-tab-count">{counts[key] ?? 0}</span>
            </button>
          ))}
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div className="rq-empty">
            No artworks in <strong>{FILTER_LABELS[filter]}</strong>.
            {filter === 'NEEDS_REVIEW' && (
              <span> Upload a workbook via{' '}
                <button className="rq-link" onClick={() => navigate('/ckk-secure-admin/inventory-sync')}>
                  Inventory Sync
                </button>.
              </span>
            )}
          </div>
        ) : (
          <div className="rq-table-wrap">
            <table className="rq-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>SKU</th>
                  <th>Status</th>
                  <th>Category</th>
                  <th>Qty</th>
                  <th>Price (INR)</th>
                  <th>Price (USD)</th>
                  <th>Dimensions</th>
                  <th>Materials</th>
                  <th>Image</th>
                  <th>Image File</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(artwork => (
                  <React.Fragment key={artwork.id}>
                    <tr className={artwork.id === editingId ? 'rq-row-editing' : ''}>
                      <td className="rq-td-title">{artwork.title}</td>
                      <td className="rq-td-sku">{artwork.sku || '—'}</td>
                      <td>
                        <span className={`rq-status-badge ${STATUS_COLORS[artwork.status] || ''}`}>
                          {artwork.status?.replace('_', ' ') || '—'}
                        </span>
                      </td>
                      <td>{artwork.category || '—'}</td>
                      <td className="rq-td-center">{artwork.quantity ?? '—'}</td>
                      <td className="rq-td-right">
                        {artwork.price_inr != null ? `₹${Number(artwork.price_inr).toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className="rq-td-right">
                        {artwork.price_usd != null ? `$${Number(artwork.price_usd).toLocaleString()}` : '—'}
                      </td>
                      <td>{artwork.dimensions || '—'}</td>
                      <td>{artwork.materials || '—'}</td>
                      <td className="rq-td-thumb">
                        {artwork.image
                          && (artwork.image.startsWith('http') || artwork.image.startsWith('/api/'))
                          && !brokenImageIds.has(artwork.id)
                          ? (
                            <img
                              src={artwork.image}
                              alt={artwork.title}
                              className="rq-thumb"
                              onError={() => setBrokenImageIds(prev => new Set(prev).add(artwork.id))}
                            />
                          )
                          : <span className="rq-thumb-placeholder">No image</span>}
                      </td>
                      <td className="rq-td-sku">{artwork.image_filename || '—'}</td>
                      <td className="rq-td-center" style={{display:'none'}}>
                        {/* legacy "Has Image" column hidden — replaced by thumbnail */}
                        {artwork.image && (artwork.image.startsWith('http') || artwork.image.startsWith('/api/')) ? '✅' : '—'}
                      </td>
                      <td className="rq-td-date">
                        {artwork.created_at ? new Date(artwork.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="rq-td-actions">
                        <div className="rq-actions">
                          <button
                            className="rq-btn rq-btn-edit"
                            onClick={() => editingId === artwork.id ? cancelEdit() : startEdit(artwork)}
                          >
                            {editingId === artwork.id ? 'Cancel' : 'Edit'}
                          </button>
                          {artwork.status !== 'IN_STOCK' && (
                            <button
                              className="rq-btn rq-btn-publish"
                              onClick={() => handleStatusChange(artwork, 'IN_STOCK')}
                            >
                              Publish
                            </button>
                          )}
                          {artwork.status !== 'OUT_OF_STOCK' && artwork.status !== 'ARCHIVED' && (
                            <button
                              className="rq-btn rq-btn-oos"
                              onClick={() => handleStatusChange(artwork, 'OUT_OF_STOCK')}
                            >
                              OOS
                            </button>
                          )}
                          {artwork.status !== 'ARCHIVED' && (
                            <button
                              className="rq-btn rq-btn-archive"
                              onClick={() => handleStatusChange(artwork, 'ARCHIVED')}
                            >
                              Archive
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Inline edit panel */}
                    {editingId === artwork.id && (
                      <tr className="rq-edit-row">
                        <td colSpan={13}>
                          <div className="rq-edit-panel">
                            <h4>Edit — {artwork.title}</h4>
                            {editError && <div className="rq-edit-error">{editError}</div>}
                            <div className="rq-edit-grid">
                              <label>
                                Title
                                <input value={editForm.title}
                                  onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
                              </label>
                              <label>
                                Status
                                <select value={editForm.status}
                                  onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                                  {STATUS_OPTIONS.map(s => (
                                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                Quantity
                                <input type="number" min="0" value={editForm.quantity}
                                  onChange={e => setEditForm(f => ({ ...f, quantity: e.target.value }))} />
                              </label>
                              <label>
                                Price (INR)
                                <input type="number" min="0" value={editForm.price}
                                  onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))} />
                              </label>
                              <label>
                                Dimensions
                                <input value={editForm.dimensions}
                                  onChange={e => setEditForm(f => ({ ...f, dimensions: e.target.value }))} />
                              </label>
                              <label>
                                Materials
                                <input value={editForm.materials}
                                  onChange={e => setEditForm(f => ({ ...f, materials: e.target.value }))} />
                              </label>
                              <label className="rq-edit-full">
                                Description
                                <textarea rows={3} value={editForm.description}
                                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
                              </label>
                              <label className="rq-edit-full">
                                Notes (internal)
                                <textarea rows={2} value={editForm.notes}
                                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
                              </label>
                            </div>
                            <div className="rq-edit-actions">
                              <button
                                className="btn-primary"
                                onClick={() => saveEdit(artwork)}
                                disabled={editSaving}
                              >
                                {editSaving ? 'Saving…' : 'Save Changes'}
                              </button>
                              <button className="btn-secondary" onClick={cancelEdit}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminReviewQueue;
