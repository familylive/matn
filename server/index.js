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
import { seedAdmin, checkAdmin, adminToken, adminRequired, hashPassword } from './admin.js'
import { seedBots, onNewRequest, resumeBots } from './bots.js'
import { issueInvoice, autoSettle, getSetting as getSet } from './flow.js'

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
seedBots()

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

const fullUser = (id) =>
  db
    .prepare(
      `SELECT id, phone, name, city, role, email, nationality, specialty, lat, lng, avatar,
        sound_on, last_seen, created_at,
        CASE WHEN last_seen IS NOT NULL AND last_seen >= datetime('now', '-2 minutes') THEN 1 ELSE 0 END AS online
       FROM users WHERE id = ?`,
    )
    .get(id)

app.get('/api/me', authRequired, (req, res) => {
  const user = fullUser(req.userId)
  if (!user) return res.status(404).json({ error: 'not_found' })
  res.json(user)
})

app.post('/api/auth/register', authRequired, (req, res) => {
  const b = req.body || {}
  const name = String(b.name || '').trim()
  if (!name) return res.status(400).json({ error: 'name_required' })
  const role = ['expert', 'support', 'customer'].includes(b.role) ? b.role : 'customer'

  db.prepare(
    `UPDATE users SET name = ?, city = ?, role = ?, email = ?, nationality = ?, specialty = ?,
      lat = ?, lng = ?, phone = COALESCE(?, phone), last_seen = datetime('now') WHERE id = ?`,
  ).run(
    name,
    b.city || null,
    role,
    b.email || null,
    b.nationality || null,
    b.specialty || null,
    b.lat != null ? Number(b.lat) : null,
    b.lng != null ? Number(b.lng) : null,
    b.phone || null,
    req.userId,
  )

  if (role === 'expert') {
    const existing = db.prepare('SELECT * FROM experts WHERE user_id = ?').get(req.userId)
    if (existing) {
      db.prepare(
        `UPDATE experts SET name = ?, name_ar = ?, job = ?, city = ?, phone = ?, lat = ?, lng = ? WHERE id = ?`,
      ).run(name, name, b.specialty || existing.job, b.city || existing.city, b.phone || existing.phone,
        b.lat != null ? Number(b.lat) : existing.lat, b.lng != null ? Number(b.lng) : existing.lng, existing.id)
    } else {
      db.prepare(
        `INSERT INTO experts (name, name_ar, job, city, rate, rating, reviews_count, image, phone, skills, experience, lat, lng, user_id, verify_status)
         VALUES (?, ?, ?, ?, '150 ريال/ساعة', 4.5, 0, '/experts/ac.jpg', ?, '[]', '1 سنة', ?, ?, ?, 'pending')`,
      ).run(name, name, b.specialty || 'AC', b.city || 'الرياض', b.phone || null,
        b.lat != null ? Number(b.lat) : null, b.lng != null ? Number(b.lng) : null, req.userId)
    }
  }

  res.json(fullUser(req.userId))
})

app.patch('/api/me/sound', authRequired, (req, res) => {
  db.prepare('UPDATE users SET sound_on = ? WHERE id = ?').run(req.body?.sound_on ? 1 : 0, req.userId)
  res.json({ ok: true, sound_on: req.body?.sound_on ? 1 : 0 })
})

app.get('/api/online/count', (_req, res) => {
  const c = db
    .prepare("SELECT COUNT(*) c FROM users WHERE last_seen >= datetime('now', '-2 minutes')")
    .get().c
  res.json({ online: c, experts_online: db.prepare("SELECT COUNT(*) c FROM experts e JOIN users u ON u.id = e.user_id WHERE u.last_seen >= datetime('now','-2 minutes')").get().c })
})

/* ---------- experts ---------- */

app.get('/api/experts', (req, res) => {
  const { category, q } = req.query
  let sql = "SELECT * FROM experts WHERE COALESCE(verify_status, 'approved') = 'approved'"
  const params = []
  if (category) { sql += ' AND job = ?'; params.push(category) }
  if (q) { sql += ' AND (name LIKE ? OR job LIKE ? OR city LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`) }
  sql += ' ORDER BY rating DESC'
  const rows = db.prepare(sql).all(...params)
  res.json(rows.map((r) => ({ ...r, skills: r.skills ? JSON.parse(r.skills) : [] })))
})

app.get('/api/experts/:id', (req, res) => {
  const row = db.prepare("SELECT * FROM experts WHERE id = ? AND COALESCE(verify_status, 'approved') = 'approved'").get(req.params.id)
  if (!row) return res.status(404).json({ error: 'not_found' })
  res.json({ ...row, skills: row.skills ? JSON.parse(row.skills) : [] })
})

/* ---------- requests + live bidding ---------- */

const getSetting = (k, d) => db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value ?? d
const commissionCustomer = () => Number(getSetting('commission_customer', 7.5))
const commissionExpert = () => Number(getSetting('commission_expert', 7.5))
const round2 = (n) => Math.round(n * 100) / 100
const customerTotal = (amount) => round2(amount * (1 + commissionCustomer() / 100))

const R_EARTH_KM = 6371
function haversineKm(aLat, aLng, bLat, bLng) {
  if ([aLat, aLng, bLat, bLng].some((v) => v === null || v === undefined)) return null
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R_EARTH_KM * Math.asin(Math.sqrt(h)) * 10) / 10
}

const requestWithBids = (id) => {
  const request = db
    .prepare(
      `SELECT r.*, u.name AS owner_name FROM requests r JOIN users u ON u.id = r.user_id WHERE r.id = ?`,
    )
    .get(id)
  if (!request) return null
  const bids = db
    .prepare(
      `SELECT b.*, e.name AS expert_name, e.name_ar AS expert_name_ar, e.job AS expert_job, e.rating AS expert_rating, e.image AS expert_image, e.lat AS lat, e.lng AS lng
       FROM bids b JOIN experts e ON e.id = b.expert_id
       WHERE b.request_id = ? ORDER BY b.amount ASC`,
    )
    .all(id)
    .map((b) => ({ ...b, distance_km: haversineKm(request.lat, request.lng, b.lat, b.lng) }))
  const nearest = bids
    .filter((b) => b.distance_km !== null)
    .sort((a, z) => a.distance_km - z.distance_km)[0]
  return { ...request, bids, nearest_bid_id: nearest?.id ?? null }
}

app.get('/api/requests/counts', (_req, res) => {
  const rows = db
    .prepare("SELECT category, COUNT(*) c FROM requests WHERE status = 'open' GROUP BY category")
    .all()
  const byCategory = Object.fromEntries(rows.map((r) => [r.category, r.c]))
  res.json({ total: rows.reduce((a, r) => a + r.c, 0), byCategory })
})

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
  const { title, category, description, city, budget, subcategory, warranty_days } = req.body || {}
  if (!title || !category) return res.status(400).json({ error: 'title_and_category_required' })
  const info = db
    .prepare(
      `INSERT INTO requests (user_id, title, category, description, city, budget, lat, lng, ends_at, subcategory, warranty_days)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+60 minutes'), ?, ?)`,
    )
    .run(
      req.userId,
      title,
      category,
      description || null,
      city || null,
      budget ? Number(budget) : null,
      req.body?.lat != null ? Number(req.body.lat) : null,
      req.body?.lng != null ? Number(req.body.lng) : null,
      subcategory || null,
      Number(warranty_days) || 3,
    )
  const request = requestWithBids(info.lastInsertRowid)
  io.emit('request:new', request)
  io.emit('notify', {
    type: 'request',
    title: 'طلب جديد',
    body: `${request.title} — ${request.city || ''}`,
    requestId: request.id,
    category: request.category,
    subcategory: request.subcategory || null,
  })
  onNewRequest(io, request)
  res.status(201).json(request)
})

app.post('/api/requests/:id/bids', authRequired, (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id)
  if (!request) return res.status(404).json({ error: 'not_found' })
  if (request.status !== 'open') return res.status(409).json({ error: 'request_closed' })
  if (request.ends_at && new Date(request.ends_at.replace(' ', 'T') + 'Z') < new Date())
    return res.status(409).json({ error: 'auction_ended' })

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
      `SELECT b.*, e.name AS expert_name, e.name_ar AS expert_name_ar, e.job AS expert_job, e.rating AS expert_rating, e.image AS expert_image, e.lat AS lat, e.lng AS lng
       FROM bids b JOIN experts e ON e.id = b.expert_id WHERE b.id = ?`,
    )
    .get(info.lastInsertRowid)
  io.to(`request:${request.id}`).emit('bid:new', bid)
  io.to(`user:${request.user_id}`).emit('notify', {
    type: 'bid',
    title: 'سومة جديدة',
    body: `${bid.expert_name_ar || bid.expert_name} سوم بـ${bid.amount} ريال`,
    requestId: request.id,
    amount: bid.amount,
  })
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

  db.prepare(`UPDATE requests SET status = 'awaiting_payment', accepted_bid_id = ? WHERE id = ?`).run(bid.id, request.id)
  const updated = requestWithBids(request.id)
  io.to(`request:${request.id}`).emit('request:accepted', updated)
  res.json(updated)
})

app.post('/api/requests/:id/complete', authRequired, (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id)
  if (!request) return res.status(404).json({ error: 'not_found' })
  if (request.user_id !== req.userId) return res.status(403).json({ error: 'forbidden' })
  if (request.status !== 'assigned') return res.status(409).json({ error: 'not_assigned' })
  db.prepare(
    `UPDATE requests SET status = 'done', completed_at = datetime('now'),
      warranty_until = datetime('now', '+' || COALESCE(warranty_days, 3) || ' days')
     WHERE id = ?`,
  ).run(request.id)
  const invoice = issueInvoice(request.id)
  res.json({ ...requestWithBids(request.id), invoice })
})

app.post('/api/requests/:id/close', authRequired, (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id)
  if (!request) return res.status(404).json({ error: 'not_found' })
  if (request.user_id !== req.userId) return res.status(403).json({ error: 'forbidden' })
  if (request.status !== 'done') return res.status(409).json({ error: 'not_done' })
  const wu = request.warranty_until ? new Date(request.warranty_until.replace(' ', 'T') + 'Z') : null
  if (wu && wu > new Date()) return res.status(409).json({ error: 'warranty_active', until: request.warranty_until })
  db.prepare("UPDATE requests SET status = 'closed', closed_at = datetime('now') WHERE id = ?").run(request.id)
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

app.get('/api/admin/requests', adminRequired, (req, res) => {
  const scope = req.query.scope
  const where =
    scope === 'active' ? "WHERE r.status IN ('open','awaiting_payment','assigned','done')"
    : scope === 'closed' ? "WHERE r.status IN ('closed','canceled')"
    : ''
  res.json(
    db
      .prepare(
        `SELECT r.*, u.name AS owner_name, u.phone AS owner_phone,
          (SELECT COUNT(*) FROM bids b WHERE b.request_id = r.id) AS bids_count,
          (SELECT MIN(amount) FROM bids b WHERE b.request_id = r.id) AS lowest_bid
         FROM requests r JOIN users u ON u.id = r.user_id ${where} ORDER BY r.id DESC LIMIT 300`,
      )
      .all(),
  )
})

/* ---------- users & admins management ---------- */

const publicUser = (u) => ({
  id: u.id, name: u.name, phone: u.phone, city: u.city, role: u.role,
  email: u.email, status: u.status, created_at: u.created_at, last_seen: u.last_seen,
  online: u.last_seen && new Date(u.last_seen.replace(' ', 'T') + 'Z').getTime() > Date.now() - 120000 ? 1 : 0,
})

app.get('/api/admin/users', adminRequired, (req, res) => {
  const role = req.query.role
  const rows = role
    ? db.prepare('SELECT * FROM users WHERE role = ? ORDER BY id DESC').all(role)
    : db.prepare('SELECT * FROM users ORDER BY id DESC').all()
  res.json(rows.map(publicUser))
})

app.patch('/api/admin/users/:id', adminRequired, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
  if (!u) return res.status(404).json({ error: 'not_found' })
  const b = req.body || {}
  const fields = ['name', 'phone', 'city', 'role', 'status', 'email', 'specialty']
  const sets = []
  const params = []
  for (const f of fields) if (b[f] !== undefined) { sets.push(`${f} = ?`); params.push(b[f]) }
  if (sets.length) db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params, u.id)
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)))
})

app.delete('/api/admin/users/:id', adminRequired, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
  if (!u) return res.status(404).json({ error: 'not_found' })
  db.prepare('DELETE FROM bids WHERE expert_id IN (SELECT id FROM experts WHERE user_id = ?)').run(u.id)
  db.prepare('DELETE FROM experts WHERE user_id = ?').run(u.id)
  db.prepare('DELETE FROM requests WHERE user_id = ?').run(u.id)
  db.prepare('DELETE FROM users WHERE id = ?').run(u.id)
  res.json({ ok: true })
})

app.get('/api/admin/admins', adminRequired, (_req, res) => {
  res.json(db.prepare('SELECT id, email, name, status, id AS created_at FROM admins ORDER BY id').all())
})

app.post('/api/admin/admins', adminRequired, (req, res) => {
  const { email, password, name } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'email_and_password_required' })
  const exists = db.prepare('SELECT id FROM admins WHERE email = ?').get(email.trim().toLowerCase())
  if (exists) return res.status(409).json({ error: 'email_exists' })
  const info = db.prepare('INSERT INTO admins (email, password_hash, name) VALUES (?, ?, ?)').run(
    email.trim().toLowerCase(), hashPassword(password), name || null,
  )
  res.status(201).json({ id: info.lastInsertRowid, email, name, status: 'active' })
})

app.patch('/api/admin/admins/:id', adminRequired, (req, res) => {
  const a = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.params.id)
  if (!a) return res.status(404).json({ error: 'not_found' })
  const { status, name } = req.body || {}
  if (status) db.prepare('UPDATE admins SET status = ? WHERE id = ?').run(status, a.id)
  if (name !== undefined) db.prepare('UPDATE admins SET name = ? WHERE id = ?').run(name, a.id)
  res.json(db.prepare('SELECT id, email, name, status FROM admins WHERE id = ?').get(a.id))
})

app.delete('/api/admin/admins/:id', adminRequired, (req, res) => {
  const count = db.prepare('SELECT COUNT(*) c FROM admins').get().c
  if (count <= 1) return res.status(409).json({ error: 'last_admin' })
  db.prepare('DELETE FROM admins WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

/* ---------- reports ---------- */

app.get('/api/admin/reports', adminRequired, (_req, res) => {
  const one = (sql, ...p) => db.prepare(sql).get(...p)
  const byCategory = db.prepare(
    `SELECT category, COUNT(*) c, COALESCE(SUM(CASE WHEN status='done' THEN 1 ELSE 0 END),0) done
     FROM requests GROUP BY category ORDER BY c DESC`,
  ).all()
  const byCity = db.prepare(
    `SELECT COALESCE(city,'غير محدد') city, COUNT(*) c FROM requests GROUP BY city ORDER BY c DESC LIMIT 10`,
  ).all()
  const daily = db.prepare(
    `SELECT substr(created_at,1,10) d, COUNT(*) c FROM requests
     WHERE created_at >= datetime('now','-14 days') GROUP BY d ORDER BY d`,
  ).all()
  res.json({
    totals: {
      requests: one('SELECT COUNT(*) c FROM requests').c,
      done: one("SELECT COUNT(*) c FROM requests WHERE status='done'").c,
      open: one("SELECT COUNT(*) c FROM requests WHERE status IN ('open','assigned')").c,
      users: one('SELECT COUNT(*) c FROM users').c,
      experts: one('SELECT COUNT(*) c FROM experts').c,
      bids: one('SELECT COUNT(*) c FROM bids').c,
      invoices: one('SELECT COUNT(*) c FROM invoices').c,
      revenue: one('SELECT COALESCE(SUM(amount),0) s FROM invoices').s,
      commission: one('SELECT COALESCE(SUM(commission),0) s FROM invoices').s,
      avg_bid: Math.round(one('SELECT COALESCE(AVG(amount),0) a FROM bids').a),
    },
    byCategory,
    byCity,
    daily,
  })
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

/* ---------- صورة الملف الشخصي ---------- */

app.post('/api/me/avatar', authRequired, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file' })
  const url = `/uploads/${req.file.filename}`
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(url, req.userId)
  res.status(201).json({ url })
})

/* ---------- توثيق الإقامة (OCR) ---------- */

app.post('/api/me/iqama', authRequired, upload.single('iqama'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file' })
  const url = `/uploads/${req.file.filename}`
  let parsed = {}
  try {
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker('ara', 1, { logger: () => {} })
    const { data } = await worker.recognize(req.file.path)
    await worker.terminate()
    const text = data.text || ''
    const pick = (re) => (text.match(re) || [])[1]?.trim() || ''
    parsed = {
      raw: text,
      name: pick(/الاسم\s*[:\-]?\s*([^\n]+)/),
      iqama_number: (text.match(/\b\d{10}\b/) || [])[0] || '',
      nationality: pick(/الجنسية\s*[:\-]?\s*([^\n]+)/),
      profession: pick(/(?:المهنة|الوظيفة)\s*[:\-]?\s*([^\n]+)/),
      issue: pick(/(?:تاريخ\s*الإصدار|الإصدار)\s*[:\-]?\s*([^\n]+)/),
      expiry: pick(/(?:تاريخ\s*الانتهاء|الانتهاء)\s*[:\-]?\s*([^\n]+)/),
    }
  } catch {
    parsed = { error: 'ocr_failed' }
  }
  res.status(201).json({ url, parsed })
})

app.post('/api/me/verify', authRequired, (req, res) => {
  const b = req.body || {}
  const expert = db.prepare('SELECT * FROM experts WHERE user_id = ?').get(req.userId)
  if (!expert) return res.status(404).json({ error: 'expert_profile_missing' })
  const iqama = String(b.iqama_number || '').replace(/\D/g, '')
  if (iqama.length !== 10) return res.status(400).json({ error: 'invalid_iqama' })
  if (!b.iqama_name || !b.iqama_image) return res.status(400).json({ error: 'missing_fields' })

  db.prepare(
    `UPDATE experts SET iqama_number = ?, iqama_name = ?, iqama_issue = ?, iqama_expiry = ?,
      nationality = ?, profession = ?, iqama_image = ?, verify_status = 'pending', verify_note = NULL
     WHERE id = ?`,
  ).run(iqama, b.iqama_name, b.iqama_issue || null, b.iqama_expiry || null,
    b.nationality || null, b.profession || null, b.iqama_image, expert.id)

  io.emit('notify', { type: 'verify', title: 'طلب توثيق جديد', body: b.iqama_name })
  res.json({ ok: true, status: 'pending' })
})

app.get('/api/me/verify', authRequired, (req, res) => {
  const e = db.prepare('SELECT * FROM experts WHERE user_id = ?').get(req.userId)
  if (!e) return res.status(404).json({ error: 'expert_profile_missing' })
  res.json({ status: e.verify_status || 'approved', note: e.verify_note, iqama_number: e.iqama_number,
    iqama_name: e.iqama_name, iqama_image: e.iqama_image })
})

/* ---------- الإعدادات ---------- */

app.get('/api/settings', (_req, res) => {
  res.json({
    commission_customer: commissionCustomer(),
    commission_expert: commissionExpert(),
    commission_total: round2(commissionCustomer() + commissionExpert()),
    demo_auto_accept: getSet('demo_auto_accept', '0') === '1',
  })
})

app.get('/api/admin/settings', adminRequired, (_req, res) => {
  res.json({
    commission_customer: commissionCustomer(),
    commission_expert: commissionExpert(),
    commission_total: round2(commissionCustomer() + commissionExpert()),
    demo_auto_accept: getSet('demo_auto_accept', '0') === '1',
  })
})

app.patch('/api/admin/settings', adminRequired, (req, res) => {
  if (req.body?.demo_auto_accept !== undefined) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('demo_auto_accept', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(req.body.demo_auto_accept ? '1' : '0')
  }
  const c = Number(req.body?.commission_customer)
  const e = Number(req.body?.commission_expert)
  if (Number.isFinite(c) && Number.isFinite(e)) {
    if (!(c >= 0 && c <= 30) || !(e >= 0 && e <= 30)) return res.status(400).json({ error: 'invalid_percent' })
  const up = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    up.run('commission_customer', String(c))
    up.run('commission_expert', String(e))
  }
  res.json({
    commission_customer: commissionCustomer(),
    commission_expert: commissionExpert(),
    commission_total: round2(commissionCustomer() + commissionExpert()),
    demo_auto_accept: getSet('demo_auto_accept', '0') === '1',
  })
})

/* ---------- التصنيفات ---------- */

app.get('/api/categories', (_req, res) => {
  res.json(db.prepare('SELECT * FROM categories WHERE active = 1 ORDER BY sort, id').all())
})

app.get('/api/categories/tree', (_req, res) => {
  const all = db.prepare('SELECT * FROM categories WHERE active = 1 ORDER BY sort, id').all()
  const parents = all.filter((c) => !c.parent_id)
  res.json(parents.map((p) => ({ ...p, children: all.filter((c) => c.parent_id === p.id) })))
})

app.get('/api/admin/categories', adminRequired, (_req, res) => {
  res.json(db.prepare('SELECT * FROM categories ORDER BY sort, id').all())
})

app.post('/api/admin/categories', adminRequired, (req, res) => {
  const { key, ar, en, icon, sort, image, parent_id } = req.body || {}
  if (!key || !ar) return res.status(400).json({ error: 'key_and_ar_required' })
  try {
    const info = db.prepare('INSERT INTO categories (key, ar, en, icon, sort, image, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(key.trim(), ar.trim(), en || null, icon || '🛠️', Number(sort) || 99, image || null, parent_id || null)
    res.status(201).json(db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid))
  } catch {
    res.status(409).json({ error: 'key_exists' })
  }
})

app.patch('/api/admin/categories/:id', adminRequired, (req, res) => {
  const c = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id)
  if (!c) return res.status(404).json({ error: 'not_found' })
  const b = req.body || {}
  const sets = []
  const params = []
  for (const f of ['ar', 'en', 'icon', 'active', 'sort', 'image', 'parent_id']) {
    if (b[f] !== undefined) { sets.push(`${f} = ?`); params.push(f === 'active' ? (b[f] ? 1 : 0) : b[f]) }
  }
  if (sets.length) db.prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`).run(...params, c.id)
  res.json(db.prepare('SELECT * FROM categories WHERE id = ?').get(c.id))
})

app.delete('/api/admin/categories/:id', adminRequired, (req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

/* ---------- الدفع ---------- */

app.post('/api/requests/:id/pay', authRequired, (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id)
  if (!request) return res.status(404).json({ error: 'not_found' })
  if (request.user_id !== req.userId) return res.status(403).json({ error: 'forbidden' })
  if (request.status !== 'awaiting_payment') return res.status(409).json({ error: 'not_awaiting_payment' })

  const method = String(req.body?.method || '')
  if (!['cash', 'card', 'urpay', 'stcpay'].includes(method)) return res.status(400).json({ error: 'invalid_method' })
  const needsPhone = ['urpay', 'stcpay'].includes(method)
  const phone = needsPhone ? String(req.body?.phone || '').replace(/[^\d+]/g, '') : null
  if (needsPhone && phone.replace(/\D/g, '').length < 9) return res.status(400).json({ error: 'phone_required' })

  const bid = db.prepare('SELECT * FROM bids WHERE id = ?').get(request.accepted_bid_id)
  const amount = customerTotal(bid?.amount || 0)
  const status = method === 'cash' ? 'pending_cash' : 'paid'

  const info = db
    .prepare('INSERT INTO payments (request_id, method, amount, phone, status, ref) VALUES (?, ?, ?, ?, ?, ?)')
    .run(request.id, method, amount, phone, status, method === 'card' ? `CARD-${Date.now()}` : null)

  db.prepare("UPDATE requests SET status = 'assigned' WHERE id = ?").run(request.id)
  const updated = requestWithBids(request.id)
  io.to(`request:${request.id}`).emit('request:accepted', updated)
  io.to(`user:${request.user_id}`).emit('notify', {
    type: 'payment',
    title: method === 'cash' ? 'تم تأكيد الدفع عند الاستلام' : 'تم الدفع بنجاح',
    body: `${amount} ريال`,
    requestId: request.id,
  })
  res.status(201).json({ ok: true, payment: db.prepare('SELECT * FROM payments WHERE id = ?').get(info.lastInsertRowid), request: updated })
})

app.get('/api/admin/payments', adminRequired, (_req, res) => {
  res.json(
    db.prepare(
      `SELECT p.*, r.title AS request_title, u.name AS owner_name
       FROM payments p JOIN requests r ON r.id = p.request_id JOIN users u ON u.id = r.user_id
       ORDER BY p.id DESC LIMIT 300`,
    ).all(),
  )
})

/* ---------- توثيق الفنيين (إدارة) ---------- */

app.get('/api/admin/verifications', adminRequired, (req, res) => {
  const status = req.query.status
  const rows = status
    ? db.prepare('SELECT * FROM experts WHERE verify_status = ? ORDER BY id DESC').all(status)
    : db.prepare('SELECT * FROM experts ORDER BY id DESC').all()
  res.json(rows)
})

app.patch('/api/admin/verifications/:id', adminRequired, (req, res) => {
  const e = db.prepare('SELECT * FROM experts WHERE id = ?').get(req.params.id)
  if (!e) return res.status(404).json({ error: 'not_found' })
  const status = req.body?.status
  if (!['approved', 'rejected', 'pending'].includes(status)) return res.status(400).json({ error: 'invalid_status' })
  db.prepare('UPDATE experts SET verify_status = ?, verify_note = ? WHERE id = ?')
    .run(status, req.body?.note || null, e.id)
  if (e.user_id) {
    io.to(`user:${e.user_id}`).emit('notify', {
      type: 'verify',
      title: status === 'approved' ? 'تم توثيق حسابك ✅' : status === 'rejected' ? 'تم رفض التوثيق' : 'التوثيق قيد المراجعة',
      body: req.body?.note || '',
    })
  }
  res.json({ ok: true })
})

/* ---------- تقرير العمولات ---------- */

app.get('/api/admin/commissions', adminRequired, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT i.*, r.title AS request_title, r.city, u.name AS owner_name
       FROM invoices i JOIN requests r ON r.id = i.request_id JOIN users u ON u.id = r.user_id
       ORDER BY i.id DESC LIMIT 500`,
    )
    .all()
  const totals = db
    .prepare(
      `SELECT COUNT(*) count,
        COALESCE(SUM(amount),0) amount,
        COALESCE(SUM(customer_fee),0) customer_fees,
        COALESCE(SUM(expert_fee),0) expert_fees,
        COALESCE(SUM(commission),0) commission,
        COALESCE(SUM(net),0) net,
        COALESCE(SUM(total_paid),0) total_paid
       FROM invoices`,
    )
    .get()
  const byMonth = db
    .prepare(
      `SELECT substr(issued_at,1,7) m, COUNT(*) c, COALESCE(SUM(commission),0) commission, COALESCE(SUM(total_paid),0) paid
       FROM invoices GROUP BY m ORDER BY m DESC LIMIT 12`,
    )
    .all()
  res.json({ totals, rows, byMonth })
})

/* ---------- فاتورتان: عميل + فني ---------- */

app.get('/api/requests/:id/invoices', authRequired, (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id)
  if (!request) return res.status(404).json({ error: 'not_found' })
  const isOwner = request.user_id === req.userId
  const myExpert = db.prepare('SELECT * FROM experts WHERE user_id = ?').get(req.userId)
  const accepted = request.accepted_bid_id
    ? db.prepare('SELECT * FROM bids WHERE id = ?').get(request.accepted_bid_id)
    : null
  const isExpert = !!(myExpert && accepted && accepted.expert_id === myExpert.id)
  if (!isOwner && !isExpert) return res.status(403).json({ error: 'forbidden' })
  const inv = db.prepare('SELECT * FROM invoices WHERE request_id = ?').get(request.id)
  if (!inv) return res.status(404).json({ error: 'no_invoice' })
  const bid = db.prepare('SELECT b.*, e.name_ar AS expert_name FROM bids b JOIN experts e ON e.id = b.expert_id WHERE b.id = ?').get(request.accepted_bid_id)
  const user = db.prepare('SELECT name, phone FROM users WHERE id = ?').get(request.user_id)
  const pctC = commissionCustomer()
  const pctE = commissionExpert()

  res.json({
    customer: {
      number: inv.number + '-C',
      title: 'فاتورة العميل',
      to: user?.name || 'العميل',
      items: [
        { label: 'قيمة الخدمة', amount: inv.amount },
        { label: `رسوم خدمة الموقع (${pctC}%)`, amount: inv.customer_fee },
      ],
      total: inv.total_paid,
    },
    expert: {
      number: inv.number + '-E',
      title: 'فاتورة الفني (مستخلص)',
      to: bid?.expert_name || 'الفني',
      items: [
        { label: 'قيمة الخدمة', amount: inv.amount },
        { label: `عمولة الموقع (${pctE}%)`, amount: -inv.expert_fee },
      ],
      total: inv.net,
    },
    issued_at: inv.issued_at,
    request: { id: request.id, title: request.title, city: request.city },
  })
})

/* ---------- نسخ احتياطي ---------- */

const BACKUP_TABLES = ['users', 'experts', 'requests', 'bids', 'reviews', 'invoices', 'ads', 'city_requests', 'categories', 'payments', 'settings']

const collectUploads = () => {
  const refs = new Set()
  const push = (v) => { if (typeof v === 'string' && v.startsWith('/uploads/')) refs.add(v.replace('/uploads/', '')) }
  db.prepare('SELECT image FROM ads').all().forEach((r) => push(r.image))
  db.prepare('SELECT avatar FROM users').all().forEach((r) => push(r.avatar))
  db.prepare('SELECT image FROM categories').all().forEach((r) => push(r.image))
  db.prepare('SELECT iqama_image FROM experts').all().forEach((r) => push(r.iqama_image))
  const files = {}
  for (const name of refs) {
    const fp = path.join(uploadsDir, name)
    try {
      if (fs.existsSync(fp)) files[name] = fs.readFileSync(fp).toString('base64')
    } catch {}
  }
  return files
}

app.get('/api/admin/backup', adminRequired, (_req, res) => {
  const data = { at: new Date().toISOString(), version: 2, tables: {}, files: collectUploads() }
  for (const t of BACKUP_TABLES) data.tables[t] = db.prepare(`SELECT * FROM ${t}`).all()
  res.setHeader('content-disposition', `attachment; filename="mihnati-backup-${Date.now()}.json"`)
  res.json(data)
})

app.post('/api/admin/restore', adminRequired, (req, res) => {
  const tables = req.body?.tables
  if (!tables || typeof tables !== 'object') return res.status(400).json({ error: 'invalid_backup' })

  const order = ['reviews', 'payments', 'bids', 'invoices', 'requests', 'city_requests', 'ads', 'experts', 'users', 'categories', 'settings'].filter(t => BACKUP_TABLES.includes(t))

  db.pragma('foreign_keys = OFF')
  try {
    const tx = db.transaction(() => {
      for (const t of order) {
        if (!Array.isArray(tables[t])) continue
        db.prepare(`DELETE FROM ${t}`).run()
      }
      for (const t of [...order].reverse()) {
        const rows = tables[t]
        if (!Array.isArray(rows)) continue
        for (const row of rows) {
          const cols = Object.keys(row)
          if (!cols.length) continue
          const sql = `INSERT OR REPLACE INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
          db.prepare(sql).run(...cols.map((c) => row[c]))
        }
      }
    })
    tx()
    if (db.prepare('SELECT COUNT(*) c FROM categories').get().c === 0) {
      const seedCats = [
        ['AC', 'فني تكييف', 'AC Technician', '❄️'],
        ['Plumber', 'سباك', 'Plumber', '🔧'],
        ['Carpenter', 'نجار', 'Carpenter', '🔨'],
        ['Electrician', 'كهربائي', 'Electrician', '⚡'],
        ['Painter', 'دهّان', 'Painter', '🎨'],
        ['Mechanic', 'ميكانيكي', 'Mechanic', '🛠️'],
      ]
      const ins = db.prepare('INSERT INTO categories (key, ar, en, icon, sort) VALUES (?, ?, ?, ?, ?)')
      seedCats.forEach((c, i) => ins.run(c[0], c[1], c[2], c[3], i))
    }
    if (req.body?.files && typeof req.body.files === 'object') {
      for (const [name, b64] of Object.entries(req.body.files)) {
        if (typeof b64 !== 'string') continue
        try { fs.writeFileSync(path.join(uploadsDir, path.basename(name)), Buffer.from(b64, 'base64')) } catch {}
      }
    }
    res.json({ ok: true, restored_at: new Date().toISOString() })
  } catch (e) {
    res.status(500).json({ error: 'restore_failed', detail: String(e.message) })
  } finally {
    db.pragma('foreign_keys = ON')
  }
})

app.get('/api/health', (_req, res) => res.json({ ok: true, at: new Date().toISOString() }))

const clientDist = path.join(__dirname, '..', 'dist')
app.use(express.static(clientDist))
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next()
  res.sendFile(path.join(clientDist, 'index.html'))
})

io.on('connection', (socket) => {
  socket.on('identify', (userId) => {
    if (userId) socket.join(`user:${userId}`)
  })
  socket.on('join', (requestId) => socket.join(`request:${requestId}`))
  socket.on('leave', (requestId) => socket.leave(`request:${requestId}`))
})

resumeBots(io)

const PORT = process.env.PORT || 3001
server.listen(PORT, () => console.log(`mihnati server on http://localhost:${PORT}`))
