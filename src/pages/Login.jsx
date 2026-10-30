import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { api, setToken } from '../lib/api.js'

export default function Login() {
  const [form, setForm] = useState({ identifier: '', password: '' })
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [otpOpen, setOtpOpen] = useState(false)
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState('')
  const [sent, setSent] = useState(false)
  const [otpErr, setOtpErr] = useState('')
  const navigate = useNavigate()
  const { login } = useAuth()

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')

    // دخول لوحة التحكم (إيميل الإدارة)
    if (form.identifier.includes('@')) {
      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: form.identifier.trim(), password: form.password }),
        })
        if (res.ok) {
          const data = await res.json()
          localStorage.setItem('adminToken', data.token)
          navigate('/admin')
          return
        }
      } catch {}
    }

    try {
      const r = await api.loginLocal(form.identifier.trim(), form.password)
      setToken(r.token)
      login({ ...r.user, userName: r.user.name || r.user.username || r.user.phone })
      navigate(r.user?.name ? '/' : '/register')
    } catch (err) {
      setError(
        err.message === 'account_suspended' ? 'حسابك موقوف — راجع الدعم'
        : 'اسم المستخدم أو كلمة المرور غلط',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-4 py-8 mx-auto w-full max-w-md">
      <div className="text-center mb-6">
        <div className="w-20 h-20 rounded-2xl bg-white grid place-items-center mx-auto ring-4 ring-[#C9A227]/30 shadow-sm">
          م
        </div>
        <h1 className="text-2xl font-extrabold text-[#11221A] mt-3">تسجيل الدخول</h1>
        <p className="text-gray-500 text-sm">أهلاً بك في مهنتي</p>
      </div>

      <form onSubmit={submit} className="card-lux p-5 space-y-4">
        <div className="gold-bar absolute inset-x-0 top-0" />
        <div className="pt-1 space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-600">الإيميل أو اسم المستخدم</label>
            <input
              required
              value={form.identifier}
              onChange={(e) => setForm({ ...form, identifier: e.target.value })}
              placeholder="example@mail.com أو username"
              className="w-full mt-1 px-3 py-2.5 border border-[#E3D9BF] rounded-xl outline-none focus:border-[#006C35]"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-600">كلمة المرور</label>
            <div className="relative mt-1">
              <input
                required
                type={show ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
                className="w-full px-3 py-2.5 pe-11 border border-[#E3D9BF] rounded-xl outline-none focus:border-[#006C35]"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label="إظهار كلمة المرور"
                className="absolute inset-y-0 end-0 px-3 text-gray-400"
              >
                {show ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88L3 3m6.878 6.878L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'جارٍ الدخول…' : 'دخول'}
          </button>
        </div>
      </form>

      <div className="text-center mt-4">
        <button onClick={() => setOtpOpen((v) => !v)} className="text-xs font-bold text-[#8a6d13] underline">
          دخول برمز الجوال (OTP)
        </button>
      </div>

      {otpOpen && (
        <div className="card-lux p-4 mt-3 space-y-2">
          <p className="text-xs font-bold text-gray-700">دخول سريع برمز الجوال</p>
          <input
            type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="+966 5X XXX XXXX"
            className="w-full px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm"
          />
          {!sent ? (
            <button
              onClick={async () => {
                setOtpErr('')
                try {
                  const r = await api.requestOtp(phone)
                  setSent(true)
                  if (r.devCode) setDevCode(r.devCode)
                } catch { setOtpErr('رقم غير صحيح') }
              }}
              className="w-full bg-[#11221A] text-white py-2 rounded-lg text-sm font-bold"
            >
              أرسل الرمز
            </button>
          ) : (
            <>
              <input
                inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)}
                placeholder="رمز من ٦ أرقام"
                className="w-full px-3 py-2 border border-[#E3D9BF] rounded-lg text-sm"
              />
              {devCode && <p className="text-[11px] text-gray-500">رمز التجربة: <b>{devCode}</b></p>}
              <button
                onClick={async () => {
                  setOtpErr('')
                  try {
                    const r = await api.verifyOtp(phone, code)
                    setToken(r.token)
                    login({ ...r.user, userName: r.user.name || r.user.phone })
                    navigate(r.user?.name ? '/' : '/register')
                  } catch { setOtpErr('الرمز غلط') }
                }}
                className="w-full bg-[#006C35] text-white py-2 rounded-lg text-sm font-bold"
              >
                تحقق ودخول
              </button>
            </>
          )}
          {otpErr && <p className="text-xs text-red-500">{otpErr}</p>}
        </div>
      )}

      <div className="text-center mt-5">
        <span className="text-sm text-gray-500">ما عندك حساب؟ </span>
        <Link to="/register" className="text-sm font-extrabold text-[#006C35] underline">
          تسجيل جديد
        </Link>
      </div>

      <div className="text-center mt-4">
        <Link to="/terms" className="text-[11px] text-gray-500 underline">الشروط والأحكام</Link>
      </div>

      <Link
        to="/admin"
        className="block text-center mt-6 text-xs font-bold text-[#8a6d13] bg-[#FBF5E3] border border-[#EADFC8] py-2.5 rounded-xl"
      >
        🛡️ دخول لوحة التحكم
      </Link>
    </div>
  )
}
