import React, { useState, useEffect } from 'react';
import '../styles/Contact.css';

const Contact = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
    honeypot: '', // Hidden field for spam prevention
    timestamp: Date.now() // Track when form was loaded
  });
  const [contactInfo, setContactInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);

  useEffect(() => {
    fetchContactInfo();
  }, []);

  const fetchContactInfo = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/contact`);
      if (response.ok) {
        const data = await response.json();
        setContactInfo(data);
      }
    } catch (error) {
      console.error('Error fetching contact info:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Client-side validation
    if (formData.message.trim().length < 20) {
      setSubmitStatus({ type: 'error', message: 'Message must be at least 20 characters long.' });
      return;
    }

    setSubmitting(true);
    setSubmitStatus(null);

    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/contact/send-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (response.ok) {
        setSubmitStatus({ type: 'success', message: 'Thank you for your message! We will get back to you soon.' });
        setFormData({
          name: '',
          email: '',
          subject: '',
          message: '',
          honeypot: '',
          timestamp: Date.now()
        });
      } else {
        setSubmitStatus({ type: 'error', message: data.error || 'Failed to send message. Please try again.' });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setSubmitStatus({ type: 'error', message: 'Failed to send message. Please try again later.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="contact-page"><p>Loading...</p></div>;
  }

  return (
    <div className="contact-page">
      <div className="contact-hero">
        <h1>Get In Touch</h1>
        <p>We'd love to hear from you</p>
      </div>

      <div className="container">
        <div className="contact-content">
          <div className="contact-info">
            <h2>Contact Information</h2>
            <p>
              Have questions about our artwork or interested in a custom piece? 
              Feel free to reach out to us through any of the following channels.
            </p>

            <div className="contact-details">
              {contactInfo?.emails && contactInfo.emails.length > 0 && (
                <div className="contact-item">
                  <h3>Email</h3>
                  {contactInfo.emails.map((email, index) => (
                    <p key={index}>
                      <a href={`mailto:${email}`}>{email}</a>
                    </p>
                  ))}
                </div>
              )}

              {contactInfo?.phone && (
                <div className="contact-item">
                  <h3>Phone</h3>
                  <p>
                    <a href={`tel:${contactInfo.phone.replace(/\D/g, '')}`}>{contactInfo.phone}</a>
                  </p>
                </div>
              )}

              {contactInfo?.showAddress && contactInfo?.address && (
                <div className="contact-item">
                  <h3>Address</h3>
                  <p>{contactInfo.address.street}</p>
                  <p>{contactInfo.address.city}, {contactInfo.address.state} {contactInfo.address.zip}</p>
                </div>
              )}

              {contactInfo?.showHours && contactInfo?.hours && (
                <div className="contact-item">
                  <h3>Hours</h3>
                  {contactInfo.hours.weekdays && <p>{contactInfo.hours.weekdays}</p>}
                  {contactInfo.hours.weekend && <p>{contactInfo.hours.weekend}</p>}
                </div>
              )}

              {contactInfo?.showSocial && contactInfo?.social && (
                <div className="contact-item">
                  <h3>Follow Us</h3>
                  <div className="social-links">
                    {contactInfo.social.facebook && (
                      <a href={contactInfo.social.facebook} target="_blank" rel="noopener noreferrer">Facebook</a>
                    )}
                    {contactInfo.social.instagram && (
                      <a href={contactInfo.social.instagram} target="_blank" rel="noopener noreferrer">Instagram</a>
                    )}
                    {contactInfo.social.pinterest && (
                      <a href={contactInfo.social.pinterest} target="_blank" rel="noopener noreferrer">Pinterest</a>
                    )}
                    {contactInfo.social.twitter && (
                      <a href={contactInfo.social.twitter} target="_blank" rel="noopener noreferrer">Twitter</a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="contact-form-container">
            <h2>Send Us a Message</h2>
            
            {submitStatus && (
              <div className={`submit-status ${submitStatus.type}`}>
                {submitStatus.message}
              </div>
            )}

            <form className="contact-form" onSubmit={handleSubmit}>
              {/* Honeypot field - hidden from users, only bots fill this */}
              <input
                type="text"
                name="honeypot"
                value={formData.honeypot}
                onChange={handleChange}
                style={{ display: 'none' }}
                tabIndex="-1"
                autoComplete="off"
              />

              <div className="form-group">
                <label htmlFor="name">Name *</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  minLength="2"
                />
              </div>

              <div className="form-group">
                <label htmlFor="email">Email *</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="subject">Subject *</label>
                <input
                  type="text"
                  id="subject"
                  name="subject"
                  value={formData.subject}
                  onChange={handleChange}
                  required
                  minLength="3"
                />
              </div>

              <div className="form-group">
                <label htmlFor="message">Message * (minimum 20 characters)</label>
                <textarea
                  id="message"
                  name="message"
                  rows="5"
                  value={formData.message}
                  onChange={handleChange}
                  required
                  minLength="20"
                  placeholder="Please tell us about your inquiry..."
                ></textarea>
                <small className="char-count">
                  {formData.message.length} / 20 characters minimum
                </small>
              </div>

              <button 
                type="submit" 
                className="submit-btn"
                disabled={submitting || formData.message.length < 20}
              >
                {submitting ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Contact;
