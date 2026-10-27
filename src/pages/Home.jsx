import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import experts from '../data/experts.json'
import { categories } from '../data/categories.js'
import ExpertCard from '../components/ExpertCard.jsx'
import { useLang } from '../i18n/LanguageContext.jsx'

export default function Home() {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const { t } = useLang()

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

  const steps = ['1', '2', '3']

  return (
    <div className="px-4 py-6">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('home.title')}</h2>
        <p className="text-gray-600 mb-6">{t('home.subtitle')}</p>
        <div className="relative">
          <span className="absolute inset-y-0 start-0 ps-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          <input
            type="text"
            placeholder={t('home.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full ps-10 pe-4 py-3 border border-gray-200 rounded-xl bg-gray-100 focus:bg-white focus:border-blue-400 outline-none"
          />
        </div>
      </div>

      <div className="mb-8">
        <h3 className="text-xl font-bold text-gray-900 mb-4">{t('home.categories')}</h3>
        <div className="grid grid-cols-2 gap-4">
          {categories.map((c) => (
            <button
              key={c.name}
              onClick={() => navigate(`/search?category=${encodeURIComponent(c.name)}`)}
              className="bg-white rounded-xl py-5 shadow-sm border border-gray-100 flex flex-col items-center gap-2 hover:shadow-md transition-shadow"
            >
              <span className="text-2xl">{c.icon}</span>
              <span className="text-gray-700 font-medium">{t(`cat.${c.name}`, c.name)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-8">
        <h3 className="text-xl font-bold text-gray-900 mb-4">{t('home.featured')}</h3>
        <div className="space-y-4">
          {filtered.map((e) => <ExpertCard key={e.id} expert={e} />)}
          {filtered.length === 0 && <p className="text-gray-500 text-sm">{t('home.noResults')}</p>}
        </div>
      </div>

      <div className="mb-8">
        <h3 className="text-xl font-bold text-gray-900 mb-6">{t('home.how')}</h3>
        <div className="space-y-6">
          {steps.map((n) => (
            <div key={n} className="flex items-start gap-4">
              <div className="bg-blue-500 text-white rounded-full w-12 h-12 flex items-center justify-center text-lg font-bold flex-shrink-0">
                {n}
              </div>
              <div className="flex-1">
                <h4 className="text-lg font-bold text-gray-900 mb-2">{t(`home.step${n}.t`)}</h4>
                <p className="text-gray-600">{t(`home.step${n}.d`)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
