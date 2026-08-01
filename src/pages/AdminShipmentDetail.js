import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { inventoryAPI } from '../services/api';
import '../styles/AdminShipmentDetail.css';

const STATUS_LABELS = {
  DRAFT: 'Draft',
  READY_TO_SHIP: 'Ready to Ship',
  SHIPPED: 'Shipped',
  IN_TRANSIT: 'In Transit',
  CUSTOMS: 'Customs',
  DELIVERED: 'Delivered',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

const STATUS_COLORS = {
  DRAFT: 'asd-status-draft',
  READY_TO_SHIP: 'asd-status-ready',
  SHIPPED: 'asd-status-shipped',
  IN_TRANSIT: 'asd-status-transit',
  CUSTOMS: 'asd-status-customs',
  DELIVERED: 'asd-status-delivered',
  CLOSED: 'asd-status-closed',
  CANCELLED: 'asd-status-cancelled',
};

const UPDATABLE_STATUSES = [
  'DRAFT', 'READY_TO_SHIP', 'SHIPPED', 'IN_TRANSIT', 'CUSTOMS', 'CANCELLED',
];

const fmtDate = (val) =>
  val ? new Date(val).toLocaleDateString() : '—';

const fmtDateTime = (val) =>
  val ? new Date(val).toLocaleString() : '—';

const AdminShipmentDetail = () => {
  const { id } = useParams();
  const { logout, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [shipment, setShipment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const [statusForm, setStatusForm] = useState({ status: '', carrier: '' });
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [statusSuccess, setStatusSuccess] = useState('');
  const [statusError, setStatusError] = useState('');

  const [itemForm, setItemForm] = useState({
    artwork_id: '', artwork_size_id: '', quantity: 1, notes: '',
  });
  const [itemSubmitting, setItemSubmitting] = useState(false);
  const [itemError, setItemError] = useState('');

  const [removingId, setRemovingId] = useState(null);

  useEffect(() => {
    if (!authLoading && !isAdmin()) navigate('/ckk-secure-admin');
  }, [authLoading, isAdmin, navigate]);

  const loadShipment = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await inventoryAPI.getShipmentById(id);
      setShipment(data);
      setStatusForm({ status: data.status, carrier: data.carrier || '' });
    } catch (err) {
      setErrorMsg(
        err?.response?.status === 404 ? 'Shipment not found.' : 'Failed to load shipment.'
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!authLoading && isAdmin()) loadShipment();
  }, [authLoading, isAdmin, loadShipment]);

  const handleStatusSubmit = async (e) => {
    e.preventDefault();
    setStatusError('');
    setStatusSuccess('');
    if (statusForm.status === 'SHIPPED' && !statusForm.carrier.trim()) {
      setStatusError('Carrier is required when marking as Shipped.');
      return;
    }
    setStatusSubmitting(true);
    try {
      const fields = { status: statusForm.status };
      if (statusForm.carrier.trim()) fields.carrier = statusForm.carrier.trim();
      const updated = await inventoryAPI.updateShipment(id, fields);
      setShipment(prev => ({ ...prev, ...updated }));
      setStatusSuccess(`Status updated to ${STATUS_LABELS[updated.status]}.`);
    } catch (err) {
      setStatusError(err?.response?.data?.error || 'Failed to update status.');
    } finally {
      setStatusSubmitting(false);
    }
  };

  const handleItemFormChange = (e) => {
    const { name, value } = e.target;
    setItemForm(prev => ({
      ...prev,
      [name]: name === 'quantity' ? (Number(value) || 1) : value,
    }));
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    setItemError('');
    if (!itemForm.artwork_id.trim()) {
      setItemError('Artwork ID is required.');
      return;
    }
    setItemSubmitting(true);
    try {
      await inventoryAPI.addShipmentItem(id, {
        artwork_id: itemForm.artwork_id.trim(),
        artwork_size_id: itemForm.artwork_size_id ? Number(itemForm.artwork_size_id) : null,
        quantity: itemForm.quantity || 1,
        notes: itemForm.notes.trim() || null,
      });
      setItemForm({ artwork_id: '', artwork_size_id: '', quantity: 1, notes: '' });
      await loadShipment();
    } catch (err) {
      setItemError(err?.response?.data?.error || 'Failed to add item.');
    } finally {
      setItemSubmitting(false);
    }
  };

  const handleRemoveItem = async (itemId) => {
    setRemovingId(itemId);
    try {
      await inventoryAPI.removeShipmentItem(id, itemId);
      await loadShipment();
    } catch (err) {
      setErrorMsg(err?.response?.data?.error || 'Failed to remove item.');
    } finally {
      setRemovingId(null);
    }
  };

  const handleLogout = () => { logout(); navigate('/ckk-secure-admin'); };

  const canAddItems = shipment && ['DRAFT', 'READY_TO_SHIP'].includes(shipment.status);
  const isDraft = shipment?.status === 'DRAFT';

  const header = (
    <div className="admin-header">
      <h1>Shipment {shipment ? `#${shipment.id}` : 'Detail'}</h1>
      <div className="admin-actions">
        <button onClick={() => navigate('/ckk-secure-admin/shipments')} className="btn-secondary">
          ← Shipments
        </button>
        <button onClick={handleLogout} className="btn-logout">Logout</button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="admin-shipment-detail">
        {header}
        <div className="asd-loading">Loading…</div>
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="admin-shipment-detail">
        {header}
        <div className="asd-content">
          <div className="asd-error">{errorMsg || 'Shipment not found.'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shipment-detail">
      {header}

      <div className="asd-content">
        {errorMsg && <div className="asd-error">{errorMsg}</div>}

        {/* Shipment metadata */}
        <div className="asd-card">
          <div className="asd-card-header">
            <h2 className="asd-card-title">{shipment.reference_number}</h2>
            <span className={`asd-status-badge ${STATUS_COLORS[shipment.status] || ''}`}>
              {STATUS_LABELS[shipment.status] || shipment.status}
            </span>
          </div>
          <div className="asd-meta-grid">
            <div className="asd-meta-item">
              <span className="asd-meta-label">Origin</span>
              <span className="asd-meta-value">{shipment.source_location || '—'}</span>
            </div>
            <div className="asd-meta-item">
              <span className="asd-meta-label">Destination</span>
              <span className="asd-meta-value">{shipment.destination_location || '—'}</span>
            </div>
            <div className="asd-meta-item">
              <span className="asd-meta-label">Carrier</span>
              <span className="asd-meta-value">{shipment.carrier || '—'}</span>
            </div>
            <div className="asd-meta-item">
              <span className="asd-meta-label">Tracking</span>
              <span className="asd-meta-value">{shipment.tracking_number || '—'}</span>
            </div>
            <div className="asd-meta-item">
              <span className="asd-meta-label">Expected Ship</span>
              <span className="asd-meta-value">{fmtDate(shipment.expected_ship_date)}</span>
            </div>
            <div className="asd-meta-item">
              <span className="asd-meta-label">Shipped Date</span>
              <span className="asd-meta-value">{fmtDate(shipment.shipped_date)}</span>
            </div>
            <div className="asd-meta-item">
              <span className="asd-meta-label">Created</span>
              <span className="asd-meta-value">{fmtDateTime(shipment.created_at)}</span>
            </div>
            {shipment.notes && (
              <div className="asd-meta-item asd-meta-full">
                <span className="asd-meta-label">Notes</span>
                <span className="asd-meta-value">{shipment.notes}</span>
              </div>
            )}
          </div>
        </div>

        {/* Status update */}
        <div className="asd-card">
          <h3 className="asd-section-title">Update Status</h3>
          {statusSuccess && <div className="asd-success">{statusSuccess}</div>}
          {statusError && <div className="asd-error">{statusError}</div>}
          <form className="asd-status-form" onSubmit={handleStatusSubmit}>
            <div className="asd-inline-row">
              <select
                className="asd-select"
                value={statusForm.status}
                onChange={(e) => setStatusForm(prev => ({ ...prev, status: e.target.value }))}
                disabled={statusSubmitting}
              >
                {UPDATABLE_STATUSES.map(s => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
              {statusForm.status === 'SHIPPED' && (
                <input
                  className="asd-input"
                  type="text"
                  placeholder="Carrier (required)"
                  value={statusForm.carrier}
                  onChange={(e) => setStatusForm(prev => ({ ...prev, carrier: e.target.value }))}
                  disabled={statusSubmitting}
                />
              )}
              <button type="submit" className="btn-primary" disabled={statusSubmitting}>
                {statusSubmitting ? 'Saving…' : 'Save Status'}
              </button>
            </div>
          </form>
        </div>

        {/* Manifest items */}
        <div className="asd-card">
          <h3 className="asd-section-title">
            Manifest Items ({shipment.items?.length || 0})
          </h3>

          {shipment.items?.length > 0 ? (
            <div className="asd-table-wrap">
              <table className="asd-table">
                <thead>
                  <tr>
                    <th>Item ID</th>
                    <th>Artwork</th>
                    <th>Size ID</th>
                    <th>Qty</th>
                    <th>Notes</th>
                    {isDraft && <th>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {shipment.items.map(item => (
                    <tr key={item.id}>
                      <td>#{item.id}</td>
                      <td>
                        {item.artwork_title}{' '}
                        <span className="asd-artwork-id">({item.artwork_id})</span>
                      </td>
                      <td className="asd-td-center">{item.artwork_size_id ?? '—'}</td>
                      <td className="asd-td-center">{item.quantity}</td>
                      <td>{item.notes || '—'}</td>
                      {isDraft && (
                        <td>
                          <button
                            className="asd-btn-remove"
                            onClick={() => handleRemoveItem(item.id)}
                            disabled={removingId === item.id}
                          >
                            {removingId === item.id ? '…' : 'Remove'}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="asd-empty">No manifest items recorded.</p>
          )}

          {/* Add item form — only for DRAFT / READY_TO_SHIP */}
          {canAddItems && (
            <div className="asd-add-item">
              <h4 className="asd-add-title">Add Artwork to Shipment</h4>
              {itemError && <div className="asd-error">{itemError}</div>}
              <form className="asd-add-form" onSubmit={handleAddItem}>
                <div className="asd-add-row">
                  <div className="asd-add-field asd-add-field--wide">
                    <label className="asd-label">
                      Artwork ID <span className="asd-required">*</span>
                    </label>
                    <input
                      className="asd-input"
                      name="artwork_id"
                      type="text"
                      placeholder="art-..."
                      value={itemForm.artwork_id}
                      onChange={handleItemFormChange}
                      disabled={itemSubmitting}
                    />
                  </div>
                  <div className="asd-add-field asd-add-field--small">
                    <label className="asd-label">Size ID</label>
                    <input
                      className="asd-input"
                      name="artwork_size_id"
                      type="number"
                      placeholder="—"
                      value={itemForm.artwork_size_id}
                      onChange={handleItemFormChange}
                      disabled={itemSubmitting}
                      min="1"
                    />
                  </div>
                  <div className="asd-add-field asd-add-field--small">
                    <label className="asd-label">Qty</label>
                    <input
                      className="asd-input"
                      name="quantity"
                      type="number"
                      min="1"
                      max="100"
                      value={itemForm.quantity}
                      onChange={handleItemFormChange}
                      disabled={itemSubmitting}
                    />
                  </div>
                  <div className="asd-add-field">
                    <label className="asd-label">Notes</label>
                    <input
                      className="asd-input"
                      name="notes"
                      type="text"
                      placeholder="Optional"
                      value={itemForm.notes}
                      onChange={handleItemFormChange}
                      disabled={itemSubmitting}
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="btn-primary asd-add-btn"
                  disabled={itemSubmitting}
                >
                  {itemSubmitting ? 'Adding…' : 'Add to Shipment'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminShipmentDetail;
