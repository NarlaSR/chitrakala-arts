import React, { useState, useEffect } from 'react';
import '../styles/WishlistModal.css';
import { useWishlist } from '../context/WishlistContext';
import InquiryForm from './InquiryForm';

const WishlistModal = ({ open, onClose }) => {
  const { wishlist, removeFromWishlist, clearWishlist } = useWishlist();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Reset submitted state when modal is opened
  useEffect(() => {
    if (open) setSubmitted(false);
  }, [open]);
  // Set timestamp at modal open for spam prevention
  const [formTimestamp] = useState(Date.now());

  if (!open) return null;

  const handleInquirySubmit = async (formData) => {
    setSubmitting(true);
    setSubmitError('');
    try {
      // Compose subject for wishlist inquiry
      const subject = 'Wishlist Inquiry';
      // Add honeypot and timestamp for spam prevention
      const payload = {
        name: formData.name,
        email: formData.email,
        subject,
        message: formData.message,
        honeypot: '',
        timestamp: formTimestamp
      };
      // Use absolute backend URL for local dev to avoid CORS issues
      // Use Railway backend URL in production, localhost in development
      const isLocal = window.location.hostname === 'localhost';
      const backendUrl = isLocal
        ? 'http://localhost:5000/api/contact/send-message'
        : 'https://chitrakalaarts-production.up.railway.app/api/contact/send-message';
      const res = await fetch(backendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send inquiry');
      }
      setSubmitted(true);
      clearWishlist();
    } catch (err) {
      setSubmitError(err.message || 'Failed to send inquiry. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="wishlist-modal-overlay" onClick={onClose}>
      <div className="wishlist-modal" onClick={e => e.stopPropagation()}>
        <button className="wishlist-modal-close" onClick={onClose}>&times;</button>
        <h2>Your Wishlist</h2>
        {wishlist.length === 0 && !submitted ? (
          <p>Your wishlist is empty.</p>
        ) : submitted ? (
          <div style={{ textAlign: 'center', margin: '2rem 0' }}>
            <h3>Inquiry Sent!</h3>
            <p>Thank you for your interest. We will contact you soon.</p>
            <button onClick={onClose} style={{ marginTop: '1rem' }}>Close</button>
          </div>
        ) : (
          <>
            <ul className="wishlist-list">
              {wishlist.map(item => (
                <li key={item.id} className="wishlist-item">
                  <span>{item.title}</span>
                  <button onClick={() => removeFromWishlist(item.id)} aria-label="Remove">Remove</button>
                </li>
              ))}
            </ul>
            <button className="wishlist-clear-btn" onClick={clearWishlist}>Clear Wishlist</button>
            <InquiryForm wishlist={wishlist} onSubmit={handleInquirySubmit} submitting={submitting} />
            {submitError && <div className="inquiry-error" style={{ marginTop: '0.5rem' }}>{submitError}</div>}
          </>
        )}
      </div>
    </div>
  );
};

export default WishlistModal;
