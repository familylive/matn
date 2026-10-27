import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useFavorites } from '../hooks/useFavorites.js'

export default function Profile() {
  const { user, logout } = useAuth()
  const { favorites } = useFavorites()
  const navigate = useNavigate()

  if (!user) return null

  const initials = user.userName
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')

  return (
    <div className="px-4 py-6">
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 text-center">
        {user.avatar ? (
          <img src={user.avatar} alt={user.userName} className="w-20 h-20 rounded-full object-cover mx-auto mb-4" />
        ) : (
          <div className="w-20 h-20 rounded-full bg-blue-500 text-white flex items-center justify-center text-2xl font-bold mx-auto mb-4">
            {initials}
          </div>
        )}
        <h2 className="text-xl font-bold text-gray-900">{user.userName}</h2>
        <p className="text-gray-500 text-sm">📍 {user.userLocation || user.location}</p>
        {user.email && <p className="text-gray-500 text-sm mt-1">{user.email}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4 mt-6">
        <div className="bg-white rounded-xl p-4 text-center border border-gray-100">
          <p className="text-2xl font-bold text-gray-900">{favorites.length}</p>
          <p className="text-sm text-gray-500">Saved experts</p>
        </div>
        <div className="bg-white rounded-xl p-4 text-center border border-gray-100">
          <p className="text-2xl font-bold text-gray-900">0</p>
          <p className="text-sm text-gray-500">Requests</p>
        </div>
      </div>

      <button
        onClick={() => { logout(); navigate('/') }}
        className="w-full mt-6 bg-white border border-red-200 text-red-500 py-3 rounded-xl font-medium"
      >
        Sign out
      </button>
    </div>
  )
}
