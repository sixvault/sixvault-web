import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const canonicalUrl = import.meta.env.VITE_WEB_BASE_URL;
if (import.meta.env.PROD && canonicalUrl) {
  try {
    const canonical = new URL(canonicalUrl);
    if (window.location.hostname !== canonical.hostname) {
      const target = `${canonical.origin}${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.replace(target);
    }
  } catch {
    // ignore invalid VITE_WEB_BASE_URL
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
