import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../lib/api.js'

export default function Invoice() {
  const { id, type } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/api/requests/${id}/invoices`).then(setData).catch(() => setError('تعذّر تحميل الفاتورة'))
  }, [id])

  if (error) return <div className="p-6 text-center text-red-500">{error}</div>
  if (!data) return <div className="p-6 text-center text-gray-500">جارٍ التحميل…</div>

  const inv = type === 'expert' ? data.expert : data.customer

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <style>{`
        .stamp {
          transform: rotate(-6deg);
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1px;
          min-width: 216px;
          border: 2.5px solid #A8121B;
          border-radius: 10px;
          padding: 9px 18px 8px;
          color: #A8121B;
          position: relative;
          background: rgba(168,18,27,.035);
        }
        .stamp::after {
          content: ''; position: absolute; inset: 3px;
          border: 1px solid #A8121B; border-radius: 7px; opacity: .55; pointer-events: none;
        }
        .stamp-logo {
          width: 42px; height: 42px; object-fit: contain;
          filter: grayscale(1) sepia(1) hue-rotate(-28deg) saturate(7) brightness(.75);
          opacity: .92;
        }
        .stamp-brand { width: 94px; height: auto; display: block; margin-top: 1px; opacity: .95; }
        .stamp-approved {
          font-size: 10.5px; font-weight: 800; letter-spacing: 4px;
          text-align: center; line-height: 1; margin-top: 2px; opacity: 1;
        }
        .stamp-meta {
          margin-top: 6px; padding-top: 4px; border-top: 1px solid rgba(168,18,27,.55);
          width: 100%; font-size: 8.5px; color: #A8121B; text-align: center;
          font-family: ui-monospace, monospace; line-height: 1.4; letter-spacing: .2px;
        }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .sheet { box-shadow: none !important; margin: 0 !important; }
        }
      `}</style>

      <div className="max-w-xl mx-auto">
        <div className="no-print flex gap-2 mb-3">
          <button onClick={() => window.print()} className="flex-1 bg-[#006C35] text-white py-2.5 rounded-xl font-bold">
            🖨️ طباعة / حفظ PDF
          </button>
          <button onClick={() => window.close()} className="px-4 py-2.5 rounded-xl border border-gray-300 bg-white font-bold text-gray-600">
            إغلاق
          </button>
        </div>

        <div className="sheet bg-white rounded-2xl shadow p-6" style={{ direction: 'rtl' }}>
          <div className="flex items-start justify-between border-b border-gray-200 pb-4">
            <div className="flex items-center gap-2">
              <img src="/logo-mark.png" alt="مهنتي" className="w-9 h-9 object-contain" />
              <div>
                <p className="font-extrabold text-[#11221A]">{inv.seller_name || 'مهنتي'}</p>
                <p className="text-[10px] text-gray-500">{inv.through || 'منصة الخدمات والمزاد اللحظي'}</p>
                {inv.seller_vat && <p className="text-[9px] text-gray-400" dir="ltr">VAT: {inv.seller_vat}</p>}
              </div>
            </div>
            <div className="text-end">
              <p className="font-extrabold text-sm">{inv.title}</p>
              <p className="text-[11px] text-gray-500">{inv.number}</p>
              <p className="text-[10px] text-gray-400">{data.issued_at?.slice(0, 16)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 my-4 text-[11px]">
            <div>
              <p className="text-gray-400">إلى</p>
              <p className="font-bold">{inv.to}</p>
            </div>
            <div className="text-end">
              <p className="text-gray-400">الطلب</p>
              <p className="font-bold">#{data.request.number} — {data.request.title}</p>
              <p className="text-gray-500">{data.request.city || ''}</p>
            </div>
          </div>

          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-200">
                <th className="text-start py-2 font-bold">البند</th>
                <th className="text-end py-2 font-bold">المبلغ (ر.س)</th>
              </tr>
            </thead>
            <tbody>
              {inv.items.map((it, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-2 text-gray-700">{it.label}</td>
                  <td className={`py-2 text-end font-bold ${it.amount < 0 ? 'text-red-500' : 'text-gray-900'}`}>{it.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-between items-center mt-4 pt-3 border-t-2 border-[#006C35]">
            <p className="font-extrabold text-sm">الإجمالي</p>
            <p className="font-extrabold text-lg text-[#006C35]">{inv.total} ر.س</p>
          </div>

          {inv.due_to_platform > 0 && (
            <div className="mt-3 rounded-xl bg-[#FBF5E3] border border-[#EADFC8] p-3">
              <p className="text-xs font-extrabold text-[#8a6d13]">
                مبلغ يُحوّل للمنصة: {inv.due_to_platform} ر.س
              </p>
              <p className="text-[10px] text-gray-600 mt-1">{inv.note}</p>
            </div>
          )}

          <div className="mt-5 flex justify-center">
            <div>
              <div className="stamp">
                <img src="/logo-mark.png" alt="" className="stamp-logo" />
                <img src="/stamp-word.png" alt="مهنتي" className="stamp-brand" />
                <span className="stamp-approved">معتمد</span>
                <div className="stamp-meta">
                  {inv.number} · {String(data.issued_at || '').slice(0, 10)} · {String(data.issued_at || '').slice(11, 16)}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 text-[9px] text-gray-400 leading-5 text-center">
            {inv.vat_number && <p>الرقم الضريبي للمنصة: <span dir="ltr">{inv.vat_number}</span></p>}
            <p>هذه الفاتورة صادرة إلكترونياً عبر منصة مهنتي · <span dir="ltr">mihnati.onrender.com</span></p>
          </div>
        </div>
      </div>
    </div>
  )
}
