import { useEffect, useState } from 'react'
import { categories as fallback } from '../data/categories.js'

export function useCategories() {
  const [cats, setCats] = useState(fallback)
  useEffect(() => {
    fetch('/api/categories')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d) && d.length) {
          setCats(d.map((c) => ({ id: c.id, name: c.key, icon: c.icon || '🛠️', ar: c.ar, en: c.en, image: c.image, parent_id: c.parent_id || null })))
        }
      })
      .catch(() => {})
  }, [])
  return cats
}

export const catLabel = (c, lang) => (lang === 'ar' ? c.ar || c.name : c.en || c.name)
