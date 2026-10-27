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
      className="card-lux cursor-pointer active:scale-[.995] transition"
    >
      <div className="gold-bar" />
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="relative">
            <img src={expert.image} alt={expertName(expert, lang)} className="w-20 h-20 rounded-xl object-cover ring-2 ring-[#FBF5E3]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-extrabold text-[#11221A] truncate">{expertName(expert, lang)}</h4>
              <FavoriteButton expertId={expert.id} />
            </div>
            <p className="text-[#006C35] text-sm font-semibold">{t(`cat.${expert.jobName}`, expert.jobName)}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[#C9A227]">★</span>
              <span className="text-sm font-bold text-gray-900">{expert.rating}</span>
              <span className="text-gray-300">•</span>
              <span className="text-xs text-gray-500">{expert.reviews} {t('expert.reviews')}</span>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-500">📍 {t(`city.${expert.location}`, expert.location)}</span>
              <span className="chip-gold">{expert.hourlyRate}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
