import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { inventoryAPI } from '../services/api';
import '../styles/AdminPhysicalInventory.css';

const PI_STATUSES = [
  'PENDING_SHIPMENT', 'IN_TRANSIT', 'RECEIVED', 'INSPECTION_REQUIRED',
  'INSPECTED', 'AVAILABLE', 'RESERVED', 'SOLD', 'DAMAGED', 'ARCHIVED',
];

const STATUS_LABELS = {
  ALL: 'All',
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

const STATUS_COLORS = {
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

const AdminPhysicalInventory = () => {
  const { logout, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!authLoading && !isAdmin()) navigate('/ckk-secure-admin');
  }, [authLoading, isAdmin, navigate]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await inventoryAPI.getPhysicalInventory();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
      setErrorMsg('Failed to load physical inventory.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isAdmin()) loadItems();
  }, [authLoading, isAdmin, loadItems]);

  const counts = PI_STATUSES.reduce((acc, s) => {
    acc[s] = items.filter(r => r.status === s).length;
    return acc;
  }, { ALL: items.length });

  const filtered = filter === 'ALL' ? items : items.filter(i => i.status === filter);

  const handleLogout = () => { logout(); navigate('/ckk-secure-admin'); };

  if (loading) {
    return (
      <div className="admin-physical-inventory">
        <div className="admin-header">
          <h1>Physical Inventory</h1>
          <div className="admin-actions">
            <button onClick={() => navigate('/ckk-secure-admin/dashboard')} className="btn-secondary">← Dashboard</button>
            <button onClick={handleLogout} className="btn-logout">Logout</button>
          </div>
        </div>
        <div className="pi-loading">Loading physical inventory…</div>
      </div>
    );
  }

  return (
    <div className="admin-physical-inventory">
      <div className="admin-header">
        <h1>Physical Inventory</h1>
        <div className="admin-actions">
          <button onClick={() => navigate('/ckk-secure-admin/shipments')} className="btn-secondary">
            Shipments
          </button>
          <button onClick={() => navigate('/ckk-secure-admin/dashboard')} className="btn-secondary">
            ← Dashboard
          </button>
          <button onClick={() => navigate('/')} className="btn-secondary">View Site</button>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </div>

      <div className="pi-content">
        {errorMsg && <div className="pi-error">{errorMsg}</div>}

        <div className="pi-filter-row">
          {[['ALL', counts.ALL], ...PI_STATUSES.map(s => [s, counts[s]])].map(([key, n]) => (
            <button
              key={key}
              className={`pi-filter-btn${filter === key ? ' pi-filter-active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {STATUS_LABELS[key]} <span className="pi-filter-count">{n}</span>
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="pi-empty">
            No physical inventory rows with status <strong>{STATUS_LABELS[filter]}</strong>.
          </div>
        ) : (
          <div className="pi-table-wrap">
            <table className="pi-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Artwork</th>
                  <th>SKU</th>
                  <th>Status</th>
                  <th>Shipment</th>
                  <th>Received</th>
                  <th>Inspected</th>
                  <th>Source</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id}>
                    <td>#{item.id}</td>
                    <td className="pi-td-title">
                      {item.artwork_title}
                      <span className="pi-artwork-id"> ({item.artwork_id})</span>
                    </td>
                    <td className="pi-td-sku">{item.artwork_sku || '—'}</td>
                    <td>
                      <span className={`pi-status-badge ${STATUS_COLORS[item.status] || ''}`}>
                        {STATUS_LABELS[item.status] || item.status}
                      </span>
                    </td>
                    <td>{item.shipment_reference || '—'}</td>
                    <td className="pi-td-date">
                      {item.received_date
                        ? new Date(item.received_date).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="pi-td-date">
                      {item.inspected_date
                        ? new Date(item.inspected_date).toLocaleDateString()
                        : '—'}
                    </td>
                    <td>{item.source || '—'}</td>
                    <td className="pi-td-notes">
                      {item.condition_notes || item.notes || '—'}
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

export default AdminPhysicalInventory;
