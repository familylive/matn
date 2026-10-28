import { createContext, useContext, useEffect, useState } from 'react'
import { demoUsers } from '../data/demoUsers.js'
import { api, setToken } from '../lib/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const raw = localStorage.getItem('currentUser')
    if (raw) {
      try { setUser(JSON.parse(raw)) } catch { localStorage.removeItem('currentUser') }
    }
    setLoading(false)
  }, [])

  const login = (nextUser) => {
    setUser(nextUser)
    localStorage.setItem('currentUser', JSON.stringify(nextUser))
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('currentUser')
    setToken(null)
  }

  // تم الدخول من جهاز آخر → نخرج المستخدم من هذا الجهاز
  useEffect(() => {
    const onReplaced = () => {
      setUser(null)
      localStorage.removeItem('currentUser')
      setToken(null)
      try {
        alert('تم تسجيل الدخول لحسابك من جهاز آخر — تم تسجيل خروجك من هذا الجهاز.')
      } catch {}
    }
    window.addEventListener('session-replaced', onReplaced)
    return () => window.removeEventListener('session-replaced', onReplaced)
  }, [])

  const loginWithPhone = async (phone, code, name) => {
    const { token, user: account } = await api.verifyOtp(phone, code, name)
    setToken(token)
    const merged = {
      ...account,
      userName: account.name || account.phone,
      userLocation: account.city || '',
      isPhoneAccount: true,
    }
    login(merged)
    return merged
  }

  const loginWithCredentials = (userName, password) => {
    const found = demoUsers.find(
      (u) => u.userName.toLowerCase() === userName.trim().toLowerCase() && u.password === password,
    )
    if (!found) return false
    const { password: _pw, ...safe } = found
    login(safe)
    return true
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, login, logout, loginWithCredentials, loginWithPhone, isAuthenticated: !!user }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
