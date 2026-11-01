try {
  // Light is the default. Only an explicit choice (vouch_theme) switches to dark; older stored settings are normalised.
  const explicit = localStorage.getItem('vouch_theme_v2')
  document.documentElement.dataset.theme = explicit === 'dark' ? 'dark' : 'light'
  if (!explicit) {
    const raw = localStorage.getItem('vouch_settings')
    if (raw) { const s = JSON.parse(raw); if (s?.preferences) { s.preferences.theme = 'light'; localStorage.setItem('vouch_settings', JSON.stringify(s)) } }
    localStorage.setItem('vouch_theme_v2', 'light')
  }
} catch { document.documentElement.dataset.theme = 'light' }
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
