import { useEffect, useMemo, useState } from 'react'

export default function AdsCarousel() {
  const [ads, setAds] = useState([])
  const [index, setIndex] = useState(0)
  const [bad, setBad] = useState({})

  useEffect(() => {
    let alive = true
    fetch('/api/ads')
      .then((r) => r.json())
      .then((d) => { if (alive) setAds(Array.isArray(d) ? d : []) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (ads.length < 2) return
    const id = setInterval(() => setIndex((i) => (i + 1) % ads.length), 8000)
    return () => clearInterval(id)
  }, [ads.length])

  const current = useMemo(() => ads[index], [ads, index])

  if (!ads.length) return null

  return (
    <div className="px-4 pt-4">
      <div className="card-lux">
        <div className="gold-bar" />
        <a href={current.link || '#'} target={current.link ? '_blank' : undefined} rel="noreferrer" className="block">
          <div className="relative h-36 bg-[#F3F5F3]">
            {current.image && !bad[current.id] ? (
              <img
                src={current.image}
                alt={current.title}
                onError={() => setBad((b) => ({ ...b, [current.id]: true }))}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[#006C35] font-bold">
                {current.title}
              </div>
            )}
            {current.featured ? (
              <span className="absolute top-2 start-2 chip-gold">★ مميـز</span>
            ) : null}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
              <p className="text-white text-sm font-bold truncate">{current.title}</p>
            </div>
          </div>
        </a>
        {ads.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 py-2">
            {ads.map((a, i) => (
              <button
                key={a.id}
                onClick={() => setIndex(i)}
                aria-label={`ad ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-[#C9A227]' : 'w-1.5 bg-[#D8DEE3]'}`}
              />
            ))}
          </div>
        )}
      </div>
      <p className="text-[10px] text-gray-400 mt-1 text-center">إعلان</p>
    </div>
  )
}
