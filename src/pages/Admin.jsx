import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const TOKEN_KEY = 'adminToken'
const getToken = () => localStorage.getItem(TOKEN_KEY)

async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {}
  const token = getToken()
  if (token) headers.authorization = `Bearer ${token}`
  if (!form) headers['content-type'] = 'application/json'
  const res = await fetch(path, { method, headers, body: form ? form : body ? JSON.stringify(body) : undefined })
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
          <input type="email" required placeholder="الإيميل" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full px-3 py-2.5 border border-[#E3D9BF] rounded-xl outline-none focus:border-[#006C35]" />
          <input type="password" required placeholder="كلمة المرور" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full px-3 py-2.5 border border-[#E3D9BF] rounded-xl outline-none focus:border-[#006C35]" />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button disabled={busy} className="btn-primary">{busy ? 'جارٍ الدخول…' : 'دخول'}</button>
          <button type="button" onClick={() => navigate('/')} className="w-full text-center text-sm text-gray-500 py-1">← رجوع للتطبيق</button>
        </form>
      </div>
    </div>
  )
}

const NAV = [
  { key: 'overview', label: 'نظرة عامة', icon: '📊' },
  { group: 'المستخدمون', items: [
    { key: 'users:admins', label: 'الإدارة', icon: '🛡️' },
    { key: 'users:experts', label: 'الفنيون', icon: '🧰' },
    { key: 'users:customers', label: 'العملاء', icon: '🧑‍💼' },
    { key: 'users:support', label: 'الدعم الفني', icon: '🎧' },
  ]},
  { group: 'الطلبات', items: [
    { key: 'requests:active', label: 'النشطة', icon: '🟢' },
    { key: 'requests:closed', label: 'المغلقة', icon: '⚪' },
  ]},
  { key: 'verifications', label: 'طلبات التوثيق', icon: '🪪' },
  { key: 'reports', label: 'التقارير', icon: '📈' },
  { key: 'commissions', label: 'تقرير العمولات', icon: '💰' },
  { key: 'categories', label: 'التصنيفات', icon: '🗂️' },
  { key: 'ads', label: 'الإعلانات', icon: '📣' },
  { key: 'invoices', label: 'الفواتير', icon: '🧾' },
  { key: 'payments', label: 'المدفوعات', icon: '💳' },
  { key: 'cities', label: 'طلبات المدن', icon: '📍' },
  { key: 'backup', label: 'النسخ الاحتياطي', icon: '💾' },
]

const TITLES = {
  overview: 'نظرة عامة', reports: 'التقارير', ads: 'الإعلانات', invoices: 'الفواتير',
  categories: 'التصنيفات', payments: 'المدفوعات', commissions: 'تقرير العمولات', verifications: 'طلبات التوثيق',
  cities: 'طلبات المدن', backup: 'النسخ الاحتياطي',
  'users:admins': 'المستخدمون — الإدارة', 'users:experts': 'المستخدمون — الفنيون',
  'users:customers': 'المستخدمون — العملاء', 'users:support': 'المستخدمون — الدعم الفني',
  'requests:active': 'الطلبات — النشطة', 'requests:closed': 'الطلبات — المغلقة',
}

function Stat({ label, value, accent }) {
  return (
    <div className="card-lux p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-extrabold mt-1 ${accent || 'text-[#006C35]'}`}>{value}</p>
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
      <Stat label="الفنيون" value={s.experts} />
      <Stat label="الإعلانات" value={s.ads} />
      <Stat label="الفواتير" value={s.invoices} />
      <Stat label="إجمالي الفواتير" value={`${s.invoices_total} ر.س`} />
      <Stat label="طلبات مدن جديدة" value={s.city_requests} accent="text-[#8a6d13]" />
    </div>
  )
}

function UserRow({ u, type, onChanged }) {
  const [edit, setEdit] = useState(false)
  const [form, setForm] = useState(u)
  const active = u.status !== 'suspended'

  const save = async () => {
    if (type === 'admins') await api(`/api/admin/admins/${u.id}`, { method: 'PATCH', body: { name: form.name } })
    else await api(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      body: { name: form.name, phone: form.phone, city: form.city, role: form.role, email: form.email },
    })
    setEdit(false)
    onChanged()
  }

  const toggle = async () => {
    const status = active ? 'suspended' : 'active'
    if (type === 'admins') await api(`/api/admin/admins/${u.id}`, { method: 'PATCH', body: { status } })
    else await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { status } })
    onChanged()
  }

  const remove = async () => {
    if (!confirm(`حذف ${u.name || u.email}؟`)) return
    try {
      if (type === 'admins') await api(`/api/admin/admins/${u.id}`, { method: 'DELETE' })
      else await api(`/api/admin/users/${u.id}`, { method: 'DELETE' })
      onChanged()
    } catch (e) {
      alert(e.message === 'last_admin' ? 'ما يمكن حذف آخر مدير' : 'تعذّر الحذف')
    }
  }

  return (
    <div className="card-lux p-3">
      {!edit ? (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-bold text-sm text-[#11221A] truncate">
                {u.name || u.email || u.phone || 'بدون اسم'}
                {u.online ? <span className="ms-2 text-green-500 text-xs">●</span> : null}
              </p>
              <p className="text-[11px] text-gray-500">
                {u.email || u.phone} {u.city ? `· ${u.city}` : ''}
              </p>
            </div>
            <span className={`text-[10px] px-2 py-1 rounded-full font-bold whitespace-nowrap ${active ? 'bg-[#E9F5EE] text-[#006C35]' : 'bg-red-50 text-red-500'}`}>
              {active ? 'مفعّل' : 'موقوف'}
            </span>
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={() => { setForm(u); setEdit(true) }} className="text-[11px] bg-[#FBF5E3] text-[#8a6d13] px-2.5 py-1 rounded-lg font-bold">تعديل</button>
            <button onClick={toggle} className="text-[11px] bg-[#E9F5EE] text-[#006C35] px-2.5 py-1 rounded-lg font-bold">
              {active ? 'إيقاف' : 'تفعيل'}
            </button>
            <button
              onClick={async () => {
                const pw = prompt('كلمة المرور الجديدة (٦ أحرف على الأقل):')
                if (!pw) return
                if (pw.length < 6) return alert('قصيرة جداً')
                try {
                  if (type === 'admins') await api(`/api/admin/admins/${u.id}`, { method: 'PATCH', body: { password: pw } })
                  else await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { password: pw } })
                  alert('تم تغيير كلمة المرور ✅')
                } catch { alert('تعذّر التغيير') }
              }}
              className="text-[11px] bg-[#FBF5E3] text-[#8a6d13] px-2.5 py-1 rounded-lg font-bold"
            >
              كلمة المرور
            </button>
            <button onClick={remove} className="text-[11px] bg-red-50 text-red-500 px-2.5 py-1 rounded-lg font-bold">حذف</button>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="الاسم" className="w-full px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-sm" />
          {type !== 'admins' && (
            <>
              <input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="الجوال" className="w-full px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-sm" />
              <input value={form.city || ''} onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="المدينة" className="w-full px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-sm" />
              <input value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="الإيميل" className="w-full px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-sm" />
              <select value={form.role || 'customer'} onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-sm bg-white">
                <option value="customer">عميل</option>
                <option value="expert">فني</option>
                <option value="support">دعم فني</option>
              </select>
            </>
          )}
          <div className="flex gap-2">
            <button onClick={save} className="flex-1 bg-[#006C35] text-white py-1.5 rounded-lg text-sm font-bold">حفظ</button>
            <button onClick={() => setEdit(false)} className="px-3 py-1.5 rounded-lg text-sm border border-gray-200">إلغاء</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Users({ type }) {
  const [rows, setRows] = useState([])
  const [addOpen, setAddOpen] = useState(false)
  const [nf, setNf] = useState({ email: '', password: '', name: '', phone: '', city: '' })
  const [err, setErr] = useState('')

  const load = () => {
    const path = type === 'admins' ? '/api/admin/admins' : `/api/admin/users?role=${type}`
    api(path).then(setRows).catch(() => {})
  }
  useEffect(load, [type])

  const addUser = async (e) => {
    e.preventDefault()
    setErr('')
    try {
      await api('/api/admin/users', { method: 'POST', body: { ...nf, role: type } })
      setAddOpen(false)
      setNf({ email: '', password: '', name: '', phone: '', city: '' })
      load()
    } catch (e2) {
      setErr(
        e2.message === 'phone_taken' ? 'الجوال مسجّل مسبقاً'
        : e2.message === 'phone_invalid' ? 'رقم جوال غير صحيح'
        : 'تعذّرت الإضافة',
      )
    }
  }

  const addAdmin = async (e) => {
    e.preventDefault()
    setErr('')
    try {
      await api('/api/admin/admins', { method: 'POST', body: nf })
      setAddOpen(false)
      setNf({ email: '', password: '', name: '' })
      load()
    } catch (e2) {
      setErr(e2.message === 'email_exists' ? 'الإيميل مستخدم' : 'تعذّر الإضافة')
    }
  }

  return (
    <div className="space-y-2">
      {type !== 'admins' && (
        <div className="mb-2">
          {!addOpen ? (
            <button onClick={() => setAddOpen(true)} className="btn-primary">
              + إضافة {type === 'customer' ? 'عميل' : type === 'expert' ? 'فني' : 'مستخدم'}
            </button>
          ) : (
            <form onSubmit={addUser} className="card-lux p-3 space-y-2">
              <input placeholder="الاسم" required value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })}
                className="w-full px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-sm" />
              <input placeholder="الجوال 05XXXXXXXX" required value={nf.phone} onChange={(e) => setNf({ ...nf, phone: e.target.value })}
                className="w-full px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-sm" />
              <input placeholder="المدينة" value={nf.city} onChange={(e) => setNf({ ...nf, city: e.target.value })}
                className="w-full px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-sm" />
              <input placeholder="كلمة المرور (اختياري)" value={nf.password} onChange={(e) => setNf({ ...nf, password: e.target.value })}
                className="w-full px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-sm" />
              {err && <p className="text-xs text-red-500">{err}</p>}
              <div className="flex gap-2">
                <button className="flex-1 bg-[#006C35] text-white py-1.5 rounded-lg text-sm font-bold">حفظ</button>
                <button type="button" onClick={() => setAddOpen(false)} className="px-3 py-1.5 rounded-lg text-sm border border-gray-200">إلغاء</button>
              </div>
            </form>
          )}
        </div>
      )}

      {type === 'admins' && (
        <div className="mb-2">
          {!addOpen ? (
            <button onClick={() => setAddOpen(true)} className="btn-primary">+ إضافة مدير</button>
          ) : (
            <form onSubmit={addAdmin} className="card-lux p-3 space-y-2">
              <input placeholder="الاسم" value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })}
                className="w-full px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-sm" />
              <input placeholder="الإيميل" type="email" required value={nf.email} onChange={(e) => setNf({ ...nf, email: e.target.value })}
                className="w-full px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-sm" />
              <input placeholder="كلمة المرور" type="text" required value={nf.password} onChange={(e) => setNf({ ...nf, password: e.target.value })}
                className="w-full px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-sm" />
              {err && <p className="text-xs text-red-500">{err}</p>}
              <div className="flex gap-2">
                <button className="flex-1 bg-[#006C35] text-white py-1.5 rounded-lg text-sm font-bold">حفظ</button>
                <button type="button" onClick={() => setAddOpen(false)} className="px-3 py-1.5 rounded-lg text-sm border border-gray-200">إلغاء</button>
              </div>
            </form>
          )}
        </div>
      )}

      {rows.map((u) => <UserRow key={u.id} u={u} type={type} onChanged={load} />)}
      {rows.length === 0 && <p className="text-sm text-gray-500">ما فيه بيانات.</p>}
    </div>
  )
}

function Requests({ scope }) {
  const [rows, setRows] = useState([])
  useEffect(() => {
    api(`/api/admin/requests?scope=${scope}`).then(setRows).catch(() => {})
  }, [scope])

  const statusAr = { open: 'مفتوح', assigned: 'مُسند', done: 'مكتمل', canceled: 'ملغي' }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">{rows.length} طلب</p>
      {rows.map((r) => (
        <div key={r.id} className="card-lux p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-bold text-sm text-[#11221A] truncate">{r.title}</p>
            <span className="text-[10px] px-2 py-1 rounded-full bg-gray-100 text-gray-600 whitespace-nowrap">
              {statusAr[r.status] || r.status}
            </span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            {r.owner_name || 'بدون اسم'} · {r.city || '—'} · {r.bids_count} سومة
            {r.lowest_bid ? ` · الأقل ${r.lowest_bid}` : ''}
          </p>
          <p className="text-[10px] text-gray-400 mt-1">{r.created_at}</p>
          {r.status === 'done' && (
            <button
              onClick={async () => {
                const reason = prompt('سبب الإغلاق الإداري (إلزامي — ١٠ أحرف على الأقل):')
                if (reason === null) return
                try {
                  await api(`/api/admin/requests/${r.id}/close`, { method: 'POST', body: { reason } })
                  alert('تم إغلاق الطلب')
                  api(`/api/admin/requests?scope=${scope}`).then(setRows).catch(() => {})
                } catch (e) {
                  alert(
                    e.message === 'reason_required' ? 'السبب مطلوب (١٠ أحرف على الأقل)'
                    : e.message === 'wait_period' ? 'لازم تمر ساعة من التنفيذ قبل الإغلاق الإداري'
                    : 'تعذّر الإغلاق',
                  )
                }
              }}
              className="mt-2 text-[11px] bg-[#11221A] text-white px-2.5 py-1 rounded-lg font-bold"
            >
              إغلاق إداري + سبب
            </button>
          )}
          {r.closed_by === 'admin' && r.close_reason && (
            <p className="text-[10px] text-[#8a6d13] mt-1">سبب الإغلاق: {r.close_reason}</p>
          )}
        </div>
      ))}
      {rows.length === 0 && <p className="text-sm text-gray-500">ما فيه طلبات.</p>}
    </div>
  )
}

function Reports() {
  const [r, setR] = useState(null)
  useEffect(() => { api('/api/admin/reports').then(setR).catch(() => {}) }, [])
  if (!r) return <p className="text-gray-500">جارٍ التحميل…</p>
  const max = Math.max(1, ...r.daily.map((d) => d.c))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="إجمالي الطلبات" value={r.totals.requests} />
        <Stat label="مكتملة" value={r.totals.done} />
        <Stat label="نشطة" value={r.totals.open} accent="text-[#8a6d13]" />
        <Stat label="متوسط السومة" value={`${r.totals.avg_bid} ر.س`} />
        <Stat label="الإيراد (فواتير)" value={`${r.totals.revenue} ر.س`} />
        <Stat label="الفنيون" value={r.totals.experts} />
        <Stat label="عمولة المنصة" value={`${r.totals.commission || 0} ر.س`} accent="text-[#8a6d13]" />
      </div>

      <div className="card-lux p-4">
        <p className="font-extrabold text-sm mb-3">آخر ١٤ يوم</p>
        <div className="flex items-end gap-1 h-24">
          {r.daily.map((d) => (
            <div key={d.d} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full bg-[#006C35] rounded-t" style={{ height: `${(d.c / max) * 80}px` }} />
              <span className="text-[8px] text-gray-400">{d.d.slice(5)}</span>
            </div>
          ))}
          {r.daily.length === 0 && <p className="text-xs text-gray-500">لا بيانات</p>}
        </div>
      </div>

      <div className="card-lux p-4">
        <p className="font-extrabold text-sm mb-2">حسب التخصص</p>
        {r.byCategory.map((c) => (
          <div key={c.category} className="flex items-center justify-between text-sm py-1">
            <span className="text-gray-700">{c.category}</span>
            <span className="text-gray-500">{c.c} طلب · {c.done} مكتمل</span>
          </div>
        ))}
        {r.byCategory.length === 0 && <p className="text-xs text-gray-500">لا بيانات</p>}
      </div>

      <div className="card-lux p-4">
        <p className="font-extrabold text-sm mb-2">أعلى المدن</p>
        {r.byCity.map((c) => (
          <div key={c.city} className="flex items-center justify-between text-sm py-1">
            <span className="text-gray-700">{c.city}</span>
            <span className="text-gray-500">{c.c}</span>
          </div>
        ))}
        {r.byCity.length === 0 && <p className="text-xs text-gray-500">لا بيانات</p>}
      </div>
    </div>
  )
}

function Ads() {
  const [ads, setAds] = useState([])
  const [form, setForm] = useState({ title: '', link: '', price: '', duration_days: 30, featured: true, starts_at: '', ends_at: '' })
  const [image, setImage] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = () => api('/api/admin/ads').then(setAds).catch(() => {})
  useEffect(() => { load() }, [])

  const upload = async (file) => {
    const fd = new FormData()
    fd.append('image', file)
    try {
      const r = await api('/api/admin/upload', { method: 'POST', form: fd })
      setImage(r.url)
    } catch { setErr('تعذّر رفع الصورة') }
  }

  const create = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      await api('/api/admin/ads', {
        method: 'POST',
        body: { ...form, price: form.price ? Number(form.price) : null, image },
      })
      setForm({ title: '', link: '', price: '', duration_days: 30, featured: true, starts_at: '', ends_at: '' })
      setImage('')
      load()
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
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
          <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            className="w-full text-sm mt-1" />
          {image && <img src={image} alt="preview" className="mt-2 h-24 rounded-lg object-cover" />}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" placeholder="السعر (ريال)" value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            className="px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm" />
          <input type="number" min="1" placeholder="المدة (أيام)" value={form.duration_days}
            onChange={(e) => setForm({ ...form, duration_days: e.target.value })}
            className="px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-gray-500">يبدأ (تاريخ ووقت)</label>
            <input type="datetime-local" value={form.starts_at}
              onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
              className="w-full mt-1 px-2 py-2 border border-[#E3D9BF] rounded-lg text-xs" />
          </div>
          <div>
            <label className="text-[11px] text-gray-500">ينتهي (تاريخ ووقت)</label>
            <input type="datetime-local" value={form.ends_at}
              onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
              className="w-full mt-1 px-2 py-2 border border-[#E3D9BF] rounded-lg text-xs" />
          </div>
        </div>
        <p className="text-[10px] text-gray-400 -mt-1">اتركهما فاضيين = يبدأ الآن وينتهي حسب المدة بالأيام</p>
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
            {ad.image ? <img src={ad.image} alt={ad.title} className="w-16 h-12 rounded-lg object-cover" /> : <div className="w-16 h-12 rounded-lg bg-gray-100" />}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-[#11221A] truncate">{ad.title}</p>
              <p className="text-[11px] text-gray-500">
                {ad.price ? `${ad.price} ر.س · ` : ''}
                {ad.starts_at?.slice(0, 10)} ← {ad.ends_at?.slice(0, 10)}{ad.featured ? ' · ★' : ''}
              </p>
              {(() => {
                const now = new Date().toISOString().slice(0, 16).replace('T', ' ')
                const st = ad.starts_at && ad.starts_at > now ? 'sched' : ad.ends_at && ad.ends_at < now ? 'ended' : 'live'
                const map = { sched: ['⏳ مجدول', 'bg-amber-50 text-amber-600'], ended: ['⏹ منتهي', 'bg-gray-100 text-gray-500'], live: ['● يعمل الآن', 'bg-[#E9F5EE] text-[#006C35]'] }
                const [txt, cls] = map[st]
                return <span className={`inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${cls}`}>{txt}</span>
              })()}
            </div>
            <button onClick={() => toggle(ad, 'active')} className={`text-[11px] px-2 py-1 rounded-lg ${ad.active ? 'bg-[#E9F5EE] text-[#006C35]' : 'bg-gray-100 text-gray-500'}`}>
              {ad.active ? 'مفعّل' : 'موقوف'}
            </button>
            <button onClick={() => remove(ad)} className="text-[11px] text-red-500 px-1">حذف</button>
          </div>
        ))}
        {ads.length === 0 && <p className="text-sm text-gray-500">ما فيه إعلانات بعد.</p>}
      </div>
    </div>
  )
}

function Categories() {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState({ key: '', ar: '', en: '', icon: '🛠️', image: '', parent_id: '', min_price: '' })
  const [editId, setEditId] = useState(null)
  const [err, setErr] = useState('')
  const load = () => api('/api/admin/categories').then(setRows).catch(() => {})
  useEffect(() => { load() }, [])

  const uploadImage = async (file) => {
    const fd = new FormData()
    fd.append('image', file)
    const r = await api('/api/admin/upload', { method: 'POST', form: fd })
    return r.url
  }

  const add = async (e) => {
    e.preventDefault()
    setErr('')
    try {
      await api('/api/admin/categories', { method: 'POST', body: form })
      setForm({ key: '', ar: '', en: '', icon: '🛠️', image: '', parent_id: '', min_price: '' })
      load()
    } catch (e2) { setErr(e2.message === 'key_exists' ? 'المفتاح مستخدم' : 'تعذّر الإضافة') }
  }

  const saveEdit = async (c) => {
    await api(`/api/admin/categories/${c.id}`, {
      method: 'PATCH',
      body: { ar: c.ar, en: c.en, icon: c.icon, image: c.image, min_price: c.min_price === '' ? null : Number(c.min_price) },
    })
    setEditId(null)
    load()
  }

  const toggle = async (c) => {
    await api(`/api/admin/categories/${c.id}`, { method: 'PATCH', body: { active: c.active ? 0 : 1 } })
    load()
  }
  const remove = async (c) => {
    if (!confirm(`حذف ${c.ar}؟`)) return
    await api(`/api/admin/categories/${c.id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="space-y-3">
      <form onSubmit={add} className="card-lux p-4 space-y-2">
        <div className="gold-bar absolute inset-x-0 top-0" />
        <p className="font-extrabold text-[#11221A] pt-1">إضافة قسم</p>
        <div className="grid grid-cols-2 gap-2">
          <input required placeholder="الاسم بالعربي" value={form.ar} onChange={(e) => setForm({ ...form, ar: e.target.value })}
            className="px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm" />
          <input required placeholder="المفتاح (EN)" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value.replace(/\s/g, '') })}
            className="px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm" />
        </div>
        <input placeholder="English name" value={form.en} onChange={(e) => setForm({ ...form, en: e.target.value })}
          className="w-full px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm" />
        <div>
          <label className="text-[11px] text-gray-500">تحت قسم (اختياري)</label>
          <select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
            className="w-full px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm bg-white">
            <option value="">— قسم رئيسي —</option>
            {rows.filter((r) => !r.parent_id).map((r) => (
              <option key={r.id} value={r.id}>{r.ar}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2 items-center">
          <input placeholder="أيقونة (إيموجي)" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })}
            className="px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm" />
          <label className="text-xs text-gray-600">
            صورة القسم
            <input type="file" accept="image/*" className="block w-full text-xs mt-1"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (f) setForm({ ...form, image: await uploadImage(f) })
              }} />
          </label>
        </div>
        <div>
          <label className="text-[11px] text-gray-500">أقل مبلغ يقدر يدفعه العميل (ر.س)</label>
          <input type="number" min="0" placeholder="مثال: 100" value={form.min_price}
            onChange={(e) => setForm({ ...form, min_price: e.target.value })}
            className="w-full mt-1 px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm" />
          <p className="text-[10px] text-gray-400 mt-1">إذا حطيت رقم، ما يقدر العميل ينشر طلب بأقل منه</p>
        </div>
        {form.image && <img src={form.image} alt="preview" className="h-16 rounded-lg object-cover" />}
        {err && <p className="text-xs text-red-500">{err}</p>}
        <button className="btn-primary">إضافة القسم</button>
      </form>

      {rows.map((c) => (
        <div key={c.id} className="card-lux p-3">
          {editId === c.id ? (
            <div className="space-y-2">
              <input value={c.ar} onChange={(e) => setRows((r) => r.map((x) => x.id === c.id ? { ...x, ar: e.target.value } : x))}
                className="w-full px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-sm" />
              <input value={c.en || ''} onChange={(e) => setRows((r) => r.map((x) => x.id === c.id ? { ...x, en: e.target.value } : x))}
                placeholder="English" className="w-full px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-sm" />
              <div>
                <label className="text-[11px] text-gray-500">أقل مبلغ (ر.س)</label>
                <input type="number" min="0" value={c.min_price ?? ''} placeholder="بدون حد"
                  onChange={(e) => setRows((r) => r.map((x) => x.id === c.id ? { ...x, min_price: e.target.value } : x))}
                  className="w-full mt-1 px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-sm" />
              </div>
              <div className="flex gap-2 items-center">
                <input value={c.icon || ''} onChange={(e) => setRows((r) => r.map((x) => x.id === c.id ? { ...x, icon: e.target.value } : x))}
                  className="w-20 px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-sm" />
                <label className="text-[11px] text-gray-600">
                  صورة
                  <input type="file" accept="image/*" className="block text-[11px]"
                    onChange={async (e) => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      const url = await uploadImage(f)
                      setRows((r) => r.map((x) => x.id === c.id ? { ...x, image: url } : x))
                    }} />
                </label>
                {c.image && <img src={c.image} alt="" className="w-10 h-10 rounded-lg object-cover" />}
              </div>
              <div className="flex gap-2">
                <button onClick={() => saveEdit(c)} className="flex-1 bg-[#006C35] text-white py-1.5 rounded-lg text-sm font-bold">حفظ</button>
                <button onClick={() => setEditId(null)} className="px-3 py-1.5 rounded-lg text-sm border border-gray-200">إلغاء</button>
              </div>
            </div>
          ) : (
            <div className={`flex items-center gap-3 ${c.parent_id ? 'ps-5' : ''}`}>
              {c.parent_id ? <span className="text-gray-400 text-xs">↳</span> : null}
              {c.image ? (
                <img src={c.image} alt={c.ar} className="w-12 h-12 rounded-lg object-cover" />
              ) : (
                <span className="text-2xl">{c.icon}</span>
              )}
              <div className="flex-1">
                <p className="font-bold text-sm text-[#11221A]">{c.ar}</p>
                <p className="text-[11px] text-gray-500">
                  {c.min_price ? `أقل مبلغ ${c.min_price} ر.س · ` : ''}
                  {c.key} · {c.en || '—'}
                  {c.parent_id ? ` · تابع لـ${rows.find((r) => r.id === c.parent_id)?.ar || ''}` : ''}
                </p>
              </div>
              <button onClick={() => setEditId(c.id)} className="text-[11px] bg-[#FBF5E3] text-[#8a6d13] px-2 py-1 rounded-lg font-bold">تعديل</button>
              <button onClick={() => toggle(c)} className={`text-[11px] px-2 py-1 rounded-lg font-bold ${c.active ? 'bg-[#E9F5EE] text-[#006C35]' : 'bg-gray-100 text-gray-500'}`}>
                {c.active ? 'إيقاف' : 'تفعيل'}
              </button>
              <button onClick={() => remove(c)} className="text-[11px] text-red-500 px-1">حذف</button>
            </div>
          )}
        </div>
      ))}
      {rows.length === 0 && <p className="text-sm text-gray-500">ما فيه تصنيفات.</p>}
    </div>
  )
}

function Payments() {
  const [rows, setRows] = useState([])
  useEffect(() => { api('/api/admin/payments').then(setRows).catch(() => {}) }, [])
  const label = { cash: 'كاش', card: 'بطاقة', urpay: 'urpay' }
  const statusAr = { paid: 'مدفوع', pending_cash: 'عند الاستلام' }
  return (
    <div className="space-y-2">
      {rows.map((p) => (
        <div key={p.id} className="card-lux p-3 flex items-center justify-between">
          <div>
            <p className="font-bold text-sm text-[#11221A]">{label[p.method] || p.method} · {p.amount} ر.س</p>
            <p className="text-[11px] text-gray-500">{p.request_title} · {p.owner_name}{p.phone ? ` · ${p.phone}` : ''}</p>
            <p className="text-[10px] text-gray-400">{p.created_at}</p>
          </div>
          <span className={`text-[10px] px-2 py-1 rounded-full ${p.status === 'paid' ? 'bg-[#E9F5EE] text-[#006C35]' : 'bg-[#FBF5E3] text-[#8a6d13]'}`}>
            {statusAr[p.status] || p.status}
          </span>
        </div>
      ))}
      {rows.length === 0 && <p className="text-sm text-gray-500">ما فيه مدفوعات بعد.</p>}
    </div>
  )
}

function Verifications() {
  const [rows, setRows] = useState([])
  const [tab, setTab] = useState('pending')
  const load = (st) => api(`/api/admin/verifications?status=${st}`).then(setRows).catch(() => {})
  useEffect(() => { load(tab) }, [tab])

  const act = async (id, status) => {
    const note = status === 'rejected' ? prompt('سبب الرفض (اختياري)') || null : null
    await api(`/api/admin/verifications/${id}`, { method: 'PATCH', body: { status, note } })
    load(tab)
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {[['pending', 'قيد المراجعة'], ['approved', 'موثّقون'], ['rejected', 'مرفوضون']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === k ? 'bg-[#006C35] text-white' : 'bg-white border border-[#E3D9BF] text-gray-600'}`}>
            {l}
          </button>
        ))}
      </div>

      {rows.filter((r) => (r.verify_status || 'approved') === tab).map((e) => (
        <div key={e.id} className="card-lux p-3 space-y-2">
          <div className="flex items-start gap-3">
            {e.iqama_image && (
              <a href={e.iqama_image} target="_blank" rel="noreferrer">
                <img src={e.iqama_image} alt="iqama" className="w-24 h-16 object-cover rounded-lg border border-[#EADFC8]" />
              </a>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-[#11221A]">{e.name_ar || e.name}</p>
              <p className="text-[11px] text-gray-500">{e.job} · {e.city || '—'}</p>
              {e.iqama_number && (
                <p className="text-[11px] text-gray-500 mt-1">
                  إقامة: {e.iqama_number} · {e.nationality || '—'} · {e.profession || '—'}
                </p>
              )}
            </div>
          </div>
          {tab === 'pending' && (
            <div className="flex gap-2">
              <button onClick={() => act(e.id, 'approved')} className="flex-1 bg-[#006C35] text-white py-2 rounded-lg text-xs font-bold">موافقة وتفعيل</button>
              <button onClick={() => act(e.id, 'rejected')} className="flex-1 bg-red-50 text-red-500 py-2 rounded-lg text-xs font-bold">رفض</button>
            </div>
          )}
        </div>
      ))}
      {rows.filter((r) => (r.verify_status || 'approved') === tab).length === 0 && (
        <p className="text-sm text-gray-500">لا يوجد طلبات في هذا القسم.</p>
      )}
    </div>
  )
}

function Commissions() {
  const [d, setD] = useState(null)
  useEffect(() => { api('/api/admin/commissions').then(setD).catch(() => {}) }, [])
  if (!d) return <p className="text-gray-500">جارٍ التحميل…</p>
  const t = d.totals
  return (
    <div className="space-y-3">
      <div className="card-lux p-4 bg-gradient-to-br from-[#006C35] to-[#004d26] text-white">
        <p className="text-xs text-white/70">إجمالي العمولات المحصّلة</p>
        <p className="text-3xl font-extrabold mt-1">{t.commission} <span className="text-lg">ر.س</span></p>
        <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] text-white/85">
          <p>على العملاء: {t.customer_fees} ر.س</p>
          <p>على الفنيين: {t.expert_fees} ر.س</p>
          <p>عدد الفواتير: {t.count}</p>
          <p>صافي الفنيين: {t.net} ر.س</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="إجمالي المدفوع" value={`${t.total_paid} ر.س`} />
        <Stat label="قيمة الخدمات" value={`${t.amount} ر.س`} />
      </div>

      <div className="card-lux p-4">
        <p className="font-extrabold text-sm mb-2">حسب الشهر</p>
        {d.byMonth.map((m) => (
          <div key={m.m} className="flex items-center justify-between text-sm py-1">
            <span className="text-gray-700">{m.m}</span>
            <span className="text-[#8a6d13] font-bold">{m.commission} ر.س · {m.c} فاتورة</span>
          </div>
        ))}
        {d.byMonth.length === 0 && <p className="text-xs text-gray-500">لا فواتير بعد.</p>}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-extrabold text-[#11221A]">تفصيل الفواتير</p>
        {d.rows.map((r) => (
          <div key={r.id} className="card-lux p-3">
            <div className="flex items-center justify-between">
              <p className="font-bold text-sm text-[#11221A]">{r.number}</p>
              <span className="chip-gold">{r.commission} ر.س</span>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">{r.request_title} · {r.owner_name} · {r.issued_at?.slice(0, 10)}</p>
            <p className="text-[10px] text-gray-400 mt-1">
              قيمة {r.amount} · مدفوع {r.total_paid} · عميل {r.customer_fee} · فني {r.expert_fee} · صافي {r.net}
            </p>
          </div>
        ))}
        {d.rows.length === 0 && <p className="text-sm text-gray-500">ما فيه فواتير.</p>}
      </div>
    </div>
  )
}

function CommissionBox() {
  const [c, setC] = useState('')
  const [e, setE] = useState('')
  const [demo, setDemo] = useState(false)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    api('/api/admin/settings').then((d) => {
      setC(String(d.commission_customer))
      setE(String(d.commission_expert))
      setDemo(!!d.demo_auto_accept)
    }).catch(() => {})
  }, [])
  const save = async () => {
    await api('/api/admin/settings', {
      method: 'PATCH',
      body: { commission_customer: Number(c), commission_expert: Number(e) },
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }
  return (
    <div className="card-lux p-4 space-y-2">
      <p className="font-extrabold text-sm text-[#11221A]">💰 العمولة (تُقسّم على الطرفين)</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-gray-500">على العميل %</label>
          <input type="number" step="0.5" min="0" max="30" value={c} onChange={(ev) => setC(ev.target.value)}
            className="w-full px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm" />
        </div>
        <div>
          <label className="text-[11px] text-gray-500">على الفني %</label>
          <input type="number" step="0.5" min="0" max="30" value={e} onChange={(ev) => setE(ev.target.value)}
            className="w-full px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm" />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-gray-500">الإجمالي: {Number(c || 0) + Number(e || 0)}%</p>
        <button onClick={save} className="bg-[#006C35] text-white text-xs font-bold px-3 py-2 rounded-lg">حفظ</button>
      </div>
      <div className="border-t border-dashed border-[#EADFC8] pt-2 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-[#11221A]">🤖 وضع العرض (بوت يقبل الطلب)</p>
          <p className="text-[10px] text-gray-500">طلبات التكييف تُقبل تلقائياً بأقل سومة وتصدر فاتورتها</p>
        </div>
        <button onClick={toggleDemo}
          className={`w-12 h-7 rounded-full relative transition ${demo ? 'bg-[#006C35]' : 'bg-gray-300'}`}>
          <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-all ${demo ? 'start-0.5' : 'end-0.5'}`} />
        </button>
      </div>
      {saved && <p className="text-[11px] text-[#006C35] font-bold">تم الحفظ ✅</p>}
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
          <div className="text-end">
            <span className="chip-gold">{i.amount} ر.س</span>
            {i.commission ? (
              <p className="text-[10px] text-gray-500 mt-1">
                عمولة {i.commission} · صافي {i.net}{i.total_paid ? ` · مدفوع ${i.total_paid}` : ''}
              </p>
            ) : null}
          </div>
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
          ) : <span className="text-[11px] text-gray-400">مكتمل</span>}
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
      const res = await fetch('/api/admin/backup', { headers: { authorization: `Bearer ${getToken()}` } })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mihnati-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setMsg('تم تنزيل النسخة ✅')
    } catch { setMsg('تعذّر التنزيل') } finally { setBusy(false) }
  }

  const restore = async (file) => {
    setBusy(true); setMsg('')
    try {
      const payload = JSON.parse(await file.text())
      await api('/api/admin/restore', { method: 'POST', body: payload })
      setMsg('تمت الاستعادة ✅ حدّث الصفحة')
    } catch { setMsg('الملف غير صالح') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-3">
      <div className="card-lux p-4">
        <p className="font-extrabold text-[#11221A] mb-1">💾 نسخة احتياطية</p>
        <p className="text-xs text-gray-500 mb-3">نزّل نسخة من كل البيانات قبل أي نشر، واستعدها بعد النشر.</p>
        <button onClick={download} disabled={busy} className="btn-primary">تنزيل النسخة</button>
      </div>
      <div className="card-lux p-4">
        <p className="font-extrabold text-[#11221A] mb-2">استعادة</p>
        <input type="file" accept="application/json" onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} className="text-sm w-full" />
      </div>
      {msg && <p className="text-sm text-[#006C35] font-bold">{msg}</p>}
    </div>
  )
}

function Shell({ onLogout }) {
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState('overview')
  const navigate = useNavigate()

  const renderSection = () => {
    if (section.startsWith('users:')) return <Users type={section.split(':')[1]} />
    if (section.startsWith('requests:')) return <Requests scope={section.split(':')[1]} />
    switch (section) {
      case 'overview': return (<><Overview /><div className="mt-4"><CommissionBox /></div></>)
      case 'reports': return <Reports />
      case 'ads': return <Ads />
      case 'invoices': return <Invoices />
      case 'categories': return <Categories />
      case 'commissions': return <Commissions />
      case 'verifications': return <Verifications />
      case 'payments': return <Payments />
      case 'cities': return <CityRequests />
      case 'backup': return <Backup />
      default: return null
    }
  }

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
          <aside onClick={(e) => e.stopPropagation()} className="absolute inset-y-0 start-0 w-72 bg-white shadow-2xl p-4 flex flex-col overflow-y-auto">
            <div className="flex items-center gap-2 mb-6">
              <span className="w-10 h-10 rounded-xl bg-[#006C35] text-white grid place-items-center font-extrabold">م</span>
              <div>
                <p className="font-extrabold text-[#11221A]">مهنتي</p>
                <p className="text-[11px] text-gray-500">الإدارة</p>
              </div>
            </div>

            <nav className="space-y-1 flex-1">
              {NAV.map((item) =>
                item.group ? (
                  <div key={item.group} className="pt-2">
                    <p className="px-3 py-1 text-[11px] font-bold text-gray-400">{item.group}</p>
                    {item.items.map((s) => (
                      <button key={s.key} onClick={() => { setSection(s.key); setOpen(false) }}
                        className={`w-full text-start px-6 py-2 rounded-xl text-sm font-semibold ${section === s.key ? 'bg-[#E9F5EE] text-[#006C35]' : 'text-gray-600 hover:bg-gray-50'}`}>
                        <span className="me-2">{s.icon}</span>{s.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button key={item.key} onClick={() => { setSection(item.key); setOpen(false) }}
                    className={`w-full text-start px-3 py-2.5 rounded-xl text-sm font-semibold ${section === item.key ? 'bg-[#E9F5EE] text-[#006C35]' : 'text-gray-600 hover:bg-gray-50'}`}>
                    <span className="me-2">{item.icon}</span>{item.label}
                  </button>
                ),
              )}
            </nav>

            <button onClick={onLogout} className="text-sm text-red-500 py-2 font-semibold">تسجيل الخروج</button>
          </aside>
        </div>
      )}

      <main className="p-4 pb-16 max-w-3xl mx-auto">
        <h2 className="text-lg font-extrabold text-[#11221A] mb-3">{TITLES[section]}</h2>
        {renderSection()}
      </main>
    </div>
  )
}

export default function Admin() {
  const [authed, setAuthed] = useState(!!getToken())
  if (!authed) return <Login onDone={() => setAuthed(true)} />
  return <Shell onLogout={() => { localStorage.removeItem(TOKEN_KEY); setAuthed(false) }} />
}
