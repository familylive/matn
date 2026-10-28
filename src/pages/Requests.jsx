import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'

const ERROR_AR = {
  unauthorized: 'انتهت جلستك — سجّل دخولك من جديد',
  session_expired: 'انتهت جلستك — سجّل دخولك من جديد',
  city_required: 'اختر مدينتك أولاً',
  title_and_category_required: 'اكتب وصف الطلب واختر التصنيف',
}
import { useLang } from '../i18n/LanguageContext.jsx'
import { useCategories, catLabel } from '../hooks/useCategories.js'
import CityGate from '../components/CityGate.jsx'

const statusStyles = {
  open: 'bg-[#E9F5EE] text-[#006C35]',
  awaiting_payment: 'bg-orange-50 text-orange-600',
  assigned: 'bg-[#FBF5E3] text-[#8a6d13]',
  done: 'bg-blue-50 text-blue-600',
  closed: 'bg-gray-100 text-gray-500',
}

const statusAr = {
  open: 'مفتوح',
  awaiting_payment: 'بانتظار الدفع',
  assigned: 'مُسند',
  done: 'تحت الضمان',
  closed: 'مغلق',
}

const catId = (categories, key) => categories.find((c) => c.name === key)?.id || null

export default function Requests() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ title: '', category: 'Plumber', subcategory: '', city: '', budget: '', description: '', warranty_days: 3 })
  const [loc, setLoc] = useState({ lat: null, lng: null, status: 'idle', accuracy: null })
  const { isAuthenticated, user } = useAuth()
  const { t, lang } = useLang()
  const categories = useCategories()
  const navigate = useNavigate()

  const load = async () => {
    try {
      const data = await api.requests()
      setItems(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    const saved = user?.city || user?.userLocation
    if (saved) setForm((f) => (f.city ? f : { ...f, city: saved }))
  }, [user])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!isAuthenticated || !localStorage.getItem('authToken')) return navigate('/login')
    if (!form.city) return setError('اختر مدينتك أولاً')
    try {
      const created = await api.createRequest({
        ...form,
        budget: form.budget ? Number(form.budget) : null,
        lat: loc.lat,
        lng: loc.lng,
      })
      setShowForm(false)
      setForm({ title: '', category: 'Plumber', subcategory: '', city: '', budget: '', description: '', warranty_days: 3 })
      navigate(`/requests/${created.id}`)
    } catch (err) {
      if (err.code === 'unauthorized') {
        setError(ERROR_AR.unauthorized)
        setTimeout(() => navigate('/login'), 1200)
        return
      }
      setError(ERROR_AR[err.message] || err.message)
    }
  }

  return (
    <div className="px-4 py-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-extrabold text-[#11221A]">{t('req.title')}</h2>
          <p className="text-gray-500 text-xs">{t('req.subtitle')}</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="bg-[#006C35] text-white text-sm px-3.5 py-2 rounded-xl font-bold whitespace-nowrap"
        >
          {showForm ? t('req.cancel') : t('req.new')}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="card-lux p-4 mb-5 space-y-3">
          <div className="gold-bar absolute inset-x-0 top-0" />
          <div className="pt-1 space-y-3">
            <input
              required
              placeholder={t('req.whatNeeded')}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2.5 border border-[#E3D9BF] rounded-xl outline-none focus:border-[#006C35]"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="px-3 py-2.5 border border-[#E3D9BF] rounded-xl bg-white"
              >
                {categories.map((c) => (
                  <option key={c.name} value={c.name}>{catLabel(c, lang)}</option>
                ))}
              </select>
              <input
                type="number" min="0"
                placeholder={t('req.budget')}
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
                className="px-3 py-2.5 border border-[#E3D9BF] rounded-xl outline-none focus:border-[#006C35]"
              />
            </div>

            {categories.filter((x) => x.parent_id === catId(categories, form.category)).length > 0 && (
              <select
                value={form.subcategory}
                onChange={(e) => setForm({ ...form, subcategory: e.target.value })}
                className="w-full px-3 py-2.5 border border-[#E3D9BF] rounded-xl bg-white text-sm"
              >
                <option value="">القسم الفرعي (اختياري)</option>
                {categories.filter((x) => x.parent_id === catId(categories, form.category)).map((k) => (
                  <option key={k.id} value={k.name}>{catLabel(k, lang)}</option>
                ))}
              </select>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">🛡️ مدة الضمان على الإصلاح</label>
              <select
                value={form.warranty_days}
                onChange={(e) => setForm({ ...form, warranty_days: Number(e.target.value) })}
                className="w-full px-3 py-2.5 border border-[#E3D9BF] rounded-xl bg-white text-sm"
              >
                <option value={1}>يوم واحد</option>
                <option value={3}>٣ أيام</option>
                <option value={7}>أسبوع</option>
                <option value={30}>شهر</option>
              </select>
              <p className="text-[10px] text-gray-500 mt-1">الطلب ما يُغلق إلا بعد انتهاء الضمان وموافقتك على الإغلاق.</p>
            </div>

            <CityGate value={form.city} onChange={(c) => setForm({ ...form, city: c })} />

            <div className="rounded-xl border border-[#E3D9BF] bg-[#FBF9F2] p-3">
              <button
                type="button"
                onClick={() => {
                  if (!navigator.geolocation) return setLoc({ ...loc, status: 'unsupported' })
                  setLoc({ ...loc, status: 'loading' })
                  navigator.geolocation.getCurrentPosition(
                    (pos) =>
                      setLoc({
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        accuracy: Math.round(pos.coords.accuracy),
                        status: 'ok',
                      }),
                    () => setLoc({ ...loc, status: 'denied' }),
                    { enableHighAccuracy: true, timeout: 10000 },
                  )
                }}
                className="w-full rounded-lg bg-white border border-[#006C35] text-[#006C35] py-2 text-sm font-bold"
              >
                {loc.status === 'loading' ? 'جارٍ تحديد موقعك…' : '📍 حدد موقعي الحالي'}
              </button>
              {loc.status === 'ok' && (
                <p className="text-[11px] text-[#006C35] mt-2 text-center">
                  تم تحديد موقعك ✅ (دقة ±{loc.accuracy} م) — راح تشوف مسافة كل حرفي عنك.
                </p>
              )}
              {loc.status === 'denied' && (
                <p className="text-[11px] text-red-500 mt-2 text-center">
                  ما قدرنا نأخذ موقعك — اسمح بالوصول للموقع من إعدادات المتصفح.
                </p>
              )}
              {loc.status === 'unsupported' && (
                <p className="text-[11px] text-red-500 mt-2 text-center">جهازك ما يدعم تحديد الموقع.</p>
              )}
            </div>

            <textarea
              placeholder={t('req.details')}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2.5 border border-[#E3D9BF] rounded-xl outline-none focus:border-[#006C35]"
            />
            <button type="submit" className="btn-primary">{t('req.publish')}</button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {loading && <p className="text-sm text-gray-500">{t('req.loading')}</p>}

      <div className="space-y-3">
        {items.map((r) => (
          <Link key={r.id} to={`/requests/${r.id}`} className="block card-lux p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bold text-[#11221A]">
                {r.number ? <span className="text-[10px] text-gray-400 me-1">#{r.number}</span> : null}
                {r.title}
              </h3>
              <span className={`text-[11px] px-2 py-1 rounded-full font-semibold whitespace-nowrap ${statusStyles[r.status] || 'bg-gray-100 text-gray-600'}`}>
                {statusAr[r.status] || r.status}
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              {t(`cat.${r.category}`, r.category)}{r.city ? ` · ${r.city}` : ''}
            </p>
            <div className="flex items-center gap-3 mt-2 text-xs">
              <span className="text-gray-500">{r.bids_count} {t('req.bids')}</span>
              {r.lowest_bid != null && (
                <span className="chip-gold">{t('req.lowest')} {r.lowest_bid} {t('common.tnd')}</span>
              )}
            </div>
          </Link>
        ))}
        {!loading && items.length === 0 && <p className="text-gray-500 text-sm">{t('req.empty')}</p>}
      </div>
    </div>
  )
}
