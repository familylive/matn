import { useLocation, useNavigate, useParams } from 'react-router-dom'
import experts from '../data/experts.json'
import FavoriteButton from '../components/FavoriteButton.jsx'

export default function ExpertDetail() {
  const { id } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const expert = state?.expert || experts.find((e) => String(e.id) === String(id))

  if (!expert) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-gray-600">Expert not found.</p>
        <button onClick={() => navigate('/')} className="text-blue-500 font-medium">Go back home</button>
      </div>
    )
  }

  const tel = expert.phoneNumber?.replace(/\s/g, '')
  const wa = expert.phoneNumber?.replace(/[^\d]/g, '')

  return (
    <div className="min-h-screen bg-gray-50 max-w-sm mx-auto">
      <div className="relative">
        <img src={expert.image} alt={expert.personName} className="w-full h-56 object-cover" />
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 bg-white/90 rounded-full p-2 shadow"
          aria-label="Back"
        >
          <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="absolute top-4 right-4">
          <FavoriteButton expertId={expert.id} />
        </div>
      </div>

      <div className="px-4 py-5 -mt-6 bg-gray-50 rounded-t-2xl relative">
        <h1 className="text-2xl font-bold text-gray-900">{expert.personName}</h1>
        <p className="text-gray-600">{expert.jobName}</p>

        <div className="flex items-center gap-2 mt-3">
          <span className="text-yellow-500">★</span>
          <span className="font-medium text-gray-900">{expert.rating}</span>
          <span className="text-gray-400">•</span>
          <span className="text-gray-600 text-sm">{expert.reviews} reviews</span>
          {expert.emergency && (
            <span className="ml-auto text-xs bg-red-50 text-red-500 px-2 py-1 rounded-full">24/7 Emergency</span>
          )}
        </div>

        <div className="mt-5 space-y-3 text-sm text-gray-700">
          <p>📍 {expert.address}</p>
          <p>💼 {expert.experience} experience</p>
          <p>💰 {expert.hourlyRate}</p>
          <p>🏢 {expert.company}</p>
          <p>🕒 {expert.availability}</p>
        </div>

        <p className="mt-5 text-gray-600">{expert.description}</p>

        {Array.isArray(expert.skills) && (
          <div className="flex flex-wrap gap-2 mt-4">
            {expert.skills.map((s) => (
              <span key={s} className="text-xs bg-white border border-gray-200 text-gray-600 px-3 py-1 rounded-full">{s}</span>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mt-6">
          <a
            href={`tel:${tel}`}
            className="bg-blue-500 text-white text-center py-3 rounded-xl font-medium"
          >
            Call
          </a>
          <a
            href={`https://wa.me/${wa}`}
            target="_blank" rel="noreferrer"
            className="bg-white border border-gray-300 text-gray-800 text-center py-3 rounded-xl font-medium"
          >
            WhatsApp
          </a>
        </div>
      </div>
    </div>
  )
}
