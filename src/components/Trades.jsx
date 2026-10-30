import { useNavigate } from 'react-router-dom'
import { useLang } from '../i18n/LanguageContext.jsx'
import { useParentCategories as useCategories, catLabel } from '../hooks/useCategories.js'
import { tradesOf } from '../data/services.js'

/** شارة ملوّنة: لون يحدده المدير + نص الشارة */
export function ExpertBadge({ color, label, className = '' }) {
  if (!label) return null
  const c = color || '#006C35'
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${className}`}
      style={{ color: c, borderColor: c, background: `${c}14` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
      {label}
    </span>
  )
}

/** قائمة تخصصات الفني كشرائح صغيرة */
export function TradesChips({ expert, max = 4 }) {
  const { lang } = useLang()
  const categories = useCategories()
  const label = (key) => {
    const c = categories.find((x) => x.name === key)
    return c ? `${c.icon} ${catLabel(c, lang)}` : key
  }
  const trades = tradesOf(expert)
  if (!trades.length) return null
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {trades.slice(0, max).map((t) => (
        <span key={t.cat} className="text-[10px] font-bold text-[#006C35] bg-[#EAF4EE] border border-[#CFE6D8] px-2 py-0.5 rounded-full">
          {label(t.cat)}
        </span>
      ))}
      {trades.length > max && (
        <span className="text-[10px] font-bold text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
          +{trades.length - max}
        </span>
      )}
    </div>
  )
}
