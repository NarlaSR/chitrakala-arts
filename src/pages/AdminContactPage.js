import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/AdminContact.css';

const AdminContactPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contactData, setContactData] = useState({
    emails: [''],
    phone: '',
    address: {
      street: '',
      city: '',
      state: '',
      zip: ''
    },
    hours: {
      weekdays: '',
      weekend: ''
    },
    social: {
      facebook: '',
      instagram: '',
      pinterest: '',
      twitter: ''
    },
    showHours: true,
    showAddress: true,
    showSocial: false
  });

  useEffect(() => {
    fetchContactData();
  }, []);

  const fetchContactData = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/contact`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setContactData(data);
      }
    } catch (error) {
      console.error('Error fetching contact data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailChange = (index, value) => {
    const newEmails = [...contactData.emails];
    newEmails[index] = value;
    setContactData({ ...contactData, emails: newEmails });
  };

  const addEmail = () => {
    setContactData({
      ...contactData,
      emails: [...contactData.emails, '']
    });
  };

  const removeEmail = (index) => {
    if (contactData.emails.length > 1) {
      const newEmails = contactData.emails.filter((_, i) => i !== index);
      setContactData({ ...contactData, emails: newEmails });
    }
  };

  const handleAddressChange = (field, value) => {
    setContactData({
      ...contactData,
      address: { ...contactData.address, [field]: value }
    });
  };

  const handleHoursChange = (field, value) => {
    setContactData({
      ...contactData,
      hours: { ...contactData.hours, [field]: value }
    });
  };

  const handleSocialChange = (platform, value) => {
    setContactData({
      ...contactData,
      social: { ...contactData.social, [platform]: value }
    });
  };

  const handleSave = async () => {
    // Validation
    const validEmails = contactData.emails.filter(email => email.trim() !== '');
    if (validEmails.length === 0) {
      alert('At least one email address is required');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (let email of validEmails) {
      if (!emailRegex.test(email)) {
        alert(`Invalid email format: ${email}`);
        return;
      }
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/contact`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ...contactData, emails: validEmails })
      });

      if (response.ok) {
        alert('Contact information updated successfully!');
        navigate('/ckk-secure-admin/dashboard');
      } else {
        alert('Failed to update contact information');
      }
    } catch (error) {
      console.error('Error updating contact info:', error);
      alert('Error updating contact information');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="admin-contact-page"><p>Loading...</p></div>;
  }

  return (
    <div className="admin-contact-page">
      <div className="admin-header">
        <h1>Edit Contact Information</h1>
        <div className="admin-actions">
          <button onClick={() => navigate('/ckk-secure-admin/dashboard')} className="btn-secondary">
            Back to Dashboard
          </button>
        </div>
      </div>

      <div className="contact-form">
        {/* Email Addresses Section */}
        <div className="form-section">
          <h2>Email Addresses</h2>
          <p className="section-description">Add multiple email addresses to receive contact form submissions</p>
          {contactData.emails.map((email, index) => (
            <div key={index} className="email-group">
              <input
                type="email"
                value={email}
                onChange={(e) => handleEmailChange(index, e.target.value)}
                placeholder="email@example.com"
                className="form-input"
              />
              {contactData.emails.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeEmail(index)}
                  className="btn-remove"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={addEmail} className="btn-add">
            + Add Another Email
          </button>
        </div>

        {/* Phone Number */}
        <div className="form-section">
          <h2>Phone Number</h2>
          <input
            type="tel"
            value={contactData.phone}
            onChange={(e) => setContactData({ ...contactData, phone: e.target.value })}
            placeholder="+1 (555) 123-4567"
            className="form-input"
          />
        </div>

        {/* Address Section */}
        <div className="form-section">
          <h2>Address</h2>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={contactData.showAddress}
              onChange={(e) => setContactData({ ...contactData, showAddress: e.target.checked })}
            />
            Show address on Contact page
          </label>
          <div className="form-group">
            <input
              type="text"
              value={contactData.address.street}
              onChange={(e) => handleAddressChange('street', e.target.value)}
              placeholder="Street Address"
              className="form-input"
            />
          </div>
          <div className="form-row">
            <input
              type="text"
              value={contactData.address.city}
              onChange={(e) => handleAddressChange('city', e.target.value)}
              placeholder="City"
              className="form-input"
            />
            <input
              type="text"
              value={contactData.address.state}
              onChange={(e) => handleAddressChange('state', e.target.value)}
              placeholder="State"
              className="form-input"
            />
            <input
              type="text"
              value={contactData.address.zip}
              onChange={(e) => handleAddressChange('zip', e.target.value)}
              placeholder="ZIP Code"
              className="form-input"
            />
          </div>
        </div>

        {/* Hours Section */}
        <div className="form-section">
          <h2>Business Hours</h2>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={contactData.showHours}
              onChange={(e) => setContactData({ ...contactData, showHours: e.target.checked })}
            />
            Show business hours on Contact page
          </label>
          <div className="form-group">
            <label>Weekdays</label>
            <input
              type="text"
              value={contactData.hours.weekdays}
              onChange={(e) => handleHoursChange('weekdays', e.target.value)}
              placeholder="Monday - Friday: 9:00 AM - 6:00 PM"
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label>Weekend</label>
            <input
              type="text"
              value={contactData.hours.weekend}
              onChange={(e) => handleHoursChange('weekend', e.target.value)}
              placeholder="Saturday - Sunday: 10:00 AM - 4:00 PM"
              className="form-input"
            />
          </div>
        </div>

        {/* Social Media Section */}
        <div className="form-section">
          <h2>Social Media Links</h2>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={contactData.showSocial}
              onChange={(e) => setContactData({ ...contactData, showSocial: e.target.checked })}
            />
            Show social media links on Contact page
          </label>
          <div className="form-group">
            <label>Facebook URL</label>
            <input
              type="url"
              value={contactData.social.facebook}
              onChange={(e) => handleSocialChange('facebook', e.target.value)}
              placeholder="https://facebook.com/yourpage"
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label>Instagram URL</label>
            <input
              type="url"
              value={contactData.social.instagram}
              onChange={(e) => handleSocialChange('instagram', e.target.value)}
              placeholder="https://instagram.com/yourprofile"
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label>Pinterest URL</label>
            <input
              type="url"
              value={contactData.social.pinterest}
              onChange={(e) => handleSocialChange('pinterest', e.target.value)}
              placeholder="https://pinterest.com/yourprofile"
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label>Twitter URL</label>
            <input
              type="url"
              value={contactData.social.twitter}
              onChange={(e) => handleSocialChange('twitter', e.target.value)}
              placeholder="https://twitter.com/yourhandle"
              className="form-input"
            />
          </div>
        </div>

        {/* Save Button */}
        <div className="form-actions">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary btn-save"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminContactPage;
