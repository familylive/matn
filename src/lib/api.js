const BASE = import.meta.env.VITE_API_URL || ''

const tokenKey = 'authToken'

export const getToken = () => localStorage.getItem(tokenKey)
export const setToken = (t) => (t ? localStorage.setItem(tokenKey, t) : localStorage.removeItem(tokenKey))

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'content-type': 'application/json' }
  if (auth) {
    const token = getToken()
    if (token) headers.authorization = `Bearer ${token}`
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) {
    localStorage.removeItem('authToken')
    localStorage.removeItem('currentUser')
    const err = new Error(data.error || 'unauthorized')
    err.code = 'unauthorized'
    throw err
  }
  if (!res.ok) {
    const err = new Error(data.error || `http_${res.status}`)
    err.code = data.error
    throw err
  }
  return data
}

export const api = {
  get: (path) => request(path, { auth: true }),
  post: (path, body) => request(path, { method: 'POST', body, auth: true }),
  signup: (payload) => request('/api/auth/signup', { method: 'POST', body: payload }),
  loginLocal: (identifier, password) => request('/api/auth/login-local', { method: 'POST', body: { identifier, password } }),
  requestOtp: (phone) => request('/api/auth/request-otp', { method: 'POST', body: { phone } }),
  verifyOtp: (phone, code, name) =>
    request('/api/auth/verify', { method: 'POST', body: { phone, code, name } }),
  me: () => request('/api/me', { auth: true }),
  register: (payload) => request('/api/auth/register', { method: 'POST', body: payload, auth: true }),
  setSound: (sound_on) => request('/api/me/sound', { method: 'PATCH', body: { sound_on }, auth: true }),
  uploadAvatar: async (file) => {
    const fd = new FormData()
    fd.append('avatar', file)
    const res = await fetch('/api/me/avatar', {
      method: 'POST',
      headers: { authorization: `Bearer ${getToken()}` },
      body: fd,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'upload_failed')
    return data
  },

  experts: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString()
    return request(`/api/experts${qs ? `?${qs}` : ''}`)
  },

  requests: (status) => request(`/api/requests${status ? `?status=${status}` : ''}`, { auth: true }),
  request: (id) => request(`/api/requests/${id}`),
  createRequest: (payload) => request('/api/requests', { method: 'POST', body: payload, auth: true }),
  placeBid: (id, payload) => request(`/api/requests/${id}/bids`, { method: 'POST', body: payload, auth: true }),
  acceptBid: (id, bidId) => request(`/api/requests/${id}/accept`, { method: 'POST', body: { bidId }, auth: true }),
  complete: (id, body) => request(`/api/requests/${id}/complete`, { method: 'POST', body: body || {}, auth: true }),
  payExtra: (id, extraId, payload) => request(`/api/requests/${id}/extras/${extraId}/pay`, { method: 'POST', body: payload, auth: true }),
  addExtra: (id, payload) => request(`/api/requests/${id}/extras`, { method: 'POST', body: payload, auth: true }),
  closeRequest: (id) => request(`/api/requests/${id}/close`, { method: 'POST', auth: true }),
  rejectBid: (id, bidId) => request(`/api/requests/${id}/bids/${bidId}/reject`, { method: 'POST', auth: true }),
  payRequest: (id, payload) => request(`/api/requests/${id}/pay`, { method: 'POST', body: payload, auth: true }),
  review: (id, payload) => request(`/api/requests/${id}/review`, { method: 'POST', body: payload, auth: true }),
}
