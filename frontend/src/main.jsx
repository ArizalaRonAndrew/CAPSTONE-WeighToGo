import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'
import { initOutbox } from './utils/outbox.js'

registerSW({ immediate: true })

// Offline outbox auto-flush. Register the `online`/resume listeners up front
// (not behind a dynamic import) so a connection restored during startup is
// never missed; init is idempotent.
initOutbox()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

