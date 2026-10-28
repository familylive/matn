import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { SAUDI_CITIES, cityByName } from '../data/cities.js'

export default function LocationSetup() {
  const { user, isAuthenticated, login } = useAuth()
  const [open, setOpen] = useState(false)
  const cities = SAUDI_CITIES
  const [city, setCity] = useState('')
  const [coords, setCoords] = useState({ lat: null, lng: null })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (isAuthenticated && (!user?.city || !user?.lat)) setOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.city, user?.lat])

  const locate = () => {
    if (!navigator.geolocation) return setErr('جهازك ما يدعم تحديد الموقع')
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setErr('اسمح بالوصول للموقع من إعدادات المتصفح'),
      { enableHighAccuracy: true, timeout: 12000 },
    )
  }

  const save = async () => {
    setErr('')
    if (!city) return setErr('اختر مدينتك')
    // إذا ما قدرنا نأخذ GPS، نستخدم مركز المدينة المختارة
    const base = coords.lat ? coords : cityByName(city) || {}
    if (!base.lat) return setErr('حدد موقعك الحالي (GPS)')
    setBusy(true)
    try {
      const updated = await api.patch('/api/me/profile', { city, lat: base.lat, lng: base.lng })
      login({ ...user, ...updated, userName: updated.name || user?.userName, userLocation: updated.city })
      setOpen(false)
    } catch {
      setErr('تعذّر الحفظ')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-3" dir="rtl">
        <div className="text-center">
          <div className="text-4xl">📍</div>
          <h3 className="font-extrabold text-[#11221A] mt-1">حدد موقعك ومدينتك</h3>
          <p className="text-[11px] text-gray-500">مرة واحدة فقط — نستخدمه لجلب أقرب حرفي إليك</p>
        </div>

        <button type="button" onClick={locate} className="w-full bg-[#006C35] text-white py-2.5 rounded-xl font-bold text-sm">
          {coords.lat ? '✅ تم تحديد موقعك' : '📍 استخدام موقعي الحالي (GPS)'}
        </button>
        {coords.lat && (
          <p className="text-[10px] text-gray-500 text-center">{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</p>
        )}

        <select value={city} onChange={(e) => setCity(e.target.value)}
          className="w-full px-3 py-2.5 border border-[#E3D9BF] rounded-xl text-sm bg-white">
          <option value="">اختر مدينتك…</option>
          {cities.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>

        {err && <p className="text-xs text-red-500">{err}</p>}

        <button onClick={save} disabled={busy} className="btn-primary">
          {busy ? 'جارٍ الحفظ…' : 'حفظ ومتابعة'}
        </button>
        <button onClick={() => setOpen(false)} className="w-full text-center text-[11px] text-gray-400 py-1">
          لاحقاً
        </button>
      </div>
    </div>
  )
}
