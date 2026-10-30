import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'

const money = (n) => Number(n || 0).toFixed(2)

export default function LoyaltyCard() {
  const [d, setD] = useState(null)
  const [copied, setCopied] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { api.get('/api/me/loyalty').then(setD).catch(() => {}) }, [])
  if (!d) return null

  const pct = Math.min(100, Math.round(((d.qualified || 0) / (d.target || 30)) * 100))

  const copy = async () => {
    try { await navigator.clipboard.writeText(d.code); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch {}
  }
  const share = async () => {
    const url = `${location.origin}/register?ref=${encodeURIComponent(d.code)}`
    const text = `انضم لنادي الولاء في «مهنتي» بكودي ${d.code}\n${url}`
    if (navigator.share) { try { await navigator.share({ title: 'نادي الولاء — مهنتي', text, url }) } catch {} }
    else { try { await navigator.clipboard.writeText(text); setMsg('تم نسخ نص الدعوة ✅'); setTimeout(() => setMsg(''), 2500) } catch {} }
  }

  const nextExpiry = (d.credits || []).find((c) => c.remaining > 0)

  return (
    <div className="card-lux p-4 mt-4">
      <div className="gold-bar absolute inset-x-0 top-0" />
      <div className="pt-1">
        <div className="flex items-center justify-between">
          <p className="font-extrabold text-sm text-[#11221A]">👑 نادي الولاء</p>
          <span className="text-[10px] text-gray-500">صلاحية الرصيد {d.valid_days} يوم</span>
        </div>

        <div
          className="mt-3 rounded-2xl p-4 border-2 border-[#C9A227]/40 flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg,#4A0A1E 0%,#7A1230 55%,#3A0817 100%)' }}
        >
          <div>
            <p className="text-[11px] text-white/80 font-bold">رصيدك في نادي الولاء</p>
            <p className="text-3xl font-extrabold text-white leading-tight">{money(d.balance)}</p>
            <p className="text-[10px] text-white/80 font-bold">نقطة</p>
          </div>
          <div className="text-[11px] text-white font-bold text-end leading-6 border-s border-white/25 ps-3">
            <p>1 نقطة = 1 ريال</p>
            <p>لطلبات الفنيين فقط</p>
          </div>
        </div>
        {d.expiring_soon?.length > 0 && (
          <div className="mt-2 rounded-xl border border-[#E9D9A6] bg-[#FBF5E3] px-3 py-2">
            <p className="text-[11px] font-extrabold text-[#8a6d13]">⏳ رصيدك قرب ينتهي</p>
            {d.expiring_soon.map((c) => (
              <p key={c.id} className="text-[10px] text-[#8a6d13]/90">
                {Number(c.remaining).toFixed(2)} ر.س تنتهي في {String(c.expires_at).slice(0, 10)} — استخدمها في طلب فني قبل تفوتك.
              </p>
            ))}
          </div>
        )}

        {nextExpiry && (
          <p className="text-[10px] text-gray-500 mt-1">
            ⏳ أقرب رصيد ينتهي: {String(nextExpiry.expires_at).slice(0, 10)} — المنتهي يُصفّر تلقائياً (الأقدم أولاً).
          </p>
        )}

        <div className="mt-3 pt-3 border-t border-[#F0E9D8]">
          <div className="rounded-xl p-3" style={{ background: 'linear-gradient(135deg,#4A0A1E 0%,#7A1230 60%,#3A0817 100%)' }}>
            <p className="text-white font-bold text-[12px] leading-6 border-b border-white/20 pb-1">
              • كل {d.target} عضو يطلب طلب حقيقي = {d.bonus} نقطة
            </p>
            <p className="text-white font-bold text-[12px] leading-6 border-b border-white/20 py-1">
              • كل نقطة = 1 ريال في طلبات الفنيين
            </p>
            <p className="text-white font-bold text-[12px] leading-6 pt-1">
              • صلاحية النقاط {d.valid_days} يوم — الأقدم ينتهي أولاً
            </p>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 bg-[#11221A] text-white rounded-xl px-3 py-2.5 text-center font-extrabold tracking-widest text-sm" dir="ltr">
              {d.code}
            </div>
            <button onClick={copy} className="px-3 py-2.5 rounded-xl bg-[#EAF4EE] text-[#006C35] text-xs font-bold border border-[#CFE6D8]">
              {copied ? '✓ نُسخ' : 'نسخ'}
            </button>
            <button onClick={share} className="px-3 py-2.5 rounded-xl bg-[#006C35] text-white text-xs font-bold">مشاركة</button>
          </div>
          {msg && <p className="text-[10px] text-[#006C35] font-bold mt-1">{msg}</p>}

          <div className="mt-3">
            <div className="flex items-center justify-between text-[10px] text-gray-500">
              <span>أعضاء مؤهلون: {d.qualified} / {d.target}</span>
              <span>{d.bonus_paid ? '✅ استلمت المكافأة' : `المكافأة ${d.bonus} ر.س`}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 mt-1 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#006C35] to-[#C9A227]" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {d.invited?.length > 0 && (
            <ul className="mt-2 space-y-1 max-h-48 overflow-auto">
              {d.invited.slice(0, 8).map((x, i) => (
                <li key={i} className="flex items-center justify-between text-[11px] bg-white border border-[#F0E9D8] rounded-lg px-2 py-1.5">
                  <span className="truncate">{x.name || 'عضو'}</span>
                  <span className={x.qualified ? 'text-[#006C35] font-bold' : 'text-gray-400'}>
                    {x.qualified ? '✓ مؤهل' : '⏳ بعد أول طلب حقيقي'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
