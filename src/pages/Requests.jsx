import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { categories } from '../data/categories.js'

const statusStyles = {
  open: 'bg-blue-50 text-blue-600',
  assigned: 'bg-amber-50 text-amber-600',
  done: 'bg-green-50 text-green-600',
}

export default function Requests() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ title: '', category: 'Plumber', city: '', budget: '', description: '' })
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()

  const load = async () => {
    try {
      const data = await api.requests()
      setItems(data)
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
    try {
      const created = await api.createRequest({
        ...form,
        budget: form.budget ? Number(form.budget) : null,
      })
      setShowForm(false)
      setForm({ title: '', category: 'Plumber', city: '', budget: '', description: '' })
      navigate(`/requests/${created.id}`)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Requests</h2>
          <p className="text-gray-600 text-sm">Live auctions from customers</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="bg-blue-500 text-white text-sm px-3 py-2 rounded-xl"
        >
          {showForm ? 'Cancel' : '+ New'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="bg-white rounded-xl p-4 border border-gray-100 mb-5 space-y-3">
          <input
            required
            placeholder="What do you need? (e.g. leaking sink)"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-blue-400"
          />
          <div className="grid grid-cols-2 gap-3">
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="px-3 py-2 border border-gray-200 rounded-lg bg-white"
            >
              {categories.map((c) => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
            <input
              placeholder="City"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              className="px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-blue-400"
            />
          </div>
          <input
            type="number"
            min="0"
            placeholder="Budget (TND)"
            value={form.budget}
            onChange={(e) => setForm({ ...form, budget: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-blue-400"
          />
          <textarea
            placeholder="Details (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-blue-400"
          />
          <button type="submit" className="w-full bg-blue-500 text-white py-2.5 rounded-xl font-medium">
            Publish request
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      <div className="space-y-3">
        {items.map((r) => (
          <Link
            key={r.id}
            to={`/requests/${r.id}`}
            className="block bg-white rounded-xl p-4 border border-gray-100 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-gray-900">{r.title}</h3>
              <span className={`text-xs px-2 py-1 rounded-full ${statusStyles[r.status] || 'bg-gray-100 text-gray-600'}`}>
                {r.status}
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1">{r.category}{r.city ? ` · ${r.city}` : ''}</p>
            <div className="flex items-center gap-3 mt-2 text-sm">
              <span className="text-gray-500">{r.bids_count} bids</span>
              {r.lowest_bid != null && (
                <span className="text-green-600 font-medium">lowest {r.lowest_bid} TND</span>
              )}
              {r.budget != null && <span className="text-gray-400">budget {r.budget}</span>}
            </div>
          </Link>
        ))}
        {!loading && items.length === 0 && (
          <p className="text-gray-500 text-sm">No requests yet — publish the first one.</p>
        )}
      </div>
    </div>
  )
}
