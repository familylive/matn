import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import experts from '../data/experts.json'
import { useCategories, catLabel } from '../hooks/useCategories.js'
import ExpertCard from '../components/ExpertCard.jsx'
import AdsCarousel from '../components/AdsCarousel.jsx'
import { useLang } from '../i18n/LanguageContext.jsx'

export default function Home() {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const { t, lang } = useLang()
  const categories = useCategories()
  const [counts, setCounts] = useState({ byCategory: {} })

  useEffect(() => {
    let alive = true
    const load = () =>
      fetch('/api/requests/counts')
        .then((r) => r.json())
        .then((d) => { if (alive) setCounts(d) })
        .catch(() => {})
    load()
    const id = setInterval(load, 30000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return experts
    return experts.filter(
      (e) =>
        e.personName.toLowerCase().includes(q) ||
        e.jobName.toLowerCase().includes(q) ||
        e.location.toLowerCase().includes(q) ||
        t(`cat.${e.jobName}`, e.jobName).includes(q) ||
        t(`city.${e.location}`, e.location).includes(q),
    )
  }, [query, t])

  return (
    <div className="pb-8">
      <div className="relative px-4 pt-5 pb-6 bg-gradient-to-b from-[#006C35] to-[#004d26] text-white overflow-hidden">
        <div className="absolute -top-10 -end-10 w-40 h-40 rounded-full bg-white/5" />
        <div className="absolute -bottom-14 -start-8 w-36 h-36 rounded-full bg-[#C9A227]/20" />
        <h2 className="text-2xl font-extrabold leading-snug">{t('home.title')}</h2>
        <p className="text-white/80 text-sm mt-1">{t('home.subtitle')}</p>
        <div className="relative mt-4">
          <span className="absolute inset-y-0 start-0 ps-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-[#006C35]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          <input
            type="text"
            placeholder={t('home.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full ps-10 pe-4 py-3 rounded-xl bg-white text-gray-800 placeholder:text-gray-400 outline-none ring-1 ring-[#C9A227]/40 focus:ring-2 focus:ring-[#C9A227]"
          />
        </div>
      </div>

      <AdsCarousel />

      <div className="px-4 mt-6">
        <h3 className="section-title mb-3">{t('home.categories')}</h3>
        <div className="grid grid-cols-2 gap-3">
          {categories.filter((c) => !c.parent_id).map((c) => { const kids = categories.filter((k) => k.parent_id === c.id); return (
            <button
              key={c.name}
              onClick={() => navigate(`/search?category=${encodeURIComponent(c.name)}`)}
              className="card-lux active:scale-[.98] transition p-4 flex flex-col items-center gap-2"
            >
              {c.image ? (
                <img src={c.image} alt={c.ar} className="w-14 h-14 rounded-full object-cover border border-[#EADFC8]" />
              ) : (
                <span className="w-12 h-12 rounded-full bg-[#FBF5E3] border border-[#EADFC8] grid place-items-center text-2xl">
                  {c.icon}
                </span>
              )}
              <span className="text-[#11221A] font-bold">{catLabel(c, lang)}</span>
              {counts.byCategory?.[c.name] ? (
                <span className="absolute top-2 end-2 min-w-6 h-6 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold grid place-items-center shadow">
                  {counts.byCategory[c.name]}
                </span>
              ) : null}
              {kids.length > 0 && (
                <span className="flex flex-wrap justify-center gap-1 mt-1">
                  {kids.map((k) => (
                    <span
                      key={k.id}
                      onClick={(ev) => { ev.stopPropagation(); navigate(`/search?category=${encodeURIComponent(k.name)}`) }}
                      className="text-[10px] bg-[#FBF5E3] text-[#8a6d13] border border-[#EADFC8] px-2 py-0.5 rounded-full"
                    >
                      {catLabel(k, lang)}
                    </span>
                  ))}
                </span>
              )}
              <span className="text-[10px] text-[#8a6d13]">اطلب الآن ←</span>
            </button>
          )})}
        </div>
      </div>

      <div className="px-4 mt-7">
        <h3 className="section-title mb-3">{t('home.featured')}</h3>
        <div className="space-y-3">
          {filtered.map((e) => <ExpertCard key={e.id} expert={e} />)}
          {filtered.length === 0 && <p className="text-gray-500 text-sm">{t('home.noResults')}</p>}
        </div>
      </div>

      <div className="px-4 mt-8">
        <h3 className="section-title mb-4">{t('home.how')}</h3>
        <div className="space-y-4">
          {['1', '2', '3'].map((n) => (
            <div key={n} className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[#006C35] text-white grid place-items-center font-extrabold flex-shrink-0 ring-4 ring-[#FBF5E3]">
                {n}
              </div>
              <div>
                <h4 className="font-bold text-[#11221A]">{t(`home.step${n}.t`)}</h4>
                <p className="text-gray-600 text-sm">{t(`home.step${n}.d`)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
