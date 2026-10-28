import crypto from 'node:crypto'
import { db } from './db.js'
import { signToken } from './auth.js'

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'abdmmm9@gmail.com'
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Mihnati@2026'

const hash = (password, salt) =>
  crypto.scryptSync(password, salt, 32).toString('hex')

const SALT = 'mihnati-admin'
export function hashPassword(password) {
  return `${SALT}:${hash(password, SALT)}`
}

export function seedAdmin() {
  const existing = db.prepare('SELECT * FROM admins WHERE email = ?').get(ADMIN_EMAIL)
  const password_hash = hashPassword(ADMIN_PASSWORD)
  if (!existing) {
    db.prepare('INSERT INTO admins (email, password_hash) VALUES (?, ?)').run(ADMIN_EMAIL, password_hash)
    console.log(`admin seeded: ${ADMIN_EMAIL}`)
  } else if (process.env.ADMIN_RESET === '1') {
    db.prepare('UPDATE admins SET password_hash = ? WHERE email = ?').run(password_hash, ADMIN_EMAIL)
    console.log('admin password reset')
  }
}

export function checkAdmin(email, password) {
  const row = db.prepare('SELECT * FROM admins WHERE email = ?').get(String(email || '').trim().toLowerCase())
  if (!row || row.status === 'suspended') return null
  const [salt, expected] = row.password_hash.split(':')
  const actual = hash(password, salt)
  if (actual !== expected) return null
  return row
}

export function adminToken(admin) {
  return signToken(`admin:${admin.id}`)
}

export function adminRequired(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  const data = token ? req.app.locals.verify(token) : null
  if (!data || !String(data.uid).startsWith('admin:')) return res.status(401).json({ error: 'unauthorized' })
  req.adminId = Number(String(data.uid).split(':')[1])
  next()
}
