import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

/* Load order is the cascade. Tokens first, then the base document layer,
   then components. Feature stylesheets are imported by their own components
   and land after these, so they can lean on the tokens above. */
import './styles/tokens.css'
import './styles/base.css'
import './styles/layout.css'
import './styles/components.css'
import './styles/controls.css'
import './styles/overlays.css'

import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
