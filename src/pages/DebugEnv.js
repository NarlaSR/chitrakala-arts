import React from 'react';

// Debug page to check environment variables in production
const DebugEnv = () => {
  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>Environment Debug</h1>
      <p><strong>REACT_APP_API_URL:</strong> {process.env.REACT_APP_API_URL || 'UNDEFINED'}</p>
      <p><strong>NODE_ENV:</strong> {process.env.NODE_ENV}</p>
      <p><strong>All env vars:</strong></p>
      <pre>{JSON.stringify(process.env, null, 2)}</pre>
    </div>
  );
};

export default DebugEnv;
