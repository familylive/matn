import { useFavorites } from '../hooks/useFavorites.js'

export default function FavoriteButton({ expertId }) {
  const { isFavorite, toggleFavorite } = useFavorites()
  const active = isFavorite(expertId)
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        toggleFavorite(expertId)
      }}
      aria-label={active ? 'Remove from favorites' : 'Add to favorites'}
      className="bg-white rounded-full p-1.5 shadow-sm"
    >
      <svg
        className={`w-4 h-4 ${active ? 'text-red-500 fill-current' : 'text-gray-400'}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
        />
      </svg>
    </button>
  )
}
