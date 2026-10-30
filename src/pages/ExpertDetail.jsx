import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import experts from '../data/experts.json'
import FavoriteButton from '../components/FavoriteButton.jsx'
import { useLang } from '../i18n/LanguageContext.jsx'
import { expertName } from '../i18n/display.js'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../lib/api.js'

export default function ExpertDetail() {
  const { id } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const { t, lang } = useLang()
  const [reviews, setReviews] = useState([])
  const [contact, setContact] = useState(null)
  const [directOpen, setDirectOpen] = useState(false)
  const [df, setDf] = useState({ title: '', city: '', description: '' })
  const [dbusy, setDbusy] = useState(false)
  const [derr, setDerr] = useState('')

  const sendDirect = async (e) => {
    e.preventDefault()
    setDerr('')
    setDbusy(true)
    try {
      const r = await api.post('/api/requests/direct', {
        expertId: expert.id,
        title: df.title,
        city: df.city || expert.city,
        description: df.description,
      })
      navigate(`/requests/${r.id}`)
    } catch (err2) {
      setDerr(err2.message === 'title_required' ? 'اكتب وصف المشكلة' : 'تعذّر الإرسال')
    } finally {
      setDbusy(false)
    }
  }
  const { isAuthenticated } = useAuth()

  useEffect(() => {
    if (isAuthenticated) api.get(`/api/experts/${id}/contact`).then(setContact).catch(() => {})
  }, [id, isAuthenticated])

  useEffect(() => {
    fetch(`/api/experts/${id}/reviews`).then((r) => r.json()).then(setReviews).catch(() => {})
  }, [id])
  const expert = state?.expert || experts.find((e) => String(e.id) === String(id))

  if (!expert) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-gray-600">{t('expert.notFound')}</p>
        <button onClick={() => navigate('/')} className="text-blue-500 font-medium">{t('nav.home')}</button>
      </div>
    )
  }

  const tel = expert.phoneNumber?.replace(/\s/g, '')
  const wa = expert.phoneNumber?.replace(/[^\d]/g, '')

  return (
    <div className="min-h-screen bg-gray-50 w-full max-w-sm md:max-w-4xl mx-auto pb-24">
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-[#ECE3CE] px-3 py-2 flex items-center gap-2">
        <button
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
          className="w-9 h-9 rounded-lg bg-[#FBF5E3] text-[#8a6d13] grid place-items-center font-bold"
          aria-label="رجوع"
        >
          ›
        </button>
        <span className="text-sm font-extrabold text-[#11221A]">{expertName(expert, lang)}</span>
        <button onClick={() => navigate('/')} className="ms-auto text-xs font-bold text-[#006C35]">الرئيسية</button>
      </div>
      <div className="relative">
        <img src={expert.image} alt={expert.personName} className="w-full h-56 object-cover" />
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 start-4 bg-white/90 rounded-full p-2 shadow"
          aria-label={t('expert.back')}
        >
          <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="absolute top-4 end-4">
          <FavoriteButton expertId={expert.id} />
        </div>
      </div>

      <div className="px-4 py-5 -mt-6 bg-gray-50 rounded-t-2xl relative">
        <h1 className="text-2xl font-bold text-gray-900">{expertName(expert, lang)}</h1>
        <p className="text-gray-600">{t(`cat.${expert.jobName}`, expert.jobName)}</p>

        <div className="flex items-center gap-2 mt-3">
          <span className="text-yellow-500">★</span>
          <span className="font-medium text-gray-900">{Number(expert.rating).toFixed(1)}</span>
          <span className="text-gray-400">•</span>
          <span className="text-gray-600 text-sm">{expert.reviews} {t('expert.reviews')}</span>
          {expert.emergency && (
            <span className="ms-auto text-xs bg-red-50 text-red-500 px-2 py-1 rounded-full">
              {t('expert.emergency')}
            </span>
          )}
        </div>

        <div className="mt-5 space-y-3 text-sm text-gray-700">
          <p>📍 {expert.address}</p>
          <p>💼 {expert.experience} {t('expert.experience')}</p>
          <p>💰 {expert.hourlyRate}</p>
          {!!(expert.has_car ?? expert.hasCar) && (
            <p className="inline-flex items-center gap-1 text-[11px] font-bold text-[#006C35] bg-[#EAF4EE] border border-[#CFE6D8] px-2 py-0.5 rounded-full">
              🚗 يملك سيارة — يوصلك أسرع
            </p>
          )}
          <p>🏢 {expert.company}</p>
          <p>🕒 {expert.availability}</p>
        </div>

        <p className="mt-5 text-gray-600">{expert.description}</p>

        {Array.isArray(expert.skills) && (
          <div className="flex flex-wrap gap-2 mt-4">
            {expert.skills.map((s) => (
              <span key={s} className="text-xs bg-white border border-gray-200 text-gray-600 px-3 py-1 rounded-full">
                {s}
              </span>
            ))}
          </div>
        )}

        {reviews.length > 0 && (
          <div className="mt-6">
            <h3 className="font-extrabold text-sm text-[#11221A] mb-2">تقييمات العملاء ({reviews.length})</h3>
            <div className="space-y-2">
              {reviews.map((r) => (
                <div key={r.id} className="bg-white rounded-xl p-3 border border-[#F0E9D8]">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-[#11221A]">{r.customer_name || 'عميل'}</p>
                    <p className="text-[#C9A227] text-xs">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</p>
                  </div>
                  {r.comment && <p className="text-[11px] text-gray-600 mt-1">{r.comment}</p>}
                  <p className="text-[10px] text-gray-400 mt-1">{r.created_at?.slice(0, 10)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {isAuthenticated ? (
          <button
            onClick={() => setDirectOpen(true)}
            className="w-full mt-6 bg-[#11221A] text-white py-3.5 rounded-xl font-extrabold flex items-center justify-center gap-2"
          >
            📩 طلب مباشر لهذا الفني
          </button>
        ) : (
          <button
            onClick={() => navigate('/login')}
            className="w-full mt-6 bg-[#11221A] text-white py-3.5 rounded-xl font-extrabold"
          >
            سجّل دخول لتطلب من هذا الفني
          </button>
        )}

        {directOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={() => setDirectOpen(false)}>
            <form onSubmit={sendDirect} onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-3">
              <p className="font-extrabold text-[#11221A]">طلب مباشر إلى {expertName(expert, lang)}</p>
              <p className="text-[11px] text-gray-500">يوصل له هو فقط — ما ينزل بالمزاد</p>
              <input required placeholder="وش المشكلة؟ مثال: تسريب في الحمام"
                value={df.title} onChange={(e) => setDf({ ...df, title: e.target.value })}
                className="w-full px-3 py-2.5 border border-[#E3D9BF] rounded-xl text-sm" />
              <input placeholder="المدينة" value={df.city} onChange={(e) => setDf({ ...df, city: e.target.value })}
                className="w-full px-3 py-2.5 border border-[#E3D9BF] rounded-xl text-sm" />
              <textarea rows={3} placeholder="تفاصيل إضافية (اختياري)" value={df.description}
                onChange={(e) => setDf({ ...df, description: e.target.value })}
                className="w-full px-3 py-2.5 border border-[#E3D9BF] rounded-xl text-sm" />
              {derr && <p className="text-xs text-red-500">{derr}</p>}
              <button disabled={dbusy} className="btn-primary">{dbusy ? 'جارٍ الإرسال…' : 'أرسل الطلب'}</button>
              <button type="button" onClick={() => setDirectOpen(false)} className="w-full text-xs text-gray-400 py-1">إلغاء</button>
            </form>
          </div>
        )}

        {contact?.allowed ? (
          <div className="grid grid-cols-2 gap-3 mt-6">
            <a href={`tel:${contact.phone?.replace(/\s/g, '')}`} className="bg-[#006C35] text-white text-center py-3 rounded-xl font-bold">
              📞 اتصال
            </a>
            <a
              href={`https://wa.me/${contact.whatsapp}`}
              target="_blank" rel="noreferrer"
              className="bg-white border border-[#E3D9BF] text-gray-800 text-center py-3 rounded-xl font-bold"
            >
              💬 واتساب
            </a>
          </div>
        ) : (
          <div className="mt-6 rounded-xl bg-[#FBF5E3] border border-[#EADFC8] p-3 text-center">
            <p className="text-xs font-bold text-[#8a6d13]">🔒 بيانات التواصل تظهر بعد سداد الطلب</p>
            <p className="text-[10px] text-gray-500 mt-1">اطلب خدمتك وسوم معه — وبعد الدفع يظهر الجوال والواتساب</p>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-[#ECE3CE] p-3">
        <div className="max-w-sm md:max-w-4xl mx-auto flex gap-2">
          <button
            onClick={() => (isAuthenticated ? setDirectOpen(true) : navigate('/login'))}
            className="flex-1 bg-[#11221A] text-white py-3 rounded-xl font-extrabold text-sm"
          >
            📩 طلب مباشر
          </button>
          <button
            onClick={() => navigate('/')}
            className="px-4 bg-[#FBF5E3] text-[#8a6d13] border border-[#EADFC8] rounded-xl font-bold text-sm"
          >
            الرئيسية
          </button>
        </div>
      </div>
    </div>
  )
}
