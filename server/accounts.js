import crypto from 'node:crypto'
import { db } from './db.js'

const SALT = 'mihnati-user'
export const hashPassword = (p) => `${SALT}:${crypto.scryptSync(String(p), SALT, 32).toString('hex')}`

export function verifyPassword(password, stored) {
  if (!stored) return false
  const [salt, hash] = stored.split(':')
  const actual = crypto.scryptSync(String(password), salt, 32).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(hash, 'hex'))
}

/** يحوّل أي صيغة جوال سعودية إلى +9665XXXXXXXX */
export function normalizePhone(input) {
  let d = String(input || '').replace(/[^\d]/g, '')
  if (!d) return null
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('966')) d = d.slice(3)
  d = d.replace(/^0+/, '')
  if (d.length === 9 && d.startsWith('5')) return `+966${d}`
  if (d.length >= 9) return `+966${d}`
  return null
}

export const findByIdentifier = (identifier) => {
  const id = String(identifier || '').trim().toLowerCase()
  return (
    db.prepare('SELECT * FROM users WHERE lower(username) = ?').get(id) ||
    db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(id) ||
    db.prepare('SELECT * FROM users WHERE phone = ?').get(normalizePhone(identifier) || identifier) ||
    null
  )
}
