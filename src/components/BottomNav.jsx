import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useLang } from '../i18n/LanguageContext.jsx'

const items = [
  { to: '/', key: 'nav.home', icon: 'M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10' },
  { to: '/my-requests', key: 'nav.myRequests', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { to: '/requests', key: 'nav.requests', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { to: '/favorites', key: 'nav.favorites', icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z' },
  { to: '/profile', key: 'nav.profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
]

export default function BottomNav() {
  const { t } = useLang()
  const [open, setOpen] = useState(0)

  useEffect(() => {
    let alive = true
    const load = () =>
      fetch('/api/requests/counts')
        .then((r) => r.json())
        .then((d) => { if (alive) setOpen(d.total || 0) })
        .catch(() => {})
    load()
    const id = setInterval(load, 30000)
    return () => { alive = false; clearInterval(id) }
  }, [])
  return (
    <nav className="md:hidden shrink-0 bg-white border-t border-gray-100 flex justify-around pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 text-xs ${isActive ? 'text-blue-500' : 'text-gray-400'}`
          }
        >
          <span className="relative">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
            </svg>
            {item.key === 'nav.requests' && open > 0 && (
              <span className="absolute -top-1.5 -end-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold grid place-items-center">
                {open}
              </span>
            )}
          </span>
          {t(item.key)}
        </NavLink>
      ))}
    </nav>
  )
}
