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
  
  // Pricing settings state
  const [pricingSettings, setPricingSettings] = useState({
    fx_rate: 83,
    usd_multiplier: 1.75
  });
  const [fetchingFxRate, setFetchingFxRate] = useState(false);
  const [recalculatingPrices, setRecalculatingPrices] = useState(false);

  useEffect(() => {
    fetchSettings();
    fetchPricingSettings();
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

  // Pricing settings functions
  const fetchPricingSettings = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/pricing-settings`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setPricingSettings({
          fx_rate: data.fx_rate,
          usd_multiplier: data.usd_multiplier
        });
      }
    } catch (error) {
      console.error('Error fetching pricing settings:', error);
    }
  };

  const handlePricingChange = (field, value) => {
    setPricingSettings(prev => ({
      ...prev,
      [field]: parseFloat(value) || 0
    }));
  };

  const handleSavePricingSettings = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/pricing-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(pricingSettings)
      });

      if (response.ok) {
        alert('Pricing settings updated successfully!');
      } else {
        alert('Failed to update pricing settings');
      }
    } catch (error) {
      console.error('Error updating pricing settings:', error);
      alert('Error updating pricing settings');
    } finally {
      setSaving(false);
    }
  };

  const handleFetchLatestFxRate = async () => {
    setFetchingFxRate(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/pricing-settings/fetch-fx-rate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setPricingSettings(prev => ({
          ...prev,
          fx_rate: data.fx_rate
        }));
        alert(`Latest FX rate fetched: ${data.fx_rate} INR/USD\nFetched from: ${data.source}\nLast updated: ${new Date(data.last_updated).toLocaleString()}`);
      } else {
        alert('Failed to fetch latest FX rate');
      }
    } catch (error) {
      console.error('Error fetching FX rate:', error);
      alert('Error fetching FX rate');
    } finally {
      setFetchingFxRate(false);
    }
  };

  const handleRecalculateAllPrices = async () => {
    const confirmed = window.confirm(
      `This will recalculate USD prices for ALL artworks using:\n\n` +
      `FX Rate: ${pricingSettings.fx_rate} INR/USD\n` +
      `USD Multiplier: ${pricingSettings.usd_multiplier}x\n\n` +
      `Are you sure you want to continue?`
    );

    if (!confirmed) return;

    setRecalculatingPrices(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/artworks/recalculate-prices`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        alert(`Successfully recalculated prices for ${data.updated} artworks!`);
      } else {
        alert('Failed to recalculate prices');
      }
    } catch (error) {
      console.error('Error recalculating prices:', error);
      alert('Error recalculating prices');
    } finally {
      setRecalculatingPrices(false);
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

        {/* Pricing Settings */}
        <section className="settings-section">
          <h2>Pricing Configuration</h2>
          <p className="section-description">
            Configure currency conversion for artwork pricing. INR is the master price; USD is auto-calculated using the formula: <strong>USD = (INR ÷ FX Rate) × USD Multiplier</strong>
          </p>

          <div className="form-group">
            <label htmlFor="fxRate">FX Rate (INR per USD)</label>
            <input
              type="number"
              id="fxRate"
              step="0.01"
              min="1"
              value={pricingSettings.fx_rate}
              onChange={(e) => handlePricingChange('fx_rate', e.target.value)}
            />
            <small>Current exchange rate: How many INR equals 1 USD (e.g., 83.25)</small>
          </div>

          <div className="pricing-actions">
            <button
              type="button"
              className="fetch-fx-button"
              onClick={handleFetchLatestFxRate}
              disabled={fetchingFxRate || saving}
            >
              {fetchingFxRate ? 'Fetching...' : '🌐 Fetch Latest FX Rate'}
            </button>
          </div>

          <div className="form-group">
            <label htmlFor="usdMultiplier">USD Multiplier</label>
            <input
              type="number"
              id="usdMultiplier"
              step="0.01"
              min="1"
              value={pricingSettings.usd_multiplier}
              onChange={(e) => handlePricingChange('usd_multiplier', e.target.value)}
            />
            <small>Markup factor for USD pricing (e.g., 1.75 for 75% markup). Default: 1.75x</small>
          </div>

          <div className="pricing-example">
            <strong>Example Calculation:</strong>
            <p>
              If an artwork is ₹{(8300).toLocaleString('en-IN')} INR:<br/>
              USD = (₹8,300 ÷ {pricingSettings.fx_rate}) × {pricingSettings.usd_multiplier} 
              = ${Math.round((8300 / pricingSettings.fx_rate) * pricingSettings.usd_multiplier)}
              (after psychological rounding to 9/49/99 endings)
            </p>
          </div>

          <div className="pricing-actions-group">
            <button
              type="button"
              className="save-pricing-button"
              onClick={handleSavePricingSettings}
              disabled={saving || fetchingFxRate || recalculatingPrices}
            >
              {saving ? 'Saving...' : '💾 Save Pricing Settings'}
            </button>

            <button
              type="button"
              className="recalculate-button"
              onClick={handleRecalculateAllPrices}
              disabled={saving || fetchingFxRate || recalculatingPrices}
            >
              {recalculatingPrices ? 'Recalculating...' : '🔄 Recalculate All Prices'}
            </button>
          </div>

          <div className="pricing-warning">
            <strong>⚠️ Important:</strong> After changing FX rate or multiplier, click "Recalculate All Prices" 
            to update all existing artworks. New artworks will automatically use the current settings.
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
