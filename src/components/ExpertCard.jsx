import { useNavigate } from 'react-router-dom'
import FavoriteButton from './FavoriteButton.jsx'
import { useLang } from '../i18n/LanguageContext.jsx'
import { expertName } from '../i18n/display.js'

export default function ExpertCard({ expert }) {
  const navigate = useNavigate()
  const { t, lang } = useLang()
  return (
    <div
      onClick={() => navigate(`/expert/${expert.id}`, { state: { expert } })}
      className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex items-start gap-4">
        <div className="relative">
          <img src={expert.image} alt={expert.personName} className="w-20 h-20 rounded-lg object-cover" />
          <div className="absolute top-2 end-2">
            <FavoriteButton expertId={expert.id} />
          </div>
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-gray-900">{expertName(expert, lang)}</h4>
          <p className="text-gray-600 text-sm">{t(`cat.${expert.jobName}`, expert.jobName)}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-yellow-400">★</span>
            <span className="text-sm font-medium text-gray-900">{expert.rating}</span>
            <span className="text-gray-400">•</span>
            <span className="text-sm text-gray-600">
              {expert.reviews} {t('expert.reviews')}
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-1">📍 {t(`city.${expert.location}`, expert.location)}</p>
          <p className="text-sm text-blue-500 mt-1">{expert.hourlyRate}</p>
        </div>
      </div>
    </div>
  )
}
