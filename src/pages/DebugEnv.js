import React, { useState, useEffect } from 'react';
import { useCurrency } from '../context/CurrencyContext';

// Debug page to check environment variables and country detection in production
const DebugEnv = () => {
  const { currency } = useCurrency();
  const [locationData, setLocationData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchLocation = async () => {
      try {
        const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/user/location`);
        const data = await response.json();
        setLocationData(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchLocation();
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', maxWidth: '800px' }}>
      <h1>🔍 Debug Dashboard</h1>
      
      <div style={{ marginBottom: '30px', padding: '15px', background: '#f0f0f0', borderRadius: '5px' }}>
        <h2>🌍 Country Detection</h2>
        {loading ? (
          <p>Loading location data...</p>
        ) : error ? (
          <p style={{ color: 'red' }}>Error: {error}</p>
        ) : (
          <>
            <p><strong>Detected Country Code:</strong> <span style={{ fontSize: '24px' }}>{locationData?.country_code || 'UNKNOWN'}</span></p>
            <p><strong>Country Name:</strong> {locationData?.country_name || 'Unknown'}</p>
            <p><strong>Your IP:</strong> {locationData?.ip || 'Unknown'}</p>
            <p><strong>Detection Source:</strong> {locationData?.source || 'Unknown'}</p>
            {locationData?.error && <p style={{ color: 'red' }}><strong>API Error:</strong> {locationData.error}</p>}
            <p><strong>Currency Being Used:</strong> {currency}</p>
            <p><strong>Cached Country (Session):</strong> {sessionStorage.getItem('userCountry') || 'None'}</p>
          </>
        )}
        <button 
          onClick={() => {
            sessionStorage.clear();
            window.location.reload();
          }}
          style={{ padding: '10px 20px', marginTop: '10px', cursor: 'pointer' }}
        >
          Clear Cache & Reload
        </button>
      </div>

      <div style={{ marginBottom: '30px', padding: '15px', background: '#f0f0f0', borderRadius: '5px' }}>
        <h2>⚙️ Environment Variables</h2>
        <p><strong>REACT_APP_API_URL:</strong> {process.env.REACT_APP_API_URL || 'UNDEFINED'}</p>
        <p><strong>NODE_ENV:</strong> {process.env.NODE_ENV}</p>
      </div>

      <div style={{ marginBottom: '30px', padding: '15px', background: '#f0f0f0', borderRadius: '5px' }}>
        <h2>📋 All Environment Variables</h2>
        <pre style={{ overflow: 'auto', maxHeight: '400px' }}>{JSON.stringify(process.env, null, 2)}</pre>
      </div>
    </div>
  );
};

export default DebugEnv;
