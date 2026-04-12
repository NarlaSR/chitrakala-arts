import React, { useState, useEffect } from 'react';
import { useCurrency } from '../context/CurrencyContext';
import '../styles/Footer.css';

const Footer = () => {
  const [settings, setSettings] = useState({
    siteName: 'Chitrakala Arts',
    tagline: 'Showcasing the beauty of handcrafted art',
    copyright: '© {year} Chitrakala Arts. All rights reserved.',
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

  const { countryCode } = useCurrency();

  const displayName = countryCode === 'IN' ? settings.siteName : 'Sainar Chitrakala Ventures';
  const displayCopyright = countryCode === 'IN'
    ? '© {year} Chitrakala Sanskriti. All rights reserved.'
    : '© {year} Sainar Chitrakala Ventures. All rights reserved.';

  const fetchSettings = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/settings`);
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const formatCopyright = (text) => {
    return text.replace('{year}', new Date().getFullYear());
  };

  const socialPlatforms = [
    { key: 'instagram', label: 'Instagram', icon: '📷' },
    { key: 'facebook', label: 'Facebook', icon: '👍' },
    { key: 'pinterest', label: 'Pinterest', icon: '📌' },
    { key: 'twitter', label: 'Twitter', icon: '🐦' },
    { key: 'youtube', label: 'YouTube', icon: '▶️' }
  ];

  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-section">
          <h3>{displayName}</h3>
          <p>{settings.tagline}</p>
        </div>
        
        <div className="footer-section">
          <h4>Quick Links</h4>
          <ul>
            <li><a href="/">Home</a></li>
            <li><a href="/about">About</a></li>
            <li><a href="/contact">Contact</a></li>
          </ul>
        </div>
        
        <div className="footer-section">
          <h4>Categories</h4>
          <ul>
            <li><a href="/category/dot-mandala">Dot Mandala Art</a></li>
            <li><a href="/category/lippan-art">Lippan Art</a></li>
            <li><a href="/category/textile-design">Textile Designing</a></li>
          </ul>
        </div>
        
        {settings.showSocial && (
          <div className="footer-section">
            <h4>Connect</h4>
            <div className="social-links">
              {socialPlatforms.map(platform => (
                settings.social[platform.key] && (
                  <a 
                    key={platform.key}
                    href={settings.social[platform.key]} 
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={platform.label}
                  >
                    {platform.label}
                  </a>
                )
              )).filter(Boolean)}
            </div>
          </div>
        )}
      </div>
      
      <div className="footer-bottom">
        <p>{formatCopyright(displayCopyright)}</p>
        {settings.developer.showCredit && settings.developer.name && (
          <div className="developer-credit">
            <span>Designed & Developed by </span>
            {settings.developer.website ? (
              <a 
                href={settings.developer.website} 
                target="_blank" 
                rel="noopener noreferrer"
                className="developer-link"
              >
                {settings.developer.logo && (
                  <img 
                    src={settings.developer.logo} 
                    alt={settings.developer.name}
                    className="developer-logo"
                  />
                )}
                <span>{settings.developer.name}</span>
              </a>
            ) : (
              <>
                {settings.developer.logo && (
                  <img 
                    src={settings.developer.logo} 
                    alt={settings.developer.name}
                    className="developer-logo"
                  />
                )}
                <span>{settings.developer.name}</span>
              </>
            )}
          </div>
        )}
      </div>
    </footer>
  );
};

export default Footer;

