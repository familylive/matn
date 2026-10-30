import { useEffect } from 'react'
import Header from './Header.jsx'
import BottomNav from './BottomNav.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { getToken } from '../lib/api.js'

export default function Layout({ children }) {
  const { isAuthenticated } = useAuth()

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
    <div className="w-full max-w-sm md:max-w-4xl lg:max-w-6xl mx-auto flex flex-col h-[100dvh] bg-gray-50 md:shadow-[0_0_60px_rgba(0,0,0,0.06)]">
      <Header />
      <main className="flex-grow overflow-y-auto">{children}</main>
      <BottomNav />
    </div>
  )
}
