import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useFavorites } from '../hooks/useFavorites.js'
import { useLang } from '../i18n/LanguageContext.jsx'
import { api, getToken } from '../lib/api.js'
import { enablePush, testPush, pushSupported } from '../lib/push.js'
import ExpertWorkspace from '../components/ExpertWorkspace.jsx'
import WalletCard from '../components/WalletCard.jsx'
import LoyaltyCard from '../components/LoyaltyCard.jsx'
import VerifiedBadge from '../components/VerifiedBadge.jsx'

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
  const [myExpert, setMyExpert] = useState(null)

  useEffect(() => {
    if (!isExpert) return
    api.get('/api/me/expert').then(setMyExpert).catch(() => {})
  }, [isExpert])

  const toggleCar = async () => {
    const next = !myExpert?.has_car
    setMyExpert((e) => ({ ...e, has_car: next ? 1 : 0 }))
    try {
      await api.patch('/api/me/expert', { has_car: next })
    } catch {
      setMyExpert((e) => ({ ...e, has_car: next ? 0 : 1 }))
    }
  }

  return (
    <div className="px-4 py-5 mx-auto w-full max-w-2xl lg:max-w-4xl">
      <div className="card-lux p-5 text-center">
        <div className="gold-bar absolute inset-x-0 top-0" />
        <button
          onClick={() => { logout(); navigate('/') }}
          className="absolute top-3 end-3 z-10 text-[11px] font-bold text-red-500 bg-red-50 border border-red-100 px-2.5 py-1 rounded-lg"
        >
          خروج
        </button>
        <div className="relative inline-block pt-2">
          {/* زر تعديل الصورة — على اليسار، كبير وواضح */}
          <label className="absolute -bottom-3 -end-3 z-20 w-10 h-10 rounded-full bg-[#C9A227] text-white grid place-items-center cursor-pointer shadow-lg ring-2 ring-white">
            <svg className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 3.487a2.06 2.06 0 112.914 2.914L7.5 18.65l-4 1 1-4L16.862 3.487z" />
            </svg>
            <input
              type="file" accept="image/*" className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                try {
                  const r = await api.uploadAvatar(f)
                  setMe((m) => ({ ...(m || profile), avatar: r.url }))
                  login({ ...user, avatar: r.url })
                } catch {}
              }}
            />
          </label>
          {profile.avatar ? (
            <img src={profile.avatar} alt={profile.name} className="w-20 h-20 rounded-full object-cover" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-[#006C35] text-white grid place-items-center text-2xl font-extrabold">
              {initials}
            </div>
          )}
          <span
            className={`absolute top-1 end-0 w-4 h-4 rounded-full border-2 border-white ${profile.online ? 'bg-green-500' : 'bg-gray-300'}`}
            title={profile.online ? 'متصل الآن' : 'غير متصل'}
          />

        </div>
        <h2 className="text-lg font-extrabold text-[#11221A] mt-4 flex items-center justify-center gap-1.5">
          <span className="truncate">{profile.name || profile.userName}</span>
          {!!profile.verified && <VerifiedBadge size={22} title="موثّق" />}
        </h2>
        <div className="flex items-center justify-center gap-2 mt-1 flex-wrap">
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${isExpert ? 'bg-[#FBF5E3] text-[#8a6d13]' : 'bg-[#E9F5EE] text-[#006C35]'}`}>
            {isExpert ? 'فني' : 'عميل'}
          </span>
          {!!profile.verified && (
            <span className="text-[11px] px-2.5 py-0.5 rounded-full font-extrabold bg-[#006C35] text-white shadow-sm">
              عميل موثوق
            </span>
          )}
          <span className={`text-[11px] ${profile.online ? 'text-green-600' : 'text-gray-400'}`}>
            {profile.online ? '● متصل الآن' : '○ غير متصل'}
          </span>
        </div>
        {profile.city && <p className="text-gray-500 text-sm mt-1">📍 {profile.city}</p>}
        {!!profile.specialty && isExpert && (
          <p className="text-gray-500 text-xs mt-1">{t(`cat.${profile.specialty}`, profile.specialty)}</p>
        )}
        {profile.email && <p className="text-gray-500 text-xs mt-0.5">{profile.email}</p>}
      </div>

      {isExpert && myExpert && (
        <button
          onClick={toggleCar}
          className="card-lux w-full mt-4 p-4 flex items-center justify-between text-start"
        >
          <div>
            <p className="font-extrabold text-sm text-[#11221A]">🚗 أملك سيارة</p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {myExpert.has_car
                ? 'مفعّل — يرشّحك النظام أولاً للمزايدة'
                : 'غير مفعّل — فعّله لتكون أول المرشحين'}
            </p>
          </div>
          <span
            className={`w-12 h-6 rounded-full flex items-center px-0.5 transition shrink-0 ${
              myExpert.has_car ? 'bg-[#006C35] justify-end' : 'bg-gray-300 justify-start'
            }`}
          >
            <span className="block w-5 h-5 rounded-full bg-white shadow" />
          </span>
        </button>
      )}

      {isExpert && <WalletCard />}

      <LoyaltyCard />

      {isExpert && myExpert && <ExpertWorkspace expert={myExpert} onChange={setMyExpert} />}

      <div className="card-lux p-4 mt-4">
        <p className="font-extrabold text-sm text-[#11221A]">🔔 إشعارات الطلبات</p>
        <p className="text-[11px] text-gray-500 mt-1 leading-5">
          فعّل التنبيهات عشان يوصلك صوت وإشعار حتى لو التطبيق مسكّر.
          <br />
          <span className="text-[#8a6d13]">آيفون: أضف الموقع للشاشة الرئيسية أولاً (مشاركة ← إضافة إلى الشاشة الرئيسية).</span>
        </p>
        {!pushSupported() ? (
          <p className="text-[11px] text-red-500 mt-2">جهازك/متصفحك ما يدعم الإشعارات.</p>
        ) : (
          <div className="flex gap-2 mt-3">
            <button
              onClick={async () => {
                try {
                  await enablePush(getToken())
                  alert('تم تفعيل الإشعارات ✅')
                } catch (e) {
                  alert(e.message === 'denied' ? 'رفضت الإذن — اسمح بالإشعارات من إعدادات المتصفح' : 'تعذّر التفعيل')
                }
              }}
              className="flex-1 bg-[#006C35] text-white py-2 rounded-lg text-xs font-bold"
            >
              تفعيل الإشعارات
            </button>
            <button
              onClick={async () => {
                const r = await testPush(getToken())
                alert(r.sent ? 'أرسلنا إشعار تجربة ✅' : 'ما فيه اشتراك — فعّل الإشعارات أول')
              }}
              className="px-3 py-2 rounded-lg text-xs font-bold border border-[#E3D9BF] text-[#8a6d13]"
            >
              تجربة
            </button>
          </div>
        )}
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
