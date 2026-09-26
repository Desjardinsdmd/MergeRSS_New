import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import '@/globals.css' // brand tokens (see BRAND.md); must load after index.css

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
