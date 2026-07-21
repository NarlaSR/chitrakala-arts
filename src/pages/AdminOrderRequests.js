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

  const flash = (msg) => { setActionMsg(msg); setTimeout(() => setActionMsg(''), 3000); };

  const toggleExpand = async (request) => {
    if (expandedId === request.id) {
      setExpandedId(null);
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
      loadRequests();
    } catch (err) {
      flash(`Error: ${err.response?.data?.error || 'Status update failed'}`);
    } finally {
      setStatusSaving(false);
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
