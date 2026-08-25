import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

/* Load order is the cascade. Tokens first, then the base document layer,
   then components. Feature stylesheets are imported by their own components
   and land after these, so they can lean on the tokens above. */
import './tokens.css'
import './base.css'
import './layout.css'
import './components.css'
import './controls.css'
import './overlays.css'

import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
