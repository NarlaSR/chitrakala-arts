import React, { useState } from 'react';
import '../styles/RequestDetailsForm.css';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MESSAGE_LENGTH = 2000;

const RequestDetailsForm = ({ onSubmit, submitting }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter your name.');
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      setError(`Message is too long. Please keep it under ${MAX_MESSAGE_LENGTH} characters.`);
      return;
    }
    setError('');
    onSubmit({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      message: message.trim(),
    });
  };

  return (
    <form className="request-details-form" onSubmit={handleSubmit}>
      <h3>Your Details</h3>
      <label>
        Name*
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={255}
          required
        />
      </label>
      <label>
        Email*
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          maxLength={254}
          required
        />
      </label>
      <label>
        Phone
        <input
          type="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="Optional"
          maxLength={50}
        />
      </label>
      <label>
        Message
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Anything else we should know? (optional)"
          maxLength={MAX_MESSAGE_LENGTH}
        />
      </label>
      {error && <div className="request-form-error">{error}</div>}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Submitting…' : 'Submit Request'}
      </button>
    </form>
  );
};

export default RequestDetailsForm;
