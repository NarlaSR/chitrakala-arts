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
  'DRAFT', 'READY_TO_SHIP', 'SHIPPED', 'IN_TRANSIT', 'CUSTOMS', 'DELIVERED', 'CANCELLED',
];

const PI_STATUS_LABELS = {
  PENDING_SHIPMENT: 'Pending',
  IN_TRANSIT: 'In Transit',
  RECEIVED: 'Received',
  INSPECTION_REQUIRED: 'Needs Inspection',
  INSPECTED: 'Inspected',
  AVAILABLE: 'Available',
  RESERVED: 'Reserved',
  SOLD: 'Sold',
  DAMAGED: 'Damaged',
  ARCHIVED: 'Archived',
};

const PI_STATUS_COLORS = {
  PENDING_SHIPMENT: 'pi-status-pending',
  IN_TRANSIT: 'pi-status-transit',
  RECEIVED: 'pi-status-received',
  INSPECTION_REQUIRED: 'pi-status-inspection',
  INSPECTED: 'pi-status-inspected',
  AVAILABLE: 'pi-status-available',
  RESERVED: 'pi-status-reserved',
  SOLD: 'pi-status-sold',
  DAMAGED: 'pi-status-damaged',
  ARCHIVED: 'pi-status-archived',
};

// Allowed transitions per PI status — mirrors server PI_TRANSITION_MAP.
const PI_TRANSITIONS = {
  IN_TRANSIT: [
    { status: 'RECEIVED', label: 'Mark Received', btnClass: 'asd-btn-pi-received' },
  ],
  RECEIVED: [
    { status: 'INSPECTION_REQUIRED', label: 'Needs Inspection', btnClass: 'asd-btn-pi-inspection' },
    { status: 'INSPECTED', label: 'Mark Inspected', btnClass: 'asd-btn-pi-inspected' },
    { status: 'DAMAGED', label: 'Mark Damaged', btnClass: 'asd-btn-pi-damaged', requiresNotes: true },
    { status: 'ARCHIVED', label: 'Archive', btnClass: 'asd-btn-pi-archive' },
  ],
  INSPECTION_REQUIRED: [
    { status: 'INSPECTED', label: 'Mark Inspected', btnClass: 'asd-btn-pi-inspected' },
    { status: 'DAMAGED', label: 'Mark Damaged', btnClass: 'asd-btn-pi-damaged', requiresNotes: true },
    { status: 'ARCHIVED', label: 'Archive', btnClass: 'asd-btn-pi-archive' },
  ],
  INSPECTED: [
    { status: 'AVAILABLE', label: 'Mark Available', btnClass: 'asd-btn-pi-available' },
    { status: 'DAMAGED', label: 'Mark Damaged', btnClass: 'asd-btn-pi-damaged', requiresNotes: true },
    { status: 'ARCHIVED', label: 'Archive', btnClass: 'asd-btn-pi-archive' },
  ],
  AVAILABLE: [
    { status: 'DAMAGED', label: 'Mark Damaged', btnClass: 'asd-btn-pi-damaged', requiresNotes: true },
    { status: 'ARCHIVED', label: 'Archive', btnClass: 'asd-btn-pi-archive' },
  ],
  DAMAGED: [
    { status: 'AVAILABLE', label: 'Mark Available', btnClass: 'asd-btn-pi-available' },
    { status: 'ARCHIVED', label: 'Archive', btnClass: 'asd-btn-pi-archive' },
  ],
};

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

  const [statusForm, setStatusForm] = useState({ status: '', carrier: '', delivered_date: '' });
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [statusSuccess, setStatusSuccess] = useState('');
  const [statusError, setStatusError] = useState('');

  const [itemForm, setItemForm] = useState({
    artwork_id: '', artwork_size_id: '', quantity: 1, notes: '',
  });
  const [itemSubmitting, setItemSubmitting] = useState(false);
  const [itemError, setItemError] = useState('');

  const [removingId, setRemovingId] = useState(null);

  // Physical inventory rows for this shipment
  const [physicalItems, setPhysicalItems] = useState([]);
  const [piActions, setPiActions] = useState({}); // { [piId]: { damagedInput, conditionNotes, submitting, error } }

  useEffect(() => {
    if (!authLoading && !isAdmin()) navigate('/ckk-secure-admin');
  }, [authLoading, isAdmin, navigate]);

  const loadPhysicalItems = useCallback(async () => {
    try {
      const data = await inventoryAPI.getPhysicalInventoryByShipment(id);
      setPhysicalItems(Array.isArray(data) ? data : []);
    } catch {
      // non-fatal — shipment data is primary
    }
  }, [id]);

  const loadShipment = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const [shipData, piData] = await Promise.all([
        inventoryAPI.getShipmentById(id),
        inventoryAPI.getPhysicalInventoryByShipment(id),
      ]);
      setShipment(shipData);
      setStatusForm({
        status: shipData.status,
        carrier: shipData.carrier || '',
        delivered_date: shipData.delivered_date
          ? new Date(shipData.delivered_date).toISOString().split('T')[0]
          : '',
      });
      setPhysicalItems(Array.isArray(piData) ? piData : []);
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
      if (statusForm.status === 'DELIVERED' && statusForm.delivered_date) {
        fields.delivered_date = statusForm.delivered_date;
      }
      const updated = await inventoryAPI.updateShipment(id, fields);
      setShipment(prev => ({ ...prev, ...updated }));
      setStatusSuccess(`Status updated to ${STATUS_LABELS[updated.status]}.`);
      // Reload PI items in case DELIVERED cascade changed them
      await loadPhysicalItems();
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

  const handlePiAction = async (piId, toStatus, conditionNotes = null) => {
    setPiActions(prev => ({
      ...prev,
      [piId]: { ...prev[piId], submitting: true, error: '' },
    }));
    try {
      await inventoryAPI.updatePhysicalInventoryStatus(piId, toStatus, conditionNotes);
      await loadPhysicalItems();
      setPiActions(prev => { const n = { ...prev }; delete n[piId]; return n; });
    } catch (err) {
      setPiActions(prev => ({
        ...prev,
        [piId]: {
          ...prev[piId],
          submitting: false,
          error: err?.response?.data?.error || 'Failed to update status.',
        },
      }));
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
              <span className="asd-meta-label">Delivered Date</span>
              <span className="asd-meta-value">{fmtDate(shipment.delivered_date)}</span>
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
              {statusForm.status === 'DELIVERED' && (
                <input
                  className="asd-input"
                  type="date"
                  title="Delivered date (optional)"
                  value={statusForm.delivered_date}
                  onChange={(e) => setStatusForm(prev => ({ ...prev, delivered_date: e.target.value }))}
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

        {/* Physical Inventory */}
        <div className="asd-card">
          <h3 className="asd-section-title">
            Physical Inventory ({physicalItems.length})
          </h3>
          {physicalItems.length === 0 ? (
            <p className="asd-empty">No physical inventory rows for this shipment.</p>
          ) : (
            <div className="asd-table-wrap">
              <table className="asd-table asd-pi-table">
                <thead>
                  <tr>
                    <th>PI ID</th>
                    <th>Artwork</th>
                    <th>Status</th>
                    <th>Received</th>
                    <th>Inspected</th>
                    <th>Condition Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {physicalItems.map(pi => {
                    const transitions = PI_TRANSITIONS[pi.status] || [];
                    const actionState = piActions[pi.id] || {};
                    return (
                      <tr key={pi.id}>
                        <td>#{pi.id}</td>
                        <td>
                          {pi.artwork_title}{' '}
                          <span className="asd-artwork-id">({pi.artwork_id})</span>
                        </td>
                        <td>
                          <span className={`pi-status-badge ${PI_STATUS_COLORS[pi.status] || ''}`}>
                            {PI_STATUS_LABELS[pi.status] || pi.status}
                          </span>
                        </td>
                        <td className="asd-td-date">{fmtDate(pi.received_date)}</td>
                        <td className="asd-td-date">{fmtDate(pi.inspected_date)}</td>
                        <td className="asd-td-notes">{pi.condition_notes || '—'}</td>
                        <td className="asd-pi-action-cell">
                          {actionState.error && (
                            <div className="asd-pi-row-error">{actionState.error}</div>
                          )}
                          {transitions.length === 0 ? (
                            <span className="asd-pi-no-actions">—</span>
                          ) : (
                            <div className="asd-pi-actions">
                              {transitions.map(t =>
                                t.requiresNotes ? (
                                  actionState.damagedInput ? (
                                    <div key={t.status} className="asd-pi-notes-inline">
                                      <input
                                        className="asd-input asd-pi-notes-input"
                                        type="text"
                                        placeholder="Condition notes (required)"
                                        value={actionState.conditionNotes || ''}
                                        onChange={e => setPiActions(prev => ({
                                          ...prev,
                                          [pi.id]: { ...prev[pi.id], conditionNotes: e.target.value },
                                        }))}
                                        disabled={actionState.submitting}
                                      />
                                      <div className="asd-pi-notes-btns">
                                        <button
                                          className={`asd-btn-pi-action ${t.btnClass}`}
                                          onClick={() => handlePiAction(pi.id, t.status, actionState.conditionNotes)}
                                          disabled={actionState.submitting || !actionState.conditionNotes?.trim()}
                                        >
                                          {actionState.submitting ? '…' : 'Confirm'}
                                        </button>
                                        <button
                                          className="asd-btn-pi-action asd-btn-pi-cancel"
                                          onClick={() => setPiActions(prev => ({
                                            ...prev,
                                            [pi.id]: { ...prev[pi.id], damagedInput: false, conditionNotes: '' },
                                          }))}
                                          disabled={actionState.submitting}
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      key={t.status}
                                      className={`asd-btn-pi-action ${t.btnClass}`}
                                      onClick={() => setPiActions(prev => ({
                                        ...prev,
                                        [pi.id]: { ...prev[pi.id], damagedInput: true },
                                      }))}
                                      disabled={actionState.submitting}
                                    >
                                      {t.label}
                                    </button>
                                  )
                                ) : (
                                  <button
                                    key={t.status}
                                    className={`asd-btn-pi-action ${t.btnClass}`}
                                    onClick={() => handlePiAction(pi.id, t.status)}
                                    disabled={actionState.submitting}
                                  >
                                    {actionState.submitting ? '…' : t.label}
                                  </button>
                                )
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminShipmentDetail;
