import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import '../styles/RequestConfirmation.css';

const STORAGE_KEY = 'orderRequestConfirmation';

const availabilityLabel = (availability) =>
  availability === 'MADE_TO_ORDER' ? 'Made to Order' : 'Available';

const formatItemPrice = (item) => {
  if (item.snapshot_price_inr != null) return `₹${Number(item.snapshot_price_inr).toLocaleString('en-IN')}`;
  if (item.snapshot_price_usd != null) return `$${Number(item.snapshot_price_usd).toLocaleString()}`;
  return 'Price on request';
};

// Reads the confirmation snapshot for the artwork request the customer just
// submitted. Route state (freshest, set at navigation time) is preferred;
// sessionStorage is the durable fallback so a page refresh or back/forward
// navigation still shows the same confirmation instead of losing it. Both
// sources only ever contain the customer's own submitted data plus the
// public artwork snapshot already shown to them before they submitted —
// nothing admin-only, and nothing fetched from any new API.
function readConfirmation(locationState) {
  if (locationState?.confirmation) return locationState.confirmation;
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

const RequestConfirmation = () => {
  const location = useLocation();
  const [confirmation] = useState(() => readConfirmation(location.state));

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  if (!confirmation) {
    return (
      <div className="request-confirmation-page">
        <div className="request-confirmation-card">
          <h1>No request found</h1>
          <p>
            We couldn&rsquo;t find a recent request to show here. If you just
            submitted a request, please check your email for updates, or
            browse the gallery to submit a new one.
          </p>
          <Link to="/" className="btn-primary">Return to Gallery</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="request-confirmation-page">
      <div className="request-confirmation-card">
        <h1>Thank you. Your request has been received.</h1>
        <p className="request-confirmation-intro">
          We will review it and contact you soon. This is an inquiry, not a
          paid order &mdash; no payment has been collected.
        </p>

        {confirmation.id && (
          <p className="request-confirmation-ref">
            Request reference: <strong>#{confirmation.id}</strong>
          </p>
        )}

        <section className="request-confirmation-section">
          <h2>Your Details</h2>
          <dl className="request-confirmation-details">
            <dt>Name</dt>
            <dd>{confirmation.customer_name}</dd>
            <dt>Email</dt>
            <dd>{confirmation.customer_email}</dd>
            {confirmation.customer_phone && (
              <>
                <dt>Phone</dt>
                <dd>{confirmation.customer_phone}</dd>
              </>
            )}
          </dl>
        </section>

        {Array.isArray(confirmation.items) && confirmation.items.length > 0 && (
          <section className="request-confirmation-section">
            <h2>Requested Items</h2>
            <ul className="request-confirmation-items">
              {confirmation.items.map((item) => (
                <li key={item.id} className="request-confirmation-item">
                  <div className="request-confirmation-item-title">
                    {item.snapshot_title}
                    {item.quantity > 1 ? ` × ${item.quantity}` : ''}
                  </div>
                  <div className="request-confirmation-item-meta">
                    {item.snapshot_sku && <span>SKU: {item.snapshot_sku}</span>}
                    {item.snapshot_size_label && <span>{item.snapshot_size_label}</span>}
                    <span
                      className={`request-confirmation-availability${
                        item.snapshot_availability === 'MADE_TO_ORDER' ? ' request-confirmation-availability--mto' : ''
                      }`}
                    >
                      {availabilityLabel(item.snapshot_availability)}
                    </span>
                  </div>
                  <div className="request-confirmation-item-price">{formatItemPrice(item)}</div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="request-confirmation-section request-confirmation-next-steps">
          <h2>What happens next</h2>
          <ul>
            <li>Our team will review your request and item availability.</li>
            <li>Pricing, shipping, and other details will be confirmed manually.</li>
            <li>We will contact you by email{confirmation.customer_phone ? ' or phone' : ''} with next steps.</li>
            <li>No payment has been collected &mdash; this is a request only.</li>
          </ul>
        </section>

        <Link to="/" className="btn-primary request-confirmation-return">Return to Gallery</Link>
      </div>
    </div>
  );
};

export default RequestConfirmation;
