import { useNavigate } from 'react-router-dom'
import FavoriteButton from './FavoriteButton.jsx'
import { useLang } from '../i18n/LanguageContext.jsx'
import { expertName } from '../i18n/display.js'
import { ExpertBadge, TradesChips } from './Trades.jsx'
import VerifiedBadge from './VerifiedBadge.jsx'

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
              <h4 className="font-extrabold text-[#11221A] truncate flex items-center gap-1">
                <span className="truncate">{expertName(expert, lang)}</span>
                {expert.approved !== false && <VerifiedBadge size={16} />}
              </h4>
              <ExpertBadge color={expert.badge_color} label={expert.badge_label || (expert.is_company ? 'شركة موثقة' : '')} className="shrink-0" />
              <FavoriteButton expertId={expert.id} />
            </div>
            <p className="text-[#006C35] text-sm font-semibold">{t(`cat.${expert.jobName}`, expert.jobName)}</p>
            <TradesChips expert={expert} max={3} />
            {expert.exp_years ? (
              <p className="text-[10px] text-gray-500 mt-1">🧾 خبرة {expert.exp_years} سنة</p>
            ) : null}
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[#C9A227]">★</span>
              <span className="text-sm font-bold text-gray-900">{Number(expert.rating).toFixed(1)}</span>
              <span className="text-gray-300">•</span>
              <span className="text-xs text-gray-500">{expert.reviews} {t('expert.reviews')}</span>
            </div>
            {expert.hasCar && (
              <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-[#006C35] bg-[#EAF4EE] border border-[#CFE6D8] px-2 py-0.5 rounded-full">
                🚗 يملك سيارة
              </span>
            )}
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
