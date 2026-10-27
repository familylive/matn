import { useNavigate } from 'react-router-dom'
import FavoriteButton from './FavoriteButton.jsx'

export default function ExpertCard({ expert }) {
  const navigate = useNavigate()
  return (
    <div
      onClick={() => navigate(`/expert/${expert.id}`, { state: { expert } })}
      className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex items-start space-x-4">
        <div className="relative">
          <img src={expert.image} alt={expert.personName} className="w-20 h-20 rounded-lg object-cover" />
          <div className="absolute top-2 right-2">
            <FavoriteButton expertId={expert.id} />
          </div>
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-gray-900">{expert.personName}</h4>
          <p className="text-gray-600 text-sm">{expert.jobName}</p>
          <div className="flex items-center space-x-2 mt-2">
            <div className="flex items-center">
              <svg className="w-4 h-4 text-yellow-400 fill-current" viewBox="0 0 24 24">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              <span className="text-sm font-medium text-gray-900 ml-1">{expert.rating}</span>
            </div>
            <span className="text-gray-400">•</span>
            <span className="text-sm text-gray-600">{expert.reviews} reviews</span>
          </div>
          <p className="text-sm text-gray-600 mt-1">📍 {expert.location}</p>
          <p className="text-sm text-blue-500 mt-1">{expert.hourlyRate}</p>
        </div>
      </div>
    </div>
  )
}
