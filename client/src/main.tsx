import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Initialize app
const root = document.getElementById('root');

if (!root) {
  throw new Error(
    'Root element not found. Make sure your index.html has a <div id="root"></div> element.'
  );
}

// Performance monitoring (optional)
if (import.meta.env.PROD) {
  // Log when the app is fully loaded
  window.addEventListener('load', () => {
    console.info('CrypticStorage loaded successfully');
  });
}

// Render app
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Service Worker registration (for PWA support)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.info('Service Worker registered:', registration);
      })
      .catch((error) => {
        console.error('Service Worker registration failed:', error);
      });
  });
}

// Hot Module Replacement (HMR) for development
if (import.meta.hot) {
  import.meta.hot.accept();
}
