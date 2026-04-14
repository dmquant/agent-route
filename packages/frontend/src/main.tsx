import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';

const ADMIN_API_KEY = 'sk_admin_route_2025';
const originalFetch = window.fetch;
window.fetch = async (input, init) => {
  const customInit = init || {};
  const headers = new Headers(customInit.headers);
  if (!headers.has('X-API-Key')) {
    headers.set('X-API-Key', ADMIN_API_KEY);
  }
  customInit.headers = headers;
  return originalFetch(input, customInit);
};

import { LanguageProvider } from './i18n';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </BrowserRouter>
  </StrictMode>,
);
