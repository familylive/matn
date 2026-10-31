import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'

const money = (n) => Number(n || 0).toFixed(2)
const KIND = { earning: 'مستحق خدمة', referral: 'مكافأة دعوة', adjust: 'تسوية' }
const STATUS = { hold: 'محجوز (تحت الحفظ)', available: 'متاح للسحب' }

export default function WalletCard() {
  const [w, setW] = useState(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ amount: '', iban: '', account_name: '' })
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = () => api.get('/api/me/wallet').then(setW).catch(() => {})
  useEffect(() => { load() }, [])

  if (!w) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(w.invite_code)
      setCopied(true); setTimeout(() => setCopied(false), 1800)
    } catch {}
  }

  const share = async () => {
    const url = `${location.origin}/register?ref=${encodeURIComponent(w.invite_code)}`
    const text = `سجّل في «مهنتي» كفني عبر كودي ${w.invite_code}\n${url}`
    if (navigator.share) {
      try { await navigator.share({ title: 'مهنتي', text, url }) } catch {}
    } else {
      try { await navigator.clipboard.writeText(text); setMsg('تم نسخ نص الدعوة ✅'); setTimeout(() => setMsg(''), 2500) } catch {}
    }
  }

  const submitWithdraw = async (e) => {
    e.preventDefault()
    setBusy(true); setMsg('')
    try {
      const r = await api.post('/api/me/wallet/withdraw', {
        amount: Number(form.amount),
        iban: form.iban,
        account_name: form.account_name,
      })
      setW((x) => ({ ...x, ...r.wallet }))
      setForm({ amount: '', iban: form.iban, account_name: form.account_name })
      setOpen(false)
      setMsg('✅ تم إرسال طلب السحب — ينفذ خلال أسبوع العمل')
      load()
    } catch (err) {
      setMsg(
        err.message === 'insufficient' ? 'المبلغ أكبر من رصيدك المتاح'
        : err.message === 'invalid_iban' ? 'رقم الآيبان غير صحيح (SA + 22 رقم)'
        : 'تعذّر إرسال الطلب',
      )
    } finally {
      setBusy(false)
    }
  }

  const r = w.referrals || {}
  const pct = Math.min(100, Math.round(((r.qualified || 0) / (r.target || 10)) * 100))

  return (
    <div className="card-lux p-4 mt-4">
      <div className="gold-bar absolute inset-x-0 top-0" />
      <div className="pt-1">
        <div className="flex items-center justify-between">
          <p className="font-extrabold text-sm text-[#11221A]">💰 محفظتي</p>
          <span className="text-[10px] text-gray-500">مدة الحفظ {w.hold_days} أيام</span>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="rounded-xl bg-[#006C35] text-white p-2.5 text-center">
            <p className="text-[10px] opacity-80">متاح للسحب</p>
            <p className="text-lg font-extrabold">{money(w.available)}</p>
          </div>
          <div className="rounded-xl bg-[#FBF5E3] border border-[#EADFC8] p-2.5 text-center">
            <p className="text-[10px] text-[#8a6d13]">محجوز</p>
            <p className="text-lg font-extrabold text-[#8a6d13]">{money(w.pending)}</p>
          </div>
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-2.5 text-center">
            <p className="text-[10px] text-gray-500">تم تحويله</p>
            <p className="text-lg font-extrabold text-gray-700">{money(w.paid)}</p>
          </div>
        </div>

        {Number(w.due_platform) > 0 && (
          <div className="mt-2 rounded-xl bg-[#FDF2F2] border border-[#F3C6C6] px-3 py-2">
            <p className="text-[11px] font-extrabold text-red-600">
              💳 عمولة المنصة عليك: {money(w.due_platform)} ر.س
            </p>
            <p className="text-[10px] text-red-500/80">محصّلة مع مبلغ العميل — تُخصم من رصيدك المتاح وتُسدد للمنصة.</p>
          </div>
        )}

        <p className="text-[10px] text-gray-500 mt-2 leading-4">
          مستحقاتك تبقى في حساب الموقع {w.hold_days} أيام بعد إكمال الطلب (للفصل في أي نزاع) ثم تصبح قابلة للسحب.
        </p>

        <button
          onClick={() => setOpen((v) => !v)}
          disabled={w.available < 1}
          className={`w-full mt-3 py-2.5 rounded-xl text-sm font-bold ${w.available >= 1 ? 'bg-[#11221A] text-white' : 'bg-gray-100 text-gray-400'}`}
        >
          {w.available >= 1 ? '🏦 طلب سحب المستحقات' : 'ما فيه مبلغ متاح للسحب حالياً'}
        </button>

        {open && (
          <form onSubmit={submitWithdraw} className="mt-2 space-y-2 bg-[#FBF9F2] border border-[#EADFC8] rounded-xl p-3">
            <input
              required type="number" min="1" step="0.01" placeholder={`المبلغ (متاح ${money(w.available)})`}
              value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="w-full px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm bg-white"
            />
            <input
              required placeholder="رقم الآيبان SA0000000000000000000000"
              value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value.toUpperCase() })}
              className="w-full px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm bg-white ltr:text-left"
              dir="ltr"
            />
            <input
              required placeholder="اسم صاحب الحساب"
              value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })}
              className="w-full px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm bg-white"
            />
            <button disabled={busy} className="btn-primary">{busy ? 'جارٍ الإرسال…' : 'إرسال الطلب'}</button>
          </form>
        )}

        {msg && <p className="text-[11px] font-bold text-[#006C35] mt-2">{msg}</p>}

        {/* الدعوات */}
        <div className="mt-4 pt-3 border-t border-[#F0E9D8]">
          <p className="font-extrabold text-sm text-[#11221A]">🎁 كود الدعوة</p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            كل ما سجّل فني بكودك وله سومة أو طلب حقيقي، ووصل العدد إلى {r.target || 20} → {r.bonus || 50} ر.س في محفظتك.
          </p>

          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 bg-[#11221A] text-white rounded-xl px-3 py-2.5 text-center font-extrabold tracking-widest text-sm" dir="ltr">
              {w.invite_code}
            </div>
            <button onClick={copy} className="px-3 py-2.5 rounded-xl bg-[#EAF4EE] text-[#006C35] text-xs font-bold border border-[#CFE6D8]">
              {copied ? '✓ نُسخ' : 'نسخ'}
            </button>
            <button onClick={share} className="px-3 py-2.5 rounded-xl bg-[#006C35] text-white text-xs font-bold">مشاركة</button>
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between text-[10px] text-gray-500">
              <span>فنيون مؤهلون: {r.qualified || 0} / {r.target || 10}</span>
              <span>{r.bonus_paid ? '✅ استلمت المكافأة' : `مكافأة ${r.bonus || 50} ر.س`}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 mt-1 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#006C35] to-[#C9A227]" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {!!(r.list && r.list.length) && (
            <ul className="mt-2 space-y-1">
              {r.list.slice(0, 6).map((x, i) => (
                <li key={i} className="flex items-center justify-between text-[11px] bg-white border border-[#F0E9D8] rounded-lg px-2 py-1.5">
                  <span className="truncate">{x.name || 'فني'}</span>
                  <span className={x.qualified ? 'text-[#006C35] font-bold' : 'text-gray-400'}>
                    {x.qualified ? '✓ مؤهل' : '⏳ بانتظار سومة/طلب حقيقي'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* الحركات */}
        {w.transactions?.length > 0 && (
          <div className="mt-4 pt-3 border-t border-[#F0E9D8]">
            <p className="font-extrabold text-sm text-[#11221A] mb-2">📊 حركات المحفظة</p>
            <ul className="space-y-1.5">
              {w.transactions.slice(0, 10).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 text-[11px] bg-white border border-[#F0E9D8] rounded-lg px-2.5 py-2">
                  <div className="min-w-0">
                    <p className="font-bold text-[#11221A] truncate">{KIND[t.kind] || t.kind} {t.note ? `— ${t.note}` : ''}</p>
                    <p className="text-[10px] text-gray-400">
                      {String(t.created_at).slice(0, 16)} · {STATUS[t.status] || t.status}
                      {t.status === 'hold' && t.available_at ? ` — يتحرر ${String(t.available_at).slice(0, 10)}` : ''}
                    </p>
                  </div>
                  <span className={`font-extrabold ${t.status === 'hold' ? 'text-[#8a6d13]' : 'text-[#006C35]'}`}>+{money(t.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {w.withdrawals?.length > 0 && (
          <p className="text-[10px] text-gray-500 mt-2">
            طلبات السحب: {w.withdrawals.slice(0, 3).map((x) => `${money(x.amount)} (${x.status === 'paid' ? 'تم التحويل' : x.status === 'rejected' ? 'مرفوض' : 'قيد التنفيذ'})`).join(' · ')}
          </p>
        )}
      </div>
    </div>
  )
}
