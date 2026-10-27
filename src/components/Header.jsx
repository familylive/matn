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
    <header className="bg-white border-b border-[#ECE3CE]">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-[#006C35] text-white grid place-items-center font-extrabold">م</span>
          <span className="font-extrabold text-[#11221A]">{t('app.name')}</span>
        </div>
        <span className="text-sm text-gray-500">{t(titleKeys[pathname] || 'app.name')}</span>
        <button
          onClick={toggleLang}
          aria-label="Change language"
          className="w-10 h-8 rounded-lg border border-[#E3D9BF] text-xs font-bold text-[#8a6d13] bg-[#FBF5E3]"
        >
          {lang === 'ar' ? 'EN' : 'ع'}
        </button>
      </div>
      <div className="gold-bar" />
    </header>
  )
}
