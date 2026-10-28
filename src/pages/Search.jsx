import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import experts from '../data/experts.json'
import { useCategories, catLabel } from '../hooks/useCategories.js'
import ExpertCard from '../components/ExpertCard.jsx'
import { useLang } from '../i18n/LanguageContext.jsx'

export default function Search() {
  const [params, setParams] = useSearchParams()
  const category = params.get('category') || ''
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('rating')
  const { t, lang } = useLang()
  const categories = useCategories()

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = experts.filter((e) => {
      const matchesQuery =
        !q ||
        e.personName.toLowerCase().includes(q) ||
        e.jobName.toLowerCase().includes(q) ||
        e.location.toLowerCase().includes(q) ||
        t(`cat.${e.jobName}`, e.jobName).includes(q)
      const matchesCategory = !category || e.jobName === category
      return matchesQuery && matchesCategory
    })
    list = [...list].sort((a, b) =>
      sort === 'rating' ? b.rating - a.rating : a.personName.localeCompare(b.personName),
    )
    return list
  }, [query, category, sort, t])

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
