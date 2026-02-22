import React, { useState } from 'react';
import '../styles/InquiryForm.css';

const InquiryForm = ({ wishlist, onSubmit, submitting }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name || !email || !message.trim()) {
      setError('Name, email, and message are required.');
      return;
    }
    setError('');
    // Format wishlist as a section in the message
    let wishlistSection = '';
    if (wishlist && wishlist.length > 0) {
      const artIds = wishlist.map(item => item.id).join(', ');
      wishlistSection = `\n\n---\nArt IDs: ${artIds}\nWishlist Items:\n` + wishlist.map((item, idx) => {
        let line = `${idx + 1}. ${item.title}`;
        if (item.size) line += ` (Size: ${item.size})`;
        if (item.price) line += ` - ₹${item.price}`;
        return line;
      }).join('\n');
    }
    // Add phone to message if provided
    const phoneSection = phone ? `\nPhone: ${phone}` : '';
    const fullMessage = message + phoneSection + wishlistSection;
    onSubmit({ name, email, message: fullMessage });
  };

  return (
    <form className="inquiry-form" onSubmit={handleSubmit}>
      <h3>Send Inquiry</h3>
      <label>
        Name*
        <input type="text" value={name} onChange={e => setName(e.target.value)} required />
      </label>
      <label>
        Email*
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
      </label>
      <label>
        Phone
        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Optional" />
      </label>
      <label>
        Message*
        <textarea value={message} onChange={e => setMessage(e.target.value)} required placeholder="Enter your message" />
      </label>
      {error && <div className="inquiry-error">{error}</div>}
      <button type="submit" disabled={submitting}>{submitting ? 'Sending...' : 'Send Inquiry'}</button>
    </form>
  );
};

export default InquiryForm;
