import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

if (!window.isSecureContext || !crypto?.subtle) {
  root.innerHTML =
    '<div style="font-family:system-ui;padding:2rem;text-align:center"><h1>Secure context required</h1><p>CrypticStorage encrypts files in your browser and needs HTTPS (or localhost) to access the Web Crypto API.</p></div>';
} else {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
