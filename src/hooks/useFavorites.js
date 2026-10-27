import { useCallback, useEffect, useState } from 'react'

const KEY = 'userFavorites'

export function useFavorites() {
  const [favorites, setFavorites] = useState([])

  useEffect(() => {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      try { setFavorites(JSON.parse(raw)) } catch { localStorage.removeItem(KEY) }
    }
  }, [])

  const persist = (next) => {
    setFavorites(next)
    localStorage.setItem(KEY, JSON.stringify(next))
  }

  const toggleFavorite = useCallback((id) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      localStorage.setItem(KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const isFavorite = useCallback((id) => favorites.includes(id), [favorites])

  return { favorites, toggleFavorite, isFavorite, clearFavorites: () => persist([]) }
}
