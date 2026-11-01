import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// The admin panel used to live on this site (/platform) and kept its login here.
// It now has its own address, so remove any admin login left behind on this site.
try {
  localStorage.removeItem('adminToken')
  localStorage.removeItem('admin')
} catch (e) { /* storage blocked: nothing to remove */ }

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)