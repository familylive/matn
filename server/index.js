import express from 'express'
import cors from 'cors'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Server as SocketServer } from 'socket.io'
import fs from 'node:fs'
import multer from 'multer'
import { db } from './db.js'
import { signToken, verifyToken, authRequired } from './auth.js'
import { cities } from './cities.js'
import { seedAdmin, checkAdmin, adminToken, adminRequired } from './admin.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const server = http.createServer(app)
const io = new SocketServer(server, { cors: { origin: '*' } })

app.use(cors())
app.use(express.json())
app.locals.verify = verifyToken

const uploadsDir = path.join(__dirname, 'uploads')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })
app.use('/uploads', express.static(uploadsDir, { maxAge: '7d' }))

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.jpg').toLowerCase()
      cb(null, `ad-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`)
    },
  }),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /image\//.test(file.mimetype)),
})

seedAdmin()

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
      `SELECT b.*, e.name AS expert_name, e.name_ar AS expert_name_ar, e.job AS expert_job, e.rating AS expert_rating, e.image AS expert_image
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
      `SELECT b.*, e.name AS expert_name, e.name_ar AS expert_name_ar, e.job AS expert_job, e.rating AS expert_rating, e.image AS expert_image
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

function issueInvoice(requestId) {
  const existing = db.prepare('SELECT * FROM invoices WHERE request_id = ?').get(requestId)
  if (existing) return existing
  const bid = db
    .prepare('SELECT * FROM bids WHERE id = (SELECT accepted_bid_id FROM requests WHERE id = ?)')
    .get(requestId)
  if (!bid) return null
  const year = new Date().getFullYear()
  const count = db.prepare("SELECT COUNT(*) c FROM invoices WHERE number LIKE ?").get(`MIH-${year}-%`).c
  const number = `MIH-${year}-${String(count + 1).padStart(4, '0')}`
  db.prepare('INSERT INTO invoices (number, request_id, amount) VALUES (?, ?, ?)').run(number, requestId, bid.amount)
  return db.prepare('SELECT * FROM invoices WHERE number = ?').get(number)
}

app.post('/api/requests/:id/complete', authRequired, (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id)
  if (!request) return res.status(404).json({ error: 'not_found' })
  if (request.user_id !== req.userId) return res.status(403).json({ error: 'forbidden' })
  if (request.status !== 'assigned') return res.status(409).json({ error: 'not_assigned' })
  db.prepare(`UPDATE requests SET status = 'done' WHERE id = ?`).run(request.id)
  const invoice = issueInvoice(request.id)
  res.json({ ...requestWithBids(request.id), invoice })
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

/* ---------- cities ---------- */

app.get('/api/cities', (_req, res) => res.json(cities))

app.post('/api/city-requests', (req, res) => {
  const city = String(req.body?.city || '').trim()
  if (!city) return res.status(400).json({ error: 'city_required' })
  const info = db
    .prepare('INSERT INTO city_requests (city, phone, note) VALUES (?, ?, ?)')
    .run(city, req.body?.phone || null, req.body?.note || null)
  res.status(201).json({ ok: true, id: info.lastInsertRowid })
})

/* ---------- ads (public) ---------- */

const activeAds = () =>
  db
    .prepare(
      `SELECT * FROM ads WHERE active = 1 AND (ends_at IS NULL OR ends_at >= datetime('now'))
       ORDER BY featured DESC, id DESC`,
    )
    .all()

app.get('/api/ads', (_req, res) => res.json(activeAds()))

/* ---------- admin ---------- */

app.post('/api/admin/login', (req, res) => {
  const admin = checkAdmin(req.body?.email, req.body?.password)
  if (!admin) return res.status(401).json({ error: 'invalid_credentials' })
  res.json({ token: adminToken(admin), admin: { id: admin.id, email: admin.email } })
})

app.get('/api/admin/overview', adminRequired, (_req, res) => {
  const one = (sql, ...p) => db.prepare(sql).get(...p).c
  res.json({
    requests: one('SELECT COUNT(*) c FROM requests'),
    open_requests: one("SELECT COUNT(*) c FROM requests WHERE status = 'open'"),
    bids: one('SELECT COUNT(*) c FROM bids'),
    experts: one('SELECT COUNT(*) c FROM experts'),
    users: one('SELECT COUNT(*) c FROM users'),
    invoices: one('SELECT COUNT(*) c FROM invoices'),
    invoices_total: db.prepare('SELECT COALESCE(SUM(amount),0) s FROM invoices').get().s,
    ads: one('SELECT COUNT(*) c FROM ads'),
    city_requests: one("SELECT COUNT(*) c FROM city_requests WHERE status = 'new'"),
  })
})

app.get('/api/admin/requests', adminRequired, (_req, res) => {
  res.json(
    db
      .prepare(
        `SELECT r.*, u.name AS owner_name, u.phone AS owner_phone,
          (SELECT COUNT(*) FROM bids b WHERE b.request_id = r.id) AS bids_count,
          (SELECT MIN(amount) FROM bids b WHERE b.request_id = r.id) AS lowest_bid
         FROM requests r JOIN users u ON u.id = r.user_id ORDER BY r.id DESC LIMIT 200`,
      )
      .all(),
  )
})

app.get('/api/admin/invoices', adminRequired, (_req, res) => {
  res.json(
    db
      .prepare(
        `SELECT i.*, r.title AS request_title, u.name AS owner_name
         FROM invoices i JOIN requests r ON r.id = i.request_id JOIN users u ON u.id = r.user_id
         ORDER BY i.id DESC LIMIT 200`,
      )
      .all(),
  )
})

app.get('/api/admin/ads', adminRequired, (_req, res) => {
  res.json(db.prepare('SELECT * FROM ads ORDER BY id DESC').all())
})

app.post('/api/admin/ads', adminRequired, (req, res) => {
  const { title, image, link, price, duration_days, featured, active } = req.body || {}
  if (!title) return res.status(400).json({ error: 'title_required' })
  const days = Number(duration_days) || 30
  const info = db
    .prepare(
      `INSERT INTO ads (title, image, link, price, duration_days, ends_at, featured, active)
       VALUES (?, ?, ?, ?, ?, datetime('now', ?), ?, ?)`,
    )
    .run(
      title,
      image || null,
      link || null,
      price ? Number(price) : null,
      days,
      `+${days} days`,
      featured ? 1 : 0,
      active === false ? 0 : 1,
    )
  res.status(201).json(db.prepare('SELECT * FROM ads WHERE id = ?').get(info.lastInsertRowid))
})

app.patch('/api/admin/ads/:id', adminRequired, (req, res) => {
  const ad = db.prepare('SELECT * FROM ads WHERE id = ?').get(req.params.id)
  if (!ad) return res.status(404).json({ error: 'not_found' })
  const fields = ['title', 'image', 'link', 'price', 'duration_days', 'featured', 'active']
  const updates = []
  const params = []
  for (const f of fields) {
    if (req.body?.[f] !== undefined) {
      updates.push(`${f} = ?`)
      params.push(['featured', 'active'].includes(f) ? (req.body[f] ? 1 : 0) : req.body[f])
    }
  }
  if (updates.length) {
    db.prepare(`UPDATE ads SET ${updates.join(', ')} WHERE id = ?`).run(...params, ad.id)
  }
  res.json(db.prepare('SELECT * FROM ads WHERE id = ?').get(ad.id))
})

app.delete('/api/admin/ads/:id', adminRequired, (req, res) => {
  db.prepare('DELETE FROM ads WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

app.post('/api/admin/upload', adminRequired, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file' })
  res.status(201).json({ url: `/uploads/${req.file.filename}` })
})

app.get('/api/admin/city-requests', adminRequired, (_req, res) => {
  res.json(db.prepare('SELECT * FROM city_requests ORDER BY id DESC').all())
})

app.patch('/api/admin/city-requests/:id', adminRequired, (req, res) => {
  db.prepare('UPDATE city_requests SET status = ? WHERE id = ?').run(req.body?.status || 'done', req.params.id)
  res.json({ ok: true })
})

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
