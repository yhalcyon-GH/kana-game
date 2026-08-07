import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// HashRouter (not BrowserRouter) because the app is deployed as a static
// site on GitHub Pages, which has no server-side rewrite for deep links —
// a direct visit to e.g. /learn/a-row would 404 without one.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
