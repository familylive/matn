import { useEffect, useState } from 'react'
import { useParentCategories as useCategories, catLabel } from '../hooks/useCategories.js'
import { useLang } from '../i18n/LanguageContext.jsx'
import { DEFAULT_SERVICES } from '../data/services.js'

/** خدمات كل تخصص: من قاعدة البيانات + الافتراضية */
export function useServices() {
  const [map, setMap] = useState(DEFAULT_SERVICES)
  useEffect(() => {
    fetch('/api/categories/tree')
      .then((r) => r.json())
      .then((tree) => {
        if (!Array.isArray(tree)) return
        const next = { ...DEFAULT_SERVICES }
        for (const p of tree) {
          const list = [...(DEFAULT_SERVICES[p.key] || [])]
          for (const c of p.children || []) if (c.ar && !list.includes(c.ar)) list.push(c.ar)
          next[p.key] = list
        }
        setMap(next)
      })
      .catch(() => {})
  }, [])
  return map
}

/**
 * محرر تخصصات الفني: يختار أكثر من تخصص، ولكل تخصص يختار الأعمال التي ينفذها.
 * value: [{ cat, subs: [] }]
 */
export default function TradesEditor({ value = [], onChange, maxTrades = 4 }) {
  const categories = useCategories()
  const services = useServices()
  const { lang } = useLang()
  const trades = Array.isArray(value) ? value : []

  const has = (cat) => trades.some((t) => t.cat === cat)

  const toggleTrade = (cat) => {
    if (has(cat)) onChange(trades.filter((t) => t.cat !== cat))
    else if (trades.length >= maxTrades) return
    else onChange([...trades, { cat, subs: [] }])
  }

  const toggleSub = (cat, sub) => {
    onChange(
      trades.map((t) =>
        t.cat !== cat
          ? t
          : { ...t, subs: t.subs.includes(sub) ? t.subs.filter((s) => s !== sub) : [...t.subs, sub] },
      ),
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-bold text-gray-600">تخصصاتك * <span className="text-[10px] text-gray-400">(تقدر تختار أكثر من تخصص)</span></label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1.5">
          {categories.map((c) => {
            const on = has(c.name)
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => toggleTrade(c.name)}
                className={`relative rounded-xl border px-2.5 py-2 text-start transition ${
                  on ? 'border-[#006C35] bg-[#EAF4EE] ring-1 ring-[#006C35]' : 'border-[#E3D9BF] bg-white'
                }`}
              >
                {on && <span className="absolute top-1.5 end-1.5 text-[10px] text-[#006C35] font-black">✓</span>}
                <div className="text-lg leading-none">{c.icon}</div>
                <div className="text-[11px] font-bold text-[#11221A] mt-1 leading-tight">{catLabel(c, lang)}</div>
              </button>
            )
          })}
        </div>
      </div>

      {trades.map((t) => {
        const cat = categories.find((c) => c.name === t.cat)
        const list = services[t.cat] || []
        return (
          <div key={t.cat} className="rounded-xl border border-[#EADFC8] bg-[#FBF9F2] p-3">
            <p className="text-[11px] font-extrabold text-[#11221A] mb-2">
              {cat ? `${cat.icon} ` : ''}أعمال {cat ? catLabel(cat, lang) : t.cat} — اختر ما تنفذه
            </p>
            <div className="flex flex-wrap gap-1.5">
              {list.map((s) => {
                const on = t.subs.includes(s)
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSub(t.cat, s)}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-full border transition ${
                      on ? 'bg-[#006C35] text-white border-[#006C35]' : 'bg-white text-gray-600 border-[#E3D9BF]'
                    }`}
                  >
                    {on ? '✓ ' : ''}{s}
                  </button>
                )
              })}
            </div>
            {!t.subs.length && <p className="text-[10px] text-gray-400 mt-1.5">ما اخترت أعمال — راح توصلك كل طلبات هذا التخصص</p>}
          </div>
        )
      })}
    </div>
  )
}
