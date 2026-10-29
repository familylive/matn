import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useLang } from '../i18n/LanguageContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'

const titleKeys = {
  '/': 'nav.home',
  '/search': 'nav.search',
  '/favorites': 'nav.favorites',
  '/profile': 'nav.profile',
  '/login': 'login.signin',
  '/requests': 'nav.requests',
  '/my-requests': 'nav.myRequests',
}

export default function Header() {

  const { pathname } = useLocation()
  const { t, lang, toggleLang } = useLang()
  const { user, isAuthenticated } = useAuth()

  const [reqCount, setReqCount] = useState(0)
  useEffect(() => {
    if (!user || user.role !== 'expert') return
    let alive = true
    const load = () =>
      fetch('/api/requests/counts')
        .then((r) => r.json())
        .then((d) => { if (alive) setReqCount(d.total || 0) })
        .catch(() => {})
    load()
    const id = setInterval(load, 20000)
    return () => { alive = false; clearInterval(id) }
  }, [user?.role])

  const name = user?.name || user?.userName || ''
  const initial = name.trim().charAt(0) || '؟'

  return (
    <header className="bg-white border-b border-[#ECE3CE]">
      {isAuthenticated && user?.role === 'expert' && reqCount > 0 && (
        <Link
          to="/requests"
          className="flex items-center justify-center gap-2 bg-[#B3261E] text-white text-[14px] font-extrabold py-3.5 px-3 shadow-md"
        >
          <span className="text-xl animate-bounce">🔔</span>
          <span>{reqCount} طلب جديد في تخصصك</span>
          <span className="bg-white/20 rounded-full px-2.5 py-0.5 text-[11px]">اضغط للسوم</span>
        </Link>
      )}
      <div className="px-3 py-2.5 flex items-center gap-2">
        <Link to="/" className="flex items-center gap-1.5 shrink-0">
          <span className="w-8 h-8 rounded-lg bg-[#006C35] text-white grid place-items-center font-extrabold">م</span>
          <span className="font-extrabold text-[#11221A] hidden sm:inline">{t('app.name')}</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
          {[
            { to: '/', key: 'nav.home' },
            { to: '/my-requests', key: 'nav.myRequests' },
            { to: '/requests', key: 'nav.requests' },
            { to: '/favorites', key: 'nav.favorites' },
          ].map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`px-3 py-1.5 rounded-lg text-[13px] font-bold transition ${
                pathname === l.to ? 'bg-[#FBF5E3] text-[#8a6d13]' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t(l.key)}
            </Link>
          ))}
        </nav>

        <span className="md:hidden flex-1 text-center text-[13px] text-gray-500 truncate">
          {t(titleKeys[pathname] || 'app.name')}
        </span>

        <button
          onClick={toggleLang}
          aria-label="Change language"
          className="w-9 h-8 rounded-lg border border-[#E3D9BF] text-[11px] font-bold text-[#8a6d13] bg-[#FBF5E3] shrink-0"
        >
          {lang === 'ar' ? 'EN' : 'ع'}
        </button>

        {isAuthenticated ? (
          <Link
            to="/profile"
            className="flex items-center gap-1.5 shrink-0 max-w-[110px]"
            aria-label="حسابي"
          >
            <span className="w-8 h-8 rounded-full bg-[#006C35] text-white grid place-items-center text-sm font-bold">
              {initial}
            </span>
            <span className="text-[11px] font-bold text-[#11221A] truncate">{name.split(' ')[0]}</span>
          </Link>
        ) : (
          <Link
            to="/login"
            className="flex items-center gap-1 shrink-0 bg-[#006C35] text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            دخول
          </Link>
        )}
      </div>
      <div className="gold-bar" />
    </header>
  )
}
