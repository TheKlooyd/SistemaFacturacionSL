import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { applyPersonalization, loadPersonalization } from './personalizationStore.js'

// Keep old admin bookmarks working while showing the public /admin address.
const currentUrl = new URL(window.location.href)
const normalizedPath = currentUrl.pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '')
const isAdmin = normalizedPath === '/admin'
  || currentUrl.searchParams.get('admin') === '1'
  || ['#/admin', '#admin'].includes(currentUrl.hash)

if (isAdmin) {
  currentUrl.pathname = '/admin'
  currentUrl.searchParams.delete('admin')
  if (['#/admin', '#admin'].includes(currentUrl.hash)) currentUrl.hash = ''
  window.history.replaceState(null, '', currentUrl)
  document.title = 'Klooyd · Administración'
  document.querySelector('link[rel="canonical"]').href = 'https://klooyd.com/admin'
}

if (isAdmin || currentUrl.searchParams.has('qr')) {
  document.querySelector('meta[name="robots"]').content = 'noindex, nofollow'
}

applyPersonalization(loadPersonalization())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
