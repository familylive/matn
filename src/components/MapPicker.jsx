import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const pin = L.divIcon({
  className: '',
  html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#006C35;border:3px solid #C9A227;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 26],
})

export default function MapPicker({ value, onChange, height = 220 }) {
  const el = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)

  useEffect(() => {
    if (!el.current || mapRef.current) return
    const start = value?.lat && value?.lng ? [value.lat, value.lng] : [24.7136, 46.6753]
    const map = L.map(el.current, { zoomControl: true, attributionControl: false }).setView(start, value?.lat ? 14 : 11)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
    mapRef.current = map

    markerRef.current = L.marker(start, { icon: pin, draggable: true }).addTo(map)
    markerRef.current.on('dragend', () => {
      const p = markerRef.current.getLatLng()
      onChange?.({ lat: p.lat, lng: p.lng })
    })
    map.on('click', (e) => {
      markerRef.current.setLatLng(e.latlng)
      onChange?.({ lat: e.latlng.lat, lng: e.latlng.lng })
    })

    setTimeout(() => map.invalidateSize(), 250)
    return () => { map.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (value?.lat && value?.lng && mapRef.current && markerRef.current) {
      const cur = markerRef.current.getLatLng()
      if (Math.abs(cur.lat - value.lat) > 1e-6 || Math.abs(cur.lng - value.lng) > 1e-6) {
        markerRef.current.setLatLng([value.lat, value.lng])
        mapRef.current.setView([value.lat, value.lng], 15)
      }
    }
  }, [value?.lat, value?.lng])

  const locate = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        onChange?.(next)
        mapRef.current?.setView([next.lat, next.lng], 16)
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return (
    <div>
      <div ref={el} style={{ height }} className="w-full rounded-xl overflow-hidden border border-[#E3D9BF] z-0" />
      <div className="flex items-center justify-between mt-2">
        <button type="button" onClick={locate} className="text-xs font-bold text-[#006C35] bg-[#E9F5EE] px-3 py-1.5 rounded-lg">
          📍 استخدم موقعي الحالي
        </button>
        <span className="text-[10px] text-gray-500">
          {value?.lat ? `${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}` : 'اضغط على الخريطة لتحديد الموقع'}
        </span>
      </div>
    </div>
  )
}
