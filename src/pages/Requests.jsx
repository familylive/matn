import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useLang } from '../i18n/LanguageContext.jsx'
import { categories } from '../data/categories.js'
import CityGate from '../components/CityGate.jsx'

const statusStyles = {
  open: 'bg-[#E9F5EE] text-[#006C35]',
  assigned: 'bg-[#FBF5E3] text-[#8a6d13]',
  done: 'bg-gray-100 text-gray-600',
}

export default function Requests() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ title: '', category: 'Plumber', city: '', budget: '', description: '' })
  const { isAuthenticated } = useAuth()
  const { t } = useLang()
  const navigate = useNavigate()

  const load = async () => {
    try {
      setItems(await api.requests())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!isAuthenticated) return navigate('/login')
    if (!form.city) return setError('اختر مدينتك أولاً')
    try {
      const created = await api.createRequest({ ...form, budget: form.budget ? Number(form.budget) : null })
      setShowForm(false)
      setForm({ title: '', category: 'Plumber', city: '', budget: '', description: '' })
      navigate(`/requests/${created.id}`)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="px-4 py-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-extrabold text-[#11221A]">{t('req.title')}</h2>
          <p className="text-gray-500 text-xs">{t('req.subtitle')}</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="bg-[#006C35] text-white text-sm px-3.5 py-2 rounded-xl font-bold whitespace-nowrap"
        >
          {showForm ? t('req.cancel') : t('req.new')}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="card-lux p-4 mb-5 space-y-3">
          <div className="gold-bar absolute inset-x-0 top-0" />
          <div className="pt-1 space-y-3">
            <input
              required
              placeholder={t('req.whatNeeded')}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2.5 border border-[#E3D9BF] rounded-xl outline-none focus:border-[#006C35]"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="px-3 py-2.5 border border-[#E3D9BF] rounded-xl bg-white"
              >
                {categories.map((c) => (
                  <option key={c.name} value={c.name}>{t(`cat.${c.name}`, c.name)}</option>
                ))}
              </select>
              <input
                type="number" min="0"
                placeholder={t('req.budget')}
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
                className="px-3 py-2.5 border border-[#E3D9BF] rounded-xl outline-none focus:border-[#006C35]"
              />
            </div>

            <CityGate value={form.city} onChange={(c) => setForm({ ...form, city: c })} />

            <textarea
              placeholder={t('req.details')}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2.5 border border-[#E3D9BF] rounded-xl outline-none focus:border-[#006C35]"
            />
            <button type="submit" className="btn-primary">{t('req.publish')}</button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {loading && <p className="text-sm text-gray-500">{t('req.loading')}</p>}

      <div className="space-y-3">
        {items.map((r) => (
          <Link key={r.id} to={`/requests/${r.id}`} className="block card-lux p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bold text-[#11221A]">{r.title}</h3>
              <span className={`text-[11px] px-2 py-1 rounded-full font-semibold whitespace-nowrap ${statusStyles[r.status] || 'bg-gray-100 text-gray-600'}`}>
                {t(`req.status.${r.status}`, r.status)}
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              {t(`cat.${r.category}`, r.category)}{r.city ? ` · ${r.city}` : ''}
            </p>
            <div className="flex items-center gap-3 mt-2 text-xs">
              <span className="text-gray-500">{r.bids_count} {t('req.bids')}</span>
              {r.lowest_bid != null && (
                <span className="chip-gold">{t('req.lowest')} {r.lowest_bid} {t('common.tnd')}</span>
              )}
            </div>
          </Link>
        ))}
        {!loading && items.length === 0 && <p className="text-gray-500 text-sm">{t('req.empty')}</p>}
      </div>
    </div>
  )
}
