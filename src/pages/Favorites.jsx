import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import expertsFallback from '../data/experts.json'
import ExpertCard from '../components/ExpertCard.jsx'
import { useFavorites } from '../hooks/useFavorites.js'
import { useLang } from '../i18n/LanguageContext.jsx'

export default function Favorites() {
  const { favorites } = useFavorites()
  const { t } = useLang()
  const [experts, setExperts] = useState([])

  useEffect(() => {
    fetch('/api/experts')
      .then((r) => r.json())
      .then((rows) =>
        setExperts(
          Array.isArray(rows)
            ? rows.map((r) => ({
                id: r.id,
                personName: r.name_ar || r.name,
                jobName: r.job,
                location: r.city,
                hourlyRate: r.rate,
                rating: r.rating,
                reviews: r.reviews_count,
                image: r.image,
                hasCar: !!r.has_car,
              }))
            : [],
        ),
      )
      .catch(() => setExperts(expertsFallback))
  }, [])

  const list = experts.filter((e) => favorites.map(String).includes(String(e.id)))

  return (
    <div className="px-4 py-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('fav.title')}</h2>
      <p className="text-gray-600 mb-6">{t('fav.subtitle')}</p>

      {list.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">{t('fav.empty')}</p>
          <Link to="/" className="text-blue-500 font-medium">{t('fav.browse')}</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {list.map((e) => <ExpertCard key={e.id} expert={e} />)}
        </div>
      )}
    </div>
  )
}
