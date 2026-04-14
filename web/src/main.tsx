import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import './index.css'
import { applyC2CssVariables } from './theme/c2CssVars'
import App from './App'
import { createLogger } from './utils/logger'

applyC2CssVariables()

const log = createLogger('global')

window.addEventListener('error', (event) => {
  log.error('uncaught error', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  })
})

window.addEventListener('unhandledrejection', (event) => {
  log.error('unhandled promise rejection', {
    reason: String(event.reason),
  })
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
