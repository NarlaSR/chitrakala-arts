import React, { createContext, useContext, useState, useEffect } from 'react';

const CurrencyContext = createContext();

export const CurrencyProvider = ({ children }) => {
  const [countryCode, setCountryCode] = useState('IN'); // Default to India
  const [currency, setCurrency] = useState('INR');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    detectCountry();
  }, []);

  const detectCountry = async () => {
    try {
      // First check if already detected and stored in sessionStorage
      const cachedCountry = sessionStorage.getItem('userCountry');
      if (cachedCountry) {
        setCountryCode(cachedCountry);
        setCurrency(cachedCountry === 'IN' ? 'INR' : 'USD');
        setLoading(false);
        return;
      }

      // Call backend API to detect country
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/user/location`);
      
      if (response.ok) {
        const data = await response.json();
        const detectedCountry = data.country_code || 'IN';
        
        setCountryCode(detectedCountry);
        setCurrency(detectedCountry === 'IN' ? 'INR' : 'USD');
        
        // Cache in sessionStorage
        sessionStorage.setItem('userCountry', detectedCountry);
      } else {
        // Fallback to India if detection fails
        setCountryCode('IN');
        setCurrency('INR');
      }
    } catch (error) {
      console.error('Error detecting country:', error);
      // Fallback to India if detection fails
      setCountryCode('IN');
      setCurrency('INR');
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
