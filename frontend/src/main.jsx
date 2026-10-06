import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'

registerSW({ immediate: true })

// Offline outbox auto-flush (online/focus/interval/boot). Dynamic import
// keeps it out of the critical path; init is idempotent per mount.
import('./utils/outbox.js').then(({ initOutbox }) => initOutbox()).catch(() => {})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

