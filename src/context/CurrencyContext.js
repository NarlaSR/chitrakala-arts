import React, { createContext, useContext, useState, useEffect } from 'react';

const CurrencyContext = createContext();

export const CurrencyProvider = ({ children }) => {
  const [countryCode, setCountryCode] = useState('US'); // Default to US
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    detectCountry();
  }, []);

  const detectCountry = async () => {
    try {
      // Dev override: ?geo=IN or ?geo=US in URL skips API detection
      const geoOverride = new URLSearchParams(window.location.search).get('geo');
      if (geoOverride) {
        setCountryCode(geoOverride);
        setCurrency(geoOverride === 'IN' ? 'INR' : 'USD');
        setLoading(false);
        return;
      }

      // Check cache for instant UI update, but always verify with backend
      const cachedCountry = sessionStorage.getItem('userCountry');
      if (cachedCountry) {
        setCountryCode(cachedCountry);
        setCurrency(cachedCountry === 'IN' ? 'INR' : 'USD');
        setLoading(false);
        // Don't return - continue to verify with backend
      }

      // Always call backend API to detect country (verify cache or get fresh)
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/user/location`);
      if (response.ok) {
        const data = await response.json();
        const detectedCountry = data.country_code || 'US';
        // Only update if not fallback
        if (data.source === 'fallback') {
          console.warn('[Currency] Location API returned fallback. Not updating country/currency.');
          return;
        }
        // Only update if different from cached value
        if (detectedCountry !== cachedCountry) {
          console.log(`[Country Detection] Updating from ${cachedCountry} to ${detectedCountry}`);
          setCountryCode(detectedCountry);
          setCurrency(detectedCountry === 'IN' ? 'INR' : 'USD');
          sessionStorage.setItem('userCountry', detectedCountry);
        } else if (!cachedCountry) {
          // First time detection
          setCountryCode(detectedCountry);
          setCurrency(detectedCountry === 'IN' ? 'INR' : 'USD');
          sessionStorage.setItem('userCountry', detectedCountry);
        }
      } else {
        // Fallback to US if detection fails and no cache
        if (!cachedCountry) {
          setCountryCode('US');
          setCurrency('USD');
        }
      }
    } catch (error) {
      console.error('Error detecting country:', error);
      // Fallback to US if detection fails and no cache
      const cachedCountry = sessionStorage.getItem('userCountry');
      if (!cachedCountry) {
        setCountryCode('US');
        setCurrency('USD');
      }
    } finally {
      setLoading(false);
    }
  };

  const value = {
    countryCode,
    currency,
    loading,
    setCountryCode: (code) => {
      setCountryCode(code);
      setCurrency(code === 'IN' ? 'INR' : 'USD');
      sessionStorage.setItem('userCountry', code);
    }
  };

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
};
