import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { api, setToken } from '../lib/api.js'
import { SAUDI_CITIES } from '../data/cities.js'
import { useCategories, catLabel } from '../hooks/useCategories.js'
import MapPicker from '../components/MapPicker.jsx'
import { useLang } from '../i18n/LanguageContext.jsx'

export default function Register() {
  const { user, login, isAuthenticated } = useAuth()
  const { t, lang } = useLang()
  const categories = useCategories()
  const navigate = useNavigate()
  const cities = SAUDI_CITIES
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    role: 'customer',
    name: '',
    username: '',
    password: '',
    phone: '',
    email: '',
    nationality: 'سعودي',
    city: '',
    specialty: 'AC',
    lat: null,
    lng: null,
  })

  useEffect(() => {
    if (user) {
      setForm((f) => ({
        ...f,
        name: user.name || user.userName || '',
        phone: user.phone || '',
        email: user.email || '',
        city: user.city || user.userLocation || '',
        role: user.role || 'customer',
        specialty: user.specialty || 'AC',
        lat: user.lat ?? null,
        lng: user.lng ?? null,
      }))
    }
  }, [user])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.city) return setError('اختر مدينتك')
    if (!form.lat || !form.lng) return setError('حدد موقعك على الخريطة')
    setBusy(true)
    try {
      let updated
      if (!isAuthenticated) {
        if (!form.username || !form.password) {
          setError('اسم المستخدم وكلمة المرور مطلوبان')
          setBusy(false)
          return
        }
        const r = await api.signup(form)
        setToken(r.token)
        updated = r.user
      } else {
        updated = await api.register(form)
      }
      login({ ...user, ...updated, userName: updated.name || updated.username, userLocation: updated.city })
      navigate(form.role === 'expert' ? '/verify' : '/profile')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const roles = [
    { key: 'customer', title: 'عميل', desc: 'أطلب خدمة وأسوم على السعر', icon: '🧑‍💼' },
    { key: 'expert', title: 'فني', desc: 'أستلم طلبات وأقدّم عروض', icon: '🧰' },
  ]

  return (
    <div className="px-4 py-5 mx-auto w-full max-w-xl">
      <h2 className="text-xl font-extrabold text-[#11221A] mb-1">
        {isAuthenticated ? 'إكمال البيانات' : 'تسجيل جديد'}
      </h2>
      <p className="text-gray-500 text-sm mb-4">بياناتك تساعدنا نوصلك بأقرب حرفي أو طلب</p>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <p className="text-xs font-bold text-gray-600 mb-2">نوع الحساب *</p>
          <div className="grid grid-cols-2 gap-3">
            {roles.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setForm({ ...form, role: r.key })}
                className={`card-lux p-3 text-start relative ${form.role === r.key ? 'ring-2 ring-[#006C35]' : ''}`}
              >
                {form.role === r.key && (
                  <span className="absolute top-2 end-2 w-5 h-5 rounded-full bg-[#006C35] text-white text-xs grid place-items-center">✓</span>
                )}
                <div className="text-2xl">{r.icon}</div>
                <p className="font-bold text-[#11221A] mt-1">{r.title}</p>
                <p className="text-[10px] text-gray-500 leading-tight">{r.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="card-lux p-4 space-y-3">
          <div className="gold-bar absolute inset-x-0 top-0" />
          <div className="pt-1 space-y-3">
            {!isAuthenticated && (
              <>
                <div>
                  <label className="text-xs font-bold text-gray-600">اسم المستخدم *</label>
                  <input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.replace(/\s/g, '') })}
                    placeholder="username"
                    className="w-full mt-1 px-3 py-2.5 border border-[#E3D9BF] rounded-xl outline-none focus:border-[#006C35]" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600">كلمة المرور *</label>
                  <input required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="٦ أحرف على الأقل"
                    className="w-full mt-1 px-3 py-2.5 border border-[#E3D9BF] rounded-xl outline-none focus:border-[#006C35]" />
                </div>
              </>
            )}
            <div>
              <label className="text-xs font-bold text-gray-600">الاسم *</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full mt-1 px-3 py-2.5 border border-[#E3D9BF] rounded-xl outline-none focus:border-[#006C35]" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600">الجوال *</label>
              <input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+966 5X XXX XXXX"
                className="w-full mt-1 px-3 py-2.5 border border-[#E3D9BF] rounded-xl outline-none focus:border-[#006C35]" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600">الإيميل</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full mt-1 px-3 py-2.5 border border-[#E3D9BF] rounded-xl outline-none focus:border-[#006C35]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-600">الجنسية</label>
                <select value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })}
                  className="w-full mt-1 px-3 py-2.5 border border-[#E3D9BF] rounded-xl bg-white">
                  {['سعودي', 'مقيم', 'أخرى'].map((n) => <option key={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600">المدينة *</label>
                <select required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="w-full mt-1 px-3 py-2.5 border border-[#E3D9BF] rounded-xl bg-white">
                  <option value="">اختر…</option>
                  {cities.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </div>
            </div>

            {form.role === 'expert' && (
              <div>
                <label className="text-xs font-bold text-gray-600">التخصص *</label>
                <select value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })}
                  className="w-full mt-1 px-3 py-2.5 border border-[#E3D9BF] rounded-xl bg-white">
                  {categories.map((c) => (
                    <option key={c.name} value={c.name}>{c.icon} {catLabel(c, lang)}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="card-lux p-4">
          <div className="gold-bar absolute inset-x-0 top-0" />
          <p className="text-xs font-bold text-gray-600 mb-2 pt-1">موقعك على الخريطة *</p>
          <MapPicker value={{ lat: form.lat, lng: form.lng }} onChange={({ lat, lng }) => setForm({ ...form, lat, lng })} />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        <button disabled={busy} className="btn-primary">{busy ? 'جارٍ الحفظ…' : 'حفظ البيانات'}</button>
      </form>
    </div>
  )
}
