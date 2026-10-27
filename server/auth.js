import crypto from 'node:crypto'
import { db } from './db.js'

const SECRET = process.env.AUTH_SECRET || 'dev-secret-change-me'

export function signToken(userId) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, t: Date.now() })).toString('base64url')
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
  req.userId = data.uid
  try {
    db.prepare('UPDATE users SET last_seen = datetime(\'now\') WHERE id = ?').run(data.uid)
  } catch {}
  next()
}
