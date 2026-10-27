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
  if (!res.ok) throw new Error(data.error || `http_${res.status}`)
  return data
}

export const api = {
  requestOtp: (phone) => request('/api/auth/request-otp', { method: 'POST', body: { phone } }),
  verifyOtp: (phone, code, name) =>
    request('/api/auth/verify', { method: 'POST', body: { phone, code, name } }),
  me: () => request('/api/me', { auth: true }),
  register: (payload) => request('/api/auth/register', { method: 'POST', body: payload, auth: true }),
  setSound: (sound_on) => request('/api/me/sound', { method: 'PATCH', body: { sound_on }, auth: true }),

  experts: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString()
    return request(`/api/experts${qs ? `?${qs}` : ''}`)
  },

  requests: (status) => request(`/api/requests${status ? `?status=${status}` : ''}`),
  request: (id) => request(`/api/requests/${id}`),
  createRequest: (payload) => request('/api/requests', { method: 'POST', body: payload, auth: true }),
  placeBid: (id, payload) => request(`/api/requests/${id}/bids`, { method: 'POST', body: payload, auth: true }),
  acceptBid: (id, bidId) => request(`/api/requests/${id}/accept`, { method: 'POST', body: { bidId }, auth: true }),
  complete: (id) => request(`/api/requests/${id}/complete`, { method: 'POST', auth: true }),
  review: (id, payload) => request(`/api/requests/${id}/review`, { method: 'POST', body: payload, auth: true }),
}
