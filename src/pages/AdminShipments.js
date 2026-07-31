import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { inventoryAPI } from '../services/api';
import '../styles/AdminShipments.css';

const SHIPMENT_STATUSES = [
  'DRAFT', 'READY_TO_SHIP', 'SHIPPED', 'IN_TRANSIT',
  'CUSTOMS', 'DELIVERED', 'CLOSED', 'CANCELLED',
];

const STATUS_LABELS = {
  ALL: 'All',
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
  DRAFT: 'sh-status-draft',
  READY_TO_SHIP: 'sh-status-ready',
  SHIPPED: 'sh-status-shipped',
  IN_TRANSIT: 'sh-status-transit',
  CUSTOMS: 'sh-status-customs',
  DELIVERED: 'sh-status-delivered',
  CLOSED: 'sh-status-closed',
  CANCELLED: 'sh-status-cancelled',
};

const AdminShipments = () => {
  const { logout, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!authLoading && !isAdmin()) navigate('/ckk-secure-admin');
  }, [authLoading, isAdmin, navigate]);

  const loadShipments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await inventoryAPI.getShipments();
      setShipments(Array.isArray(data) ? data : []);
    } catch {
      setShipments([]);
      setErrorMsg('Failed to load shipments.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isAdmin()) loadShipments();
  }, [authLoading, isAdmin, loadShipments]);

  const counts = SHIPMENT_STATUSES.reduce((acc, s) => {
    acc[s] = shipments.filter(r => r.status === s).length;
    return acc;
  }, { ALL: shipments.length });

  const filtered = filter === 'ALL' ? shipments : shipments.filter(s => s.status === filter);

  const handleLogout = () => { logout(); navigate('/ckk-secure-admin'); };

  if (loading) {
    return (
      <div className="admin-shipments">
        <div className="admin-header">
          <h1>Shipments</h1>
          <div className="admin-actions">
            <button onClick={() => navigate('/ckk-secure-admin/dashboard')} className="btn-secondary">← Dashboard</button>
            <button onClick={handleLogout} className="btn-logout">Logout</button>
          </div>
        </div>
        <div className="sh-loading">Loading shipments…</div>
      </div>
    );
  }

  return (
    <div className="admin-shipments">
      <div className="admin-header">
        <h1>Shipments</h1>
        <div className="admin-actions">
          <button
            onClick={() => navigate('/ckk-secure-admin/shipments/create')}
            className="btn-primary"
          >
            + Create Shipment
          </button>
          <button onClick={() => navigate('/ckk-secure-admin/physical-inventory')} className="btn-secondary">
            Physical Inventory
          </button>
          <button onClick={() => navigate('/ckk-secure-admin/dashboard')} className="btn-secondary">
            ← Dashboard
          </button>
          <button onClick={() => navigate('/')} className="btn-secondary">View Site</button>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </div>

      <div className="sh-content">
        {errorMsg && <div className="sh-error">{errorMsg}</div>}

        <div className="sh-filter-row">
          {[['ALL', counts.ALL], ...SHIPMENT_STATUSES.map(s => [s, counts[s]])].map(([key, n]) => (
            <button
              key={key}
              className={`sh-filter-btn${filter === key ? ' sh-filter-active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {STATUS_LABELS[key]} <span className="sh-filter-count">{n}</span>
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="sh-empty">
            No shipments with status <strong>{STATUS_LABELS[filter]}</strong>.
          </div>
        ) : (
          <div className="sh-table-wrap">
            <table className="sh-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Reference</th>
                  <th>Status</th>
                  <th>Origin</th>
                  <th>Destination</th>
                  <th>Carrier</th>
                  <th>Items</th>
                  <th>Shipped</th>
                  <th>Delivered</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(shipment => (
                  <tr key={shipment.id}>
                    <td>#{shipment.id}</td>
                    <td className="sh-td-ref">{shipment.reference_number || '—'}</td>
                    <td>
                      <span className={`sh-status-badge ${STATUS_COLORS[shipment.status] || ''}`}>
                        {STATUS_LABELS[shipment.status] || shipment.status}
                      </span>
                    </td>
                    <td>{shipment.source_location || '—'}</td>
                    <td>{shipment.destination_location || '—'}</td>
                    <td>{shipment.carrier || '—'}</td>
                    <td className="sh-td-center">{shipment.item_count}</td>
                    <td className="sh-td-date">
                      {shipment.shipped_date
                        ? new Date(shipment.shipped_date).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="sh-td-date">
                      {shipment.delivered_date
                        ? new Date(shipment.delivered_date).toLocaleDateString()
                        : '—'}
                    </td>
                    <td>
                      <Link
                        to={`/ckk-secure-admin/shipments/${shipment.id}`}
                        className="sh-btn sh-btn-view"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminShipments;
