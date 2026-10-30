import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { api } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { expertName } from '../i18n/display.js'
import { useLang } from '../i18n/LanguageContext.jsx'
import { SAUDI_CITIES, cityByName } from '../data/cities.js'

const meIcon = L.divIcon({
  className: '',
  html: `<div style="width:20px;height:20px;border-radius:50%;background:#1a73e8;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
})

const proIcon = L.divIcon({
  className: '',
  html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#006C35;border:3px solid #C9A227;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 26],
})

export default function Nearby() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const { lang } = useLang()
  const el = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)

  const [pos, setPos] = useState(null)
  const [list, setList] = useState([])
  const [status, setStatus] = useState('locating')
  const [picked, setPicked] = useState(null)
  const [form, setForm] = useState({ title: '', description: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [city, setCity] = useState('')

  // تحديد موقعي
  useEffect(() => {
    if (!navigator.geolocation) return setStatus('unsupported')
    navigator.geolocation.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setStatus('denied'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    )
  }, [])

  // جلب الفنيين القريبين
  useEffect(() => {
    if (!pos) return
    setStatus('loading')
    const load = () =>
      fetch(`/api/experts/nearby?lat=${pos.lat}&lng=${pos.lng}&km=10`)
        .then((r) => r.json())
        .then((d) => {
          setList(Array.isArray(d) ? d : [])
          setStatus('ok')
        })
        .catch(() => setStatus('error'))
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [pos])

  // الخريطة
  useEffect(() => {
    if (!pos || !el.current || mapRef.current) return
    const map = L.map(el.current, { zoomControl: true, attributionControl: false }).setView([pos.lat, pos.lng], 13)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
    mapRef.current = map

    L.circle([pos.lat, pos.lng], { radius: 10000, color: '#006C35', weight: 1, fillColor: '#006C35', fillOpacity: 0.06 }).addTo(map)
    L.marker([pos.lat, pos.lng], { icon: meIcon }).addTo(map).bindPopup('موقعك')
    layerRef.current = L.layerGroup().addTo(map)
    setTimeout(() => map.invalidateSize(), 250)
    return () => { map.remove(); mapRef.current = null }
  }, [pos])

  // علامات الفنيين
  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return
    layerRef.current.clearLayers()
    list.forEach((e) => {
      L.marker([e.lat, e.lng], { icon: proIcon })
        .addTo(layerRef.current)
        .on('click', () => setPicked(e))
    })
  }, [list])

  const send = async (e) => {
    e.preventDefault()
    if (!isAuthenticated) return navigate('/login')
    setErr('')
    setBusy(true)
    try {
      const r = await api.post('/api/requests/direct', {
        expertId: picked.id,
        title: form.title,
        description: form.description,
        city: picked.city,
        lat: pos?.lat,
        lng: pos?.lng,
      })
      navigate(`/requests/${r.id}`)
    } catch (e2) {
      setErr(e2.message === 'title_required' ? 'اكتب وصف المشكلة' : 'تعذّر الإرسال')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-4 py-4 mx-auto w-full max-w-3xl lg:max-w-5xl">
      <h2 className="text-xl font-extrabold text-[#11221A]">🗺️ الفنيون القريبون الآن</h2>
      <p className="text-gray-500 text-xs mt-1">خلال ١٠ كم من موقعك · اطلب أحدهم مباشرة بدون مزاد</p>

      <div ref={el} className="mt-3 rounded-2xl overflow-hidden border border-[#EADFC8]" style={{ height: 300 }} />

      <div className="mt-3 text-xs text-gray-600">
        {status === 'locating' && '📍 جارٍ تحديد موقعك…'}
        {status === 'denied' && '⛔ الموقع مقفول — اختر مدينتك بالأسفل أو اسمح بالموقع من إعدادات المتصفح.'}
        {status === 'unsupported' && 'جهازك ما يدعم تحديد الموقع.'}
        {status === 'loading' && '🔍 نبحث عن فنيين متصلين قريبين…'}
        {status === 'ok' && `${list.length} فني متصل داخل ١٠ كم`}
      </div>

      {(status === 'denied' || status === 'unsupported') && (
        <div className="card-lux p-4 mt-3 space-y-2">
          <p className="text-xs font-bold text-[#11221A]">📍 اختر مدينتك يدوياً</p>
          <select
            value={city}
            onChange={(e) => {
              const c = e.target.value
              setCity(c)
              const cc = cityByName(c)
              if (cc) setPos({ lat: cc.lat, lng: cc.lng })
            }}
            className="w-full px-3 py-2.5 border border-[#E3D9BF] rounded-xl text-sm bg-white"
          >
            <option value="">— اختر مدينة —</option>
            {SAUDI_CITIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
          <button
            onClick={() => {
              if (!navigator.geolocation) return
              setStatus('locating')
              navigator.geolocation.getCurrentPosition(
                (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
                () => setStatus('denied'),
                { enableHighAccuracy: true, timeout: 15000 },
              )
            }}
            className="w-full bg-[#006C35] text-white py-2.5 rounded-xl text-sm font-bold"
          >
            جرّب تحديد موقعي مرة ثانية
          </button>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 mt-4">
        {list.map((e) => (
          <div key={e.id} className="card-lux p-3 flex items-center gap-3">
            <img src={e.image} alt="" className="w-14 h-14 rounded-xl object-cover" />
            <div className="flex-1 min-w-0">
              <p className="font-extrabold text-sm text-[#0B0A08] truncate">{expertName(e, lang)}</p>
              <p className="text-[11px] text-gray-500">
                {e.job} · 📍 {e.distance_km} كم
                {e.has_car ? ' · 🚗' : ''}
              </p>
              <p className="text-[11px] text-[#006C35] font-bold">● متصل الآن</p>
            </div>
            <button
              onClick={() => setPicked(e)}
              className="bg-[#11221A] text-white text-[11px] font-bold px-3 py-2 rounded-lg"
            >
              اطلب مباشرة
            </button>
          </div>
        ))}
      </div>

      {status === 'ok' && list.length === 0 && (
        <div className="card-lux p-5 text-center mt-3">
          <p className="text-sm text-gray-600">ما فيه فني متصل داخل ١٠ كم حالياً.</p>
          <button onClick={() => navigate('/requests')} className="mt-3 text-sm font-bold text-[#006C35] underline">
            انشر طلب مزاد عام ←
          </button>
        </div>
      )}

      {picked && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-end sm:place-items-center p-0 sm:p-4" onClick={() => setPicked(null)}>
          <form onSubmit={send} onClick={(ev) => ev.stopPropagation()} className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-3">
              <img src={picked.image} alt="" className="w-12 h-12 rounded-xl object-cover" />
              <div>
                <p className="font-extrabold text-[#11221A]">{expertName(picked, lang)}</p>
                <p className="text-[11px] text-gray-500">{picked.distance_km} كم · متصل الآن</p>
              </div>
            </div>
            <input
              required
              placeholder="وش المشكلة؟ مثال: مكيف ما يبرد"
              value={form.title}
              onChange={(ev) => setForm({ ...form, title: ev.target.value })}
              className="w-full px-3 py-2.5 border border-[#E3D9BF] rounded-xl text-sm"
            />
            <textarea
              rows={2}
              placeholder="تفاصيل إضافية (اختياري)"
              value={form.description}
              onChange={(ev) => setForm({ ...form, description: ev.target.value })}
              className="w-full px-3 py-2.5 border border-[#E3D9BF] rounded-xl text-sm"
            />
            <p className="text-[10px] text-gray-500">طلب خاص بينك وبينه فقط — ما ينزل بالمزاد العام</p>
            {err && <p className="text-xs text-red-500">{err}</p>}
            <button disabled={busy} className="btn-primary">{busy ? 'جارٍ الإرسال…' : 'أرسل الطلب الخاص'}</button>
            <button type="button" onClick={() => setPicked(null)} className="w-full text-xs text-gray-400 py-1">إغلاق</button>
          </form>
        </div>
      )}
    </div>
  )
}
