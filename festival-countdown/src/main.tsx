import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  // Fail fast in a controlled way if the root element is missing
  // This avoids undefined behavior during bootstrap.
  // In production, this should surface clearly in logs / monitoring.
  // eslint-disable-next-line no-console
  console.error('Root element with id "root" not found in the document.');
  throw new Error('Application root element not found');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <div className="min-h-screen bg-background text-foreground">
      <App />
    </div>
  </React.StrictMode>
);
