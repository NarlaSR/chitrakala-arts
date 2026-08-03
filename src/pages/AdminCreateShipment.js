import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { inventoryAPI } from '../services/api';
import '../styles/AdminCreateShipment.css';

const AdminCreateShipment = () => {
  const { logout, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    reference_number: '',
    source_location: '',
    destination_location: '',
    status: 'DRAFT',
    expected_ship_date: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!authLoading && !isAdmin()) navigate('/ckk-secure-admin');
  }, [authLoading, isAdmin, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!form.reference_number.trim()) {
      setErrorMsg('Reference number is required.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        reference_number: form.reference_number.trim(),
        source_location: form.source_location.trim() || null,
        destination_location: form.destination_location.trim() || null,
        status: form.status,
        expected_ship_date: form.expected_ship_date || null,
        notes: form.notes.trim() || null,
      };
      const shipment = await inventoryAPI.createShipment(payload);
      navigate(`/ckk-secure-admin/shipments/${shipment.id}`);
    } catch (err) {
      const msg = err?.response?.data?.error || 'Failed to create shipment.';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => { logout(); navigate('/ckk-secure-admin'); };

  return (
    <div className="admin-create-shipment">
      <div className="admin-header">
        <h1>Create Shipment</h1>
        <div className="admin-actions">
          <button onClick={() => navigate('/ckk-secure-admin/shipments')} className="btn-secondary">
            ← Shipments
          </button>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </div>

      <div className="acs-content">
        {errorMsg && <div className="acs-error">{errorMsg}</div>}

        <form className="acs-form" onSubmit={handleSubmit}>
          <div className="acs-field">
            <label className="acs-label" htmlFor="reference_number">
              Reference Number <span className="acs-required">*</span>
            </label>
            <input
              id="reference_number"
              name="reference_number"
              className="acs-input"
              type="text"
              placeholder="e.g. SHIP-2026-001"
              value={form.reference_number}
              onChange={handleChange}
              disabled={submitting}
            />
          </div>

          <div className="acs-row">
            <div className="acs-field">
              <label className="acs-label" htmlFor="source_location">Source Location</label>
              <input
                id="source_location"
                name="source_location"
                className="acs-input"
                type="text"
                placeholder="e.g. India - Artist Studio"
                value={form.source_location}
                onChange={handleChange}
                disabled={submitting}
              />
            </div>
            <div className="acs-field">
              <label className="acs-label" htmlFor="destination_location">Destination Location</label>
              <input
                id="destination_location"
                name="destination_location"
                className="acs-input"
                type="text"
                placeholder="e.g. USA - Warehouse"
                value={form.destination_location}
                onChange={handleChange}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="acs-row">
            <div className="acs-field">
              <label className="acs-label" htmlFor="status">Initial Status</label>
              <select
                id="status"
                name="status"
                className="acs-input"
                value={form.status}
                onChange={handleChange}
                disabled={submitting}
              >
                <option value="DRAFT">Draft</option>
                <option value="READY_TO_SHIP">Ready to Ship</option>
              </select>
            </div>
            <div className="acs-field">
              <label className="acs-label" htmlFor="expected_ship_date">Expected Ship Date</label>
              <input
                id="expected_ship_date"
                name="expected_ship_date"
                className="acs-input"
                type="date"
                value={form.expected_ship_date}
                onChange={handleChange}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="acs-field">
            <label className="acs-label" htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              name="notes"
              className="acs-textarea"
              rows={3}
              placeholder="Optional notes..."
              value={form.notes}
              onChange={handleChange}
              disabled={submitting}
            />
          </div>

          <div className="acs-actions">
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create Shipment'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate('/ckk-secure-admin/shipments')}
              disabled={submitting}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdminCreateShipment;
