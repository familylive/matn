import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { demoUsers } from '../data/demoUsers.js'
import { api } from '../lib/api.js'
import { useLang } from '../i18n/LanguageContext.jsx'

export default function Login() {
  const [form, setForm] = useState({ userName: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { t } = useLang()
  const { login, loginWithCredentials, loginWithPhone } = useAuth()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [devCode, setDevCode] = useState('')
  const [phoneErr, setPhoneErr] = useState('')

  const onChange = (e) => {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
    if (error) setError('')
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')

    // لو الإدخال إيميل: جرّب دخول لوحة التحكم أولاً
    if (form.userName.includes('@')) {
      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: form.userName.trim(), password: form.password }),
        })
        if (res.ok) {
          const data = await res.json()
          localStorage.setItem('adminToken', data.token)
          navigate('/admin')
          return
        }
      } catch {}
    }

    await new Promise((r) => setTimeout(r, 400))
    const ok = loginWithCredentials(form.userName, form.password)
    if (ok) navigate('/')
    else setError(t('login.invalid'))
    setBusy(false)
  }

  const quickLogin = (u) => {
    const { password: _pw, ...safe } = u
    login(safe)
    navigate('/')
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('login.title')}</h1>
          <p className="text-gray-600">{t('login.subtitle')}</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-6">
          <div>
            <label htmlFor="userName" className="block text-sm font-medium text-gray-700 mb-2">
              {t('login.username')}
            </label>
            <input
              id="userName" name="userName" type="text" required
              value={form.userName} onChange={onChange}
              placeholder={t('login.usernamePh')}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              {t('login.password')}
            </label>
            <input
              id="password" name="password" type="password" required
              value={form.password} onChange={onChange}
              placeholder={t('login.passwordPh')}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit" disabled={busy}
            className="w-full bg-blue-500 text-white py-3 rounded-xl font-medium hover:bg-blue-600 transition-colors disabled:opacity-60"
          >
            {busy ? t('login.signing') : t('login.signin')}
          </button>

          <button
            type="button"
            onClick={() => { login({ userId: 999, userName: 'Guest User', userLocation: 'Tunis' }); navigate('/') }}
            className="w-full border border-gray-300 text-gray-700 py-3 rounded-xl font-medium hover:bg-gray-50 transition-colors"
          >
            {t('login.guest')}
          </button>
        </form>

        <div className="mt-6 bg-white rounded-xl p-4 border border-gray-100">
          <p className="text-sm font-medium text-gray-900 mb-3">{t('login.orPhone')}</p>
          <div className="space-y-3">
            <input
              type="tel"
              inputMode="tel"
              placeholder={t('login.phonePh')}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            {!sent ? (
              <button
                type="button"
                onClick={async () => {
                  setPhoneErr('')
                  try {
                    const r = await api.requestOtp(phone)
                    setSent(true)
                    if (r.devCode) setDevCode(r.devCode)
                  } catch (e) {
                    setPhoneErr(e.message)
                  }
                }}
                className="w-full bg-gray-900 text-white py-2.5 rounded-xl text-sm font-medium"
              >
                {t('login.sendCode')}
              </button>
            ) : (
              <>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder={t('login.codePh')}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
                {devCode && (
                  <p className="text-xs text-gray-500">
                    {t('login.demoCode')}: <span className="font-mono font-bold">{devCode}</span>
                  </p>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    setPhoneErr('')
                    try {
                      const merged = await loginWithPhone(phone, code)
                      navigate(merged?.name ? '/' : '/register')
                    } catch (e) {
                      setPhoneErr(e.message)
                    }
                  }}
                  className="w-full bg-blue-500 text-white py-2.5 rounded-xl text-sm font-medium"
                >
                  {t('login.verify')}
                </button>
              </>
            )}
            {phoneErr && <p className="text-xs text-red-500">{phoneErr}</p>}
          </div>
        </div>

        <button
          onClick={() => navigate('/admin')}
          className="w-full mt-5 text-center text-sm font-bold text-[#8a6d13] bg-[#FBF5E3] border border-[#EADFC8] py-2.5 rounded-xl"
        >
          🛡️ دخول لوحة التحكم (للإدارة)
        </button>

        <div className="mt-8">
          <p className="text-center text-sm text-gray-500 mb-4">{t('login.quick')}</p>
          <div className="space-y-3">
            {demoUsers.map((u) => (
              <div key={u.userName} className="bg-white rounded-xl p-3 border border-gray-100 flex items-center gap-3">
                <img src={u.avatar} alt={u.userName} className="w-10 h-10 rounded-full object-cover" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{u.userName}</p>
                  <p className="text-xs text-gray-500">{u.email}</p>
                  <p className="text-xs text-gray-500">📍 {t(`city.${u.location}`, u.location)}</p>
                </div>
                <button onClick={() => quickLogin(u)} className="text-sm text-blue-500 font-medium">
                  {t('login.click')}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
