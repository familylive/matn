import express from 'express'
import cors from 'cors'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Server as SocketServer } from 'socket.io'
import { db } from './db.js'
import { signToken, authRequired } from './auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const server = http.createServer(app)
const io = new SocketServer(server, { cors: { origin: '*' } })

app.use(cors())
app.use(express.json())

/* ---------- auth (phone + OTP) ---------- */

const DEV_MODE = process.env.NODE_ENV !== 'production' || process.env.DEV_OTP === '1'

app.post('/api/auth/request-otp', (req, res) => {
  const phone = String(req.body?.phone || '').replace(/[^\d+]/g, '')
  if (phone.replace(/\D/g, '').length < 9) return res.status(400).json({ error: 'invalid_phone' })

  const code = String(Math.floor(100000 + Math.random() * 900000))
  const expiresAt = Date.now() + 5 * 60 * 1000
  db.prepare(
    `INSERT INTO otps (phone, code, expires_at, attempts) VALUES (?, ?, ?, 0)
     ON CONFLICT(phone) DO UPDATE SET code=excluded.code, expires_at=excluded.expires_at, attempts=0`,
  ).run(phone, code, expiresAt)

  // In production this is where an SMS provider (Unifonic / Msegat) is called.
  res.json({ ok: true, phone, expiresIn: 300, ...(DEV_MODE ? { devCode: code } : {}) })
})

app.post('/api/auth/verify', (req, res) => {
  const phone = String(req.body?.phone || '').replace(/[^\d+]/g, '')
  const code = String(req.body?.code || '').trim()
  const row = db.prepare('SELECT * FROM otps WHERE phone = ?').get(phone)
  if (!row) return res.status(400).json({ error: 'otp_not_requested' })
  if (Date.now() > row.expires_at) return res.status(400).json({ error: 'otp_expired' })
  if (row.attempts >= 5) return res.status(429).json({ error: 'too_many_attempts' })
  if (row.code !== code) {
    db.prepare('UPDATE otps SET attempts = attempts + 1 WHERE phone = ?').run(phone)
    return res.status(400).json({ error: 'wrong_code' })
  }
  db.prepare('DELETE FROM otps WHERE phone = ?').run(phone)

  let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone)
  if (!user) {
    const info = db.prepare('INSERT INTO users (phone, name) VALUES (?, ?)').run(phone, req.body?.name || null)
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)
  }
  res.json({ token: signToken(user.id), user })
})

app.get('/api/me', authRequired, (req, res) => {
  const user = db.prepare('SELECT id, phone, name, city, created_at FROM users WHERE id = ?').get(req.userId)
  if (!user) return res.status(404).json({ error: 'not_found' })
  res.json(user)
})

/* ---------- experts ---------- */

app.get('/api/experts', (req, res) => {
  const { category, q } = req.query
  let sql = 'SELECT * FROM experts WHERE 1=1'
  const params = []
  if (category) { sql += ' AND job = ?'; params.push(category) }
  if (q) { sql += ' AND (name LIKE ? OR job LIKE ? OR city LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`) }
  sql += ' ORDER BY rating DESC'
  const rows = db.prepare(sql).all(...params)
  res.json(rows.map((r) => ({ ...r, skills: r.skills ? JSON.parse(r.skills) : [] })))
})

app.get('/api/experts/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM experts WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'not_found' })
  res.json({ ...row, skills: row.skills ? JSON.parse(row.skills) : [] })
})

/* ---------- requests + live bidding ---------- */

const requestWithBids = (id) => {
  const request = db
    .prepare(
      `SELECT r.*, u.name AS owner_name FROM requests r JOIN users u ON u.id = r.user_id WHERE r.id = ?`,
    )
    .get(id)
  if (!request) return null
  const bids = db
    .prepare(
      `SELECT b.*, e.name AS expert_name, e.job AS expert_job, e.rating AS expert_rating, e.image AS expert_image
       FROM bids b JOIN experts e ON e.id = b.expert_id
       WHERE b.request_id = ? ORDER BY b.amount ASC`,
    )
    .all(id)
  return { ...request, bids }
}

app.get('/api/requests', (req, res) => {
  const { status } = req.query
  const rows = db
    .prepare(
      `SELECT r.*, u.name AS owner_name,
        (SELECT COUNT(*) FROM bids b WHERE b.request_id = r.id) AS bids_count,
        (SELECT MIN(b.amount) FROM bids b WHERE b.request_id = r.id) AS lowest_bid
       FROM requests r JOIN users u ON u.id = r.user_id
       ${status ? 'WHERE r.status = ?' : ''}
       ORDER BY r.created_at DESC LIMIT 50`,
    )
    .all(...(status ? [status] : []))
  res.json(rows)
})

app.get('/api/requests/:id', (req, res) => {
  const data = requestWithBids(req.params.id)
  if (!data) return res.status(404).json({ error: 'not_found' })
  res.json(data)
})

app.post('/api/requests', authRequired, (req, res) => {
  const { title, category, description, city, budget } = req.body || {}
  if (!title || !category) return res.status(400).json({ error: 'title_and_category_required' })
  const info = db
    .prepare(
      `INSERT INTO requests (user_id, title, category, description, city, budget)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(req.userId, title, category, description || null, city || null, budget ? Number(budget) : null)
  const request = requestWithBids(info.lastInsertRowid)
  io.emit('request:new', request)
  res.status(201).json(request)
})

app.post('/api/requests/:id/bids', authRequired, (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id)
  if (!request) return res.status(404).json({ error: 'not_found' })
  if (request.status !== 'open') return res.status(409).json({ error: 'request_closed' })

  const expertId = Number(req.body?.expertId)
  const amount = Number(req.body?.amount)
  if (!expertId || !amount || amount <= 0) return res.status(400).json({ error: 'invalid_bid' })
  const expert = db.prepare('SELECT * FROM experts WHERE id = ?').get(expertId)
  if (!expert) return res.status(404).json({ error: 'expert_not_found' })

  const info = db
    .prepare('INSERT INTO bids (request_id, expert_id, amount, note) VALUES (?, ?, ?, ?)')
    .run(request.id, expertId, amount, req.body?.note || null)

  const bid = db
    .prepare(
      `SELECT b.*, e.name AS expert_name, e.job AS expert_job, e.rating AS expert_rating, e.image AS expert_image
       FROM bids b JOIN experts e ON e.id = b.expert_id WHERE b.id = ?`,
    )
    .get(info.lastInsertRowid)
  io.to(`request:${request.id}`).emit('bid:new', bid)
  res.status(201).json(bid)
})

app.post('/api/requests/:id/accept', authRequired, (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id)
  if (!request) return res.status(404).json({ error: 'not_found' })
  if (request.user_id !== req.userId) return res.status(403).json({ error: 'forbidden' })
  if (request.status !== 'open') return res.status(409).json({ error: 'already_closed' })

  const bidId = Number(req.body?.bidId)
  const bid = db.prepare('SELECT * FROM bids WHERE id = ? AND request_id = ?').get(bidId, request.id)
  if (!bid) return res.status(404).json({ error: 'bid_not_found' })

  db.prepare(`UPDATE requests SET status = 'assigned', accepted_bid_id = ? WHERE id = ?`).run(bid.id, request.id)
  const updated = requestWithBids(request.id)
  io.to(`request:${request.id}`).emit('request:accepted', updated)
  res.json(updated)
})

app.post('/api/requests/:id/complete', authRequired, (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id)
  if (!request) return res.status(404).json({ error: 'not_found' })
  if (request.user_id !== req.userId) return res.status(403).json({ error: 'forbidden' })
  if (request.status !== 'assigned') return res.status(409).json({ error: 'not_assigned' })
  db.prepare(`UPDATE requests SET status = 'done' WHERE id = ?`).run(request.id)
  res.json(requestWithBids(request.id))
})

app.post('/api/requests/:id/review', authRequired, (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id)
  if (!request) return res.status(404).json({ error: 'not_found' })
  if (request.status !== 'done') return res.status(409).json({ error: 'not_done' })
  const rating = Number(req.body?.rating)
  if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'invalid_rating' })

  const bid = db.prepare('SELECT * FROM bids WHERE id = ?').get(request.accepted_bid_id)
  if (!bid) return res.status(409).json({ error: 'no_accepted_bid' })

  db.prepare('INSERT INTO reviews (request_id, expert_id, rating, comment) VALUES (?, ?, ?, ?)').run(
    request.id, bid.expert_id, rating, req.body?.comment || null,
  )
  const agg = db.prepare('SELECT AVG(rating) avg, COUNT(*) c FROM reviews WHERE expert_id = ?').get(bid.expert_id)
  db.prepare('UPDATE experts SET rating = ?, reviews_count = ? WHERE id = ?').run(
    Math.round(agg.avg * 10) / 10, agg.c, bid.expert_id,
  )
  res.status(201).json({ ok: true })
})

/* ---------- static client + realtime ---------- */

app.get('/api/health', (_req, res) => res.json({ ok: true, at: new Date().toISOString() }))

const clientDist = path.join(__dirname, '..', 'dist')
app.use(express.static(clientDist))
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next()
  res.sendFile(path.join(clientDist, 'index.html'))
})

io.on('connection', (socket) => {
  socket.on('join', (requestId) => socket.join(`request:${requestId}`))
  socket.on('leave', (requestId) => socket.leave(`request:${requestId}`))
})

const PORT = process.env.PORT || 3001
server.listen(PORT, () => console.log(`mihnati server on http://localhost:${PORT}`))
