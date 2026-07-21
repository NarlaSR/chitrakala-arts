import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';

import App from './App';
import { RequestCartProvider } from './context/RequestCartContext';
import { HomeViewProvider } from './context/HomeViewContext';
import { CurrencyProvider } from './context/CurrencyContext';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <CurrencyProvider>
      <RequestCartProvider>
        <HomeViewProvider>
          <App />
        </HomeViewProvider>
      </RequestCartProvider>
    </CurrencyProvider>
  </React.StrictMode>
);
