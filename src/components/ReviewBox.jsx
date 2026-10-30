import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'

const EXPERT_TAGS = ['أنصح بالتعامل معه', 'سريع في عمله', 'منجز', 'محترف', 'أسعار مناسبة', 'نظيف في عمله']
const CUSTOMER_TAGS = ['حسن التعامل', 'طيب الأخلاق', 'محترم', 'صادق في تعاملاته', 'أنصح بالتعامل معه']

/**
 * صندوق تقييم: يظهر للعميل (يقيّم الفني) وللفني (يقيّم العميل) بعد طلب مدفوع ومكتمل.
 */
export default function ReviewBox({ requestId, isOwner, isExpert, paid, done }) {
  const [state, setState] = useState(null)
  const [stars, setStars] = useState(0)
  const [tags, setTags] = useState([])
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const target = isOwner ? 'expert' : isExpert ? 'customer' : null
  const list = target === 'expert' ? EXPERT_TAGS : CUSTOMER_TAGS

  useEffect(() => {
    if (!target || !done) return
    api.get(`/api/requests/${requestId}/review-status`).then(setState).catch(() => {})
  }, [requestId, target, done])

  if (!target || !done) return null

  if (!paid) {
    return (
      <div className="card-lux p-3 mt-3 text-[11px] text-gray-500">
        💬 التقييم يفتح بعد إتمام الدفع وتنفيذ الطلب.
      </div>
    )
  }

  if (state?.reviewed) {
    return (
      <div className="card-lux p-3 mt-3 text-center text-[12px] text-[#006C35] font-bold">
        ✅ شكراً — تم إرسال تقييمك
      </div>
    )
  }

  const submit = async () => {
    if (!stars) return setMsg('اختر عدد النجوم أولاً')
    setBusy(true); setMsg('')
    try {
      await api.post(`/api/requests/${requestId}/review`, { stars, tags, comment })
      setState({ reviewed: true })
    } catch (e) {
      setMsg(e.message === 'already_reviewed' ? 'سبق تقييمه' : 'تعذّر الإرسال')
    } finally { setBusy(false) }
  }

  return (
    <div className="card-lux p-4 mt-4">
      <div className="gold-bar absolute inset-x-0 top-0" />
      <div className="pt-1 space-y-3">
        <p className="font-extrabold text-sm text-[#11221A]">
          {target === 'expert' ? '⭐ قيّم الفني' : '⭐ قيّم العميل'}
        </p>

        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setStars(n)} className="text-3xl leading-none" aria-label={`${n} نجوم`}>
              <span className={n <= stars ? 'text-[#C9A227]' : 'text-gray-300'}>★</span>
            </button>
          ))}
          <span className="text-[11px] text-gray-500 ms-1">{stars ? `${stars} / 5` : 'اختر'}</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {list.map((t) => {
            const on = tags.includes(t)
            return (
              <button key={t} type="button" onClick={() => setTags(on ? tags.filter((x) => x !== t) : [...tags, t])}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${on ? 'bg-[#006C35] text-white border-[#006C35]' : 'bg-white text-gray-600 border-[#E3D9BF]'}`}>
                {on ? '✓ ' : ''}{t}
              </button>
            )
          })}
        </div>

        <textarea
          rows={2}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={target === 'customer' ? 'ملاحظاتك (تظهر للإدارة فقط)' : 'تعليقك (اختياري)'}
          className="w-full px-3 py-2 border border-[#E3D9BF] rounded-xl text-sm"
        />

        {msg && <p className="text-[11px] text-red-500 font-bold">{msg}</p>}
        <button onClick={submit} disabled={busy} className="btn-primary">
          {busy ? 'جارٍ الإرسال…' : 'إرسال التقييم'}
        </button>
        {target === 'customer' && (
          <p className="text-[10px] text-gray-500">تقييمك للعميل يظهر للإدارة فقط — العميل يشوف عدد النجوم فقط.</p>
        )}
      </div>
    </div>
  )
}
