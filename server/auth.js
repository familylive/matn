import crypto from 'node:crypto'
import { db } from './db.js'

const SECRET = process.env.AUTH_SECRET || 'dev-secret-change-me'

export function signToken(userId, sessionVersion) {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, v: sessionVersion ?? null, t: Date.now() }),
  ).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifyToken(token) {
  if (!token || !token.includes('.')) return null
  const [payload, sig] = token.split('.')
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
  if (sig !== expected) return null
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString())
  } catch {
    return null
  }
}

export function authRequired(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  const data = verifyToken(token)
  if (!data) return res.status(401).json({ error: 'unauthorized' })
  const exists = db.prepare('SELECT id, status, session_version FROM users WHERE id = ?').get(data.uid)
  if (!exists) return res.status(401).json({ error: 'session_expired' })
  if (exists.status === 'suspended') return res.status(403).json({ error: 'account_suspended' })
  // 🔐 جهاز واحد فقط: أي دخول جديد يلغي الجلسة السابقة
  // الرموز القديمة (بدون رقم جلسة) تُلغى — لازم دخول جديد مرة واحدة
  if (data.v == null && typeof data.uid !== 'string') {
    return res.status(401).json({ error: 'session_expired' })
  }
  if (data.v != null && Number(exists.session_version || 0) !== Number(data.v)) {
    return res.status(401).json({ error: 'session_replaced' })
  }
  req.userId = data.uid
  try {
    db.prepare('UPDATE users SET last_seen = datetime(\'now\') WHERE id = ?').run(data.uid)
  } catch {}
  next()
}
