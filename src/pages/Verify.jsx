import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'

export default function Verify() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState(null)
  const [form, setForm] = useState({ iqama_name: '', iqama_number: '', iqama_issue: '', iqama_expiry: '', nationality: '', profession: '' })
  const [image, setImage] = useState('')
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    api.get('/api/me/verify').then(setStatus).catch(() => {})
  }, [])

  const onFile = async (file) => {
    setErr('')
    setScanning(true)
    try {
      const fd = new FormData()
      fd.append('iqama', file)
      const res = await fetch('/api/me/iqama', {
        method: 'POST',
        headers: { authorization: `Bearer ${localStorage.getItem('authToken')}` },
        body: fd,
      })
      const data = await res.json()
      if (data.url) {
        setImage(data.url)
        const p = data.parsed || {}
        setForm((f) => ({
          ...f,
          iqama_name: p.name || f.iqama_name,
          iqama_number: p.iqama_number || f.iqama_number,
          iqama_issue: p.issue || f.iqama_issue,
          iqama_expiry: p.expiry || f.iqama_expiry,
          nationality: p.nationality || f.nationality,
          profession: p.profession || f.profession,
        }))
        if (p.error) setErr('ما قدرنا نقرأ الصورة تلقائياً — عبّي البيانات يدوياً.')
      }
    } catch {
      setErr('تعذّر رفع الصورة')
    } finally {
      setScanning(false)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    if (!image) return setErr('ارفع صورة الإقامة أولاً')
    setBusy(true)
    try {
      await api.post('/api/me/verify', { ...form, iqama_image: image })
      setStatus({ status: 'pending' })
    } catch (e2) {
      setErr(e2.message === 'invalid_iqama' ? 'رقم الإقامة لازم ١٠ أرقام' : 'تعذّر الإرسال')
    } finally {
      setBusy(false)
    }
  }

  if (status?.status === 'pending') {
    return (
      <div className="px-4 py-10 text-center">
        <div className="text-5xl">⏳</div>
        <h2 className="text-xl font-extrabold text-[#11221A] mt-3">توثيقك قيد المراجعة</h2>
        <p className="text-gray-500 text-sm mt-2">
          تم استلام بيانات إقامتك. تظهر للمهتمين بعد موافقة الإدارة — عادةً خلال ٢٤ ساعة.
        </p>
        <button onClick={() => navigate('/')} className="btn-ghost mt-6">رجوع للتطبيق</button>
      </div>
    )
  }

  if (status?.status === 'approved') {
    return (
      <div className="px-4 py-10 text-center">
        <div className="text-5xl">✅</div>
        <h2 className="text-xl font-extrabold text-[#11221A] mt-3">حسابك موثّق</h2>
        <button onClick={() => navigate('/')} className="btn-ghost mt-6">رجوع للتطبيق</button>
      </div>
    )
  }

  return (
    <div className="px-4 py-5">
      <h2 className="text-xl font-extrabold text-[#11221A] mb-1">توثيق الفني</h2>
      <p className="text-gray-500 text-sm mb-4">ارفع صورة إقامتك — نقرأ البيانات تلقائياً، والإدارة تراجعها ثم تفعّلك.</p>

      {status?.status === 'rejected' && (
        <div className="card-lux p-3 mb-3 border-red-200">
          <p className="text-sm text-red-500 font-bold">تم رفض توثيقك السابق</p>
          {status.note && <p className="text-xs text-gray-500 mt-1">{status.note}</p>}
        </div>
      )}

      <form onSubmit={submit} className="space-y-3">
        <div className="card-lux p-4">
          <div className="gold-bar absolute inset-x-0 top-0" />
          <p className="text-xs font-bold text-gray-600 mb-2 pt-1">صورة الإقامة</p>
          <input
            type="file" accept="image/*" capture="environment"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            className="w-full text-sm"
          />
          {scanning && <p className="text-xs text-[#006C35] mt-2">جارٍ قراءة البيانات من الصورة… قد يأخذ ١٠–٢٠ ثانية</p>}
          {image && <img src={image} alt="iqama" className="mt-2 w-full rounded-xl border border-[#E3D9BF]" />}
        </div>

        <div className="card-lux p-4 space-y-2">
          {[
            ['iqama_name', 'الاسم'],
            ['iqama_number', 'رقم الإقامة (١٠ أرقام)'],
            ['iqama_issue', 'تاريخ الإصدار'],
            ['iqama_expiry', 'تاريخ الانتهاء'],
            ['nationality', 'الجنسية'],
            ['profession', 'المهنة'],
          ].map(([k, label]) => (
            <div key={k}>
              <label className="text-[11px] font-bold text-gray-600">{label}</label>
              <input
                value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                inputMode={k === 'iqama_number' ? 'numeric' : 'text'}
                className="w-full mt-1 px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm"
              />
            </div>
          ))}
        </div>

        {err && <p className="text-sm text-red-500">{err}</p>}
        <button disabled={busy || scanning} className="btn-primary">
          {busy ? 'جارٍ الإرسال…' : 'إرسال للمراجعة'}
        </button>
      </form>
    </div>
  )
}
