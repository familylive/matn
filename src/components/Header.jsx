import { useLocation } from 'react-router-dom'
import { useLang } from '../i18n/LanguageContext.jsx'

const titleKeys = {
  '/': 'nav.home',
  '/search': 'nav.search',
  '/favorites': 'nav.favorites',
  '/profile': 'nav.profile',
  '/login': 'login.signin',
  '/requests': 'nav.requests',
}

export default function Header() {
  const { pathname } = useLocation()
  const { t, lang, toggleLang } = useLang()
  return (
    <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
      <span className="w-10" />
      <h1 className="text-lg font-medium text-gray-900">{t(titleKeys[pathname] || 'app.name')}</h1>
      <button
        onClick={toggleLang}
        aria-label="Change language"
        className="w-10 h-8 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600"
      >
        {lang === 'ar' ? 'EN' : 'ع'}
      </button>
    </header>
  )
}
