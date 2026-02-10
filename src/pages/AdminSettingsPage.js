import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/AdminSettings.css';

const AdminSettingsPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [settings, setSettings] = useState({
    siteName: '',
    tagline: '',
    copyright: '',
    social: {
      facebook: '',
      instagram: '',
      pinterest: '',
      twitter: '',
      youtube: ''
    },
    developer: {
      name: '',
      logo: '',
      website: '',
      showCredit: true
    },
    showSocial: true
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/settings`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
        if (data.developer.logo) {
          setLogoPreview(data.developer.logo);
        }
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSocialChange = (platform, value) => {
    setSettings(prev => ({
      ...prev,
      social: {
        ...prev.social,
        [platform]: value
      }
    }));
  };

  const handleDeveloperChange = (field, value) => {
    setSettings(prev => ({
      ...prev,
      developer: {
        ...prev.developer,
        [field]: value
      }
    }));
  };

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('Logo file size should be less than 2MB');
        return;
      }
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit= async (e) => {
    e.preventDefault();

    setSaving(true);
    try {
      const token = localStorage.getItem('authToken');
      const formData = new FormData();
      formData.append('settings', JSON.stringify(settings));
      
      if (logoFile) {
        formData.append('developerLogo', logoFile);
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/settings`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        setSettings(data.data);
        if (data.data.developer.logo) {
          setLogoPreview(data.data.developer.logo);
        }
        setLogoFile(null);
        alert('Site settings updated successfully!');
      } else {
        alert('Failed to update site settings');
      }
    } catch (error) {
      console.error('Error updating settings:', error);
      alert('Error updating site settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="admin-settings-loading">Loading settings...</div>;
  }

  return (
    <div className="admin-settings-container">
      <div className="admin-settings-header">
        <button onClick={() => navigate('/ckk-secure-admin/dashboard')} className="back-button">
          ← Back to Dashboard
        </button>
        <h1>Site Settings</h1>
      </div>

      <form onSubmit={handleSubmit} className="admin-settings-form">
        {/* General Settings */}
        <section className="settings-section">
          <h2>General Information</h2>
          
          <div className="form-group">
            <label htmlFor="siteName">Site Name</label>
            <input
              type="text"
              id="siteName"
              value={settings.siteName}
              onChange={(e) => handleInputChange('siteName', e.target.value)}
              placeholder="Chitrakala Arts"
            />
          </div>

          <div className="form-group">
            <label htmlFor="tagline">Tagline</label>
            <input
              type="text"
              id="tagline"
              value={settings.tagline}
              onChange={(e) => handleInputChange('tagline', e.target.value)}
              placeholder="Showcasing the beauty of handcrafted art"
            />
          </div>

          <div className="form-group">
            <label htmlFor="copyright">Copyright Text</label>
            <input
              type="text"
              id="copyright"
              value={settings.copyright}
              onChange={(e) => handleInputChange('copyright', e.target.value)}
              placeholder="© {year} Chitrakala Arts. All rights reserved."
            />
            <small>Use {'{year}'} to display current year automatically</small>
          </div>
        </section>

        {/* Social Media */}
        <section className="settings-section">
          <div className="section-header">
            <h2>Social Media Links</h2>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.showSocial}
                onChange={(e) => handleInputChange('showSocial', e.target.checked)}
              />
              <span>Show social links</span>
            </label>
          </div>

          <div className="form-group">
            <label htmlFor="facebook">Facebook URL</label>
            <input
              type="url"
              id="facebook"
              value={settings.social.facebook}
              onChange={(e) => handleSocialChange('facebook', e.target.value)}
              placeholder="https://facebook.com/yourpage"
            />
          </div>

          <div className="form-group">
            <label htmlFor="instagram">Instagram URL</label>
            <input
              type="url"
              id="instagram"
              value={settings.social.instagram}
              onChange={(e) => handleSocialChange('instagram', e.target.value)}
              placeholder="https://instagram.com/yourprofile"
            />
          </div>

          <div className="form-group">
            <label htmlFor="pinterest">Pinterest URL</label>
            <input
              type="url"
              id="pinterest"
              value={settings.social.pinterest}
              onChange={(e) => handleSocialChange('pinterest', e.target.value)}
              placeholder="https://pinterest.com/yourprofile"
            />
          </div>

          <div className="form-group">
            <label htmlFor="twitter">Twitter/X URL</label>
            <input
              type="url"
              id="twitter"
              value={settings.social.twitter}
              onChange={(e) => handleSocialChange('twitter', e.target.value)}
              placeholder="https://twitter.com/yourprofile"
            />
          </div>

          <div className="form-group">
            <label htmlFor="youtube">YouTube URL</label>
            <input
              type="url"
              id="youtube"
              value={settings.social.youtube}
              onChange={(e) => handleSocialChange('youtube', e.target.value)}
              placeholder="https://youtube.com/yourchannel"
            />
          </div>
        </section>

        {/* Developer Credit */}
        <section className="settings-section">
          <div className="section-header">
            <h2>Developer Credit</h2>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.developer.showCredit}
                onChange={(e) => handleDeveloperChange('showCredit', e.target.checked)}
              />
              <span>Show developer credit</span>
            </label>
          </div>

          <div className="form-group">
            <label htmlFor="developerName">Developer Name</label>
            <input
              type="text"
              id="developerName"
              value={settings.developer.name}
              onChange={(e) => handleDeveloperChange('name', e.target.value)}
              placeholder="SaiNar Tech Group"
            />
          </div>

          <div className="form-group">
            <label htmlFor="developerWebsite">Developer Website</label>
            <input
              type="url"
              id="developerWebsite"
              value={settings.developer.website}
              onChange={(e) => handleDeveloperChange('website', e.target.value)}
              placeholder="https://yourwebsite.com"
            />
          </div>

          <div className="form-group">
            <label htmlFor="developerLogo">Developer Logo</label>
            {logoPreview && (
              <div className="logo-preview">
                <img src={logoPreview} alt="Developer logo preview" />
              </div>
            )}
            <input
              type="file"
              id="developerLogo"
              accept="image/*"
              onChange={handleLogoChange}
            />
            <small>Recommended: 150px × 40px, PNG with transparent background, max 2MB</small>
          </div>
        </section>

        <div className="form-actions">
          <button 
            type="button" 
            onClick={() => navigate('/ckk-secure-admin/dashboard')} 
            className="cancel-button"
            disabled={saving}
          >
            Cancel
          </button>
          <button 
            type="submit" 
            className="save-button"
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AdminSettingsPage;
