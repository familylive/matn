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
              <img src="/logo.png" alt="مهنتي" className="w-10 h-10 object-contain" />
              <div>
                <p className="font-extrabold text-[#11221A]">مهنتي</p>
                <p className="text-[10px] text-gray-500">منصة الخدمات والمزاد اللحظي</p>
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

          {inv.vat_number && (
            <p className="text-[10px] text-gray-500 mt-3 text-center">
              الرقم الضريبي: <span dir="ltr">{inv.vat_number}</span>
            </p>
          )}
          <p className="text-[10px] text-gray-400 mt-2 text-center">
            هذه الفاتورة صادرة إلكترونياً من منصة مهنتي · mihnati.dellini.net
          </p>
        </div>
      </div>
    </div>
  )
}
