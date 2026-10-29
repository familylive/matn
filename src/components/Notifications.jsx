import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { useAuth } from '../context/AuthContext.jsx'
import { useNavigate } from 'react-router-dom'

const socket = io({ autoConnect: false })

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const now = ctx.currentTime
    ;[880, 1180].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + i * 0.18)
      gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.18 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.22)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + i * 0.18)
      osc.stop(now + i * 0.18 + 0.25)
    })
    setTimeout(() => ctx.close?.(), 1200)
  } catch {}
}

export default function Notifications() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [toast, setToast] = useState(null)
  const [soundOn, setSoundOn] = useState(localStorage.getItem('soundOn') !== '0')
  const timerRef = useRef(null)

  useEffect(() => {
    if (!socket.connected) socket.connect()
    const identify = () => { if (user?.id) socket.emit('identify', user.id) }
    identify()
    socket.on('connect', identify)

    const onNotify = (n) => {
      // تنبيه الطلبات للفنيين: حسب التخصص فقط
      if (n.type === 'request' && user?.role === 'expert' && n.category && n.category !== user.specialty) return
      setToast(n)
      if (localStorage.getItem('soundOn') !== '0') beep()
      if (navigator.vibrate) navigator.vibrate([120, 60, 120])
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setToast(null), 12000)
    }
    socket.on('notify', onNotify)
    return () => {
      socket.off('notify', onNotify)
      socket.off('connect', identify)
    }
  }, [user?.id])

  useEffect(() => {
    const handler = (e) => setSoundOn(e.detail)
    window.addEventListener('sound-pref', handler)
    return () => window.removeEventListener('sound-pref', handler)
  }, [])

  if (!toast) return null

  const isReq = toast.type === 'request'

  if (isReq) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm grid place-items-center p-4" dir="rtl">
        <div className="w-full max-w-sm rounded-3xl bg-white overflow-hidden shadow-2xl animate-[pop_.25s_ease-out]">
          <div className="bg-[#006C35] text-white text-center py-6">
            <div className="text-5xl mb-2">🔔</div>
            <p className="text-xl font-extrabold">طلب جديد في تخصصك!</p>
            <p className="text-white/80 text-xs mt-1">مزاد دقيقتين — اسرع بالسومة</p>
          </div>
          <div className="p-5 text-center">
            <p className="text-lg font-extrabold text-[#0B0A08]">{toast.body}</p>
            <button
              onClick={() => { navigate(`/requests/${toast.requestId}`); setToast(null) }}
              className="mt-4 w-full bg-[#006C35] text-white py-3.5 rounded-2xl font-extrabold text-base"
            >
              عرض الطلب والسوم الآن
            </button>
            <button onClick={() => setToast(null)} className="mt-2 w-full text-gray-400 text-xs py-2">
              لاحقاً
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed top-3 inset-x-3 z-50 max-w-sm mx-auto">
      <div
        onClick={() => {
          if (toast.requestId) navigate(`/requests/${toast.requestId}`)
          setToast(null)
        }}
        className={`card-lux p-3 flex items-start gap-3 shadow-xl cursor-pointer ${toast.type === 'request' ? 'ring-2 ring-[#C9A227]' : ''}`}
      >
        <span className="w-9 h-9 rounded-full bg-[#E9F5EE] text-[#006C35] grid place-items-center text-lg">
          {toast.type === 'bid' ? '💰' : '🔔'}
        </span>
        <div className="flex-1">
          <p className="font-bold text-sm text-[#11221A]">{toast.title}</p>
          <p className="text-xs text-gray-600">{toast.body}</p>
        </div>
        <button onClick={(e) => { e.stopPropagation(); setToast(null) }} className="text-gray-400 text-sm">✕</button>
      </div>
    </div>
  )
}
