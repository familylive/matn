import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useFavorites } from '../hooks/useFavorites.js'
import { useLang } from '../i18n/LanguageContext.jsx'
import { api } from '../lib/api.js'

export default function Profile() {
  const { user, logout, login } = useAuth()
  const { favorites } = useFavorites()
  const { t } = useLang()
  const navigate = useNavigate()
  const [me, setMe] = useState(null)
  const [sound, setSound] = useState(localStorage.getItem('soundOn') !== '0')

  useEffect(() => {
    api.me().then((d) => {
      setMe(d)
      login({ ...user, ...d, userName: d.name || user?.userName })
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!user) return null

  const profile = me || user
  const initials = (profile.name || profile.userName || '؟')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')

  const toggleSound = async () => {
    const next = !sound
    setSound(next)
    localStorage.setItem('soundOn', next ? '1' : '0')
    window.dispatchEvent(new CustomEvent('sound-pref', { detail: next }))
    api.setSound(next).catch(() => {})
  }

  const isExpert = profile.role === 'expert'

  return (
    <div className="px-4 py-5">
      <div className="card-lux p-5 text-center">
        <div className="gold-bar absolute inset-x-0 top-0" />
        <button
          onClick={() => { logout(); navigate('/') }}
          className="absolute top-3 end-3 z-10 text-[11px] font-bold text-red-500 bg-red-50 border border-red-100 px-2.5 py-1 rounded-lg"
        >
          خروج
        </button>
        <div className="relative inline-block pt-2">
          {profile.avatar ? (
            <img src={profile.avatar} alt={profile.name} className="w-20 h-20 rounded-full object-cover" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-[#006C35] text-white grid place-items-center text-2xl font-extrabold">
              {initials}
            </div>
          )}
          <span
            className={`absolute bottom-1 end-1 w-5 h-5 rounded-full border-2 border-white ${profile.online ? 'bg-green-500' : 'bg-gray-300'}`}
            title={profile.online ? 'متصل الآن' : 'غير متصل'}
          />
        </div>
        <h2 className="text-lg font-extrabold text-[#11221A] mt-2">{profile.name || profile.userName}</h2>
        <div className="flex items-center justify-center gap-2 mt-1">
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${isExpert ? 'bg-[#FBF5E3] text-[#8a6d13]' : 'bg-[#E9F5EE] text-[#006C35]'}`}>
            {isExpert ? 'فني' : 'عميل'}
          </span>
          <span className={`text-[11px] ${profile.online ? 'text-green-600' : 'text-gray-400'}`}>
            {profile.online ? '● متصل الآن' : '○ غير متصل'}
          </span>
        </div>
        {profile.city && <p className="text-gray-500 text-sm mt-1">📍 {profile.city}</p>}
        {profile.specialty && isExpert && (
          <p className="text-gray-500 text-xs mt-1">{t(`cat.${profile.specialty}`, profile.specialty)}</p>
        )}
        {profile.email && <p className="text-gray-500 text-xs mt-0.5">{profile.email}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="card-lux p-4 text-center">
          <p className="text-2xl font-extrabold text-[#006C35]">{favorites.length}</p>
          <p className="text-xs text-gray-500">{t('profile.saved')}</p>
        </div>
        <div className="card-lux p-4 text-center">
          <p className="text-2xl font-extrabold text-[#006C35]">0</p>
          <p className="text-xs text-gray-500">{t('profile.requests')}</p>
        </div>
      </div>

      <div className="card-lux p-4 mt-4 flex items-center justify-between">
        <div>
          <p className="font-bold text-sm text-[#11221A]">🔔 إشعارات الصوت</p>
          <p className="text-[11px] text-gray-500">صوت عند طلب جديد أو سومة أو تعديل سعر</p>
        </div>
        <button
          onClick={toggleSound}
          className={`w-12 h-7 rounded-full transition relative ${sound ? 'bg-[#006C35]' : 'bg-gray-300'}`}
          aria-label="sound"
        >
          <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-all ${sound ? 'start-0.5' : 'end-0.5'}`} />
        </button>
      </div>

      <Link to="/register" className="btn-ghost mt-4 block text-center">تعديل البيانات</Link>

      <button
        onClick={() => { logout(); navigate('/') }}
        className="w-full mt-3 bg-white border border-red-200 text-red-500 py-3 rounded-xl font-semibold"
      >
        {t('profile.signout')}
      </button>
    </div>
  )
}
