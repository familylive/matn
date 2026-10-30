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
          <img src="/logo.png" alt="مهنتي" className="w-20 h-20 object-contain mx-auto" />
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
  { group: 'إعدادات الموقع', icon: '⚙️', items: [
    { key: 'site', label: 'الإعدادات الرئيسية', icon: '🏠' },
    { key: 'tech', label: 'الإعدادات الفنية', icon: '🧩' },
    { sub: 'القسم المالي', icon: '💰', items: [
      { key: 'gateways', label: 'بوابات الدفع', icon: '💳' },
      { key: 'bank', label: 'الدفع كاش / الحساب البنكي', icon: '🏦' },
      { key: 'finance', label: 'المالية والمحافظ', icon: '📈' },
      { key: 'finance_reports', label: 'التقارير المالية للمحاسب', icon: '🧮' },
    ]},
  ]},
  { group: 'المستخدمون', icon: '👥', items: [
    { key: 'users:ceo', label: 'المدير التنفيذي', icon: '👑' },
    { key: 'users:finance', label: 'المشرف المالي', icon: '💰' },
    { key: 'users:support', label: 'الدعم الفني', icon: '🎧' },
    { key: 'users:admin', label: 'المشرفون', icon: '🛡️' },
    { key: 'users:experts', label: 'الفنيون', icon: '🧰' },
    { key: 'users:customers', label: 'العملاء', icon: '🧑‍💼' },
    { key: 'blocked', label: 'الأرقام المحجوبة', icon: '🚫' },
  ]},
  { group: 'الطلبات', icon: '📋', items: [
    { key: 'requests:active', label: 'النشطة', icon: '🟢' },
    { key: 'requests:closed', label: 'المغلقة', icon: '⚪' },
  ]},
  { key: 'verifications', label: 'طلبات التوثيق', icon: '🪪' },
  { key: 'loyalty', label: 'نادي الولاء', icon: '👑' },
  { key: 'reports', label: 'التقارير', icon: '📈' },
  { key: 'commissions', label: 'تقرير العمولات', icon: '💵' },
  { key: 'categories', label: 'التصنيفات', icon: '🗂️' },
  { key: 'ads', label: 'الإعلانات', icon: '📣' },
  { key: 'invoices', label: 'الفواتير', icon: '🧾' },
  { key: 'payments', label: 'المدفوعات', icon: '💳' },
  { key: 'cities', label: 'طلبات المدن', icon: '📍' },
  { key: 'backup', label: 'النسخ الاحتياطي', icon: '💾' },
]

const TITLES = {
  site: 'إعدادات الموقع الرئيسية', tech: 'الإعدادات الفنية', gateways: 'بوابات الدفع',
  bank: 'الدفع كاش / الحساب البنكي', finance_reports: 'التقارير المالية للمحاسب', blocked: 'الأرقام المحجوبة',
  'users:ceo': 'المدير التنفيذي', 'users:finance': 'المشرف المالي', 'users:support': 'الدعم الفني',
  'users:admin': 'المشرفون',
  overview: 'نظرة عامة', reports: 'التقارير', ads: 'الإعلانات', invoices: 'الفواتير',
  categories: 'التصنيفات', payments: 'المدفوعات', commissions: 'تقرير العمولات', verifications: 'طلبات التوثيق', finance: 'المالية والمحافظ', loyalty: 'نادي الولاء',
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
  const [sums, setSums] = useState(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    api('/api/admin/overview').then(setS).catch(() => {})
    api('/api/admin/commission-sums').then(setSums).catch(() => {})
  }, [])
  if (!s) return <p className="text-gray-500">جارٍ التحميل…</p>
  const money = (n) =>
    `${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`
  return (
    <>
    <button
      onClick={() => setOpen((v) => !v)}
      className="w-full card-lux p-4 mb-3 text-start active:scale-[.995] transition"
    >
      <div className="gold-bar absolute inset-x-0 top-0" />
      <div className="flex items-center justify-between pt-1">
        <div>
          <p className="text-[11px] font-bold text-[#8a6d13]">💵 عمولة المنصة</p>
          <p className="text-2xl font-extrabold text-[#006C35] mt-1">
            {sums ? money(sums.all.commission) : '—'}
          </p>
          <p className="text-[10px] text-gray-500 mt-1">
            من {sums?.all.c || 0} فاتورة · إجمالي المحصّل {sums ? money(sums.all.paid) : '—'}
          </p>
        </div>
        <span className={`text-xl text-[#8a6d13] transition ${open ? 'rotate-180' : ''}`}>⌄</span>
      </div>
    </button>

    {open && sums && (
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[
          ['اليوم', sums.today],
          ['آخر ٧ أيام', sums.week],
          ['هذا الشهر', sums.month],
          ['هذه السنة', sums.year],
          ['الإجمالي', sums.all],
        ].map(([label, v]) => (
          <div key={label} className="card-lux p-3">
            <p className="text-[10px] text-gray-500">{label}</p>
            <p className="text-base font-extrabold text-[#11221A] mt-0.5">{money(v.commission)}</p>
            <p className="text-[10px] text-gray-400">{v.c} فاتورة</p>
          </div>
        ))}
      </div>
    )}

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
    </>
  )
}

const ADMIN_TYPES = ['admins', 'ceo', 'finance', 'support', 'admin']
function UserRow({ u, type, onChanged }) {
  const isAdminRow = ADMIN_TYPES.includes(type)
  const [edit, setEdit] = useState(false)
  const [form, setForm] = useState(u)
  const active = u.status !== 'suspended'

  const save = async () => {
    if (isAdminRow) await api(`/api/admin/admins/${u.id}`, { method: 'PATCH', body: { name: form.name, role: form.role } })
    else await api(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      body: { name: form.name, phone: form.phone, city: form.city, role: form.role, email: form.email },
    })
    setEdit(false)
    onChanged()
  }

  const toggle = async () => {
    const status = active ? 'suspended' : 'active'
    if (isAdminRow) await api(`/api/admin/admins/${u.id}`, { method: 'PATCH', body: { status } })
    else await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { status } })
    onChanged()
  }

  const remove = async () => {
    if (!confirm(`حذف ${u.name || u.email}؟`)) return
    try {
      if (isAdminRow) await api(`/api/admin/admins/${u.id}`, { method: 'DELETE' })
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
              {u.violations > 0 && (
                <span className={`inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${u.violations >= 5 ? 'bg-red-100 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                  ⚠️ {u.violations} مخالفة
                </span>
              )}
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
                  if (isAdminRow) await api(`/api/admin/admins/${u.id}`, { method: 'PATCH', body: { password: pw } })
                  else await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { password: pw } })
                  alert('تم تغيير كلمة المرور ✅')
                } catch { alert('تعذّر التغيير') }
              }}
              className="text-[11px] bg-[#FBF5E3] text-[#8a6d13] px-2.5 py-1 rounded-lg font-bold"
            >
              كلمة المرور
            </button>
            {!isAdminRow && u.phone && (
              <button
                onClick={async () => {
                  const reason = prompt(`حجب الجوال ${u.phone}؟ اكتب السبب (اختياري):`)
                  if (reason === null) return
                  try {
                    await api('/api/admin/blocked-phones', { method: 'POST', body: { phone: u.phone, reason } })
                    alert('تم حجب الرقم وإيقاف الحساب 🚫')
                    onChanged()
                  } catch { alert('تعذّر الحجب') }
                }}
                className="text-[11px] bg-[#11221A] text-white px-2.5 py-1 rounded-lg font-bold"
              >
                🚫 حجب الجوال
              </button>
            )}
            <button onClick={remove} className="text-[11px] bg-red-50 text-red-500 px-2.5 py-1 rounded-lg font-bold">حذف</button>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="الاسم" className="w-full px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-sm" />
          {isAdminRow && (
            <input value={form.role || 'admin'} onChange={(e) => setForm({ ...form, role: e.target.value })}
              placeholder="الدور" className="w-full px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-sm" />
          )}
          {!isAdminRow && (
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


/* ---------- إعدادات الموقع ---------- */
function useSiteSettings() {
  const [d, setD] = useState(null)
  const [msg, setMsg] = useState('')
  const load = () => api('/api/admin/site-settings').then(setD).catch(() => {})
  useEffect(() => { load() }, [])
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }))
  const save = async () => {
    try {
      await api('/api/admin/site-settings', { method: 'PATCH', body: d })
      setMsg('✅ تم الحفظ')
      setTimeout(() => setMsg(''), 2500)
    } catch { setMsg('تعذّر الحفظ') }
  }
  return { d, set, save, msg }
}

const Fld = ({ label, children, hint }) => (
  <div>
    <label className="text-[11px] font-bold text-gray-600">{label}</label>
    {children}
    {hint && <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>}
  </div>
)
const inp = 'w-full mt-1 px-3 py-2 border border-[#E3D9BF] rounded-xl text-sm bg-white'

function SiteSettings() {
  const { d, set, save, msg } = useSiteSettings()
  if (!d) return <p className="text-gray-500">جارٍ التحميل…</p>
  return (
    <div className="space-y-3">
      <div className="card-lux p-4 space-y-3">
        <Fld label="اسم الموقع"><input className={inp} value={d.site_name} onChange={(e) => set('site_name', e.target.value)} /></Fld>
        <Fld label="إيميل الموقع"><input className={inp} dir="ltr" value={d.site_email} onChange={(e) => set('site_email', e.target.value)} /></Fld>
        <Fld label="رقم الدعم الفني"><input className={inp} dir="ltr" value={d.support_phone} onChange={(e) => set('support_phone', e.target.value)} /></Fld>
        <Fld label="واتساب الدعم"><input className={inp} dir="ltr" value={d.support_whatsapp} onChange={(e) => set('support_whatsapp', e.target.value)} /></Fld>
        <Fld label="رابط الموقع"><input className={inp} dir="ltr" value={d.site_url} onChange={(e) => set('site_url', e.target.value)} /></Fld>
      </div>
      {msg && <p className="text-[11px] font-bold text-[#006C35]">{msg}</p>}
      <button onClick={save} className="btn-primary">حفظ إعدادات الموقع</button>
    </div>
  )
}

function TechSettings() {
  const { d, set, save, msg } = useSiteSettings()
  if (!d) return <p className="text-gray-500">جارٍ التحميل…</p>
  const Toggle = ({ k, label, hint }) => (
    <button onClick={() => set(k, d[k] === '1' ? '0' : '1')} className="card-lux w-full p-3 flex items-center justify-between text-start">
      <div>
        <p className="font-bold text-[13px] text-[#11221A]">{label}</p>
        {hint && <p className="text-[10px] text-gray-500">{hint}</p>}
      </div>
      <span className={`w-11 h-6 rounded-full flex items-center px-0.5 ${d[k] === '1' ? 'bg-[#006C35] justify-end' : 'bg-gray-300 justify-start'}`}>
        <span className="block w-5 h-5 rounded-full bg-white shadow" />
      </span>
    </button>
  )
  return (
    <div className="space-y-2">
      <Toggle k="otp_enabled" label="دخول برمز الجوال (OTP)" hint="إيقافه يمنع الدخول بالرمز" />
      <Toggle k="signup_open" label="فتح التسجيل الجديد" hint="إيقافه يمنع إنشاء حسابات جديدة" />
      <Toggle k="maintenance" label="وضع الصيانة" hint="يظهر إشعار صيانة في التطبيق" />
      <div className="card-lux p-4 space-y-3">
        <Fld label="مدة المزاد (ثانية)"><input type="number" className={inp} value={d.auction_seconds} onChange={(e) => set('auction_seconds', e.target.value)} /></Fld>
        <Fld label="مهلة اختيار الفني (ثانية)" hint="بعد انتهاء المزاد"><input type="number" className={inp} value={d.grace_seconds} onChange={(e) => set('grace_seconds', e.target.value)} /></Fld>
      </div>
      {msg && <p className="text-[11px] font-bold text-[#006C35]">{msg}</p>}
      <button onClick={save} className="btn-primary">حفظ الإعدادات الفنية</button>
    </div>
  )
}

function Gateways() {
  const { d, set, save, msg } = useSiteSettings()
  if (!d) return <p className="text-gray-500">جارٍ التحميل…</p>
  const rows = [
    ['pay_cash', '💵 الدفع كاش عند الاستلام'],
    ['pay_card', '💳 البطاقة (مدى / فيزا)'],
    ['pay_stcpay', '📲 STC Pay'],
    ['pay_urpay', '📱 urpay'],
  ]
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-gray-500">فعّل أو أوقف كل وسيلة دفع — الموقوفة تختفي من صفحة الدفع.</p>
      {rows.map(([k, label]) => (
        <button key={k} onClick={() => set(k, d[k] === '1' ? '0' : '1')} className="card-lux w-full p-3 flex items-center justify-between">
          <span className="font-bold text-[13px] text-[#11221A]">{label}</span>
          <span className={`text-[10px] font-extrabold px-2 py-1 rounded-full ${d[k] === '1' ? 'bg-[#EAF4EE] text-[#006C35]' : 'bg-gray-100 text-gray-500'}`}>
            {d[k] === '1' ? 'مفعّل' : 'موقوف'}
          </span>
        </button>
      ))}
      {msg && <p className="text-[11px] font-bold text-[#006C35]">{msg}</p>}
      <button onClick={save} className="btn-primary">حفظ البوابات</button>
    </div>
  )
}

function BankSettings() {
  const { d, set, save, msg } = useSiteSettings()
  if (!d) return <p className="text-gray-500">جارٍ التحميل…</p>
  return (
    <div className="space-y-3">
      <div className="card-lux p-4 space-y-3">
        <p className="font-extrabold text-sm text-[#11221A]">🏦 حساب المنصة للتحويلات</p>
        <Fld label="اسم البنك"><input className={inp} value={d.bank_name} onChange={(e) => set('bank_name', e.target.value)} placeholder="مثال: مصرف الراجحي" /></Fld>
        <Fld label="رقم الآيبان"><input className={inp} dir="ltr" value={d.bank_iban} onChange={(e) => set('bank_iban', e.target.value.toUpperCase())} placeholder="SA0000000000000000000000" /></Fld>
        <Fld label="اسم المستفيد"><input className={inp} value={d.bank_account_name} onChange={(e) => set('bank_account_name', e.target.value)} /></Fld>
        <p className="text-[10px] text-gray-500">تظهر هذه البيانات للعميل عند اختيار الدفع كاش/تحويل.</p>
      </div>
      {msg && <p className="text-[11px] font-bold text-[#006C35]">{msg}</p>}
      <button onClick={save} className="btn-primary">حفظ بيانات الحساب</button>
    </div>
  )
}

function FinanceReports() {
  const open = (t) => window.open(`/admin/finance/report?type=${t}`, '_blank')
  return (
    <div className="space-y-3">
      <div className="card-lux p-4 space-y-2">
        <p className="font-extrabold text-sm text-[#11221A]">🧮 تقارير المحاسب المالي</p>
        <p className="text-[11px] text-gray-500">كل تقرير يفتح صفحة قابلة للطباعة/PDF فيها شعار الموقع ورقم التقرير وأرقام الفنيين.</p>
        <div className="grid grid-cols-2 gap-2 pt-1">
          {[['daily', 'تقرير يومي'], ['weekly', 'تقرير أسبوعي'], ['monthly', 'تقرير شهري'], ['yearly', 'تقرير سنوي']].map(([k, l]) => (
            <button key={k} onClick={() => open(k)} className="bg-[#006C35] text-white py-2.5 rounded-xl text-xs font-bold">🖨️ {l}</button>
          ))}
        </div>
      </div>
      <div className="card-lux p-4">
        <p className="font-extrabold text-sm text-[#11221A]">🔁 تحويلات الفنيين (أسبوعية)</p>
        <p className="text-[11px] text-gray-500 mt-1">جدول السبت → الجمعة مع زر تحويل لكل فني موجود في «المالية والمحافظ».</p>
        <p className="text-[10px] text-[#8a6d13] mt-1">يبقى مستحق الفني محجوزاً 7 أيام بعد إكمال الطلب قبل أن يصبح قابلاً للتحويل.</p>
      </div>
    </div>
  )
}

function Blocked() {
  const [rows, setRows] = useState([])
  const [phone, setPhone] = useState('')
  const [reason, setReason] = useState('')
  const load = () => api('/api/admin/blocked-phones').then(setRows).catch(() => {})
  useEffect(load, [])
  const add = async () => {
    try {
      await api('/api/admin/blocked-phones', { method: 'POST', body: { phone, reason } })
      setPhone(''); setReason(''); load()
    } catch { alert('رقم غير صحيح') }
  }
  return (
    <div className="space-y-2">
      <div className="card-lux p-3 space-y-2">
        <p className="text-[11px] font-bold text-gray-600">حجب رقم جوال (يمنع التسجيل والدخول بهذا الرقم)</p>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05XXXXXXXX" dir="ltr" className={inp} />
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="السبب (اختياري)" className={inp} />
        <button onClick={add} className="btn-primary">🚫 حجب الرقم</button>
      </div>
      {rows.map((r) => (
        <div key={r.phone} className="card-lux p-3 flex items-center justify-between gap-2">
          <div>
            <p className="font-bold text-sm" dir="ltr">{r.phone}</p>
            <p className="text-[10px] text-gray-500">{r.reason || 'بدون سبب'} · {String(r.created_at).slice(0, 16)}</p>
          </div>
          <button onClick={async () => { await api(`/api/admin/blocked-phones/${encodeURIComponent(r.phone)}`, { method: 'DELETE' }); load() }}
            className="text-[11px] font-bold text-red-500 bg-red-50 px-2.5 py-1 rounded-lg">رفع الحجب</button>
        </div>
      ))}
      {rows.length === 0 && <p className="text-sm text-gray-500">ما فيه أرقام محجوبة.</p>}
    </div>
  )
}

function Users({ type }) {
  const [rows, setRows] = useState([])
  const [addOpen, setAddOpen] = useState(false)
  const [nf, setNf] = useState({ email: '', password: '', name: '', phone: '', city: '' })
  const [err, setErr] = useState('')

  const roleKey = type === 'customers' ? 'customer' : type === 'experts' ? 'expert' : type
  const isAdminType = ['ceo', 'finance', 'support', 'admin', 'admins'].includes(type)
  const load = () => {
    const path = isAdminType
      ? `/api/admin/admins${type === 'admins' ? '' : `?role=${type}`}`
      : `/api/admin/users?role=${roleKey}`
    api(path).then(setRows).catch(() => {})
  }
  useEffect(load, [type])

  const addUser = async (e) => {
    e.preventDefault()
    setErr('')
    try {
      if (isAdminType) {
        await api('/api/admin/admins', { method: 'POST', body: { ...nf, role: type === 'admins' ? 'admin' : type } })
      } else {
        await api('/api/admin/users', { method: 'POST', body: { ...nf, role: roleKey } })
      }
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
      await api('/api/admin/admins', { method: 'POST', body: { ...nf, role: isAdminType && type !== 'admins' ? type : 'admin' } })
      setAddOpen(false)
      setNf({ email: '', password: '', name: '' })
      load()
    } catch (e2) {
      setErr(e2.message === 'email_exists' ? 'الإيميل مستخدم' : 'تعذّر الإضافة')
    }
  }

  return (
    <div className="space-y-2">
      {!isAdminType && (
        <div className="mb-2">
          {!addOpen ? (
            <button onClick={() => setAddOpen(true)} className="btn-primary">
              + إضافة {roleKey === 'customer' ? 'عميل' : roleKey === 'expert' ? 'فني' : 'مستخدم'}
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

      {isAdminType && (
        <div className="mb-2">
          {!addOpen ? (
            <button onClick={() => setAddOpen(true)} className="btn-primary">
              + إضافة {{ ceo: 'مدير تنفيذي', finance: 'مشرف مالي', support: 'دعم فني', admin: 'مشرف' }[type] || 'مدير'}
            </button>
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


// ضغط الصورة قبل الرفع (صور الجوال كبيرة وتفشل الرفع)
async function compressImage(file, maxW = 1600, quality = 0.85) {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxW / bitmap.width)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality))
    return blob ? new File([blob], 'img.jpg', { type: 'image/jpeg' }) : file
  } catch {
    return file
  }
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
    setErr('')
    try {
      const small = await compressImage(file)
      const fd = new FormData()
      fd.append('image', small)
      const r = await api('/api/admin/upload', { method: 'POST', form: fd })
      setImage(r.url)
    } catch (e) {
      setErr('تعذّر رفع الصورة — جرّب صورة أصغر')
    }
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
            <label className="text-[11px] text-[#8a6d13] bg-[#FBF5E3] px-2 py-1 rounded-lg font-bold cursor-pointer whitespace-nowrap">
              صورة
              <input type="file" accept="image/*" className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  try {
                    const small = await compressImage(f)
                    const fd = new FormData()
                    fd.append('image', small)
                    const up = await api('/api/admin/upload', { method: 'POST', form: fd })
                    await api(`/api/admin/ads/${ad.id}`, { method: 'PATCH', body: { image: up.url } })
                    load()
                  } catch { alert('تعذّر رفع الصورة') }
                }} />
            </label>
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
    const small = await compressImage(file)
    const fd = new FormData()
    fd.append('image', small)
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
          <label className="text-[11px] text-gray-500">سعر أساسي للقسم (اختياري) — مرجع البوتات فقط</label>
          <input type="number" min="0" placeholder="مثال: 100" value={form.min_price}
            onChange={(e) => setForm({ ...form, min_price: e.target.value })}
            className="w-full mt-1 px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm" />
          <p className="text-[10px] text-gray-400 mt-1">اتركه فاضي = بدون حد. الفنيون يسومون بحرية، والعميل يختار. لا يمنع أي فني من السوم.</p>
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
                <label className="text-[11px] text-gray-500">سعر أساسي (ر.س)</label>
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
                  {c.min_price ? `أساسي ${c.min_price} ر.س · ` : ''}
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

const BADGE_PRESETS = ['#006C35', '#C9A227', '#0B5DA8', '#7A1FA2', '#B3261E', '#0F766E', '#111827', '#C2410C']
const CAT_OPTS = [
  ['AC', '❄️ فني تكييف'], ['Plumber', '🔧 سباك'], ['Electrician', '⚡ كهربائي'],
  ['Carpenter', '🔨 نجار'], ['Painter', '🎨 دهّان'], ['Mechanic', '🛠️ ميكانيكي'],
]

function ExpertEditor({ expert, onSaved, onClose }) {
  const [f, setF] = useState({
    name: expert.name_ar || expert.name || '',
    job: expert.job || 'AC',
    city: expert.city || '',
    phone: expert.phone || '',
    verify_status: expert.verify_status || 'approved',
    badge_label: expert.badge_label || '',
    badge_color: expert.badge_color || '#006C35',
    is_company: !!expert.is_company,
    company_name: expert.company_name || '',
    exp_years: expert.exp_years ?? '',
    rate: expert.rate || '',
    image: expert.image || '',
  })
  const [certs, setCerts] = useState(Array.isArray(expert.certs) ? expert.certs : [])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [up, setUp] = useState(false)

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))

  const uploadCert = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUp(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await api('/api/admin/upload-file', { method: 'POST', form: fd })
      setCerts((c) => [...c, { url: r.url, name: r.name || file.name }])
      setMsg('تم رفع الملف — لا تنسَ الحفظ')
    } catch {
      setMsg('تعذّر رفع الملف')
    } finally {
      setUp(false)
    }
  }

  const save = async () => {
    setBusy(true); setMsg('')
    try {
      const body = {
        ...f,
        exp_years: f.exp_years === '' ? null : Number(f.exp_years),
        is_company: f.is_company ? 1 : 0,
        badge_label: f.badge_label || null,
        badge_color: f.badge_color || null,
        company_name: f.company_name || null,
        certs,
      }
      const r = await api(`/api/admin/experts/${expert.id}`, { method: 'PATCH', body })
      onSaved(r)
      setMsg('✅ تم الحفظ')
    } catch {
      setMsg('تعذّر الحفظ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-[#E3D9BF] bg-[#FBF9F2] p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="الاسم"
          className="px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-xs" />
        <input value={f.city} onChange={(e) => set('city', e.target.value)} placeholder="المدينة"
          className="px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-xs" />
        <input value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="الجوال"
          className="px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-xs" />
        <input value={f.rate} onChange={(e) => set('rate', e.target.value)} placeholder="السعر المعروض"
          className="px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-xs" />
        <input value={f.exp_years} onChange={(e) => set('exp_years', e.target.value)} placeholder="سنوات الخبرة" type="number"
          className="px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-xs" />
        <select value={f.job} onChange={(e) => set('job', e.target.value)}
          className="px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-xs bg-white">
          {CAT_OPTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={f.verify_status} onChange={(e) => set('verify_status', e.target.value)}
          className="col-span-2 px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-xs bg-white">
          <option value="approved">✅ موثّق (يظهر للعملاء)</option>
          <option value="pending">⏳ قيد المراجعة (مخفي)</option>
          <option value="rejected">⛔ مرفوض</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2 items-center">
        <input value={f.badge_label} onChange={(e) => set('badge_label', e.target.value)}
          placeholder="نص الشارة (مثال: محترف معتمد)"
          className="px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-xs" />
        <div className="flex items-center gap-1.5">
          <input type="color" value={f.badge_color} onChange={(e) => set('badge_color', e.target.value)}
            className="w-8 h-8 rounded border border-[#E3D9BF] bg-white p-0.5" />
          <div className="flex gap-1 flex-wrap">
            {BADGE_PRESETS.map((c) => (
              <button key={c} type="button" onClick={() => set('badge_color', c)}
                className="w-4 h-4 rounded-full border border-white shadow"
                style={{ background: c, outline: f.badge_color === c ? '2px solid #11221A' : 'none' }} />
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input value={f.badge_label} onChange={(e) => set('badge_label', e.target.value)} readOnly hidden />
        <label className="flex items-center gap-1.5 text-[11px] font-bold text-[#11221A]">
          <input type="checkbox" checked={f.is_company} onChange={(e) => set('is_company', e.target.checked)}
            className="w-3.5 h-3.5 accent-[#006C35]" />
          🏢 شركة متخصصة
        </label>
        {f.is_company && (
          <input value={f.company_name} onChange={(e) => set('company_name', e.target.value)}
            placeholder="اسم الشركة" className="flex-1 px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-xs" />
        )}
      </div>

      <div>
        <p className="text-[11px] font-bold text-gray-600 mb-1">📄 الشهادات</p>
        {certs.length > 0 && (
          <ul className="space-y-1 mb-1">
            {certs.map((c, i) => (
              <li key={c.url} className="flex items-center gap-2 text-[11px] bg-white border border-[#EADFC8] rounded-lg px-2 py-1">
                <a href={c.url} target="_blank" rel="noreferrer" className="flex-1 truncate text-[#0B5DA8] underline">{c.name || 'ملف'}</a>
                <button onClick={() => setCerts(certs.filter((_, j) => j !== i))} className="text-red-500 font-bold">حذف</button>
              </li>
            ))}
          </ul>
        )}
        <label className="inline-block cursor-pointer text-[11px] font-bold text-[#006C35] border border-dashed border-[#E3D9BF] rounded-lg px-2 py-1 bg-white">
          {up ? 'جارٍ الرفع…' : '＋ رفع شهادة (صورة/PDF)'}
          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={uploadCert} />
        </label>
      </div>

      {msg && <p className="text-[11px] font-bold text-[#006C35]">{msg}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="flex-1 bg-[#006C35] text-white py-2 rounded-lg text-xs font-bold">
          {busy ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}
        </button>
        <button onClick={onClose} className="px-3 bg-white border border-[#E3D9BF] text-gray-600 py-2 rounded-lg text-xs font-bold">إغلاق</button>
      </div>
    </div>
  )
}

function AddExpert({ onAdded }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({
    name: '', job: 'AC', city: '', phone: '', badge_label: 'محترف معتمد', badge_color: '#C9A227',
    is_company: false, company_name: '', exp_years: '', rate: 'حسب الاتفاق', verify_status: 'approved',
  })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))

  const save = async () => {
    if (!f.name.trim()) return setMsg('اكتب الاسم')
    setBusy(true); setMsg('')
    try {
      const r = await api('/api/admin/experts', {
        method: 'POST',
        body: {
          ...f,
          exp_years: f.exp_years === '' ? null : Number(f.exp_years),
          is_company: f.is_company ? 1 : 0,
          trades: [{ cat: f.job, subs: [] }],
        },
      })
      onAdded(r)
      setMsg('✅ تمت الإضافة — ظهر في قائمة الفنيين')
      setF({ ...f, name: '', phone: '', company_name: '', exp_years: '' })
    } catch {
      setMsg('تعذّرت الإضافة')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full bg-[#11221A] text-white py-2.5 rounded-xl text-xs font-bold">
        ➕ إضافة فني / شركة متخصصة
      </button>
    )
  }

  return (
    <div className="card-lux p-3 space-y-2">
      <p className="text-sm font-extrabold text-[#11221A]">➕ إضافة فني أو شركة</p>
      <div className="grid grid-cols-2 gap-2">
        <input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="الاسم / اسم الشركة"
          className="px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-xs" />
        <input value={f.city} onChange={(e) => set('city', e.target.value)} placeholder="المدينة"
          className="px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-xs" />
        <input value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="الجوال"
          className="px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-xs" />
        <input value={f.exp_years} onChange={(e) => set('exp_years', e.target.value)} placeholder="سنوات الخبرة" type="number"
          className="px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-xs" />
        <select value={f.job} onChange={(e) => set('job', e.target.value)}
          className="col-span-2 px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-xs bg-white">
          {CAT_OPTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <input value={f.badge_label} onChange={(e) => set('badge_label', e.target.value)} placeholder="نص الشارة"
          className="px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-xs" />
        <input type="color" value={f.badge_color} onChange={(e) => set('badge_color', e.target.value)}
          className="h-8 rounded border border-[#E3D9BF] bg-white p-0.5" />
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-[11px] font-bold">
          <input type="checkbox" checked={f.is_company} onChange={(e) => set('is_company', e.target.checked)}
            className="w-3.5 h-3.5 accent-[#006C35]" />
          🏢 شركة
        </label>
        {f.is_company && (
          <input value={f.company_name} onChange={(e) => set('company_name', e.target.value)} placeholder="اسم الشركة"
            className="flex-1 px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-xs" />
        )}
      </div>
      <p className="text-[10px] text-gray-500">الشهادات تُرفع بعد الإضافة من زر «تعديل».</p>
      {msg && <p className="text-[11px] font-bold text-[#006C35]">{msg}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="flex-1 bg-[#006C35] text-white py-2 rounded-lg text-xs font-bold">
          {busy ? 'جارٍ الإضافة…' : 'إضافة'}
        </button>
        <button onClick={() => setOpen(false)} className="px-3 bg-white border border-[#E3D9BF] py-2 rounded-lg text-xs font-bold">إلغاء</button>
      </div>
    </div>
  )
}

function Verifications() {
  const [rows, setRows] = useState([])
  const [tab, setTab] = useState('pending')
  const [editId, setEditId] = useState(null)
  const load = (st) => api(`/api/admin/verifications?status=${st}`).then(setRows).catch(() => {})
  useEffect(() => { load(tab) }, [tab])

  const act = async (id, status) => {
    const note = status === 'rejected' ? prompt('سبب الرفض (اختياري)') || null : null
    await api(`/api/admin/verifications/${id}`, { method: 'PATCH', body: { status, note } })
    load(tab)
  }

  const patchLocal = (e) => setRows((rs) => rs.map((r) => (r.id === e.id ? { ...r, ...e } : r)))

  return (
    <div className="space-y-3">
      <AddExpert onAdded={(e) => { setRows((rs) => [e, ...rs]); setTab('approved'); load('approved') }} />

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
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold text-sm text-[#11221A]">{e.name_ar || e.name}</p>
                {e.badge_label && (
                  <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full border"
                    style={{ color: e.badge_color || '#006C35', borderColor: e.badge_color || '#006C35' }}>
                    {e.badge_label}
                  </span>
                )}
                {!!e.is_company && <span className="text-[9px] font-bold text-gray-500">🏢 شركة</span>}
              </div>
              <p className="text-[11px] text-gray-500">{e.job} · {e.city || '—'} · خبرة {e.exp_years ?? '—'} سنة</p>
              {Array.isArray(e.certs) && e.certs.length > 0 && (
                <p className="text-[10px] text-[#0B5DA8] mt-0.5">📄 {e.certs.length} شهادة مرفوعة</p>
              )}
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

          <div className="flex gap-2">
            <button onClick={() => setEditId(editId === e.id ? null : e.id)}
              className="flex-1 bg-white border border-[#E3D9BF] text-[#11221A] py-1.5 rounded-lg text-xs font-bold">
              {editId === e.id ? 'إخفاء التعديل' : '✎ تعديل + شهادات + لون الشارة'}
            </button>
            <button onClick={async () => { if (!confirm('حذف هذا الفني؟')) return; await api(`/api/admin/experts/${e.id}`, { method: 'DELETE' }); setRows((rs) => rs.filter((r) => r.id !== e.id)) }}
              className="px-3 bg-red-50 text-red-500 py-1.5 rounded-lg text-xs font-bold">حذف</button>
          </div>

          {editId === e.id && (
            <ExpertEditor expert={e} onSaved={(r) => { patchLocal(r); setEditId(null) }} onClose={() => setEditId(null)} />
          )}
        </div>
      ))}
      {rows.filter((r) => (r.verify_status || 'approved') === tab).length === 0 && (
        <p className="text-sm text-gray-500">لا يوجد طلبات في هذا القسم.</p>
      )}
    </div>
  )
}



function Loyalty() {
  const [d, setD] = useState(null)
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState('')
  const [grant, setGrant] = useState(null)
  const [amount, setAmount] = useState('50')

  const load = (search = '') => api(`/api/admin/loyalty${search ? `?q=${encodeURIComponent(search)}` : ''}`).then(setD).catch(() => {})
  useEffect(() => { load() }, [])
  const money = (n) => Number(n || 0).toFixed(2)

  const doGrant = async () => {
    if (!grant) return
    try {
      await api('/api/admin/loyalty/grant', { method: 'POST', body: { user_id: grant.id, amount: Number(amount), note: 'منحة من الإدارة' } })
      setMsg(`✅ أُضيف ${amount} ر.س لرصيد ${grant.name}`)
      setGrant(null)
      load(q)
    } catch { setMsg('تعذّرت الإضافة') }
  }

  if (!d) return <p className="text-gray-500">جارٍ التحميل…</p>

  return (
    <div className="space-y-3">
      <div className="rounded-2xl p-4 border-2 border-[#C9A227]/40" style={{ background: 'linear-gradient(135deg,#4A0A1E 0%,#7A1230 55%,#3A0817 100%)' }}>
        <p className="text-white font-extrabold text-base tracking-wide">👑 نادي الولاء</p>
        <div className="mt-2 space-y-1.5">
          <p className="text-white font-bold text-[13px] leading-6 border-b border-white/20 pb-1.5">
            • كل {d.settings.target} عضو نشط = {d.settings.bonus} نقطة
          </p>
          <p className="text-white font-bold text-[13px] leading-6 border-b border-white/20 pb-1.5">
            • كل نقطة = 1 ريال تُستخدم في طلبات الفنيين فقط
          </p>
          <p className="text-white font-bold text-[13px] leading-6 border-b border-white/20 pb-1.5">
            • صلاحية النقاط {d.settings.valid_days} يوم (الأقدم ينتهي أولاً)
          </p>
          <p className="text-white font-bold text-[13px] leading-6">
            • مكافأة الفني: {d.settings.expert_target} فني = {d.settings.expert_bonus} نقطة
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="card-lux p-3 text-center"><p className="text-[10px] text-gray-500">رصيد قائم</p><p className="text-xl font-extrabold text-[#8a6d13]">{money(d.totals.balance)}</p></div>
        <div className="card-lux p-3 text-center"><p className="text-[10px] text-gray-500">رصيد مستخدم</p><p className="text-xl font-extrabold text-[#006C35]">{money(d.totals.used)}</p></div>
        <div className="card-lux p-3 text-center"><p className="text-[10px] text-gray-500">أعضاء برصيد</p><p className="text-lg font-extrabold text-[#11221A]">{d.totals.with_balance} / {d.totals.members}</p></div>
        <div className="card-lux p-3 text-center"><p className="text-[10px] text-gray-500">ينتهي خلال 7 أيام</p><p className="text-lg font-extrabold text-red-500">{money(d.totals.expiring_7d)}</p></div>
      </div>

      <div className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو الجوال أو الكود"
          className="flex-1 px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm" />
        <button onClick={() => load(q)} className="bg-[#006C35] text-white px-3 rounded-lg text-xs font-bold">بحث</button>
      </div>

      {msg && <p className="text-[11px] font-bold text-[#006C35]">{msg}</p>}

      <div className="card-lux p-0 overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead className="bg-[#006C35] text-white">
            <tr>{['#', 'الاسم', 'الجوال', 'الكود', 'دعا', 'نشط', 'الرصيد', 'ينتهي', ''].map((h) => (
              <th key={h} className="px-2 py-2 text-start font-bold whitespace-nowrap">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {d.rows.map((r) => (
              <tr key={r.id} className="border-b border-[#F0E9D8]">
                <td className="px-2 py-1.5 font-mono text-gray-500">{r.id}</td>
                <td className="px-2 py-1.5 font-bold text-[#11221A] whitespace-nowrap">{r.name || '—'}</td>
                <td className="px-2 py-1.5 text-gray-500" dir="ltr">{r.phone}</td>
                <td className="px-2 py-1.5 font-mono text-[10px]">{r.code || '—'}</td>
                <td className="px-2 py-1.5">{r.invited}</td>
                <td className="px-2 py-1.5 text-[#006C35] font-bold">{r.active_invited}</td>
                <td className="px-2 py-1.5 font-extrabold text-[#8a6d13]">{money(r.balance)}</td>
                <td className="px-2 py-1.5 text-gray-500">{r.next_expiry ? String(r.next_expiry).slice(0, 10) : '—'}</td>
                <td className="px-2 py-1.5">
                  <button onClick={() => { setGrant(r); setAmount('50') }} className="bg-[#C9A227] text-white px-2 py-1 rounded text-[10px] font-bold whitespace-nowrap">منح رصيد</button>
                </td>
              </tr>
            ))}
            {d.rows.length === 0 && <tr><td colSpan="9" className="text-center py-4 text-gray-500">ما فيه أعضاء</td></tr>}
          </tbody>
        </table>
      </div>

      {grant && (
        <div className="fixed inset-0 z-[2000] bg-black/50 grid place-items-center p-4" onClick={() => setGrant(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl p-4 w-full max-w-xs space-y-2">
            <p className="font-extrabold text-sm text-[#11221A]">منح رصيد — {grant.name}</p>
            <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm" />
            <div className="flex gap-2">
              <button onClick={doGrant} className="flex-1 bg-[#006C35] text-white py-2 rounded-lg text-xs font-bold">إضافة</button>
              <button onClick={() => setGrant(null)} className="px-3 border border-[#E3D9BF] rounded-lg text-xs font-bold">إلغاء</button>
            </div>
            <p className="text-[10px] text-gray-500">الرصيد صالح سنة ويُستخدم في طلبات الفنيين فقط.</p>
          </div>
        </div>
      )}
    </div>
  )
}

function Finance() {
  const [d, setD] = useState(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => {
    const qs = from && to ? `?from=${from}&to=${to}` : ''
    api(`/api/admin/finance${qs}`).then((r) => {
      setD(r)
      if (!from) { setFrom(r.period.from); setTo(r.period.to) }
    }).catch(() => {})
  }
  useEffect(() => { load() }, []) // eslint-disable-line

  const pay = async (row) => {
    if (!confirm(`تحويل ${row.available} ر.س إلى ${row.name}؟`)) return
    setBusy(true)
    try {
      await api(`/api/admin/finance/pay/${row.id}`, { method: 'POST', body: { amount: row.available } })
      setMsg(`✅ تم تسجيل تحويل ${row.available} ر.س لـ ${row.name}`)
      load()
    } catch { setMsg('تعذّر التسجيل') } finally { setBusy(false) }
  }

  const setW = async (id, status) => {
    await api(`/api/admin/finance/withdrawals/${id}`, { method: 'POST', body: { status } }).catch(() => {})
    load()
  }

  const openReport = (type) => {
    window.open(`/admin/finance/report?type=${type}`, '_blank')
  }

  if (!d) return <p className="text-gray-500">جارٍ التحميل…</p>
  const t = d.totals
  const money = (n) => Number(n || 0).toFixed(2)

  return (
    <div className="space-y-3">
      {d.due_count > 0 && (
        <div className="rounded-xl bg-[#FBF5E3] border border-[#E9D9A6] p-3">
          <p className="text-sm font-extrabold text-[#8a6d13]">
            🔔 {d.due_count} فني يستحقون تحويل — إجمالي {money(t.available)} ر.س
          </p>
          <p className="text-[11px] text-[#8a6d13]/80 mt-0.5">التحويلات تُسجل في الجدول أدناه وتظهر في التقارير.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="card-lux p-3 text-center"><p className="text-[10px] text-gray-500">متاح للتحويل</p><p className="text-xl font-extrabold text-[#006C35]">{money(t.available)}</p></div>
        <div className="card-lux p-3 text-center"><p className="text-[10px] text-gray-500">محجوز عند المنصة</p><p className="text-xl font-extrabold text-[#8a6d13]">{money(t.pending)}</p></div>
        <div className="card-lux p-3 text-center"><p className="text-[10px] text-gray-500">مستحق الفترة</p><p className="text-lg font-extrabold text-[#11221A]">{money(t.week_earned)}</p></div>
        <div className="card-lux p-3 text-center"><p className="text-[10px] text-gray-500">طُلب سحبه</p><p className="text-lg font-extrabold text-[#11221A]">{money(t.requested)}</p></div>
      </div>

      <div className="card-lux p-3 space-y-1">
        <p className="text-sm font-extrabold text-[#11221A]">👑 نادي الولاء (العملاء)</p>
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="text-center"><p className="text-[10px] text-gray-500">رصيد مستخدم</p><p className="font-extrabold text-[#11221A]">{money(d.credits?.used)}</p></div>
          <div className="text-center"><p className="text-[10px] text-gray-500">رصيد قائم</p><p className="font-extrabold text-[#8a6d13]">{money(d.credits?.outstanding)}</p></div>
          <div className="text-center"><p className="text-[10px] text-gray-500">عدد العملاء</p><p className="font-extrabold text-[#006C35]">{d.credits?.users ?? 0}</p></div>
        </div>
        <p className="text-[10px] text-gray-500 pt-1">
          كل {d.settings?.loyalty_target} عضو نشط = {d.settings?.loyalty_bonus} ر.س رصيد · صلاحية {d.settings?.credit_days} يوم ·
          مكافأة الفني: {d.settings?.referral_target} فني = {d.settings?.referral_bonus} ر.س
        </p>
      </div>

      <div className="card-lux p-3 space-y-2">
        <p className="text-sm font-extrabold text-[#11221A]">📅 الفترة (السبت → الجمعة)</p>
        <div className="flex gap-2 items-center">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-xs" />
          <span className="text-xs text-gray-400">→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-2 py-1.5 border border-[#E3D9BF] rounded-lg text-xs" />
          <button onClick={load} className="bg-[#006C35] text-white px-3 py-1.5 rounded-lg text-xs font-bold">عرض</button>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {[['daily', 'تقرير يومي'], ['weekly', 'أسبوعي'], ['monthly', 'شهري'], ['yearly', 'سنوي']].map(([k, l]) => (
            <button key={k} onClick={() => openReport(k)} className="bg-white border border-[#E3D9BF] text-[#11221A] px-3 py-1.5 rounded-lg text-[11px] font-bold">
              🖨️ {l}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-gray-500">التقارير تُفتح بصفحة قابلة للطباعة فيها شعار الموقع ورقم التقرير وكل فني برقمه.</p>
      </div>

      {msg && <p className="text-[11px] font-bold text-[#006C35]">{msg}</p>}

      <div className="card-lux p-0 overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead className="bg-[#006C35] text-white">
            <tr>
              {['رقم', 'الفني', 'التخصص', 'مستحق الفترة', 'محجوز', 'متاح', 'مدفوع', ''].map((h) => (
                <th key={h} className="px-2 py-2 text-start font-bold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.rows.map((r) => (
              <tr key={r.id} className="border-b border-[#F0E9D8]">
                <td className="px-2 py-1.5 font-mono text-gray-500">{r.id}</td>
                <td className="px-2 py-1.5 font-bold text-[#11221A] whitespace-nowrap">{r.name}</td>
                <td className="px-2 py-1.5 text-gray-500">{r.job}</td>
                <td className="px-2 py-1.5">{money(r.week_earned)}</td>
                <td className="px-2 py-1.5 text-[#8a6d13]">{money(r.pending)}</td>
                <td className="px-2 py-1.5 font-extrabold text-[#006C35]">{money(r.available)}</td>
                <td className="px-2 py-1.5 text-gray-500">{money(r.paid_total)}</td>
                <td className="px-2 py-1.5">
                  {r.available > 0.009 && (
                    <button disabled={busy} onClick={() => pay(r)} className="bg-[#11221A] text-white px-2 py-1 rounded text-[10px] font-bold whitespace-nowrap">
                      تحويل
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {d.rows.length === 0 && <tr><td colSpan="8" className="text-center py-4 text-gray-500">ما فيه مستحقات</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card-lux p-3">
        <p className="text-sm font-extrabold text-[#11221A] mb-2">🏦 طلبات السحب</p>
        {d.withdrawals.length === 0 && <p className="text-[11px] text-gray-500">ما فيه طلبات.</p>}
        <ul className="space-y-1.5">
          {d.withdrawals.slice(0, 20).map((w) => (
            <li key={w.id} className="flex items-center gap-2 text-[11px] bg-[#FBF9F2] border border-[#EADFC8] rounded-lg px-2 py-1.5">
              <span className="font-bold text-[#11221A] flex-1 truncate">{w.name_ar || w.name} — {money(w.amount)} ر.س</span>
              <span className="text-[10px] text-gray-500" dir="ltr">{w.iban}</span>
              <span className={`text-[10px] font-bold ${w.status === 'paid' ? 'text-[#006C35]' : w.status === 'rejected' ? 'text-red-500' : 'text-[#8a6d13]'}`}>
                {w.status === 'paid' ? 'تم' : w.status === 'rejected' ? 'مرفوض' : 'قيد التنفيذ'}
              </span>
              {w.status === 'requested' && (
                <>
                  <button onClick={() => setW(w.id, 'paid')} className="bg-[#006C35] text-white px-2 py-0.5 rounded text-[10px] font-bold">تم التحويل</button>
                  <button onClick={() => setW(w.id, 'rejected')} className="bg-red-50 text-red-500 px-2 py-0.5 rounded text-[10px] font-bold">رفض</button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
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
  const toggleDemo = async () => {
    const next = !demo
    setDemo(next)
    try {
      await api('/api/admin/settings', { method: 'PATCH', body: { demo_auto_accept: next } })
    } catch {
      setDemo(!next)
    }
  }

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
  const [snaps, setSnaps] = useState({ enabled: false, items: [] })

  const loadSnaps = () => api('/api/admin/snapshots').then(setSnaps).catch(() => {})
  useEffect(() => { loadSnaps() }, [])

  const restoreSnap = async (key) => {
    if (!confirm('استعادة هذه النسخة؟ سيتم استبدال البيانات الحالية.')) return
    setBusy(true)
    try {
      await api('/api/admin/snapshots/restore', { method: 'POST', body: { key } })
      setMsg('تمت الاستعادة من النسخة السحابية ✅')
    } catch {
      setMsg('تعذّرت الاستعادة')
    } finally {
      setBusy(false)
    }
  }

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
      <div className="card-lux p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="font-extrabold text-[#11221A]">☁️ نسخ سحابية تلقائية</p>
          <button onClick={loadSnaps} className="text-[11px] text-[#006C35] font-bold">تحديث</button>
        </div>
        <p className="text-[11px] text-gray-500 mb-2">تُحفظ كل ٣٠ دقيقة على Cloudflare — تبقى حتى لو انمسحت قاعدة السيرفر.</p>
        {!snaps.enabled && <p className="text-xs text-gray-400">غير مفعّلة بعد (تحتاج إعداد Cloudflare).</p>}
        {snaps.enabled && snaps.items.length === 0 && <p className="text-xs text-gray-400">ما فيه نسخ بعد — أول نسخة الساعة ٣ صباحاً.</p>}
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {snaps.items.map((it) => (
            <div key={it.key} className="flex items-center justify-between bg-[#FBF9F2] border border-[#EADFC8] rounded-lg px-2.5 py-1.5">
              <span className="text-[11px] text-gray-700 font-bold" dir="ltr">{it.at}</span>
              <button onClick={() => restoreSnap(it.key)} disabled={busy}
                className="text-[11px] bg-[#006C35] text-white px-2 py-1 rounded-md font-bold">
                استعادة
              </button>
            </div>
          ))}
        </div>
      </div>
      {msg && <p className="text-sm text-[#006C35] font-bold">{msg}</p>}
    </div>
  )
}

function Shell({ onLogout }) {
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState('overview')
  const [collapsed, setCollapsed] = useState({})
  const [menuOpen, setMenuOpen] = useState(false)
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
      case 'site': return <SiteSettings />
      case 'tech': return <TechSettings />
      case 'gateways': return <Gateways />
      case 'bank': return <BankSettings />
      case 'finance_reports': return <FinanceReports />
      case 'blocked': return <Blocked />
      case 'loyalty': return <Loyalty />
      case 'finance': return <Finance />
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
              <img src="/logo.png" alt="مهنتي" className="w-9 h-9 object-contain" />
              <div>
                <p className="font-extrabold text-[#11221A]">مهنتي</p>
                <p className="text-[11px] text-gray-500">الإدارة</p>
              </div>
            </div>

            <nav className="space-y-1 flex-1">
              {NAV.map((item) =>
                item.group ? (
                  <div key={item.group} className="pt-1">
                    <button
                      onClick={() => setCollapsed((c) => ({ ...c, [item.group]: !c[item.group] }))}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[13px] font-extrabold text-[#11221A] bg-[#FBF9F2] border border-[#F0E9D8]"
                    >
                      <span><span className="me-2">{item.icon}</span>{item.group}</span>
                      <span className={`text-[10px] transition ${collapsed[item.group] ? '' : 'rotate-180'}`}>▾</span>
                    </button>
                    {!collapsed[item.group] && (
                      <div className="mt-1 space-y-0.5">
                        {item.items.map((s) =>
                          s.items ? (
                            <div key={s.sub}>
                              <button
                                onClick={() => setCollapsed((c) => ({ ...c, [s.sub]: !c[s.sub] }))}
                                className="w-full flex items-center justify-between px-6 py-1.5 rounded-lg text-[12px] font-bold text-gray-600"
                              >
                                <span><span className="me-1.5">{s.icon}</span>{s.sub}</span>
                                <span className={`text-[9px] ${collapsed[s.sub] ? '' : 'rotate-180'}`}>▾</span>
                              </button>
                              {!collapsed[s.sub] && s.items.map((x) => (
                                <button key={x.key} onClick={() => { setSection(x.key); setOpen(false) }}
                                  className={`w-full text-start px-9 py-1.5 rounded-lg text-[12px] font-semibold ${section === x.key ? 'bg-[#E9F5EE] text-[#006C35]' : 'text-gray-500 hover:bg-gray-50'}`}>
                                  <span className="me-1.5">{x.icon}</span>{x.label}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <button key={s.key} onClick={() => { setSection(s.key); setOpen(false) }}
                              className={`w-full text-start px-6 py-1.5 rounded-lg text-[12.5px] font-semibold ${section === s.key ? 'bg-[#E9F5EE] text-[#006C35]' : 'text-gray-600 hover:bg-gray-50'}`}>
                              <span className="me-1.5">{s.icon}</span>{s.label}
                            </button>
                          ),
                        )}
                      </div>
                    )}
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
