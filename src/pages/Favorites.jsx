import { Link } from 'react-router-dom'
import experts from '../data/experts.json'
import ExpertCard from '../components/ExpertCard.jsx'
import { useFavorites } from '../hooks/useFavorites.js'

export default function Favorites() {
  const { favorites } = useFavorites()
  const list = experts.filter((e) => favorites.includes(e.id))

  return (
    <div className="px-4 py-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Favorites</h2>
      <p className="text-gray-600 mb-6">Experts you saved</p>

      {list.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">You haven't saved any experts yet.</p>
          <Link to="/" className="text-blue-500 font-medium">Browse experts</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {list.map((e) => <ExpertCard key={e.id} expert={e} />)}
        </div>
      )}
    </div>
  )
}
