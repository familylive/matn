import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { io } from 'socket.io-client'
import { api } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useLang } from '../i18n/LanguageContext.jsx'

const socket = io({ autoConnect: false })

export default function RequestDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()
  const { t, lang } = useLang()

  const [data, setData] = useState(null)
  const [experts, setExperts] = useState([])
  const [error, setError] = useState('')
  const [bid, setBid] = useState({ expertId: '', amount: '', note: '' })
  const [live, setLive] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await api.request(id)
      setData(res)
    } catch (e) {
      setError(e.message)
    }
  }, [id])

  useEffect(() => {
    load()
    api.experts().then(setExperts).catch(() => {})
  }, [load])

  useEffect(() => {
    if (!socket.connected) socket.connect()
    socket.emit('join', id)
    const onBid = (b) => {
      setLive(true)
      setData((prev) => {
        if (!prev) return prev
        if (prev.bids.some((x) => x.id === b.id)) return prev
        const bids = [...prev.bids, b].sort((a, z) => a.amount - z.amount)
        return { ...prev, bids }
      })
    }
    const onAccepted = (updated) => setData(updated)
    socket.on('bid:new', onBid)
    socket.on('request:accepted', onAccepted)
    return () => {
      socket.emit('leave', id)
      socket.off('bid:new', onBid)
      socket.off('request:accepted', onAccepted)
    }
  }, [id])

  const isOwner = useMemo(
    () => !!data && !!user && Number(data.user_id) === Number(user.id),
    [data, user],
  )

  const placeBid = async (e) => {
    e.preventDefault()
    setError('')
    if (!isAuthenticated) return navigate('/login')
    try {
      await api.placeBid(id, {
        expertId: Number(bid.expertId),
        amount: Number(bid.amount),
        note: bid.note,
      })
      setBid({ expertId: '', amount: '', note: '' })
    } catch (err) {
      setError(err.message)
    }
  }

  const accept = async (bidId) => {
    try {
      const updated = await api.acceptBid(id, bidId)
      setData(updated)
    } catch (err) {
      setError(err.message)
    }
  }

  const complete = async () => {
    try {
      setData(await api.complete(id))
    } catch (err) {
      setError(err.message)
    }
  }

  const review = async (rating) => {
    try {
      await api.review(id, { rating })
    } catch (err) {
      setError(err.message)
    }
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        {error || t('rd.loading')}
      </div>
    )
  }

  const lowest = data.bids[0]?.amount

  return (
    <div className="min-h-screen bg-gray-50 max-w-sm mx-auto">
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-gray-500" aria-label={t('expert.back')}>←</button>
        <h1 className="font-semibold text-gray-900 truncate">{data.title}</h1>
        {live && <span className="ms-auto text-xs text-green-600">● {t('rd.live')}</span>}
      </div>

      <div className="px-4 py-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full">{t(`cat.${data.category}`, data.category)}</span>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{t(`req.status.${data.status}`, data.status)}</span>
          {data.city && <span className="text-sm text-gray-500">📍 {data.city}</span>}
        </div>

        {data.description && <p className="text-gray-700 mb-3">{data.description}</p>}

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-white rounded-xl p-3 border border-gray-100">
            <p className="text-xs text-gray-500">{t('rd.budget')}</p>
            <p className="font-semibold text-gray-900">{data.budget ?? '—'} {t('common.tnd')}</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100">
            <p className="text-xs text-gray-500">{t('rd.lowest')}</p>
            <p className="font-semibold text-green-600">{lowest ?? '—'} {t('common.tnd')}</p>
          </div>
        </div>

        <h2 className="font-bold text-gray-900 mb-3">{t('rd.bids')} ({data.bids.length})</h2>
        <div className="space-y-3">
          {data.bids.map((b) => (
            <div key={b.id} className="bg-white rounded-xl p-3 border border-gray-100 flex items-center gap-3">
              <img src={b.expert_image} alt={b.expert_name} className="w-10 h-10 rounded-full object-cover" />
              <div className="flex-1">
                <p className="font-medium text-gray-900 text-sm">{(lang === 'ar' && b.expert_name_ar) || b.expert_name}</p>
                <p className="text-xs text-gray-500">{t(`cat.${b.expert_job}`, b.expert_job)} · ★ {b.expert_rating}</p>
                {b.note && <p className="text-xs text-gray-500 mt-1">{b.note}</p>}
              </div>
              <div className="text-right">
                <p className="font-bold text-gray-900">{b.amount} {t('common.tnd')}</p>
                {isOwner && data.status === 'open' && (
                  <button onClick={() => accept(b.id)} className="text-xs text-blue-500 mt-1">{t('rd.accept')}</button>
                )}
                {data.accepted_bid_id === b.id && (
                  <span className="text-xs text-green-600">{t('rd.accepted')}</span>
                )}
              </div>
            </div>
          ))}
          {data.bids.length === 0 && <p className="text-sm text-gray-500">{t('rd.none')}</p>}
        </div>

        {data.status === 'open' && (
          <form onSubmit={placeBid} className="bg-white rounded-xl p-4 border border-gray-100 mt-5 space-y-3">
            <h3 className="font-semibold text-gray-900 text-sm">{t('rd.placeBid')}</h3>
            <select
              required
              value={bid.expertId}
              onChange={(e) => setBid({ ...bid, expertId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm"
            >
              <option value="">{t('rd.chooseExpert')}</option>
              {experts.map((x) => (
                <option key={x.id} value={x.id}>{(lang === 'ar' && x.name_ar) || x.name} — {t(`cat.${x.job}`, x.job)}</option>
              ))}
            </select>
            <input
              required
              type="number"
              min="1"
              placeholder={t('rd.price')}
              value={bid.amount}
              onChange={(e) => setBid({ ...bid, amount: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <input
              placeholder={t('rd.note')}
              value={bid.note}
              onChange={(e) => setBid({ ...bid, note: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <button type="submit" className="w-full bg-blue-500 text-white py-2.5 rounded-xl text-sm font-medium">
              {t('rd.send')}
            </button>
          </form>
        )}

        {isOwner && data.status === 'assigned' && (
          <button onClick={complete} className="w-full mt-4 bg-green-500 text-white py-2.5 rounded-xl font-medium">
            {t('rd.complete')}
          </button>
        )}

        {isOwner && data.status === 'done' && (
          <div className="bg-white rounded-xl p-4 border border-gray-100 mt-4">
            <p className="text-sm text-gray-700 mb-2">{t('rd.rate')}</p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => review(n)} className="text-2xl text-yellow-400">★</button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
      </div>
    </div>
  )
}
