import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useParentCategories as useCategories, catLabel } from '../hooks/useCategories.js'
import ExpertCard from '../components/ExpertCard.jsx'
import { useLang } from '../i18n/LanguageContext.jsx'

export default function Search() {
  const [params, setParams] = useSearchParams()
  const category = params.get('category') || ''
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('rating')
  const [onlyVerified, setOnlyVerified] = useState(false)
  const [onlyCompany, setOnlyCompany] = useState(false)
  const { t, lang } = useLang()
  const categories = useCategories()

  // البحث الحقيقي من السيرفر (فنيون مسجّلون فعلاً)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    const qs = new URLSearchParams()
    if (query.trim()) qs.set('q', query.trim())
    if (category) qs.set('category', category)
    fetch(`/api/experts?${qs.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !Array.isArray(d)) return
        setRows(
          d.map((r) => ({
            id: r.id,
            personName: r.name_ar || r.name,
            name: r.name_ar || r.name,
            name_ar: r.name_ar,
            jobName: r.job,
            job: r.job,
            location: r.city,
            city: r.city,
            hourlyRate: r.rate,
            rating: r.rating,
            reviews: r.reviews_count,
            image: r.image,
            hasCar: !!r.has_car,
            approved: (r.verify_status || 'approved') === 'approved',
            trades: r.trades || [],
            exp_years: r.exp_years ?? null,
            badge_color: r.badge_color || null,
            badge_label: r.badge_label || null,
            is_company: !!r.is_company,
          })),
        )
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [query, category])

  const results = useMemo(() => {
    let list = [...rows]
    if (onlyVerified) list = list.filter((e) => e.approved !== false)
    if (onlyCompany) list = list.filter((e) => e.is_company)
    return sort === 'rating'
      ? list.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0))
      : list.sort((a, b) => String(a.personName || '').localeCompare(String(b.personName || '')))
  }, [rows, sort, onlyVerified, onlyCompany])

  return (
    <div className="px-4 py-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">{t('search.title')}</h2>

      <input
        type="text"
        placeholder={t('search.placeholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-100 focus:bg-white focus:border-blue-400 outline-none mb-4"
      />

      <div className="flex gap-2 mb-3">
        <button onClick={() => setOnlyVerified((v) => !v)}
          className={`text-[11px] font-bold px-3 py-1.5 rounded-full border ${onlyVerified ? 'bg-[#006C35] text-white border-[#006C35]' : 'bg-white text-gray-600 border-[#E3D9BF]'}`}>
          ✅ موثّقون
        </button>
        <button onClick={() => setOnlyCompany((v) => !v)}
          className={`text-[11px] font-bold px-3 py-1.5 rounded-full border ${onlyCompany ? 'bg-[#006C35] text-white border-[#006C35]' : 'bg-white text-gray-600 border-[#E3D9BF]'}`}>
          🏢 شركات
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        <button
          onClick={() => setParams({})}
          className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${!category ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
        >
          {t('search.all')}
        </button>
        {categories.map((c) => (
          <button
            key={c.name}
            onClick={() => setParams({ category: c.name })}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${category === c.name ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
          >
            {c.icon} {catLabel(c, lang)}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-gray-500">
          {results.length} {t('search.results')}
        </span>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1 bg-white"
        >
          <option value="rating">{t('search.topRated')}</option>
          <option value="name">{t('search.byName')}</option>
        </select>
      </div>

      <div className="space-y-4">
        {results.map((e) => <ExpertCard key={e.id} expert={e} />)}
        {results.length === 0 && <p className="text-gray-500 text-sm">{t('search.none')}</p>}
      </div>
    </div>
  )
}
