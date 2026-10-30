import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

const TOKEN_KEY = 'adminToken'
const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const KIND_AR = { daily: 'تقرير يومي', weekly: 'تقرير أسبوعي', monthly: 'تقرير شهري', yearly: 'تقرير سنوي' }

export default function FinanceReport() {
  const [params] = useSearchParams()
  const type = params.get('type') || 'weekly'
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch(`/api/admin/finance/report?type=${type}`, { headers: { authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) || ''}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setD)
      .catch(() => setErr('تعذّر تحميل التقرير — سجّل دخول اللوحة أولاً'))
  }, [type])

  if (err) return <div className="p-8 text-center text-red-500">{err}</div>
  if (!d) return <div className="p-8 text-center text-gray-500">جارٍ التحميل…</div>

  const rows = d.rows.filter((r) => r.available > 0.009 || r.pending > 0.009 || r.week_earned > 0 || r.week_paid > 0 || r.paid_total > 0)

  return (
    <div className="bg-white min-h-screen">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>

      <div className="no-print fixed top-3 left-3 flex gap-2 z-50">
        <button onClick={() => window.print()} className="bg-[#006C35] text-white px-4 py-2 rounded-lg text-sm font-bold shadow">
          🖨️ طباعة / PDF
        </button>
        <button onClick={() => window.close()} className="bg-white border px-4 py-2 rounded-lg text-sm font-bold">إغلاق</button>
      </div>

      <div className="max-w-4xl mx-auto p-8">
        {/* الترويسة */}
        <div className="flex items-center justify-between border-b-2 border-[#C9A227] pb-3">
          <img src={d.site.logo} alt="" className="h-14 w-auto object-contain" />
          <div className="text-center flex-1">
            <p className="text-xl font-extrabold text-[#006C35]">منصة مهنتي</p>
            <p className="text-[11px] text-gray-500">Mihnati — سوق الخدمات الفنية</p>
          </div>
          <div className="text-end text-[11px] text-gray-600 leading-5">
            <p className="font-bold text-[#11221A]">{d.report_number}</p>
            <p>{KIND_AR[d.kind] || d.kind}</p>
            <p dir="ltr">{d.period.from} → {d.period.to}</p>
          </div>
        </div>

        {/* الملخص */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          {[
            ['مستحقات الفنيين في الفترة', d.summary.experts_paid],
            ['عمولة المنصة', d.summary.commission],
            ['إجمالي مدفوعات العملاء', d.summary.invoices_total],
            ['مستحق للتحويل الآن', d.summary.due_now],
            ['محجوز عند المنصة', d.summary.held_now],
            ['مكافآت الدعوات', d.summary.referral_bonus],
          ].map(([l, v]) => (
            <div key={l} className="border border-[#EADFC8] rounded-lg p-2 text-center">
              <p className="text-[10px] text-gray-500">{l}</p>
              <p className="font-extrabold text-[#11221A]">{money(v)} <span className="text-[10px] font-normal">ر.س</span></p>
            </div>
          ))}
        </div>

        {/* الجدول */}
        <table className="w-full mt-5 text-[11px] border-collapse">
          <thead>
            <tr className="bg-[#006C35] text-white">
              {['#', 'رقم الفني', 'الاسم', 'التخصص', 'المدينة', 'مستحق الفترة', 'محجوز', 'متاح للتحويل', 'مدفوع في الفترة', 'الإجمالي المدفوع'].map((h) => (
                <th key={h} className="border border-[#0a5a2c] px-1.5 py-1.5 text-start font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className={i % 2 ? 'bg-[#FBF9F2]' : ''}>
                <td className="border border-[#EADFC8] px-1.5 py-1">{i + 1}</td>
                <td className="border border-[#EADFC8] px-1.5 py-1 font-mono">{r.id}</td>
                <td className="border border-[#EADFC8] px-1.5 py-1">{r.name}</td>
                <td className="border border-[#EADFC8] px-1.5 py-1">{r.job}</td>
                <td className="border border-[#EADFC8] px-1.5 py-1">{r.city || '—'}</td>
                <td className="border border-[#EADFC8] px-1.5 py-1">{money(r.week_earned)}</td>
                <td className="border border-[#EADFC8] px-1.5 py-1">{money(r.pending)}</td>
                <td className="border border-[#EADFC8] px-1.5 py-1 font-bold">{money(r.available)}</td>
                <td className="border border-[#EADFC8] px-1.5 py-1">{money(r.week_paid)}</td>
                <td className="border border-[#EADFC8] px-1.5 py-1">{money(r.paid_total)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan="10" className="border border-[#EADFC8] px-2 py-4 text-center text-gray-500">لا توجد حركات في هذه الفترة</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="bg-[#FBF5E3] font-extrabold">
              <td colSpan="5" className="border border-[#EADFC8] px-2 py-1.5">الإجمالي ({rows.length} فني)</td>
              <td className="border border-[#EADFC8] px-1.5 py-1.5">{money(d.summary.experts_paid)}</td>
              <td className="border border-[#EADFC8] px-1.5 py-1.5">{money(d.summary.held_now)}</td>
              <td className="border border-[#EADFC8] px-1.5 py-1.5">{money(d.summary.due_now)}</td>
              <td className="border border-[#EADFC8] px-1.5 py-1.5">—</td>
              <td className="border border-[#EADFC8] px-1.5 py-1.5">—</td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-6 flex items-center justify-between text-[10px] text-gray-500 border-t pt-2">
          <span>صادر من منصة مهنتي — {d.site.url}</span>
          <span dir="ltr">صدر في: {new Date(d.generated_at).toLocaleString('en-GB', { timeZone: 'Asia/Riyadh' })}</span>
        </div>
      </div>
    </div>
  )
}
