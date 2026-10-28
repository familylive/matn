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

export const findByIdentifier = (identifier) => {
  const id = String(identifier || '').trim().toLowerCase()
  return (
    db.prepare('SELECT * FROM users WHERE lower(username) = ?').get(id) ||
    db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(id) ||
    db.prepare('SELECT * FROM users WHERE phone = ?').get(identifier) ||
    null
  )
}
