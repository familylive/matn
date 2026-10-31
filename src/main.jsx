import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import Notifications from './components/Notifications.jsx'
import { LanguageProvider } from './i18n/LanguageContext.jsx'
import './index.css'

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      try { reg.update() } catch {}
    }).catch(() => {})
  })
}

/* فحص تحديث النسخة: إذا تغيّر البِلد على السيرفر ننظّف الكاش ونحدّث الصفحة مرة واحدة */
async function checkVersion() {
  try {
    const r = await fetch('/api/version', { cache: 'no-store' })
    const { build } = await r.json()
    if (!build) return
    const seen = localStorage.getItem('appBuild')
    if (!seen) { localStorage.setItem('appBuild', build); return }
    if (seen !== build) {
      localStorage.setItem('appBuild', build)
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((x) => x.update().catch(() => {})))
      }
      const flag = 'reloadedForBuild'
      if (sessionStorage.getItem(flag) !== build) {
        sessionStorage.setItem(flag, build)
        location.reload()
      }
    }
  } catch {}
}
window.addEventListener('load', checkVersion)
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion() })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <BrowserRouter>
        <AuthProvider>
          <Notifications />
          <App />
        </AuthProvider>
      </BrowserRouter>
    </LanguageProvider>
  </React.StrictMode>,
)
