import { useEffect, useState } from 'react'
import Header from './Header.jsx'
import BottomNav from './BottomNav.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { getToken } from '../lib/api.js'

export default function Layout({ children }) {
  const { isAuthenticated } = useAuth()
  const [supportWa, setSupportWa] = useState('')

  // رقم واتساب الدعم من إعدادات الموقع (يظهر للزائر قبل تسجيل الدخول)
  useEffect(() => {
    fetch('/api/site-config')
      .then((r) => r.json())
      .then((d) => setSupportWa(d?.support_whatsapp || d?.support_phone || ''))
      .catch(() => {})
  }, [])

  // نبضة «متصل الآن» كل دقيقة (تخلي ظهوري للعملاء القريبين صحيح)
  useEffect(() => {
    if (!isAuthenticated) return
    const ping = () => {
      const t = getToken()
      if (t) fetch('/api/me', { headers: { authorization: 'Bearer ' + t } }).catch(() => {})
    }
    ping()
    const id = setInterval(ping, 60000)
    return () => clearInterval(id)
  }, [isAuthenticated])

  return (
    <div className="w-full max-w-none md:max-w-4xl lg:max-w-6xl mx-auto flex flex-col h-[100dvh] min-h-[100vh] bg-gray-50 md:shadow-[0_0_60px_rgba(0,0,0,0.06)] overflow-x-hidden">
      <Header />
      <main className="flex-grow overflow-y-auto">{children}</main>
      <BottomNav />
      {supportWa && (
        <a
          href={`https://wa.me/${String(supportWa).replace(/\D/g, '')}`}
          target="_blank"
          rel="noreferrer"
          aria-label="واتساب الدعم الفني"
          className="fixed bottom-20 start-3 z-40 w-12 h-12 rounded-full bg-[#25D366] text-white grid place-items-center shadow-[0_6px_18px_rgba(37,211,102,0.45)] active:scale-95 transition"
        >
          <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden="true">
            <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.04-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.92-2.19-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.46s1.06 2.86 1.21 3.06c.15.2 2.09 3.19 5.06 4.47.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2-.57-.35z" />
            <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.13c-1.53 0-3.03-.41-4.34-1.19l-.31-.18-3.12.82.83-3.04-.2-.32a8.19 8.19 0 0 1-1.25-4.36c0-4.54 3.69-8.23 8.23-8.23 4.54 0 8.23 3.69 8.23 8.23 0 4.54-3.69 8.27-8.07 8.27z" opacity=".95" />
          </svg>
        </a>
      )}
    </div>
  )
}
