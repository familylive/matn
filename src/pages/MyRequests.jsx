import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'

const statusAr = {
  open: 'مفتوح — يستقبل سوم',
  awaiting_payment: 'بانتظار الدفع',
  assigned: 'قيد التنفيذ',
  done: 'تحت الضمان',
  closed: 'مغلق',
  canceled: 'ملغي',
}

const badge = {
  open: 'bg-[#E9F5EE] text-[#006C35]',
  awaiting_payment: 'bg-orange-50 text-orange-600',
  assigned: 'bg-[#FBF5E3] text-[#8a6d13]',
  done: 'bg-blue-50 text-blue-600',
  closed: 'bg-gray-100 text-gray-500',
  canceled: 'bg-red-50 text-red-500',
}

export default function MyRequests() {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('active')
  const [data, setData] = useState({ active: [], archived: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }
    api.get('/api/my/requests')
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isAuthenticated, navigate])

  const rows = tab === 'active' ? data.active : data.archived

  return (
    <div className="px-4 py-5">
      <h2 className="text-xl font-extrabold text-[#11221A] mb-1">طلباتي</h2>
      <p className="text-gray-500 text-xs mb-4">تابع طلباتك الجارية، وارجع لأرشيف طلباتك المغلقة</p>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('active')}
          className={`flex-1 py-2 rounded-xl text-sm font-bold ${tab === 'active' ? 'bg-[#006C35] text-white' : 'bg-white border border-[#E3D9BF] text-gray-600'}`}
        >
          الجارية ({data.active.length})
        </button>
        <button
          onClick={() => setTab('archived')}
          className={`flex-1 py-2 rounded-xl text-sm font-bold ${tab === 'archived' ? 'bg-[#11221A] text-white' : 'bg-white border border-[#E3D9BF] text-gray-600'}`}
        >
          الأرشيف ({data.archived.length})
        </button>
      </div>

      {loading && <p className="text-sm text-gray-500">جارٍ التحميل…</p>}

      <div className="space-y-3">
        {rows.map((r) => (
          <Link key={r.id} to={`/requests/${r.id}`} className="block card-lux p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bold text-[#11221A]">
                <span className="text-[10px] text-gray-400 me-1">#{r.number}</span>
                {r.title}
              </h3>
              <span className={`text-[10px] px-2 py-1 rounded-full font-bold whitespace-nowrap ${badge[r.status] || 'bg-gray-100 text-gray-600'}`}>
                {statusAr[r.status] || r.status}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              {r.category}{r.city ? ` · ${r.city}` : ''} · {r.bids_count} سومة
              {r.lowest_bid ? ` · الأقل ${r.lowest_bid}` : ''}
            </p>
            <p className="text-[10px] text-gray-400 mt-1">{r.created_at?.slice(0, 16)}</p>
          </Link>
        ))}
        {!loading && rows.length === 0 && (
          <div className="text-center py-10">
            <p className="text-gray-500 text-sm">
              {tab === 'active' ? 'ما عندك طلبات جارية.' : 'أرشيفك فاضي.'}
            </p>
            {tab === 'active' && (
              <button onClick={() => navigate('/requests')} className="mt-3 text-[#006C35] font-bold text-sm">
                أنشئ طلب جديد ←
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
