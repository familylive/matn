import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { io } from 'socket.io-client'
import { api } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useLang } from '../i18n/LanguageContext.jsx'

const socket = io({ autoConnect: false })

function ExtraPay({ requestId, extra, onPaid }) {
  const [open, setOpen] = useState(false)
  const [method, setMethod] = useState('cash')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const total = Math.round(extra.amount * 1.075 * 100) / 100

  const pay = async () => {
    setBusy(true)
    try {
      const r = await api.payExtra(requestId, extra.id, { method, phone })
      onPaid(r.request)
      setOpen(false)
    } catch {
      alert('تعذّر السداد')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[11px] bg-[#006C35] text-white px-2.5 py-1 rounded-lg font-bold">
        سدّد {total} ر.س
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40 grid place-items-center p-4" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-2xl p-4 w-full max-w-sm space-y-2" onClick={(e) => e.stopPropagation()}>
        <p className="font-extrabold text-sm text-[#11221A]">سداد العمل الإضافي</p>
        <p className="text-xs text-gray-500">{extra.title} — {extra.amount} + رسوم 7.5% = <b>{total} ر.س</b></p>
        <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm bg-white">
          <option value="cash">كاش</option>
          <option value="card">بطاقة</option>
          <option value="urpay">urpay</option>
          <option value="stcpay">STC Pay</option>
        </select>
        {['urpay', 'stcpay'].includes(method) && (
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="رقم الجوال"
            className="w-full px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm" />
        )}
        <button onClick={pay} disabled={busy} className="btn-primary">{busy ? 'جارٍ…' : 'تأكيد السداد'}</button>
      </div>
    </div>
  )
}

function FinishWork({ requestId, onDone }) {
  const [days, setDays] = useState(3)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const finish = async () => {
    setBusy(true)
    try {
      const updated = await api.complete(requestId, { warranty_days: days })
      onDone(updated)
      setDone(true)
    } catch {
      alert('تعذّر إنهاء العمل')
    } finally {
      setBusy(false)
    }
  }

  if (done) return <p className="mt-3 text-center text-sm font-bold text-[#006C35]">✅ تم إنهاء العمل وإصدار الفواتير</p>

  return (
    <div className="card-lux p-4 mt-3 space-y-2">
      <div className="gold-bar absolute inset-x-0 top-0" />
      <p className="font-extrabold text-sm text-[#11221A] pt-1">🛡️ إنهاء العمل + ضمان</p>
      <label className="text-[11px] text-gray-600">مدة ضمانك على العمل</label>
      <select value={days} onChange={(e) => setDays(Number(e.target.value))}
        className="w-full px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm bg-white">
        <option value={1}>يوم واحد</option>
        <option value={3}>٣ أيام</option>
        <option value={7}>أسبوع</option>
        <option value={30}>شهر</option>
      </select>
      <button onClick={finish} disabled={busy} className="btn-primary">
        {busy ? 'جارٍ…' : 'إنهاء العمل وإصدار الفاتورة'}
      </button>
    </div>
  )
}

function ExtraForm({ requestId, onAdded }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ title: '', amount: '' })
  const [err, setErr] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    try {
      const r = await api.addExtra(requestId, { title: form.title, amount: Number(form.amount) })
      onAdded(r.request)
      setForm({ title: '', amount: '' })
      setOpen(false)
    } catch {
      setErr('تعذّر إضافة العمل')
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full mt-3 border border-dashed border-[#C9A227] text-[#8a6d13] py-2.5 rounded-xl text-sm font-bold">
        ➕ إضافة عمل إضافي
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="card-lux p-4 mt-3 space-y-2">
      <p className="font-extrabold text-sm text-[#11221A]">عمل إضافي غير متفق عليه</p>
      <input required placeholder="اسم العمل (مثال: تغيير فلتر)" value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        className="w-full px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm" />
      <input required type="number" min="1" placeholder="السعر (ريال)" value={form.amount}
        onChange={(e) => setForm({ ...form, amount: e.target.value })}
        className="w-full px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm" />
      <p className="text-[10px] text-gray-500">تُحسب عمولة المنصة عليه وتُضاف لفاتورتك القادمة.</p>
      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex gap-2">
        <button className="flex-1 bg-[#006C35] text-white py-2 rounded-lg text-sm font-bold">إضافة</button>
        <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 rounded-lg text-sm border border-gray-200">إلغاء</button>
      </div>
    </form>
  )
}

export default function RequestDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()
  const { t, lang } = useLang()

  const [data, setData] = useState(null)
  const [experts, setExperts] = useState([])
  const [error, setError] = useState('')
  const [bid, setBid] = useState({ expertId: '', amount: '', note: '' })
  const [now, setNow] = useState(Date.now())
  const [pay, setPay] = useState({ method: 'cash', phone: '', busy: false, done: false })
  const [fees, setFees] = useState({ customer: 7.5, expert: 7.5 })
  const [myExpert, setMyExpert] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [invoices, setInvoices] = useState(null)

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => setFees({ customer: Number(d.commission_customer) || 0, expert: Number(d.commission_expert) || 0 }))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (isAuthenticated) api.get('/api/me/expert').then(setMyExpert).catch(() => {})
  }, [isAuthenticated])

  useEffect(() => {
    if (isAuthenticated && data?.accepted_bid_id) {
      api.get(`/api/requests/${id}/messages`).then(setMessages).catch(() => {})
    }
  }, [isAuthenticated, data?.accepted_bid_id, id])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const [live, setLive] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await api.request(id)
      setData(res)
    } catch (e) {
      setError(e.message)
    }
  }, [id])

  useEffect(() => {
    load()
    api.experts().then(setExperts).catch(() => {})
  }, [load])

  useEffect(() => {
    if (!socket.connected) socket.connect()
    socket.emit('join', id)
    const onBid = (b) => {
      setLive(true)
      setData((prev) => {
        if (!prev) return prev
        if (prev.bids.some((x) => x.id === b.id)) return prev
        const bids = [...prev.bids, b].sort((a, z) => a.amount - z.amount)
        return { ...prev, bids }
      })
    }
    const onAccepted = (updated) => setData(updated)
    const onMsg = (m) => setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
    socket.on('message:new', onMsg)
    socket.on('bid:new', onBid)
    socket.on('request:accepted', onAccepted)
    return () => {
      socket.emit('leave', id)
      socket.off('bid:new', onBid)
      socket.off('message:new', onMsg)
      socket.off('request:accepted', onAccepted)
    }
  }, [id])

  const isAssignedExpert = useMemo(() => {
    if (!data || !myExpert) return false
    const accepted = data.bids?.find((b) => b.id === data.accepted_bid_id)
    return !!accepted && Number(accepted.expert_id) === Number(myExpert.id)
  }, [data, myExpert])

  const isOwner = useMemo(
    () => !!data && !!user && Number(data.user_id) === Number(user.id),
    [data, user],
  )

  const placeBid = async (e) => {
    e.preventDefault()
    setError('')
    if (!isAuthenticated) return navigate('/login')
    try {
      await api.placeBid(id, { amount: Number(bid.amount), note: bid.note })
      setBid({ expertId: '', amount: '', note: '' })
    } catch (err) {
      setError(err.message)
    }
  }

  const accept = async (bidId) => {
    try {
      const updated = await api.acceptBid(id, bidId)
      setData(updated)
    } catch (err) {
      setError(err.message)
    }
  }

  const complete = async () => {
    try {
      setData(await api.complete(id))
    } catch (err) {
      setError(err.message)
    }
  }

  const submitPayment = async () => {
    setPay((p) => ({ ...p, busy: true }))
    try {
      const r = await api.payRequest(id, { method: pay.method, phone: pay.phone })
      setData(r.request)
      setPay((p) => ({ ...p, busy: false, done: true }))
    } catch (err) {
      setError(err.message === 'phone_required' ? 'أدخل رقم جوال urpay' : 'تعذّر إتمام الدفع')
      setPay((p) => ({ ...p, busy: false }))
    }
  }

  useEffect(() => {
    if (data?.status === 'done' && !invoices && isAuthenticated) {
      api.get(`/api/requests/${id}/invoices`).then(setInvoices).catch(() => {})
    }
  }, [data?.status])

  const closeRequest = async () => {
    try {
      const updated = await api.closeRequest(id)
      setData(updated)
    } catch (err) {
      setError(err.message === 'warranty_active' ? 'الضمان لسه ساري — ما يمكن إغلاق الطلب' : 'تعذّر الإغلاق')
    }
  }

  const review = async (rating) => {
    try {
      await api.review(id, { rating })
    } catch (err) {
      setError(err.message)
    }
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        {error || t('rd.loading')}
      </div>
    )
  }

  const lowest = data.bids[0]?.amount
  const base = lowest ?? 0
  const customerFee = Math.round(base * fees.customer) / 100
  const total = Math.round((base + customerFee) * 100) / 100
  const expertFee = Math.round(base * fees.expert) / 100
  const endMs = data.ends_at ? new Date(data.ends_at.replace(' ', 'T') + 'Z').getTime() : null
  const remaining = endMs ? endMs - now : null
  const ended = remaining !== null && remaining <= 0
  const mmss = remaining && remaining > 0
    ? `${String(Math.floor(remaining / 60000)).padStart(2, '0')}:${String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0')}`
    : null

  return (
    <div className="min-h-screen bg-gray-50 max-w-sm mx-auto">
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-gray-500" aria-label={t('expert.back')}>←</button>
        <h1 className="font-semibold text-gray-900 truncate">
          {data.number ? <span className="text-xs text-gray-400 me-1">#{data.number}</span> : null}
          {data.title}
        </h1>
        <span className={`ms-auto text-xs font-extrabold px-2 py-1 rounded-lg ${ended ? 'bg-red-100 text-red-600' : 'bg-red-50 text-red-600'}`}>
          {ended ? 'انتهى المزاد' : mmss ? `⏱ ${mmss}` : ''}
        </span>
        {live && <span className="text-xs text-green-600">●</span>}
      </div>

      <div className="px-4 py-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full">{t(`cat.${data.category}`, data.category)}</span>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{t(`req.status.${data.status}`, data.status)}</span>
          {data.city && <span className="text-sm text-gray-500">📍 {data.city}</span>}
          {data.lat && data.lng && (
            <a
              href={`https://maps.google.com/?q=${data.lat},${data.lng}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-[#006C35] font-bold underline"
            >
              عرض الموقع على الخريطة
            </a>
          )}
        </div>

        {data.description && <p className="text-gray-700 mb-3">{data.description}</p>}

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-white rounded-xl p-3 border border-gray-100">
            <p className="text-xs text-gray-500">{t('rd.budget')}</p>
            <p className="font-semibold text-gray-900">{data.budget ?? '—'} {t('common.tnd')}</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100">
            <p className="text-xs text-gray-500">{t('rd.lowest')}</p>
            <p className="font-semibold text-green-600">{lowest ?? '—'} {t('common.tnd')}</p>
          </div>
        </div>

        {isOwner && data.status === 'open' && data.bids.length > 0 && (
          <div className="card-lux p-4 mb-3">
            <div className="gold-bar absolute inset-x-0 top-0" />
            <p className="text-[11px] text-gray-500 pt-1">أرخص سومة الآن</p>
            <div className="flex items-center justify-between mt-1">
              <p className="text-2xl font-extrabold text-[#006C35]">{data.bids[0].amount} ر.س</p>
              <button
                onClick={() => accept(data.bids[0].id)}
                className="bg-[#006C35] text-white text-sm font-bold px-4 py-2 rounded-xl"
              >
                اقبل الأرخص
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">{data.bids[0].expert_name_ar || data.bids[0].expert_name}</p>
          </div>
        )}

        <h2 className="font-bold text-gray-900 mb-3">{t('rd.bids')} ({data.bids.length})</h2>
        <div className="space-y-3">
          {data.bids.map((b) => (
            <div key={b.id} className="bg-white rounded-xl p-3 border border-gray-100 flex items-center gap-3">
              <img src={b.expert_image} alt={b.expert_name} className="w-10 h-10 rounded-full object-cover" />
              <div className="flex-1">
                <p className="font-medium text-gray-900 text-sm">{(lang === 'ar' && b.expert_name_ar) || b.expert_name}</p>
                <p className="text-xs text-gray-500">
                  {t(`cat.${b.expert_job}`, b.expert_job)} · ★ {Number(b.expert_rating).toFixed(1)}
                  {b.distance_km != null ? ` · 📍 ${b.distance_km} كم` : ''}
                </p>
                {data.nearest_bid_id === b.id && (
                  <span className="inline-block mt-1 text-[10px] bg-[#E9F5EE] text-[#006C35] px-2 py-0.5 rounded-full font-bold">
                    الأقرب إليك
                  </span>
                )}
                {b.note && <p className="text-xs text-gray-500 mt-1">{b.note}</p>}
              </div>
              <div className="text-right">
                <p className="font-bold text-gray-900">{b.amount} {t('common.tnd')}</p>
                {isOwner && data.status === 'open' && (
                  <button onClick={() => accept(b.id)} className="text-xs text-blue-500 mt-1">{t('rd.accept')}</button>
                )}
                {data.accepted_bid_id === b.id && (
                  <span className="text-xs text-green-600">{t('rd.accepted')}</span>
                )}
              </div>
            </div>
          ))}
          {data.bids.length === 0 && <p className="text-sm text-gray-500">{t('rd.none')}</p>}
        </div>

        {data.status === 'open' && !ended && myExpert && (
          <form onSubmit={placeBid} className="bg-white rounded-xl p-4 border border-gray-100 mt-5 space-y-3">
            <h3 className="font-semibold text-gray-900 text-sm">قدّم سومتك</h3>
            <select
              required
              value={bid.expertId}
              onChange={(e) => setBid({ ...bid, expertId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm"
            >
              <option value="">{t('rd.chooseExpert')}</option>
              {experts.map((x) => (
                <option key={x.id} value={x.id}>{(lang === 'ar' && x.name_ar) || x.name} — {t(`cat.${x.job}`, x.job)}</option>
              ))}
            </select>
            <input
              required
              type="number"
              min="1"
              placeholder={t('rd.price')}
              value={bid.amount}
              onChange={(e) => setBid({ ...bid, amount: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <input
              placeholder={t('rd.note')}
              value={bid.note}
              onChange={(e) => setBid({ ...bid, note: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <button type="submit" className="w-full bg-blue-500 text-white py-2.5 rounded-xl text-sm font-medium">
              {t('rd.send')}
            </button>
          </form>
        )}

        {data.extras?.length > 0 && (
          <div className="card-lux p-4 mt-4">
            <p className="font-extrabold text-sm text-[#11221A]">➕ أعمال إضافية</p>
            {data.extras.map((e) => (
              <div key={e.id} className="py-1">
                <div className="flex justify-between text-xs text-gray-600">
                  <span>{e.title}</span>
                  <span className="font-bold">{e.amount} ر.س</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${e.status === 'paid' ? 'bg-[#E9F5EE] text-[#006C35]' : 'bg-orange-50 text-orange-600'}`}>
                    {e.status === 'paid' ? 'مدفوع' : 'بانتظار السداد'}
                  </span>
                  {isOwner && e.status !== 'paid' && (
                    <ExtraPay requestId={id} extra={e} onPaid={setData} />
                  )}
                </div>
              </div>
            ))}
            <div className="flex justify-between text-sm font-bold text-[#006C35] border-t border-dashed border-[#EADFC8] mt-2 pt-2">
              <span>الإجمالي</span><span>{data.extras_total} ر.س</span>
            </div>
          </div>
        )}

        {(isOwner || isAssignedExpert) && ['assigned', 'done'].includes(data.status) && (
          <ExtraForm requestId={id} onAdded={setData} />
        )}

        {isAssignedExpert && data.status === 'assigned' && <FinishWork requestId={id} onDone={setData} />}

        {isOwner && data.status === 'awaiting_payment' && (
          <div className="card-lux p-4 mt-4 space-y-3">
            <div className="gold-bar absolute inset-x-0 top-0" />
            <p className="font-extrabold text-[#11221A] pt-1">💳 إتمام الدفع</p>
            <div className="rounded-lg bg-white border border-[#EADFC8] p-3 text-xs space-y-1 text-gray-600">
              <div className="flex justify-between"><span>قيمة السومة</span><span>{base} ر.س</span></div>
              <div className="flex justify-between"><span>رسوم خدمة ({fees.customer}%)</span><span>{customerFee} ر.س</span></div>
              <div className="flex justify-between font-extrabold text-[#006C35] pt-1 border-t border-dashed">
                <span>الإجمالي المطلوب</span><span>{total} ر.س</span>
              </div>
            </div>
            <div className="space-y-2">
              {[
                { k: 'cash', label: '💵 كاش عند الاستلام', desc: 'تدفع للمعلم بعد تنفيذ العمل' },
                { k: 'card', label: '💳 بطاقة (مدى/فيزا)', desc: 'دفع إلكتروني آمن' },
                { k: 'urpay', label: '📱 urpay برقم الجوال', desc: 'حوّل عبر محفظة urpay' },
                { k: 'stcpay', label: '📲 STC Pay', desc: 'حوّل من محفظة STC Pay على رقم جوالك' },
              ].map((m) => (
                <button
                  key={m.k}
                  onClick={() => setPay({ ...pay, method: m.k })}
                  className={`w-full text-start p-3 rounded-xl border ${pay.method === m.k ? 'border-[#006C35] bg-[#E9F5EE]' : 'border-[#E3D9BF] bg-white'}`}
                >
                  <span className="font-bold text-sm text-[#11221A]">{m.label}</span>
                  <span className="block text-[11px] text-gray-500">{m.desc}</span>
                </button>
              ))}
            </div>

            {['urpay', 'stcpay'].includes(pay.method) && (
              <input
                value={pay.phone}
                onChange={(e) => setPay({ ...pay, phone: e.target.value })}
                placeholder={pay.method === 'stcpay' ? 'رقم جوال STC Pay' : 'رقم جوال urpay (05xxxxxxxx)'}
                className="w-full px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm"
              />
            )}

            <button onClick={submitPayment} disabled={pay.busy} className="btn-primary">
              {pay.busy ? 'جارٍ التنفيذ…' : pay.method === 'cash' ? 'تأكيد الطلب (كاش)' : `ادفع ${lowest ?? 0} ريال`}
            </button>
            <div className="rounded-lg bg-[#FBF9F2] border border-[#EADFC8] p-2 text-[11px] text-[#8a6d13] leading-relaxed">
              للفني: {base} − عمولة {fees.expert}% ({expertFee}) = <b>{Math.round((base - expertFee) * 100) / 100} ر.س</b>
              {pay.method === 'cash' && <><br />الفني يستلم {total} كاش ويحوّل للمنصة {Math.round((customerFee + expertFee) * 100) / 100} ر.س.</>}
            </div>
            <p className="text-[10px] text-gray-400 text-center">
              الدفع الإلكتروني تجريبي — نربط بوابة (Moyasar) عند الحاجة.
            </p>
          </div>
        )}

        {pay.done && (
          <div className="card-lux p-3 mt-3 text-center">
            <p className="text-[#006C35] font-bold text-sm">✅ تم الدفع — جارٍ التنفيذ</p>
          </div>
        )}

        {data.status === 'closed' && (
          <div className="card-lux p-3 mt-3 text-center">
            <p className="text-gray-600 font-bold text-sm">✅ الطلب مغلق</p>
            {data.closed_by === 'admin' && data.close_reason && (
              <p className="text-[11px] text-gray-500 mt-1">أُغلق بواسطة الإدارة — {data.close_reason}</p>
            )}
          </div>
        )}

        {isOwner && data.status === 'assigned' && (
          <button onClick={complete} className="w-full mt-4 bg-green-500 text-white py-2.5 rounded-xl font-medium">
            {t('rd.complete')}
          </button>
        )}

        {invoices && (
          <div className="mt-4 space-y-3">
            {['customer', 'expert'].map((k) => {
              const inv = invoices[k]
              return (
                <div key={k} className="card-lux p-4">
                  <div className="gold-bar absolute inset-x-0 top-0" />
                  <div className="flex items-center justify-between pt-1">
                    <p className="font-extrabold text-sm text-[#11221A]">{inv.title}</p>
                    <span className="text-[10px] text-gray-400">{inv.number}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mb-2">{inv.to} · {invoices.issued_at?.slice(0, 10)}</p>
                  {inv.items.map((it) => (
                    <div key={it.label} className="flex justify-between text-xs py-0.5">
                      <span className="text-gray-600">{it.label}</span>
                      <span className={it.amount < 0 ? 'text-red-500' : 'text-gray-800'}>{it.amount} ر.س</span>
                    </div>
                  ))}
                  <div className="flex justify-between mt-2 pt-2 border-t border-dashed border-[#EADFC8] font-extrabold text-[#006C35]">
                    <span>{k === 'customer' ? 'الإجمالي المدفوع' : 'صافي المستحق'}</span>
                    <span>{inv.total} ر.س</span>
                  </div>
                  <a
                    href={`/invoice/${id}/${k}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block mt-3 text-center text-xs font-bold text-[#006C35] bg-[#E9F5EE] border border-[#CDE9D8] py-2 rounded-lg"
                  >
                    📄 تحميل الفاتورة PDF
                  </a>
                </div>
              )
            })}
          </div>
        )}

        {(isOwner || isAssignedExpert) && data.accepted_bid_id && (
          <div className="card-lux p-4 mt-4">
            <p className="font-extrabold text-sm text-[#11221A] mb-2">💬 المحادثة</p>
            <div className="max-h-56 overflow-y-auto space-y-2 mb-2">
              {messages.map((m) => {
                const mine = Number(m.sender_id) === Number(user?.id)
                return (
                  <div key={m.id} className={`text-xs p-2 rounded-xl max-w-[85%] ${mine ? 'bg-[#E9F5EE] ms-auto' : 'bg-gray-100'}`}>
                    <p className="text-[10px] text-gray-500">{m.sender_name}</p>
                    <p className="text-gray-800">{m.body}</p>
                  </div>
                )
              })}
              {messages.length === 0 && <p className="text-[11px] text-gray-400">ابدأ المحادثة مع الطرف الآخر</p>}
            </div>
            <div className="flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="اكتب رسالة…"
                className="flex-1 px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm"
                onKeyDown={(e) => { if (e.key === 'Enter') document.getElementById('send-msg')?.click() }}
              />
              <button
                id="send-msg"
                onClick={async () => {
                  if (!text.trim()) return
                  try {
                    await api.post(`/api/requests/${id}/messages`, { body: text })
                    setText('')
                  } catch {}
                }}
                className="bg-[#006C35] text-white text-sm font-bold px-4 rounded-lg"
              >
                إرسال
              </button>
            </div>
          </div>
        )}

        {data.status === 'done' && data.warranty_until && (
          <div className="card-lux p-4 mt-4">
            <p className="font-extrabold text-sm text-[#11221A]">🛡️ ضمان الإصلاح</p>
            <p className="text-[11px] text-gray-500 mt-1">
              المدة: {data.warranty_days} يوم · ينتهي {data.warranty_until?.slice(0, 10)}
            </p>
            <p className="text-[11px] text-gray-500">
              {(() => {
                const until = new Date(data.warranty_until.replace(' ', 'T') + 'Z')
                const diff = Math.ceil((until - Date.now()) / 86400000)
                return diff > 0 ? `متبقي ${diff} يوم — الطلب يبقى مفتوح تحت الضمان` : 'انتهى الضمان — يمكنك إغلاق الطلب'
              })()}
            </p>
            {isOwner && (
              <button
                onClick={closeRequest}
                disabled={new Date(data.warranty_until.replace(' ', 'T') + 'Z') > new Date()}
                className="mt-3 w-full bg-[#11221A] text-white py-2.5 rounded-xl text-sm font-bold disabled:opacity-40"
              >
                إغلاق الطلب نهائياً
              </button>
            )}
          </div>
        )}

        {isOwner && ['done', 'closed'].includes(data.status) && (
          <div className="bg-white rounded-xl p-4 border border-gray-100 mt-4">
            <p className="text-sm text-gray-700 mb-2">{t('rd.rate')}</p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => review(n)} className="text-2xl text-yellow-400">★</button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
      </div>
    </div>
  )
}
