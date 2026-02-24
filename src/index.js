import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';

import App from './App';
import { WishlistProvider } from './context/WishlistContext';
import { HomeViewProvider } from './context/HomeViewContext';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <WishlistProvider>
      <HomeViewProvider>
        <App />
      </HomeViewProvider>
    </WishlistProvider>
  </React.StrictMode>
);
