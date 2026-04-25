import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './grove.css'
import App from './App'
import { installGlobalErrorReporter } from './api/client'

installGlobalErrorReporter()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
