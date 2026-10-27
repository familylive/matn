import { useLocation } from 'react-router-dom'

const titles = {
  '/': 'Home',
  '/search': 'Search',
  '/favorites': 'Favorites',
  '/requests': 'Requests',
  '/profile': 'Profile',
  '/login': 'Login',
}

export default function Header() {
  const { pathname } = useLocation()
  return (
    <header className="bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-center">
      <h1 className="text-lg font-medium text-gray-900">{titles[pathname] || 'Mihnati'}</h1>
    </header>
  )
}
