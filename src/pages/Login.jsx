import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { demoUsers } from '../data/demoUsers.js'
import { api } from '../lib/api.js'

export default function Login() {
  const [form, setForm] = useState({ userName: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
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
    await new Promise((r) => setTimeout(r, 400))
    const ok = loginWithCredentials(form.userName, form.password)
    if (ok) navigate('/')
    else setError('Invalid username or password')
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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome Back!</h1>
          <p className="text-gray-600">Sign in to find trusted experts near you</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-6">
          <div>
            <label htmlFor="userName" className="block text-sm font-medium text-gray-700 mb-2">Username</label>
            <input
              id="userName" name="userName" type="text" required
              value={form.userName} onChange={onChange}
              placeholder="Enter your username"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">Password</label>
            <input
              id="password" name="password" type="password" required
              value={form.password} onChange={onChange}
              placeholder="Enter your password"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit" disabled={busy}
            className="w-full bg-blue-500 text-white py-3 rounded-xl font-medium hover:bg-blue-600 transition-colors disabled:opacity-60"
          >
            {busy ? 'Signing in...' : 'Sign In'}
          </button>

          <button
            type="button"
            onClick={() => { login({ userId: 999, userName: 'Guest User', userLocation: 'Tunis' }); navigate('/') }}
            className="w-full border border-gray-300 text-gray-700 py-3 rounded-xl font-medium hover:bg-gray-50 transition-colors"
          >
            Continue as Guest
          </button>
        </form>


        <div className="mt-6 bg-white rounded-xl p-4 border border-gray-100">
          <p className="text-sm font-medium text-gray-900 mb-3">Or sign in with your phone</p>
          <div className="space-y-3">
            <input
              type="tel"
              inputMode="tel"
              placeholder="+216 98 123 456"
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
                Send code
              </button>
            ) : (
              <>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="6-digit code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
                {devCode && (
                  <p className="text-xs text-gray-500">Demo code: <span className="font-mono font-bold">{devCode}</span></p>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    setPhoneErr('')
                    try {
                      await loginWithPhone(phone, code)
                      navigate('/')
                    } catch (e) {
                      setPhoneErr(e.message)
                    }
                  }}
                  className="w-full bg-blue-500 text-white py-2.5 rounded-xl text-sm font-medium"
                >
                  Verify & sign in
                </button>
              </>
            )}
            {phoneErr && <p className="text-xs text-red-500">{phoneErr}</p>}
          </div>
        </div>
        <div className="mt-8">
          <p className="text-center text-sm text-gray-500 mb-4">Quick Demo Login:</p>
          <div className="space-y-3">
            {demoUsers.map((u) => (
              <div key={u.userName} className="bg-white rounded-xl p-3 border border-gray-100 flex items-center gap-3">
                <img src={u.avatar} alt={u.userName} className="w-10 h-10 rounded-full object-cover" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{u.userName}</p>
                  <p className="text-xs text-gray-500">{u.email}</p>
                  <p className="text-xs text-gray-500">📍 {u.location}</p>
                </div>
                <button onClick={() => quickLogin(u)} className="text-sm text-blue-500 font-medium">Click to login</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
