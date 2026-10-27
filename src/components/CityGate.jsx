import { useEffect, useState } from 'react'
import { useLang } from '../i18n/LanguageContext.jsx'

export default function CityGate({ value, onChange }) {
  const { t } = useLang()
  const [cities, setCities] = useState([])
  const [showSupport, setShowSupport] = useState(false)
  const [support, setSupport] = useState({ city: '', phone: '', note: '' })
  const [sent, setSent] = useState(false)

  useEffect(() => {
    fetch('/api/cities').then((r) => r.json()).then(setCities).catch(() => {})
  }, [])

  const submitSupport = async (e) => {
    e.preventDefault()
    await fetch('/api/city-requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(support),
    }).catch(() => {})
    setSent(true)
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">📍 {t('req.city')} *</label>
        <select
          required
          value={value}
          onChange={(e) => {
            if (e.target.value === '__other__') {
              setShowSupport(true)
              onChange('')
            } else {
              onChange(e.target.value)
            }
          }}
          className="w-full px-3 py-2.5 border border-[#E3D9BF] rounded-xl bg-white text-sm outline-none focus:border-[#006C35]"
        >
          <option value="">اختر مدينتك…</option>
          {cities.map((c) => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
          <option value="__other__">مدينتي غير موجودة…</option>
        </select>
      </div>

      {showSupport && (
        <div className="card-lux p-4">
          <div className="gold-bar absolute inset-x-0 top-0" />
          {!sent ? (
            <form onSubmit={submitSupport} className="space-y-2">
              <p className="text-sm text-gray-700 leading-relaxed">
                نعتذر منكم، سيتم إدراج مدينتكم أو مكانكم لاحقاً 🤍
                <br />
                <span className="text-xs text-gray-500">اكتب اسم مدينتك وسنضيفها في أقرب وقت.</span>
              </p>
              <input
                required
                placeholder="اسم المدينة"
                value={support.city}
                onChange={(e) => setSupport({ ...support, city: e.target.value })}
                className="w-full px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm"
              />
              <input
                placeholder="جوالك (اختياري)"
                value={support.phone}
                onChange={(e) => setSupport({ ...support, phone: e.target.value })}
                className="w-full px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm"
              />
              <div className="flex gap-2">
                <button type="submit" className="flex-1 bg-[#006C35] text-white py-2 rounded-lg text-sm font-bold">
                  أرسل للدعم
                </button>
                <button type="button" onClick={() => setShowSupport(false)} className="px-3 py-2 rounded-lg text-sm text-gray-500 border border-gray-200">
                  إغلاق
                </button>
              </div>
            </form>
          ) : (
            <div className="text-center py-2">
              <p className="text-sm text-[#006C35] font-bold">تم إرسال طلبك للدعم ✅</p>
              <p className="text-xs text-gray-500 mt-1">سنضيف مدينتك قريباً إن شاء الله.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
