import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/RequestCartModal.css';
import { useRequestCart } from '../context/RequestCartContext';
import RequestDetailsForm from './RequestDetailsForm';
import { orderRequestsAPI } from '../services/api';

const CONFIRMATION_STORAGE_KEY = 'orderRequestConfirmation';

const formatItemPrice = (item) => {
  if (item.price_inr != null) return `₹${Number(item.price_inr).toLocaleString('en-IN')}`;
  if (item.price_usd != null) return `$${Number(item.price_usd).toLocaleString()}`;
  return 'Price on request';
};

const availabilityLabel = (availability) =>
  availability === 'MADE_TO_ORDER' ? 'Made to Order' : 'Available';

const RequestCartModal = ({ open, onClose }) => {
  const { items, removeFromRequest, clearRequestCart } = useRequestCart();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Reset transient UI state whenever the modal is (re)opened
  useEffect(() => {
    if (open) {
      setSubmitError('');
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (formData) => {
    setSubmitting(true);
    setSubmitError('');
    try {
      const result = await orderRequestsAPI.create({
        name: formData.name,
        email: formData.email,
        phone: formData.phone || undefined,
        message: formData.message || undefined,
        // Only the artwork/size reference and quantity are sent — the
        // backend is the source of truth for SKU/title/category/size/price/
        // image/availability snapshots. Display-only fields on the cart
        // item (title, image, price, etc.) are never sent.
        items: items.map((item) => ({
          artwork_id: item.artwork_id,
          artwork_size_id: item.artwork_size_id || undefined,
          quantity: 1,
        })),
      });

      // Capture a confirmation snapshot from the already-safe response data
      // (the customer's own submitted details + the artwork snapshot already
      // shown to them) — no new API call, nothing admin-only. Stored in both
      // sessionStorage (survives refresh/back) and route state (freshest at
      // navigation time) before the cart is cleared or the modal closes, so
      // the confirmation can never be lost between submit and the next page.
      try {
        sessionStorage.setItem(CONFIRMATION_STORAGE_KEY, JSON.stringify(result.orderRequest));
      } catch {
        // sessionStorage can fail (private browsing, quota) — route state
        // below still carries the confirmation for this navigation.
      }

      // Only clear the cart and leave the modal after the confirmation data
      // is safely captured, per the required success ordering.
      clearRequestCart();
      onClose();
      navigate('/request-confirmation', { state: { confirmation: result.orderRequest } });
    } catch (err) {
      const backendError = err.response?.data?.error;
      if (backendError && backendError.startsWith('Item ')) {
        // Backend validation rejected one or more items (no longer public/
        // orderable, bad size reference, etc.) — cart is preserved so the
        // customer can remove/update the offending item and retry.
        setSubmitError('One or more items in your request are no longer available or valid. Please remove or update them and try again.');
      } else if (backendError) {
        // Every error message this endpoint returns (validation errors,
        // the maintenance-mode 503, the generic 500 fallback) is already a
        // customer-safe, human-written string — safe to show verbatim.
        setSubmitError(backendError);
      } else {
        setSubmitError('Something went wrong submitting your request. Please try again in a moment.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="request-cart-overlay" onClick={onClose}>
      <div className="request-cart-modal" onClick={(e) => e.stopPropagation()}>
        <button className="request-cart-close" onClick={onClose} aria-label="Close">&times;</button>
        <h2>Your Artwork Request</h2>

        {items.length === 0 ? (
          <p>You haven&rsquo;t added any artworks to your request yet.</p>
        ) : (
          <>
            <ul className="request-cart-list">
              {items.map((item) => (
                <li key={`${item.artwork_id}-${item.artwork_size_id || 'none'}`} className="request-cart-item">
                  <img
                    src={item.image || '/assets/images/placeholder.jpg'}
                    alt={item.title}
                    className="request-cart-item-image"
                  />
                  <div className="request-cart-item-info">
                    <span className="request-cart-item-title">{item.title}</span>
                    <span className="request-cart-item-meta">
                      {item.category}
                      {item.size_label ? ` · ${item.size_label}` : ''}
                    </span>
                    <span
                      className={`request-cart-availability${
                        item.availability === 'MADE_TO_ORDER' ? ' request-cart-availability--mto' : ''
                      }`}
                    >
                      {availabilityLabel(item.availability)}
                    </span>
                    <span className="request-cart-item-price">{formatItemPrice(item)}</span>
                  </div>
                  <button
                    className="request-cart-remove"
                    onClick={() => removeFromRequest(item.artwork_id, item.artwork_size_id)}
                    aria-label={`Remove ${item.title}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>

            <div className="request-cart-actions">
              <button className="btn-secondary" onClick={onClose}>Continue Browsing</button>
            </div>

            <RequestDetailsForm onSubmit={handleSubmit} submitting={submitting} />
            {submitError && (
              <div className="request-form-error request-cart-submit-error">{submitError}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default RequestCartModal;
