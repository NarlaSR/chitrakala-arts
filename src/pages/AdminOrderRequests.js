import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { orderRequestsAPI } from '../services/api';
import '../styles/AdminOrderRequests.css';

const STATUS_OPTIONS = ['NEW', 'REVIEWING', 'QUOTE_SENT', 'CONFIRMED', 'CANCELLED', 'FULFILLED'];
const FILTER_LABELS = {
  ALL: 'All',
  NEW: 'New',
  REVIEWING: 'Reviewing',
  QUOTE_SENT: 'Quote Sent',
  CONFIRMED: 'Confirmed',
  CANCELLED: 'Cancelled',
  FULFILLED: 'Fulfilled',
};

const STATUS_COLORS = {
  NEW: 'or-status-new',
  REVIEWING: 'or-status-reviewing',
  QUOTE_SENT: 'or-status-quote',
  CONFIRMED: 'or-status-confirmed',
  CANCELLED: 'or-status-cancelled',
  FULFILLED: 'or-status-fulfilled',
};

const AdminOrderRequests = () => {
  const { logout, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [expandedId, setExpandedId] = useState(null);
  const [detailCache, setDetailCache] = useState({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [statusDrafts, setStatusDrafts] = useState({});
  const [statusSaving, setStatusSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState('');

  // Reservation state
  const [pickerOpen, setPickerOpen] = useState(null); // { orderId, itemId } or null
  const [candidatesCache, setCandidatesCache] = useState({}); // key: `${orderId}:${itemId}` → array
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [reserveTarget, setReserveTarget] = useState(null); // { orderId, itemId, piId } pending confirm
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAdmin()) navigate('/ckk-secure-admin');
  }, [authLoading, isAdmin, navigate]);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const data = await orderRequestsAPI.getAll();
      setRequests(Array.isArray(data) ? data : []);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isAdmin()) loadRequests();
  }, [authLoading, isAdmin, loadRequests]);

  const counts = STATUS_OPTIONS.reduce((acc, s) => {
    acc[s] = requests.filter(r => r.status === s).length;
    return acc;
  }, { ALL: requests.length });

  const filtered = filter === 'ALL' ? requests : requests.filter(r => r.status === filter);

  const flash = (msg) => { setActionMsg(msg); setTimeout(() => setActionMsg(''), 4000); };

  const toggleExpand = async (request) => {
    if (expandedId === request.id) {
      setExpandedId(null);
      setPickerOpen(null);
      setReserveTarget(null);
      return;
    }
    setExpandedId(request.id);
    setStatusDrafts(prev => ({ ...prev, [request.id]: prev[request.id] || request.status }));
    if (!detailCache[request.id]) {
      setDetailLoading(true);
      try {
        const detail = await orderRequestsAPI.getById(request.id);
        setDetailCache(prev => ({ ...prev, [request.id]: detail }));
      } catch {
        flash('Failed to load request details');
      } finally {
        setDetailLoading(false);
      }
    }
  };

  const refreshDetail = async (requestId) => {
    try {
      const detail = await orderRequestsAPI.getById(requestId);
      setDetailCache(prev => ({ ...prev, [requestId]: detail }));
    } catch {
      flash('Failed to refresh request details');
    }
  };

  const saveStatus = async (requestId, currentStatus) => {
    const newStatus = statusDrafts[requestId];
    if (!newStatus || newStatus === currentStatus) return;
    setStatusSaving(true);
    try {
      const updated = await orderRequestsAPI.updateStatus(requestId, newStatus);
      flash(`Request #${requestId} → ${FILTER_LABELS[newStatus] || newStatus}`);
      setDetailCache(prev => ({
        ...prev,
        [requestId]: prev[requestId] ? { ...prev[requestId], status: updated.status } : prev[requestId],
      }));
      // Close any open reservation picker for this order so stale picker state cannot dangle.
      setPickerOpen(prev => (prev?.orderId === requestId ? null : prev));
      setReserveTarget(prev => (prev?.orderId === requestId ? null : prev));
      // Refresh detail to pick up any auto-released reservations from CANCELLED
      if (newStatus === 'CANCELLED') {
        await refreshDetail(requestId);
        // Clear all candidate caches for this order since reservations were released
        setCandidatesCache(prev => {
          const next = { ...prev };
          Object.keys(next).forEach(k => { if (k.startsWith(`${requestId}:`)) delete next[k]; });
          return next;
        });
      }
      loadRequests();
    } catch (err) {
      flash(`Error: ${err.response?.data?.error || 'Status update failed'}`);
    } finally {
      setStatusSaving(false);
    }
  };

  const openPicker = async (orderId, itemId) => {
    const key = `${orderId}:${itemId}`;
    setPickerOpen({ orderId, itemId });
    setReserveTarget(null);
    if (!candidatesCache[key]) {
      setCandidatesLoading(true);
      try {
        const candidates = await orderRequestsAPI.getReservationCandidates(orderId, itemId);
        setCandidatesCache(prev => ({ ...prev, [key]: candidates }));
      } catch {
        flash('Failed to load reservation candidates');
        setPickerOpen(null);
      } finally {
        setCandidatesLoading(false);
      }
    }
  };

  const closePicker = () => {
    setPickerOpen(null);
    setReserveTarget(null);
  };

  const selectCandidate = (orderId, itemId, piId) => {
    setReserveTarget({ orderId, itemId, piId });
  };

  const confirmReserve = async () => {
    if (!reserveTarget) return;
    const { orderId, itemId, piId } = reserveTarget;
    setActionBusy(true);
    try {
      await orderRequestsAPI.reserve(orderId, itemId, piId);
      flash(`PI #${piId} reserved for item #${itemId}`);
      setPickerOpen(null);
      setReserveTarget(null);
      // Invalidate all candidate caches for this order — the reserved PI may have been
      // visible in sibling items' cached candidate lists.
      setCandidatesCache(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => { if (k.startsWith(`${orderId}:`)) delete next[k]; });
        return next;
      });
      await refreshDetail(orderId);
    } catch (err) {
      flash(`Reserve failed: ${err.response?.data?.error || 'Unknown error'}`);
    } finally {
      setActionBusy(false);
    }
  };

  const handleRelease = async (orderId, itemId, piId) => {
    if (!window.confirm(`Release reservation of PI #${piId} from item #${itemId}? The unit will return to Available.`)) return;
    setActionBusy(true);
    try {
      await orderRequestsAPI.release(orderId, itemId);
      flash(`PI #${piId} reservation released`);
      // Invalidate all candidate caches for this order — the newly AVAILABLE PI may
      // now be eligible to appear in sibling items' candidate lists.
      setCandidatesCache(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => { if (k.startsWith(`${orderId}:`)) delete next[k]; });
        return next;
      });
      await refreshDetail(orderId);
    } catch (err) {
      flash(`Release failed: ${err.response?.data?.error || 'Unknown error'}`);
    } finally {
      setActionBusy(false);
    }
  };

  const handleLogout = () => { logout(); navigate('/ckk-secure-admin'); };

  if (loading) {
    return (
      <div className="admin-order-requests">
        <div className="admin-header">
          <h1>Order Requests</h1>
          <div className="admin-actions">
            <button onClick={() => navigate('/ckk-secure-admin/dashboard')} className="btn-secondary">← Dashboard</button>
            <button onClick={handleLogout} className="btn-logout">Logout</button>
          </div>
        </div>
        <div className="or-loading">Loading order requests…</div>
      </div>
    );
  }

  return (
    <div className="admin-order-requests">
      <div className="admin-header">
        <h1>Order Requests</h1>
        <div className="admin-actions">
          <button onClick={() => navigate('/ckk-secure-admin/review-queue')} className="btn-secondary">
            Review Queue
          </button>
          <button onClick={() => navigate('/ckk-secure-admin/dashboard')} className="btn-secondary">
            ← Dashboard
          </button>
          <button onClick={() => navigate('/')} className="btn-secondary">View Site</button>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </div>

      <div className="or-content">
        {actionMsg && <div className="or-flash">{actionMsg}</div>}

        <div className="or-summary">
          {[['ALL', counts.ALL], ...STATUS_OPTIONS.map(s => [s, counts[s]])].map(([key, n]) => (
            <button
              key={key}
              className={`or-count-card${filter === key ? ' or-count-active' : ''}`}
              onClick={() => setFilter(key)}
            >
              <span className="or-count-num">{n}</span>
              <span className="or-count-lbl">{FILTER_LABELS[key]}</span>
            </button>
          ))}
        </div>

        <div className="or-filter-tabs">
          {Object.entries(FILTER_LABELS).map(([key, label]) => (
            <button
              key={key}
              className={`or-tab${filter === key ? ' or-tab-active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
              <span className="or-tab-count">{counts[key] ?? 0}</span>
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="or-empty">
            No order requests in <strong>{FILTER_LABELS[filter]}</strong>.
          </div>
        ) : (
          <div className="or-table-wrap">
            <table className="or-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Customer</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Items</th>
                  <th>Submitted</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(request => {
                  const detail = detailCache[request.id];
                  const isExpanded = expandedId === request.id;
                  return (
                    <React.Fragment key={request.id}>
                      <tr className={isExpanded ? 'or-row-expanded' : ''}>
                        <td className="or-td-id">#{request.id}</td>
                        <td className="or-td-title">{request.customer_name}</td>
                        <td>{request.customer_email}</td>
                        <td>
                          <span className={`or-status-badge ${STATUS_COLORS[request.status] || ''}`}>
                            {FILTER_LABELS[request.status] || request.status}
                          </span>
                        </td>
                        <td className="or-td-center">{request.item_count}</td>
                        <td className="or-td-date">
                          {request.created_at ? new Date(request.created_at).toLocaleString() : '—'}
                        </td>
                        <td className="or-td-actions">
                          <button className="or-btn or-btn-view" onClick={() => toggleExpand(request)}>
                            {isExpanded ? 'Hide' : 'View'}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="or-detail-row">
                          <td colSpan={7}>
                            <div className="or-detail-panel">
                              {detailLoading && !detail ? (
                                <div className="or-detail-loading">Loading details…</div>
                              ) : detail ? (
                                <>
                                  <div className="or-detail-grid">
                                    <div>
                                      <h4>Customer</h4>
                                      <p><strong>Name:</strong> {detail.customer_name}</p>
                                      <p><strong>Email:</strong> {detail.customer_email}</p>
                                      <p><strong>Phone:</strong> {detail.customer_phone || '—'}</p>
                                      {detail.customer_message && (
                                        <p><strong>Message:</strong> {detail.customer_message}</p>
                                      )}
                                    </div>
                                    <div>
                                      <h4>Status</h4>
                                      <div className="or-status-edit">
                                        <select
                                          value={statusDrafts[request.id] ?? detail.status}
                                          onChange={e => setStatusDrafts(prev => ({ ...prev, [request.id]: e.target.value }))}
                                        >
                                          {STATUS_OPTIONS.map(s => (
                                            <option key={s} value={s}>{FILTER_LABELS[s]}</option>
                                          ))}
                                        </select>
                                        <button
                                          className="btn-primary"
                                          disabled={statusSaving || (statusDrafts[request.id] ?? detail.status) === detail.status}
                                          onClick={() => saveStatus(request.id, detail.status)}
                                        >
                                          {statusSaving ? 'Saving…' : 'Save Status'}
                                        </button>
                                      </div>
                                    </div>
                                  </div>

                                  <h4 className="or-items-heading">Requested Items</h4>
                                  <div className="or-items-table-wrap">
                                    <table className="or-items-table">
                                      <thead>
                                        <tr>
                                          <th>Image</th>
                                          <th>SKU</th>
                                          <th>Title</th>
                                          <th>Category</th>
                                          <th>Size</th>
                                          <th>Qty</th>
                                          <th>Price (INR)</th>
                                          <th>Price (USD)</th>
                                          <th>Availability</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(detail.items || []).map(item => (
                                          <tr key={item.id}>
                                            <td className="or-td-thumb">
                                              {item.snapshot_image ? (
                                                <img src={item.snapshot_image} alt={item.snapshot_title} className="or-thumb" />
                                              ) : (
                                                <span className="or-thumb-placeholder">No image</span>
                                              )}
                                            </td>
                                            <td className="or-td-sku">{item.snapshot_sku || '—'}</td>
                                            <td>{item.snapshot_title}</td>
                                            <td>{item.snapshot_category || '—'}</td>
                                            <td>{item.snapshot_size_label || '—'}</td>
                                            <td className="or-td-center">{item.quantity}</td>
                                            <td className="or-td-right">
                                              {item.snapshot_price_inr != null ? `₹${Number(item.snapshot_price_inr).toLocaleString('en-IN')}` : '—'}
                                            </td>
                                            <td className="or-td-right">
                                              {item.snapshot_price_usd != null ? `$${Number(item.snapshot_price_usd).toLocaleString()}` : '—'}
                                            </td>
                                            <td>
                                              <span className={`or-avail-badge${item.snapshot_availability === 'MADE_TO_ORDER' ? ' or-avail-mto' : ' or-avail-instock'}`}>
                                                {item.snapshot_availability?.replace(/_/g, ' ') || '—'}
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>

                                  {/* Inventory Reservation Section */}
                                  <h4 className="or-items-heading or-inv-heading">Inventory Reservation</h4>
                                  <div className="or-inv-section">
                                    {(detail.items || []).map(item => {
                                      const isReserved = item.physical_inventory_id != null;
                                      const isConfirmed = detail.status === 'CONFIRMED';
                                      const pickerKey = `${detail.id}:${item.id}`;
                                      const isPickerOpenForThis =
                                        pickerOpen && pickerOpen.orderId === detail.id && pickerOpen.itemId === item.id;
                                      const candidates = candidatesCache[pickerKey] || [];

                                      return (
                                        <div key={item.id} className="or-inv-item-row">
                                          <div className="or-inv-item-info">
                                            <span className="or-inv-item-label">
                                              Item #{item.id} — {item.snapshot_title}
                                              {item.snapshot_size_label ? ` (${item.snapshot_size_label})` : ''}
                                            </span>
                                            {isReserved ? (
                                              <span className="or-inv-reserved-badge">
                                                Reserved: PI #{item.physical_inventory_id}
                                              </span>
                                            ) : (
                                              <span className="or-inv-unreserved-badge">Not reserved</span>
                                            )}
                                          </div>

                                          <div className="or-inv-actions">
                                            {isReserved && (
                                              <button
                                                className="or-btn or-btn-release"
                                                disabled={actionBusy}
                                                onClick={() => handleRelease(detail.id, item.id, item.physical_inventory_id)}
                                              >
                                                Release Reservation
                                              </button>
                                            )}
                                            {!isReserved && isConfirmed && !isPickerOpenForThis && (
                                              <button
                                                className="or-btn or-btn-reserve"
                                                disabled={actionBusy}
                                                onClick={() => openPicker(detail.id, item.id)}
                                              >
                                                Reserve Inventory
                                              </button>
                                            )}
                                            {!isReserved && !isConfirmed && (
                                              <span className="or-inv-status-note">
                                                Reservation requires CONFIRMED status
                                              </span>
                                            )}
                                          </div>

                                          {isPickerOpenForThis && (
                                            <div className="or-inv-picker">
                                              <div className="or-inv-picker-header">
                                                <strong>Select a physical inventory unit to reserve</strong>
                                                <button className="or-inv-picker-close" onClick={closePicker}>✕</button>
                                              </div>
                                              {candidatesLoading ? (
                                                <div className="or-inv-picker-loading">Loading candidates…</div>
                                              ) : candidates.length === 0 ? (
                                                <div className="or-inv-empty-state">
                                                  No inventory is currently available for reservation. Inventory must be received, inspected, and made Available first.
                                                </div>
                                              ) : (
                                                <ul className="or-inv-candidate-list">
                                                  {candidates.map(pi => {
                                                    const isSelected =
                                                      reserveTarget &&
                                                      reserveTarget.orderId === detail.id &&
                                                      reserveTarget.itemId === item.id &&
                                                      reserveTarget.piId === pi.id;
                                                    return (
                                                      <li
                                                        key={pi.id}
                                                        className={`or-inv-candidate${isSelected ? ' or-inv-candidate-selected' : ''}`}
                                                        onClick={() => selectCandidate(detail.id, item.id, pi.id)}
                                                      >
                                                        <span className="or-inv-candidate-id">PI #{pi.id}</span>
                                                        {pi.size_label && (
                                                          <span className="or-inv-candidate-size">{pi.size_label}</span>
                                                        )}
                                                        {pi.source && (
                                                          <span className="or-inv-candidate-source">Source: {pi.source}</span>
                                                        )}
                                                        {pi.condition_notes && (
                                                          <span className="or-inv-candidate-notes">{pi.condition_notes}</span>
                                                        )}
                                                        {pi.received_date && (
                                                          <span className="or-inv-candidate-date">
                                                            Received: {new Date(pi.received_date).toLocaleDateString()}
                                                          </span>
                                                        )}
                                                      </li>
                                                    );
                                                  })}
                                                </ul>
                                              )}
                                              {reserveTarget &&
                                                reserveTarget.orderId === detail.id &&
                                                reserveTarget.itemId === item.id && (
                                                  <div className="or-inv-picker-confirm">
                                                    <span>Reserve PI #{reserveTarget.piId} for this item?</span>
                                                    <button
                                                      className="btn-primary"
                                                      disabled={actionBusy}
                                                      onClick={confirmReserve}
                                                    >
                                                      {actionBusy ? 'Reserving…' : 'Confirm Reserve'}
                                                    </button>
                                                    <button
                                                      className="btn-secondary"
                                                      disabled={actionBusy}
                                                      onClick={() => setReserveTarget(null)}
                                                    >
                                                      Cancel
                                                    </button>
                                                  </div>
                                                )}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </>
                              ) : (
                                <div className="or-detail-loading">Failed to load details.</div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminOrderRequests;
