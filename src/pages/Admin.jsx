import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const TOKEN_KEY = 'adminToken'
const getToken = () => localStorage.getItem(TOKEN_KEY)

async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {}
  const token = getToken()
  if (token) headers.authorization = `Bearer ${token}`
  if (!form) headers['content-type'] = 'application/json'
  const res = await fetch(path, {
    method,
    headers,
    body: form ? form : body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `http_${res.status}`)
  return data
}

function Login({ onDone }) {
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await api('/api/admin/login', { method: 'POST', body: form })
      localStorage.setItem(TOKEN_KEY, r.token)
      onDone()
    } catch {
      setError('الإيميل أو كلمة المرور غلط')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-[#0b2b19] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-[#006C35] text-white grid place-items-center text-3xl font-extrabold mx-auto ring-4 ring-[#C9A227]/40">م</div>
          <h1 className="text-white text-xl font-extrabold mt-3">لوحة تحكم مهنتي</h1>
          <p className="text-white/60 text-sm">الدخول للإدارة فقط</p>
        </div>
        <form onSubmit={submit} className="bg-white rounded-2xl p-5 space-y-3">
          <input
            type="email" required placeholder="الإيميل"
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full px-3 py-2.5 border border-[#E3D9BF] rounded-xl outline-none focus:border-[#006C35]"
          />
          <input
            type="password" required placeholder="كلمة المرور"
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full px-3 py-2.5 border border-[#E3D9BF] rounded-xl outline-none focus:border-[#006C35]"
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button disabled={busy} className="btn-primary">{busy ? 'جارٍ الدخول…' : 'دخول'}</button>
          <button type="button" onClick={() => navigate('/')} className="w-full text-center text-sm text-gray-500 py-1">
            ← رجوع للتطبيق
          </button>
        </form>
      </div>
    </div>
  )
}

const sections = [
  { key: 'overview', label: 'نظرة عامة', icon: '📊' },
  { key: 'ads', label: 'الإعلانات', icon: '📣' },
  { key: 'requests', label: 'الطلبات', icon: '📋' },
  { key: 'invoices', label: 'الفواتير', icon: '🧾' },
  { key: 'cities', label: 'طلبات المدن', icon: '📍' },
  { key: 'backup', label: 'النسخ الاحتياطي', icon: '💾' },
]

function Stat({ label, value }) {
  return (
    <div className="card-lux p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-extrabold text-[#006C35] mt-1">{value}</p>
    </div>
  )
}

function Overview() {
  const [s, setS] = useState(null)
  useEffect(() => { api('/api/admin/overview').then(setS).catch(() => {}) }, [])
  if (!s) return <p className="text-gray-500">جارٍ التحميل…</p>
  return (
    <div className="grid grid-cols-2 gap-3">
      <Stat label="الطلبات" value={s.requests} />
      <Stat label="طلبات مفتوحة" value={s.open_requests} />
      <Stat label="السومات" value={s.bids} />
      <Stat label="المستخدمون" value={s.users} />
      <Stat label="الحرفيون" value={s.experts} />
      <Stat label="الإعلانات" value={s.ads} />
      <Stat label="الفواتير" value={s.invoices} />
      <Stat label="إجمالي الفواتير" value={`${s.invoices_total} د`} />
      <Stat label="طلبات مدن جديدة" value={s.city_requests} />
    </div>
  )
}

function Ads() {
  const [ads, setAds] = useState([])
  const [form, setForm] = useState({ title: '', link: '', price: '', duration_days: 30, featured: true })
  const [image, setImage] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = () => api('/api/admin/ads').then(setAds).catch(() => {})
  useEffect(() => { load() }, [])

  const upload = async (file) => {
    const fd = new FormData()
    fd.append('image', file)
    const r = await api('/api/admin/upload', { method: 'POST', form: fd })
    setImage(r.url)
  }

  const create = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await api('/api/admin/ads', {
        method: 'POST',
        body: { ...form, price: form.price ? Number(form.price) : null, image },
      })
      setForm({ title: '', link: '', price: '', duration_days: 30, featured: true })
      setImage('')
      load()
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (ad, field) => {
    await api(`/api/admin/ads/${ad.id}`, { method: 'PATCH', body: { [field]: ad[field] ? 0 : 1 } })
    load()
  }

  const remove = async (ad) => {
    if (!confirm('حذف الإعلان؟')) return
    await api(`/api/admin/ads/${ad.id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="card-lux p-4 space-y-3">
        <div className="gold-bar absolute inset-x-0 top-0" />
        <h3 className="font-extrabold text-[#11221A] pt-1">إعلان جديد</h3>
        <input required placeholder="عنوان الإعلان" value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="w-full px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm" />
        <div>
          <label className="text-xs text-gray-500">صورة الإعلان (من جوالك)</label>
          <input
            type="file" accept="image/*"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            className="w-full text-sm mt-1"
          />
          {image && <img src={image} alt="preview" className="mt-2 h-24 rounded-lg object-cover" />}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" placeholder="السعر (دينار)" value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            className="px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm" />
          <input type="number" min="1" placeholder="مدة العرض (أيام)" value={form.duration_days}
            onChange={(e) => setForm({ ...form, duration_days: e.target.value })}
            className="px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm" />
        </div>
        <input placeholder="رابط (اختياري)" value={form.link}
          onChange={(e) => setForm({ ...form, link: e.target.value })}
          className="w-full px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm" />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} />
          إعلان مميز / بارز
        </label>
        {err && <p className="text-xs text-red-500">{err}</p>}
        <button disabled={busy} className="btn-primary">{busy ? 'جارٍ النشر…' : 'نشر الإعلان'}</button>
      </form>

      <div className="space-y-2">
        {ads.map((ad) => (
          <div key={ad.id} className="card-lux p-3 flex items-center gap-3">
            {ad.image ? (
              <img src={ad.image} alt={ad.title} className="w-16 h-12 rounded-lg object-cover" />
            ) : (
              <div className="w-16 h-12 rounded-lg bg-gray-100" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-[#11221A] truncate">{ad.title}</p>
              <p className="text-[11px] text-gray-500">
                {ad.price ? `${ad.price} د · ` : ''}ينتهي {ad.ends_at?.slice(0, 10)}
                {ad.featured ? ' · ★ مميز' : ''}
              </p>
            </div>
            <button onClick={() => toggle(ad, 'active')} className={`text-[11px] px-2 py-1 rounded-lg ${ad.active ? 'bg-[#E9F5EE] text-[#006C35]' : 'bg-gray-100 text-gray-500'}`}>
              {ad.active ? 'مفعّل' : 'موقوف'}
            </button>
            <button onClick={() => toggle(ad, 'featured')} className="text-[11px] px-2 py-1 rounded-lg bg-[#FBF5E3] text-[#8a6d13]">
              {ad.featured ? '★' : '☆'}
            </button>
            <button onClick={() => remove(ad)} className="text-[11px] text-red-500 px-1">حذف</button>
          </div>
        ))}
        {ads.length === 0 && <p className="text-sm text-gray-500">ما فيه إعلانات بعد.</p>}
      </div>
    </div>
  )
}

function Requests() {
  const [rows, setRows] = useState([])
  useEffect(() => { api('/api/admin/requests').then(setRows).catch(() => {}) }, [])
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="card-lux p-3">
          <div className="flex items-center justify-between">
            <p className="font-bold text-sm text-[#11221A]">{r.title}</p>
            <span className="text-[11px] text-gray-500">{r.status}</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            {r.owner_name} · {r.city} · {r.bids_count} سومة · {r.created_at}
          </p>
        </div>
      ))}
      {rows.length === 0 && <p className="text-sm text-gray-500">ما فيه طلبات.</p>}
    </div>
  )
}

function Invoices() {
  const [rows, setRows] = useState([])
  useEffect(() => { api('/api/admin/invoices').then(setRows).catch(() => {}) }, [])
  return (
    <div className="space-y-2">
      {rows.map((i) => (
        <div key={i.id} className="card-lux p-3 flex items-center justify-between">
          <div>
            <p className="font-bold text-sm text-[#11221A]">{i.number}</p>
            <p className="text-[11px] text-gray-500">{i.request_title} · {i.owner_name} · {i.issued_at}</p>
          </div>
          <span className="chip-gold">{i.amount} د</span>
        </div>
      ))}
      {rows.length === 0 && <p className="text-sm text-gray-500">ما فيه فواتير بعد.</p>}
    </div>
  )
}

function CityRequests() {
  const [rows, setRows] = useState([])
  const load = () => api('/api/admin/city-requests').then(setRows).catch(() => {})
  useEffect(() => { load() }, [])
  const done = async (id) => {
    await api(`/api/admin/city-requests/${id}`, { method: 'PATCH', body: { status: 'done' } })
    load()
  }
  return (
    <div className="space-y-2">
      {rows.map((c) => (
        <div key={c.id} className="card-lux p-3 flex items-center justify-between">
          <div>
            <p className="font-bold text-sm text-[#11221A]">{c.city}</p>
            <p className="text-[11px] text-gray-500">{c.phone || 'بدون جوال'} · {c.created_at}</p>
          </div>
          {c.status === 'new' ? (
            <button onClick={() => done(c.id)} className="text-[11px] bg-[#E9F5EE] text-[#006C35] px-2 py-1 rounded-lg">تمّت الإضافة</button>
          ) : (
            <span className="text-[11px] text-gray-400">مكتمل</span>
          )}
        </div>
      ))}
      {rows.length === 0 && <p className="text-sm text-gray-500">ما فيه طلبات مدن.</p>}
    </div>
  )
}

function Backup() {
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const download = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/backup', { headers: { authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` } })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mihnati-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setMsg('تم تنزيل النسخة ✅ احفظها عندك')
    } catch {
      setMsg('تعذّر التنزيل')
    } finally {
      setBusy(false)
    }
  }

  const restore = async (file) => {
    setBusy(true)
    setMsg('')
    try {
      const text = await file.text()
      const payload = JSON.parse(text)
      await fetch('/api/admin/restore', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}`,
        },
        body: JSON.stringify(payload),
      })
      setMsg('تمت الاستعادة ✅ حدّث الصفحة')
    } catch {
      setMsg('الملف غير صالح')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="card-lux p-4">
        <p className="font-extrabold text-[#11221A] mb-1">💾 نسخة احتياطية</p>
        <p className="text-xs text-gray-500 mb-3">
          نزّل نسخة من كل البيانات (الحسابات، الطلبات، السومات، الفواتير، الإعلانات) قبل أي نشر،
          واستعدها بعد النشر. الحل هذا يخليك مستمر على الخطة المجانية بدون فقدان بيانات.
        </p>
        <button onClick={download} disabled={busy} className="btn-primary">تنزيل النسخة</button>
      </div>

      <div className="card-lux p-4">
        <p className="font-extrabold text-[#11221A] mb-2">استعادة</p>
        <input
          type="file" accept="application/json"
          onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])}
          className="text-sm w-full"
        />
      </div>

      {msg && <p className="text-sm text-[#006C35] font-bold">{msg}</p>}
    </div>
  )
}

function Shell({ onLogout }) {
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState('overview')
  const navigate = useNavigate()

  const current = sections.find((s) => s.key === section)

  return (
    <div className="min-h-screen bg-[#F6F7F6]">
      <header className="bg-[#006C35] text-white px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <button onClick={() => setOpen(true)} className="text-2xl leading-none">☰</button>
        <h1 className="font-extrabold">لوحة تحكم مهنتي</h1>
        <button onClick={() => navigate('/')} className="text-xs bg-white/15 px-2.5 py-1.5 rounded-lg">التطبيق</button>
      </header>
      <div className="h-1 bg-gradient-to-r from-[#006C35] via-[#C9A227] to-[#BFC5CB]" />

      {open && (
        <div className="fixed inset-0 z-30" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <aside
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-y-0 start-0 w-72 bg-white shadow-2xl p-4 flex flex-col"
          >
            <div className="flex items-center gap-2 mb-6">
              <span className="w-10 h-10 rounded-xl bg-[#006C35] text-white grid place-items-center font-extrabold">م</span>
              <div>
                <p className="font-extrabold text-[#11221A]">مهنتي</p>
                <p className="text-[11px] text-gray-500">الإدارة</p>
              </div>
            </div>
            <nav className="space-y-1 flex-1">
              {sections.map((s) => (
                <button
                  key={s.key}
                  onClick={() => { setSection(s.key); setOpen(false) }}
                  className={`w-full text-start px-3 py-2.5 rounded-xl text-sm font-semibold ${section === s.key ? 'bg-[#E9F5EE] text-[#006C35]' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  <span className="me-2">{s.icon}</span>{s.label}
                </button>
              ))}
            </nav>
            <button onClick={onLogout} className="text-sm text-red-500 py-2 font-semibold">تسجيل الخروج</button>
          </aside>
        </div>
      )}

      <main className="p-4 pb-16 max-w-3xl mx-auto">
        <h2 className="text-lg font-extrabold text-[#11221A] mb-3">{current?.label}</h2>
        {section === 'overview' && <Overview />}
        {section === 'ads' && <Ads />}
        {section === 'requests' && <Requests />}
        {section === 'invoices' && <Invoices />}
        {section === 'cities' && <CityRequests />}
        {section === 'backup' && <Backup />}
      </main>
    </div>
  )
}

export default function Admin() {
  const [authed, setAuthed] = useState(!!getToken())
  if (!authed) return <Login onDone={() => setAuthed(true)} />
  return (
    <Shell
      onLogout={() => {
        localStorage.removeItem(TOKEN_KEY)
        setAuthed(false)
      }}
    />
  )
}
