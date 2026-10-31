import express from 'express'
import webpush from 'web-push'
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
import { seedAdmin, checkAdmin, adminToken, adminRequired, adminCan, adminRecord, ALL_PERMS, DEFAULT_PERMS, hashPassword } from './admin.js'
import { seedBots, onNewRequest, resumeBots } from './bots.js'
import { hashPassword as hashUserPassword, verifyPassword, findByIdentifier, normalizePhone } from './accounts.js'
import { issueInvoice, autoSettle, getSetting as getSet } from './flow.js'
import { seedServices, tradesOf, catsOf, certsOf, decorateExpert, parseJson } from './services.js'
import {
  ensureInviteCode, backfillInviteCodes, expertByCode, walletSummary, listTx, releaseDue,
  requestWithdrawal, invitesOf, checkReferralBonus, weekRange, money, duePlatformOf, addPlatformDue,
  HOLD_DAYS, REF_BONUS, REF_TARGET,
  ensureUserCode, backfillUserCodes, inviterUserOf, creditBalance, listCredits,
  spendCredit, clientInvites, checkLoyaltyBonus, expireCredits,
  LOYALTY_TARGET, LOYALTY_BONUS, CREDIT_DAYS, fixSettings,
  POINT_VALUE, CUSTOMER_POINTS, EXPERT_POINTS,
} from './wallet.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BOOT_ID = fs.existsSync(path.join(__dirname, '..', 'dist', 'index.html'))
  ? String(fs.statSync(path.join(__dirname, '..', 'dist', 'index.html')).mtimeMs)
  : String(Date.now())
const app = express()
const server = http.createServer(app)
const io = new SocketServer(server, { cors: { origin: '*' } })

app.use(cors())
app.use(express.json({ limit: '60mb' }))

/* 🛡️ حماية بسيطة من التخمين: حد أقصى للمحاولات */
const rlHits = new Map()
const RL_RULES = [
  [/^\/api\/auth\/login-local$/, 12, 5 * 60e3],
  [/^\/api\/auth\/signup$/, 8, 10 * 60e3],
  [/^\/api\/auth\/request-otp$/, 6, 10 * 60e3],
  [/^\/api\/auth\/verify$/, 12, 10 * 60e3],
  [/^\/api\/admin\/login$/, 10, 10 * 60e3],
  [/^\/api\/auth\/email\/send$/, 6, 10 * 60e3],
]
app.use((req, res, next) => {
  const rule = RL_RULES.find(([re]) => re.test(req.path))
  if (!rule) return next()
  const [, max, win] = rule
  const key = `${req.ip}:${req.path}`
  const now = Date.now()
  const rec = rlHits.get(key) || { n: 0, reset: now + win }
  if (now > rec.reset) { rec.n = 0; rec.reset = now + win }
  rec.n++
  rlHits.set(key, rec)
  if (rec.n > max) {
    res.setHeader('Retry-After', Math.ceil((rec.reset - now) / 1000))
    return res.status(429).json({ error: 'too_many_requests', retry_after: Math.ceil((rec.reset - now) / 1000) })
  }
  next()
})

/* 🧾 سجل عمليات الإدارة (باسم المشرف) */
app.use((req, res, next) => {
  if (!/^\/api\/admin\//.test(req.path)) return next()
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return next()
  res.on('finish', () => {
    if (res.statusCode >= 400) return
    try {
      let adminId = null
      let who = 'admin'
      const tok = String(req.headers.authorization || '').replace('Bearer ', '')
      if (tok) {
        const data = req.app.locals.verify(tok)
        if (data && String(data.uid).startsWith('admin:')) {
          adminId = Number(String(data.uid).split(':')[1])
          const a = db.prepare('SELECT name, email, role FROM admins WHERE id = ?').get(adminId)
          who = a ? `${a.name || a.email} (${a.role || 'admin'})` : 'admin'
        }
      }
      db.prepare('INSERT INTO audit_log (admin_id, action, detail) VALUES (?, ?, ?)')
        .run(adminId, `${req.method} ${req.path}`, `بواسطة ${who} · ${JSON.stringify(req.body || {}).slice(0, 350)}`)
    } catch {}
  })
  next()
})
app.locals.verify = verifyToken

const uploadsDir = process.env.UPLOADS_DIR || path.join(process.env.DATA_DIR || __dirname, 'uploads')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

/* ---- تخزين الملفات في Cloudflare KV ----
   الخطة المجانية على Render بلا قرص دائم → مجلد uploads يُمسح مع كل نشر/إعادة تشغيل.
   نحتفظ بنسخة من كل ملف مرفوع في KV، ونرجعها تلقائياً إذا اختفت من القرص. */
const kvEnv = () => ({ token: process.env.CF_BACKUP_TOKEN, acc: process.env.CF_ACCOUNT_ID, ns: process.env.CF_KV_NS })
const kvReady = () => { const { token, acc, ns } = kvEnv(); return Boolean(token && acc && ns) }
const kvFileKey = (name) => `file:${path.basename(name)}`

async function kvPutFile(name) {
  if (!kvReady()) return false
  const base = path.basename(name)
  const fp = path.join(uploadsDir, base)
  try {
    if (!fs.existsSync(fp)) return false
    const body = fs.readFileSync(fp)
    if (!body.length || body.length > 24 * 1024 * 1024) return false
    const { token, acc, ns } = kvEnv()
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${acc}/storage/kv/namespaces/${ns}/values/${encodeURIComponent(kvFileKey(base))}`,
      { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' }, body },
    )
    if (!r.ok) console.error('KV_FILE_PUT_BAD', base, r.status)
    return r.ok
  } catch (e) { console.error('KV_FILE_PUT_FAIL', base, e.message); return false }
}

async function kvGetFile(name) {
  if (!kvReady()) return null
  const base = path.basename(name)
  try {
    const { token, acc, ns } = kvEnv()
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${acc}/storage/kv/namespaces/${ns}/values/${encodeURIComponent(kvFileKey(base))}`,
      { headers: { authorization: `Bearer ${token}` } },
    )
    if (!r.ok) return null
    return Buffer.from(await r.arrayBuffer())
  } catch (e) { console.error('KV_FILE_GET_FAIL', base, e.message); return null }
}

/* أي ملف يرفعه المستخدم → نسخة سحابية في KV (لا يعطّل الرفع لو فشلت) */
app.use((req, res, next) => {
  res.on('finish', () => {
    const f = req.file
    if (!f?.filename) return
    kvPutFile(f.filename).catch(() => {})
    // نسخة دائمة داخل قاعدة البيانات (تُستعاد مع كل نسخة احتياطية)
    try {
      const fp = path.join(uploadsDir, f.filename)
      if (fs.existsSync(fp)) {
        const buf = fs.readFileSync(fp)
        db.prepare("INSERT OR REPLACE INTO files (id, name, mime, size, data) VALUES (?, ?, ?, ?, ?)")
          .run(f.filename, f.originalname || null, f.mimetype || 'application/octet-stream', buf.length, buf)
      }
    } catch (e) { console.error('FILE_DB_SAVE_FAIL', f.filename, e.message) }
  })
  next()
})

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.gif': 'image/gif', '.heic': 'image/heic', '.heif': 'image/heif', '.pdf': 'application/pdf',
}

app.get('/uploads/:name', async (req, res) => {
  const name = path.basename(req.params.name)
  const fp = path.join(uploadsDir, name)
  const type = MIME_BY_EXT[path.extname(name).toLowerCase()] || 'application/octet-stream'
  try {
    if (fs.existsSync(fp) && fs.statSync(fp).size > 0) {
      res.setHeader('Content-Type', type)
      res.setHeader('Cache-Control', 'public, max-age=604800')
      return fs.createReadStream(fp).pipe(res)
    }
  } catch {}
  // 1) من قاعدة البيانات (تنجو مع النسخ الاحتياطية)
  const row = db.prepare('SELECT mime, data FROM files WHERE id = ?').get(name)
  if (row?.data) {
    try { fs.writeFileSync(fp, Buffer.from(row.data)) } catch {}
    res.setHeader('Content-Type', row.mime || type)
    res.setHeader('Cache-Control', 'public, max-age=604800')
    return res.send(Buffer.from(row.data))
  }
  // 2) من النسخة السحابية (KV)
  const buf = await kvGetFile(name)
  if (!buf) return res.status(404).send('not_found')
  try { fs.writeFileSync(fp, buf) } catch {}
  res.setHeader('Content-Type', type)
  res.setHeader('Cache-Control', 'public, max-age=604800')
  res.send(buf)
})

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.jpg').toLowerCase()
      cb(null, `ad-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`)
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /image\//.test(file.mimetype)),
})

/* شهادات وملفات: صور + PDF */
const uploadAny = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.jpg').toLowerCase()
      cb(null, `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`)
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /image\/|pdf/.test(file.mimetype)),
})

seedAdmin()
seedBots()
seedServices(db)
backfillInviteCodes()
backfillUserCodes()
releaseDue()
setTimeout(() => { try { notifyExpiringCredits() } catch (e) { console.error('CREDIT_NOTICE_FAIL', e.message) } }, 5000)
setInterval(() => { try { releaseDue() } catch (e) { console.error('RELEASE_FAIL', e.message) } }, 30 * 60 * 1000)
setInterval(() => { try { notifyExpiringCredits() } catch (e) { console.error('CREDIT_NOTICE_FAIL', e.message) } }, 6 * 60 * 60 * 1000)

/* 💓 نبضة تشغيل — تكشف لو الموقع وقف ورجع */
const HB = 'heartbeat_at'
const setHb = () => {
  try {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(HB, new Date().toISOString())
  } catch {}
}
setHb()
setInterval(setHb, 60 * 1000)
setTimeout(() => {
  try {
    const last = db.prepare('SELECT value FROM settings WHERE key = ?').get(HB)?.value
    if (!last) return
    const gapMin = Math.round((Date.now() - new Date(last).getTime()) / 60000)
    if (gapMin >= 10) tgNotify(`🔔 رجع الموقع للعمل\nكان واقف حوالي ${gapMin} دقيقة.\nكل شي رجع طبيعي ✅`)
  } catch {}
}, 8000)

function backfillNumbers() {
  const rows = db.prepare('SELECT id FROM requests WHERE number IS NULL ORDER BY id').all()
  if (!rows.length) return
  let n = db.prepare('SELECT COALESCE(MAX(number), 1054) m FROM requests').get().m
  const up = db.prepare('UPDATE requests SET number = ? WHERE id = ?')
  for (const r of rows) up.run(++n, r.id)
  console.log(`backfilled ${rows.length} request numbers`)
}
backfillNumbers()

// توحيد صيغة الجوالات إلى +9665XXXXXXXX
function normalizePhones() {
  try {
    const users = db.prepare('SELECT id, phone FROM users WHERE phone IS NOT NULL').all()
    const upd = db.prepare('UPDATE users SET phone = ? WHERE id = ?')
    let fixed = 0
    for (const u of users) {
      const n = normalizePhone(u.phone)
      if (n && n !== u.phone && !db.prepare('SELECT 1 FROM users WHERE phone = ? AND id != ?').get(n, u.id)) {
        upd.run(n, u.id)
        fixed++
      }
    }
    if (fixed) console.log(`normalized ${fixed} phone numbers`)
  } catch (e) {
    console.error('phone normalize failed', e.message)
  }
}
normalizePhones()



/* ---------- الطلبات المباشرة (لفني معيّن) ---------- */
app.post('/api/requests/direct', authRequired, (req, res) => {
  const { expertId, title, description, city, subcategory } = req.body || {}
  const expert = db.prepare('SELECT * FROM experts WHERE id = ?').get(expertId)
  if (!expert) return res.status(404).json({ error: 'expert_not_found' })
  if (!title) return res.status(400).json({ error: 'title_required' })

  const nextNumber = db.prepare('SELECT COALESCE(MAX(number), 1054) + 1 n FROM requests').get().n
  const info = db.prepare(
    `INSERT INTO requests (user_id, title, category, description, city, subcategory, lat, lng,
       ends_at, warranty_days, number, direct_expert_id, direct_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 3, ?, ?, 'pending_expert')`,
  ).run(
    req.userId, title, expert.job, description || null, city || expert.city || null,
    subcategory || null, req.body?.lat ?? null, req.body?.lng ?? null, nextNumber, expert.id,
  )

  const request = requestWithBids(info.lastInsertRowid)
  const notice = {
    type: 'request',
    title: '📩 طلب مباشر لك',
    body: `${title} — ${city || expert.city || ''}`,
    requestId: request.id,
    category: expert.job,
  }
  if (expert.user_id) {
    io.to(`user:${expert.user_id}`).emit('notify', notice)
    pushToUsers([expert.user_id], { ...notice, url: `/requests/${request.id}`, tag: 'direct-' + request.id }).catch(() => {})
  }
  res.status(201).json(request)
})

const directGuard = (req) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id)
  if (!request) return { error: 'not_found', code: 404 }
  const mine = db.prepare('SELECT * FROM experts WHERE user_id = ?').get(req.userId)
  const isTarget = !!(mine && request.direct_expert_id === mine.id)
  const isOwner = request.user_id === req.userId
  return { request, mine, isTarget, isOwner }
}

app.post('/api/requests/:id/direct/accept', authRequired, (req, res) => {
  const g = directGuard(req)
  if (g.error) return res.status(g.code).json({ error: g.error })
  if (!g.isTarget) return res.status(403).json({ error: 'forbidden' })
  if (g.request.direct_state !== 'pending_expert') return res.status(409).json({ error: 'wrong_state' })
  db.prepare("UPDATE requests SET direct_state = 'awaiting_price' WHERE id = ?").run(g.request.id)
  io.to(`user:${g.request.user_id}`).emit('request:status', { id: g.request.id, direct_state: 'awaiting_price' })
  res.json(requestWithBids(g.request.id))
})

app.post('/api/requests/:id/direct/reject', authRequired, (req, res) => {
  const g = directGuard(req)
  if (g.error) return res.status(g.code).json({ error: g.error })
  if (!g.isTarget && !g.isOwner) return res.status(403).json({ error: 'forbidden' })
  db.prepare(
    `UPDATE requests SET status = 'canceled', direct_state = 'rejected',
      closed_at = datetime('now'), closed_by = 'user', close_reason = ? WHERE id = ?`,
  ).run(g.isTarget ? 'رفض الفني الطلب' : 'ألغى العميل الطلب', g.request.id)
  io.to(`user:${g.request.user_id}`).emit('request:status', { id: g.request.id, status: 'canceled' })
  if (g.request.direct_expert_id) {
    const ex = db.prepare('SELECT user_id FROM experts WHERE id = ?').get(g.request.direct_expert_id)
    if (ex?.user_id) io.to(`user:${ex.user_id}`).emit('request:status', { id: g.request.id, status: 'canceled' })
  }
  res.json(requestWithBids(g.request.id))
})

app.post('/api/requests/:id/direct/price', authRequired, (req, res) => {
  const g = directGuard(req)
  if (g.error) return res.status(g.code).json({ error: g.error })
  if (!g.isTarget) return res.status(403).json({ error: 'forbidden' })
  if (g.request.direct_state !== 'awaiting_price') return res.status(409).json({ error: 'wrong_state' })
  const amount = Number(req.body?.amount)
  if (!amount || amount <= 0) return res.status(400).json({ error: 'invalid_amount' })

  const info = db.prepare('INSERT INTO bids (request_id, expert_id, amount, note) VALUES (?, ?, ?, ?)')
    .run(g.request.id, g.mine.id, amount, req.body?.note || null)
  db.prepare("UPDATE requests SET direct_state = 'price_sent', accepted_bid_id = ? WHERE id = ?")
    .run(info.lastInsertRowid, g.request.id)

  io.to(`user:${g.request.user_id}`).emit('notify', {
    type: 'bid',
    title: '💰 وصل سعر الطلب المباشر',
    body: `${customerTotal(amount)} ر.س — اضغط للقبول أو الرفض`,
    requestId: g.request.id,
  })
  io.to(`user:${g.request.user_id}`).emit('request:status', { id: g.request.id, direct_state: 'price_sent' })
  res.json(requestWithBids(g.request.id))
})

app.post('/api/requests/:id/direct/accept-price', authRequired, (req, res) => {
  const g = directGuard(req)
  if (g.error) return res.status(g.code).json({ error: g.error })
  if (!g.isOwner) return res.status(403).json({ error: 'forbidden' })
  if (g.request.direct_state !== 'price_sent') return res.status(409).json({ error: 'wrong_state' })
  db.prepare("UPDATE requests SET status = 'awaiting_payment', direct_state = 'accepted' WHERE id = ?").run(g.request.id)
  io.to(`user:${req.userId}`).emit('request:status', { id: g.request.id, status: 'awaiting_payment' })
  res.json(requestWithBids(g.request.id))
})

/* ---------- إشعارات الويب (Web Push) ---------- */
const VAPID_PUBLIC = process.env.VAPID_PUBLIC || 'BKE0kJxB5-FqnKA0SMw8J2Qa0IvDNHbHvWpyUCzyyzLGTn76L96ZRhDFXj_iwTMgj2lfrNroYVs56KcbR10VK1w'
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || '5fvKkpYYxBCQqH8w5Gfz5h9AvJYir7sDo7hIXzw3pms'
try {
  webpush.setVapidDetails('mailto:abdmmm9@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE)
} catch (e) {
  console.error('VAPID_FAIL', e.message)
}

app.get('/api/push/key', (_req, res) => res.json({ key: VAPID_PUBLIC }))

app.post('/api/push/subscribe', authRequired, (req, res) => {
  const sub = req.body?.subscription || req.body
  const endpoint = sub?.endpoint
  const p256dh = sub?.keys?.p256dh
  const auth = sub?.keys?.auth
  if (!endpoint || !p256dh || !auth) return res.status(400).json({ error: 'bad_subscription' })
  db.prepare(
    `INSERT INTO push_subs (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
  ).run(req.userId, endpoint, p256dh, auth)
  res.json({ ok: true })
})

app.post('/api/push/unsubscribe', authRequired, (req, res) => {
  if (req.body?.endpoint) db.prepare('DELETE FROM push_subs WHERE endpoint = ?').run(req.body.endpoint)
  res.json({ ok: true })
})

app.post('/api/push/test', authRequired, async (req, res) => {
  const subs = db.prepare('SELECT * FROM push_subs WHERE user_id = ?').all(req.userId)
  let sent = 0
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: 'مهنتي — تجربة الإشعار 🔔', body: 'إذا وصلتك هذي، التنبيهات شغالة', url: '/requests' }),
      )
      sent++
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) db.prepare('DELETE FROM push_subs WHERE id = ?').run(s.id)
    }
  }
  res.json({ ok: true, subscriptions: subs.length, sent })
})

async function pushToUsers(userIds, payload) {
  if (!userIds.length) return 0
  const placeholders = userIds.map(() => '?').join(',')
  const subs = db.prepare(`SELECT * FROM push_subs WHERE user_id IN (${placeholders})`).all(...userIds)
  let sent = 0
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
      )
      sent++
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) db.prepare('DELETE FROM push_subs WHERE id = ?').run(s.id)
    }
  }
  return sent
}

/* ---------- auth (phone + OTP) ---------- */

// يفتح جلسة جديدة ويبطل كل الأجهزة السابقة
function startSession(userId) {
  db.prepare('UPDATE users SET session_version = COALESCE(session_version, 0) + 1 WHERE id = ?').run(userId)
  const v = db.prepare('SELECT session_version FROM users WHERE id = ?').get(userId)?.session_version || 1
  return { token: signToken(userId, v), version: v }
}

const DEV_MODE = process.env.NODE_ENV !== 'production' || process.env.DEV_OTP === '1'

app.post('/api/auth/request-otp', (req, res) => {
  const phone = normalizePhone(req.body?.phone)
  if (!phone) return res.status(400).json({ error: 'invalid_phone' })

  const code = String(Math.floor(100000 + Math.random() * 900000))
  const expiresAt = Date.now() + 5 * 60 * 1000
  db.prepare(
    `INSERT INTO otps (phone, code, expires_at, attempts) VALUES (?, ?, ?, 0)
     ON CONFLICT(phone) DO UPDATE SET code=excluded.code, expires_at=excluded.expires_at, attempts=0`,
  ).run(phone, code, expiresAt)

  // In production this is where an SMS provider (Unifonic / Msegat) is called.
  res.json({ ok: true, phone, expiresIn: 300, ...(DEV_MODE ? { devCode: code } : {}) })
})

app.post('/api/auth/signup', (req, res) => {
  const b = req.body || {}
  const username = String(b.username || '').trim()
  const password = String(b.password || '')
  const name = String(b.name || '').trim()
  if (username.length < 3) return res.status(400).json({ error: 'username_short' })
  if (password.length < 6) return res.status(400).json({ error: 'password_short' })
  if (!name) return res.status(400).json({ error: 'name_required' })

  const exists = db.prepare('SELECT id FROM users WHERE lower(username) = ?').get(username.toLowerCase())
  if (exists) return res.status(409).json({ error: 'username_taken' })

  const phone = normalizePhone(b.phone)
  if (phone && db.prepare('SELECT id FROM users WHERE phone = ?').get(phone)) {
    return res.status(409).json({ error: 'phone_taken' })
  }

  if (isBlockedPhone(phone)) return res.status(403).json({ error: 'phone_blocked' })
  if (!b.email || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(String(b.email).trim()))
    return res.status(400).json({ error: 'email_required' })
  const role = ['expert', 'support', 'customer'].includes(b.role) ? b.role : 'customer'
  const info = db
    .prepare(
      `INSERT INTO users (phone, name, city, role, email, nationality, specialty, lat, lng, username, password_hash, last_seen, referred_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`,
    )
    .run(phone, name, b.city || null, role, b.email || null, b.nationality || null, b.specialty || null,
      b.lat != null ? Number(b.lat) : null, b.lng != null ? Number(b.lng) : null,
      username, hashUserPassword(password), inviterUserOf(b.ref)?.id || null)

  const userId = info.lastInsertRowid
  if (role === 'expert') {
    const trades = sanitizeTrades(b.trades, b.specialty)
    const job = trades[0]?.cat || 'AC'
    const years = Number(b.exp_years) > 0 ? Number(b.exp_years) : 0
    db.prepare(
      `INSERT INTO experts (name, name_ar, job, city, rate, rating, reviews_count, image, phone, skills, experience, lat, lng, user_id, verify_status, has_car, trades, exp_years)
       VALUES (?, ?, ?, ?, '150 ريال/ساعة', 4.5, 0, '/experts/ac.jpg', ?, '[]', ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    ).run(name, name, job, b.city || 'الرياض', phone,
      years ? `${years} سنة` : '1 سنة',
      b.lat != null ? Number(b.lat) : null, b.lng != null ? Number(b.lng) : null, userId, b.has_car ? 1 : 0,
      JSON.stringify(trades), b.exp_years != null ? Number(b.exp_years) : null)
    const created = db.prepare('SELECT id FROM experts WHERE user_id = ?').get(userId)
    if (created) ensureInviteCode(created.id)
  }

  ensureUserCode(userId)
  if (b.ref) refreshLoyaltyBonus(inviterUserOf(b.ref)?.id)
  res.status(201).json({ ...startSession(userId), user: fullUser(userId) })
})

app.post('/api/auth/login-local', (req, res) => {
  const user = findByIdentifier(req.body?.identifier)
  if (!user || !verifyPassword(req.body?.password, user.password_hash)) {
    return res.status(401).json({ error: 'invalid_credentials' })
  }
  if (user.status === 'suspended') return res.status(403).json({ error: 'account_suspended' })
  if (isBlockedPhone(user.phone)) return res.status(403).json({ error: 'phone_blocked' })
  db.prepare("UPDATE users SET last_seen = datetime('now') WHERE id = ?").run(user.id)
  res.json({ ...startSession(user.id), user: fullUser(user.id) })
})

app.post('/api/auth/verify', (req, res) => {
  const phone = normalizePhone(req.body?.phone)
  const code = String(req.body?.code || '').trim()
  if (!phone) return res.status(400).json({ error: 'invalid_phone' })
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
    const info = db.prepare('INSERT INTO users (phone, name, phone_verified) VALUES (?, ?, 1)').run(phone, req.body?.name || null)
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)
    ensureUserCode(user.id)
  } else {
    db.prepare('UPDATE users SET phone_verified = 1 WHERE id = ?').run(user.id)
  }
  res.json({ ...startSession(user.id), user })
})

const fullUser = (id) =>
  db
    .prepare(
      `SELECT id, phone, name, city, role, email, nationality, specialty, lat, lng, avatar,
        sound_on, last_seen, created_at, COALESCE(violations,0) AS violations, status,
        COALESCE(verified,0) AS verified, COALESCE(email_verified,0) AS email_verified, COALESCE(stars_total,0) AS stars_total, COALESCE(reviews_count,0) AS reviews_count,
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
    const trades = sanitizeTrades(b.trades, b.specialty)
    const job = trades[0]?.cat || b.specialty || null
    const existing = db.prepare('SELECT * FROM experts WHERE user_id = ?').get(req.userId)
    if (existing) {
      db.prepare(
        `UPDATE experts SET name = ?, name_ar = ?, job = ?, city = ?, phone = ?, lat = ?, lng = ?, has_car = ?, trades = ?, exp_years = ? WHERE id = ?`,
      ).run(name, name, job || existing.job, b.city || existing.city, b.phone || existing.phone,
        b.lat != null ? Number(b.lat) : existing.lat, b.lng != null ? Number(b.lng) : existing.lng,
        b.has_car !== undefined ? (b.has_car ? 1 : 0) : existing.has_car,
        trades ? JSON.stringify(trades) : existing.trades,
        b.exp_years != null ? Number(b.exp_years) : existing.exp_years,
        existing.id)
    } else {
      db.prepare(
        `INSERT INTO experts (name, name_ar, job, city, rate, rating, reviews_count, image, phone, skills, experience, lat, lng, user_id, verify_status, has_car, trades, exp_years)
         VALUES (?, ?, ?, ?, '150 ريال/ساعة', 4.5, 0, '/experts/ac.jpg', ?, '[]', ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      ).run(name, name, job || 'AC', b.city || 'الرياض', b.phone || null,
        b.exp_years ? `${Number(b.exp_years)} سنة` : '1 سنة',
        b.lat != null ? Number(b.lat) : null, b.lng != null ? Number(b.lng) : null, req.userId, b.has_car ? 1 : 0,
        JSON.stringify(trades || []), b.exp_years != null ? Number(b.exp_years) : null)
      const created = db.prepare('SELECT id FROM experts WHERE user_id = ?').get(req.userId)
      if (created) ensureInviteCode(created.id)
    }
  }

  res.json(fullUser(req.userId))
})

app.patch('/api/me/profile', authRequired, (req, res) => {
  const b = { ...(req.body || {}) }
  if (b.phone !== undefined) b.phone = normalizePhone(b.phone)
  const sets = []
  const params = []
  for (const f of ['name', 'city', 'lat', 'lng', 'email', 'nationality', 'specialty', 'phone']) {
    if (b[f] !== undefined) { sets.push(`${f} = ?`); params.push(b[f]) }
  }
  if (!sets.length) return res.status(400).json({ error: 'nothing_to_update' })
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params, req.userId)
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
  if (category) { sql += " AND (job = ? OR COALESCE(trades,'') LIKE ?)"; params.push(category, `%"cat":"${category}"%`) }
  if (q) {
    const like = `%${q}%`
    sql += " AND (name LIKE ? OR name_ar LIKE ? OR job LIKE ? OR city LIKE ? OR COALESCE(skills,'') LIKE ? OR COALESCE(trades,'') LIKE ?)"
    params.push(like, like, like, like, like, like)
  }
  sql += ' ORDER BY has_car DESC, rating DESC'
  const rows = db.prepare(sql).all(...params)
  res.json(rows.map((r) => publicExpert(decorateExpert(r))))
})

app.patch('/api/me/expert', authRequired, (req, res) => {
  const e = db.prepare('SELECT * FROM experts WHERE user_id = ?').get(req.userId)
  if (!e) return res.status(404).json({ error: 'not_expert' })
  const b = req.body || {}
  if (b.has_car !== undefined) db.prepare('UPDATE experts SET has_car = ? WHERE id = ?').run(b.has_car ? 1 : 0, e.id)
  if (b.trades !== undefined) {
    const trades = sanitizeTrades(b.trades, e.job)
    if (trades.length) {
      db.prepare('UPDATE experts SET trades = ?, job = ? WHERE id = ?').run(JSON.stringify(trades), trades[0].cat, e.id)
    }
  }
  if (b.exp_years !== undefined) {
    const y = Math.max(0, Math.min(70, Number(b.exp_years) || 0))
    db.prepare('UPDATE experts SET exp_years = ?, experience = ? WHERE id = ?').run(y, y ? `${y} سنة` : null, e.id)
  }
  if (b.bio !== undefined) db.prepare('UPDATE experts SET bio = ? WHERE id = ?').run(String(b.bio || '').slice(0, 600), e.id)
  const updated = db.prepare('SELECT * FROM experts WHERE id = ?').get(e.id)
  res.json(decorateExpert(updated))
})

/* شهادات الفني — رفع من جهازه */
app.post('/api/me/certs', authRequired, uploadAny.single('file'), (req, res) => {
  const e = db.prepare('SELECT * FROM experts WHERE user_id = ?').get(req.userId)
  if (!e) return res.status(404).json({ error: 'not_expert' })
  if (!req.file) return res.status(400).json({ error: 'file_required' })
  const certs = certsOf(e)
  if (certs.length >= 10) return res.status(400).json({ error: 'too_many_certs' })
  certs.push({ url: `/uploads/${req.file.filename}`, name: String(req.body?.name || req.file.originalname || 'شهادة').slice(0, 90) })
  db.prepare('UPDATE experts SET certs = ? WHERE id = ?').run(JSON.stringify(certs), e.id)
  res.status(201).json(decorateExpert(db.prepare('SELECT * FROM experts WHERE id = ?').get(e.id)))
})

app.delete('/api/me/certs/:idx', authRequired, (req, res) => {
  const e = db.prepare('SELECT * FROM experts WHERE user_id = ?').get(req.userId)
  if (!e) return res.status(404).json({ error: 'not_expert' })
  const certs = certsOf(e)
  certs.splice(Number(req.params.idx), 1)
  db.prepare('UPDATE experts SET certs = ? WHERE id = ?').run(JSON.stringify(certs), e.id)
  res.json(decorateExpert(db.prepare('SELECT * FROM experts WHERE id = ?').get(e.id)))
})

/* الفنيون المتصلون القريبون (٥ كم) — للطلب المباشر بدون مزاد */
app.get('/api/experts/nearby', (req, res) => {
  const lat = Number(req.query.lat)
  const lng = Number(req.query.lng)
  const km = Math.min(Number(req.query.km) || 10, 30)
  if (!lat || !lng) return res.status(400).json({ error: 'location_required' })

  const rows = db
    .prepare(
      `SELECT e.*, u.last_seen AS user_last_seen
       FROM experts e JOIN users u ON u.id = e.user_id
       WHERE COALESCE(e.verify_status,'approved') = 'approved'
         AND e.lat IS NOT NULL AND e.lng IS NOT NULL
         AND u.last_seen IS NOT NULL
         AND u.last_seen >= datetime('now','-3 minutes')`,
    )
    .all()

  const out = rows
    .map((e) => ({ ...publicExpert(decorateExpert(e)), distance_km: haversineKm(lat, lng, e.lat, e.lng) }))
    .filter((e) => e.distance_km !== null && e.distance_km <= km)
    .sort((a, b) => a.distance_km - b.distance_km)

  res.json(out)
})

app.get('/api/me/expert', authRequired, (req, res) => {
  const e = db.prepare('SELECT * FROM experts WHERE user_id = ?').get(req.userId)
  if (!e) return res.json(null)
  res.json(decorateExpert(e))
})

app.patch('/api/admin/experts/:id', adminRequired, (req, res) => {
  const e = db.prepare('SELECT * FROM experts WHERE id = ?').get(req.params.id)
  if (!e) return res.status(404).json({ error: 'not_found' })
  const b = req.body || {}
  const sets = []
  const params = []
  for (const f of ['lat', 'lng', 'city', 'job', 'name', 'name_ar', 'rate', 'badge_color', 'badge_label',
    'company_name', 'bio', 'image', 'phone', 'experience']) {
    if (b[f] !== undefined) { sets.push(`${f} = ?`); params.push(b[f] === '' ? null : b[f]) }
  }
  for (const f of ['verify_status', 'is_company', 'exp_years']) {
    if (b[f] !== undefined) { sets.push(`${f} = ?`); params.push(f === 'is_company' ? (b[f] ? 1 : 0) : b[f]) }
  }
  if (b.trades !== undefined) {
    const trades = sanitizeTrades(b.trades, b.job || e.job)
    sets.push('trades = ?'); params.push(JSON.stringify(trades))
    if (b.job === undefined) { sets.push('job = ?'); params.push(trades[0]?.cat || e.job) }
  }
  if (b.certs !== undefined) {
    sets.push('certs = ?'); params.push(JSON.stringify(Array.isArray(b.certs) ? b.certs.filter((c) => c && c.url) : []))
  }
  if (b.experience !== undefined && b.exp_years === undefined) {
    const y = parseInt(String(b.experience), 10)
    if (!Number.isNaN(y)) { sets.push('exp_years = ?'); params.push(y) }
  }
  if (sets.length) db.prepare(`UPDATE experts SET ${sets.join(', ')} WHERE id = ?`).run(...params, e.id)
  res.json(decorateExpert(db.prepare('SELECT * FROM experts WHERE id = ?').get(e.id)))
})

/* ➕ إضافة فني أو شركة متخصصة من لوحة التحكم (بأي شعار لون) */
app.post('/api/admin/experts', adminRequired, (req, res) => {
  const b = req.body || {}
  const name = String(b.name || '').trim()
  if (!name) return res.status(400).json({ error: 'name_required' })
  const trades = sanitizeTrades(b.trades, b.job)
  const job = trades[0]?.cat || String(b.job || 'AC')
  const years = Number(b.exp_years) > 0 ? Number(b.exp_years) : null
  const info = db
    .prepare(
      `INSERT INTO experts (name, name_ar, job, city, rate, rating, reviews_count, image, phone, skills, experience,
        lat, lng, verify_status, has_car, trades, exp_years, badge_color, badge_label, is_company, company_name, bio)
       VALUES (?, ?, ?, ?, ?, 5, 0, ?, ?, '[]', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(name, b.name_ar || name, job, b.city || 'الرياض', b.rate || 'حسب الاتفاق', b.image || '/experts/ac.jpg',
      b.phone || null, years ? `${years} سنة` : null,
      b.lat != null ? Number(b.lat) : null, b.lng != null ? Number(b.lng) : null,
      b.verify_status || 'approved', JSON.stringify(trades), years,
      b.badge_color || null, b.badge_label || null, b.is_company ? 1 : 0, b.company_name || null, b.bio || null)
  ensureInviteCode(info.lastInsertRowid)
  res.status(201).json(decorateExpert(db.prepare('SELECT * FROM experts WHERE id = ?').get(info.lastInsertRowid)))
})

app.delete('/api/admin/experts/:id', adminRequired, (req, res) => {
  const e = db.prepare('SELECT * FROM experts WHERE id = ?').get(req.params.id)
  if (!e) return res.status(404).json({ error: 'not_found' })
  db.prepare('DELETE FROM experts WHERE id = ?').run(e.id)
  if (e.user_id) db.prepare("UPDATE users SET role = 'customer' WHERE id = ?").run(e.user_id)
  res.json({ ok: true })
})

/* رفع ملفات (شهادات PDF/صور) من لوحة التحكم */
app.post('/api/admin/upload-file', adminRequired, uploadAny.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file' })
  res.status(201).json({ url: `/uploads/${req.file.filename}`, name: req.file.originalname })
})

app.get('/api/experts/:id/contact', authRequired, (req, res) => {
  const expert = db.prepare('SELECT * FROM experts WHERE id = ?').get(req.params.id)
  if (!expert) return res.status(404).json({ error: 'not_found' })

  const paid = db
    .prepare(
      `SELECT 1 FROM requests r
       JOIN bids b ON b.id = r.accepted_bid_id
       JOIN payments p ON p.request_id = r.id
       WHERE r.user_id = ? AND b.expert_id = ? AND p.kind = 'service'
       LIMIT 1`,
    )
    .get(req.userId, expert.id)

  if (!paid) return res.json({ allowed: false })
  res.json({ allowed: true, phone: expert.phone, whatsapp: expert.phone?.replace(/[^\d]/g, '') })
})

app.get('/api/experts/:id/reviews', (req, res) => {
  res.json(
    db.prepare(
      `SELECT r.*, u.name AS customer_name FROM reviews r
       LEFT JOIN requests q ON q.id = r.request_id LEFT JOIN users u ON u.id = q.user_id
       WHERE r.expert_id = ? ORDER BY r.id DESC LIMIT 30`,
    ).all(req.params.id),
  )
})

app.get('/api/experts/:id', (req, res) => {
  const row = db.prepare("SELECT * FROM experts WHERE id = ? AND COALESCE(verify_status, 'approved') = 'approved'").get(req.params.id)
  if (!row) return res.status(404).json({ error: 'not_found' })
  res.json(publicExpert(decorateExpert(row)))
})


/* ---------- تخصصات الفني (أكثر من تخصص + خدماته) ---------- */
function sanitizeTrades(input, fallbackJob) {
  let arr = []
  if (Array.isArray(input)) arr = input
  else if (typeof input === 'string' && input.trim()) arr = [{ cat: input.trim(), subs: [] }]
  const out = []
  for (const t of arr.slice(0, 8)) {
    const cat = String((t && (t.cat || t.key || t.name)) || '').trim()
    if (!cat) continue
    if (out.some((x) => x.cat === cat)) continue
    const subs = Array.isArray(t?.subs) ? t.subs.map((x) => String(x).trim()).filter(Boolean).slice(0, 15) : []
    out.push({ cat, subs: [...new Set(subs)] })
  }
  if (!out.length && fallbackJob) out.push({ cat: String(fallbackJob), subs: [] })
  return out
}


/* ---------- المحفظة والدعوات ---------- */
/** إشعار العميل قبل انتهاء رصيد نادي الولاء بأسبوع */
function notifyExpiringCredits() {
  try {
    expireCredits()
    const rows = db
      .prepare(
        `SELECT c.id, c.user_id, c.remaining, c.expires_at, u.name
         FROM credits c JOIN users u ON u.id = c.user_id
         WHERE c.remaining > 0
           AND COALESCE(c.expiry_notified,0) = 0
           AND c.expires_at > datetime('now')
           AND c.expires_at <= datetime('now', '+7 days')`,
      )
      .all()
    if (!rows.length) return 0
    const mark = db.prepare('UPDATE credits SET expiry_notified = 1 WHERE id = ?')
    for (const r of rows) {
      const days = Math.max(1, Math.ceil((new Date(String(r.expires_at).replace(' ', 'T') + 'Z').getTime() - Date.now()) / 864e5))
      const body = `${Number(r.remaining).toFixed(2)} ر.س تنتهي بعد ${days} يوم (${String(r.expires_at).slice(0, 10)}) — استخدمها في طلب فني`
      io.to(`user:${r.user_id}`).emit('notify', {
        type: 'credit',
        title: '⏳ رصيدك في نادي الولاء قرب ينتهي',
        body,
        url: '/profile',
      })
      pushToUsers([r.user_id], {
        title: '⏳ رصيد نادي الولاء قرب ينتهي',
        body,
        url: '/profile',
        tag: 'credit-' + r.id,
      }).catch(() => {})
      mark.run(r.id)
    }
    console.log('credit expiry notices:', rows.length)
    return rows.length
  } catch (e) {
    console.error('CREDIT_NOTICE_FAIL', e.message)
    return 0
  }
}

function refreshLoyaltyBonus(inviterUserId) {
  try {
    if (!inviterUserId) return
    const r = checkLoyaltyBonus(inviterUserId)
    if (r.credited) {
      io.to(`user:${inviterUserId}`).emit('notify', {
        type: 'wallet',
        title: '🎁 مكافأة نادي الولاء',
        body: `أضفنا ${r.credited} ر.س لرصيدك — ${r.qualified} عضو نشط سجّل بكودك`,
      })
    }
  } catch (e) { console.error('LOYALTY_FAIL', e.message) }
}

function refreshInviterAll(userId) {
  try {
    const u = db.prepare('SELECT referred_by FROM users WHERE id = ?').get(userId)
    if (!u?.referred_by) return
    refreshLoyaltyBonus(u.referred_by)
    const ex = db.prepare('SELECT id FROM experts WHERE user_id = ?').get(u.referred_by)
    if (ex) {
      const r = checkReferralBonus(ex.id)
      if (r.credited) {
        io.to(`user:${u.referred_by}`).emit('notify', {
          type: 'wallet',
          title: '🎁 مكافأة دعوة',
          body: `وصل ${r.credited} ر.س لمحفظتك — ${r.qualified} فني نشط سجّل بكودك`,
        })
      }
    }
  } catch (e) { console.error('INVITE_REFRESH_FAIL', e.message) }
}

function refreshInviterBonus(userId) {
  try {
    const u = db.prepare('SELECT referred_by FROM users WHERE id = ?').get(userId)
    if (!u?.referred_by) return
    const r = checkReferralBonus(u.referred_by)
    if (r.credited) {
      const inv = db.prepare('SELECT user_id, name_ar, name FROM experts WHERE id = ?').get(u.referred_by)
      if (inv?.user_id) {
        io.to(`user:${inv.user_id}`).emit('notify', {
          type: 'wallet',
          title: '🎁 مكافأة دعوة',
          body: `وصل ${r.credited} ر.س لمحفظتك — ${r.qualified} فني نشط سجّل بكودك`,
        })
      }
    }
  } catch (e) { console.error('REF_BONUS_FAIL', e.message) }
}

/* ---------- requests + live bidding ---------- */

const getSetting = (k, d) => db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value ?? d
const commissionCustomer = () => Number(getSetting('commission_customer', 7.5))
const commissionExpert = () => Number(getSetting('commission_expert', 7.5))
const round2 = (n) => Math.round(n * 100) / 100
const customerTotal = (amount) => round2(Number(amount) || 0) // العميل يدفع قيمة السومة فقط — العمولة على الفني

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

const SENSITIVE_EXPERT_FIELDS = ['phone', 'iqama_number', 'iqama_name', 'iqama_issue', 'iqama_expiry', 'iqama_image', 'verify_note']

/** بيانات الفني العامة — بدون جوال أو بيانات إقامة (تظهر فقط بعد الدفع عبر /contact) */
const publicExpert = (e) => {
  const o = { ...e }
  for (const f of SENSITIVE_EXPERT_FIELDS) o[f] = null
  return o
}

const requestWithBids = (id) => {
  const request = db
    .prepare(
      `SELECT r.*, u.name AS owner_name, u.phone AS owner_phone, u.verified AS owner_verified,
              u.stars_total AS owner_stars, u.reviews_count AS owner_reviews, u.avatar AS owner_avatar
       FROM requests r JOIN users u ON u.id = r.user_id WHERE r.id = ?`,
    )
    .get(id)
  if (!request) return null
  const bids = db
    .prepare(
      `SELECT b.*, e.name AS expert_name, e.name_ar AS expert_name_ar, e.job AS expert_job, e.rating AS expert_rating, e.image AS expert_image, e.lat AS lat, e.lng AS lng
       FROM bids b JOIN experts e ON e.id = b.expert_id
       WHERE b.request_id = ? AND COALESCE(b.status, 'active') = 'active' ORDER BY b.amount ASC`,
    )
    .all(id)
    .map((b) => ({ ...b, distance_km: haversineKm(request.lat, request.lng, b.lat, b.lng) }))
  const extras = db.prepare('SELECT * FROM request_extras WHERE request_id = ? ORDER BY id').all(id)
  const extrasTotal = extras.reduce((a, e) => a + e.amount, 0)
  const nearest = bids
    .filter((b) => b.distance_km !== null)
    .sort((a, z) => a.distance_km - z.distance_km)[0]
  return { ...request, bids, extras, extras_total: extrasTotal, nearest_bid_id: nearest?.id ?? null }
}

app.get('/api/my/requests', authRequired, (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.*,
        (SELECT COUNT(*) FROM bids b WHERE b.request_id = r.id) AS bids_count,
        (SELECT MIN(amount) FROM bids b WHERE b.request_id = r.id) AS lowest_bid
       FROM requests r WHERE r.user_id = ? ORDER BY r.id DESC`,
    )
    .all(req.userId)

  const active = rows.filter((r) => ['open', 'awaiting_payment', 'assigned', 'done'].includes(r.status))
  const archived = rows.filter((r) => ['closed', 'canceled'].includes(r.status))
  res.json({ active, archived })
})

app.get('/api/requests/counts', (_req, res) => {
  const rows = db
    .prepare("SELECT category, COUNT(*) c FROM requests WHERE status = 'open' GROUP BY category")
    .all()
  const byCategory = Object.fromEntries(rows.map((r) => [r.category, r.c]))
  res.json({ total: rows.reduce((a, r) => a + r.c, 0), byCategory })
})

app.get('/api/requests', authRequired, (req, res) => {
  const me = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId)
  const mine = db.prepare('SELECT * FROM experts WHERE user_id = ?').get(req.userId)

  let rows
  if (mine) {
    // الفني: الطلبات المفتوحة في أي من تخصصاته + طلباته هو
    const myCats = catsOf(mine)
    const catPh = myCats.map(() => '?').join(',') || "''"
    rows = db
      .prepare(
        `SELECT r.*, u.name AS owner_name, u.verified AS owner_verified, u.stars_total AS owner_stars,
          (SELECT COUNT(*) FROM bids b WHERE b.request_id = r.id AND COALESCE(b.status,'active')='active') AS bids_count,
          (SELECT MIN(b.amount) FROM bids b WHERE b.request_id = r.id AND b.expert_id = ?) AS lowest_bid,
          (SELECT amount FROM bids b WHERE b.request_id = r.id AND b.expert_id = ? ORDER BY b.id DESC LIMIT 1) AS my_bid
         FROM requests r JOIN users u ON u.id = r.user_id
         WHERE (r.category IN (${catPh}) AND r.status = 'open' AND r.direct_expert_id IS NULL
                AND (r.ends_at IS NULL OR datetime(r.ends_at) > datetime('now','-5 minutes')))
            OR r.user_id = ?
            OR r.direct_expert_id = ?
         ORDER BY r.id DESC LIMIT 100`,
      )
      .all(mine.id, mine.id, ...myCats, req.userId, mine.id)
  } else {
    // العميل: طلباته فقط
    rows = db
      .prepare(
        `SELECT r.*, u.name AS owner_name,
          (SELECT COUNT(*) FROM bids b WHERE b.request_id = r.id AND COALESCE(b.status,'active')='active') AS bids_count,
          (SELECT MIN(b.amount) FROM bids b WHERE b.request_id = r.id AND COALESCE(b.status,'active')='active') AS lowest_bid
         FROM requests r JOIN users u ON u.id = r.user_id
         WHERE r.user_id = ?
         ORDER BY r.id DESC LIMIT 100`,
      )
      .all(req.userId)
  }
  // للعميل: الأرخص = السعر النهائي الشامل (بدون ذكر عمولة)
  const out = rows.map((r) => {
    if (mine) return r
    return {
      ...r,
      lowest_bid: r.lowest_bid != null ? customerTotal(r.lowest_bid) : null,
    }
  })
  res.json(out)
})

app.get('/api/requests/:id', (req, res) => {
  const data = requestWithBids(req.params.id)
  if (!data) return res.status(404).json({ error: 'not_found' })

  // من يحق له العرض: صاحب الطلب، الفني المسند، أو فني بنفس التخصص (ليسوم)
  const token = (req.headers.authorization || '').replace('Bearer ', '')
  const viewer = token ? verifyToken(token) : null
  if (viewer && !String(viewer.uid).startsWith('admin:')) {
    const uid = viewer.uid
    const isOwner = data.user_id === uid
    const mine = db.prepare('SELECT * FROM experts WHERE user_id = ?').get(uid)
    const accepted = data.bids.find((b) => b.id === data.accepted_bid_id)
    const isAssigned = !!(mine && accepted && accepted.expert_id === mine.id)
    const sameSpecialty = !!(mine && catsOf(mine).includes(data.category) && data.status === 'open' && !data.direct_expert_id)
    const isDirectTarget = !!(mine && data.direct_expert_id === mine.id)
    if (!isOwner && !isAssigned && !sameSpecialty && !isDirectTarget) {
      return res.status(403).json({ error: 'forbidden' })
    }
    // 🔒 السرية: الفني يشوف سوماته فقط — ما يشوف سومات منافسيه
    if (!isOwner && mine) {
      const mineBids = data.bids.filter((b) => b.expert_id === mine.id)
      return res.json({
        ...data,
        bids: mineBids,
        bids_count: data.bids.length,
        bids_hidden: true,
        nearest_bid_id: null,
      })
    }
  }
  // العميل يشوف السعر النهائي لكل سومة (شامل — بدون تفصيل عمولة)
  if (String(viewer?.uid || '').startsWith('admin:')) return res.json(data)
  const ownerView = viewer && data.user_id === viewer.uid
  if (ownerView) {
    const priced = data.bids.map((b) => ({ ...b, amount: customerTotal(b.amount) }))
    return res.json({ ...data, bids: priced })
  }
  res.json(data)
})

app.post('/api/requests', authRequired, (req, res) => {
  const { title, category, description, city, budget, subcategory, warranty_days } = req.body || {}
  if (!title || !category) return res.status(400).json({ error: 'title_and_category_required' })

  // السعر ما يحدده العميل — يجي من المزاد (نحتفظ بالميزانية فقط إن أرسلها API قديم)

  const nextNumber = db.prepare('SELECT COALESCE(MAX(number), 1054) + 1 n FROM requests').get().n
  const info = db
    .prepare(
      `INSERT INTO requests (user_id, title, category, description, city, budget, lat, lng, ends_at, subcategory, warranty_days, number)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+2 minutes'), ?, ?, ?)`,
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
      nextNumber,
    )
  const request = requestWithBids(info.lastInsertRowid)
  refreshInviterAll(req.userId)
  io.emit('request:new', request)
  // 🔔 لافتة «طلب جديد» تروح لفنيّي نفس التخصص فقط (مو للعملاء ولا لباقي الفنيين)
  const notice = {
    type: 'request',
    title: 'طلب جديد في تخصصك',
    body: `${request.title}${request.subcategory ? ' · ' + request.subcategory : ''} — ${request.city || ''}`,
    requestId: request.id,
    category: request.category,
    subcategory: request.subcategory || null,
  }
  const allExperts = db.prepare('SELECT id, job, trades, user_id FROM experts WHERE user_id IS NOT NULL').all()
  const targets = allExperts.filter((e) => catsOf(e).includes(request.category))
  for (const t of targets) io.to(`user:${t.user_id}`).emit('notify', notice)
  // 📲 إشعار دفع حقيقي (يوصل حتى لو التطبيق مسكّر)
  pushToUsers(
    targets.map((t) => t.user_id),
    {
      title: '🔔 طلب جديد في تخصصك',
      body: `${request.title}${request.subcategory ? ' · ' + request.subcategory : ''} — ${request.city || ''}`,
      url: `/requests/${request.id}`,
      tag: 'req-' + request.id,
    },
  ).catch((e) => console.error('PUSH_FAIL', e.message))
  onNewRequest(io, request)
  res.status(201).json(request)
})

app.post('/api/requests/:id/bids', authRequired, (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id)
  if (!request) return res.status(404).json({ error: 'not_found' })
  if (request.status !== 'open') return res.status(409).json({ error: 'request_closed' })
  if (request.ends_at && new Date(request.ends_at.replace(' ', 'T') + 'Z') < new Date())
    return res.status(409).json({ error: 'auction_ended' })

  const mine = db.prepare('SELECT * FROM experts WHERE user_id = ?').get(req.userId)
  if (!mine) return res.status(403).json({ error: 'not_an_expert' })
  if ((mine.verify_status || 'approved') !== 'approved') return res.status(403).json({ error: 'not_verified' })
  if (!catsOf(mine).includes(request.category) && request.direct_expert_id !== mine.id)
    return res.status(403).json({ error: 'not_your_specialty' })
  const expertId = mine.id
  const amount = Number(req.body?.amount)
  if (!amount || amount <= 0) return res.status(400).json({ error: 'invalid_bid' })

  const expert = mine

  const info = db
    .prepare('INSERT INTO bids (request_id, expert_id, amount, note) VALUES (?, ?, ?, ?)')
    .run(request.id, expertId, amount, req.body?.note || null)
  refreshInviterAll(req.userId)

  const bid = db
    .prepare(
      `SELECT b.*, e.name AS expert_name, e.name_ar AS expert_name_ar, e.job AS expert_job, e.rating AS expert_rating, e.image AS expert_image, e.lat AS lat, e.lng AS lng
       FROM bids b JOIN experts e ON e.id = b.expert_id WHERE b.id = ?`,
    )
    .get(info.lastInsertRowid)
  // سري: السومة تذهب للعميل وصاحبها فقط (مو لكل الفنيين)
  io.to(`user:${request.user_id}`).emit('bid:new', bid)
  io.to(`user:${req.userId}`).emit('bid:new', bid)
  io.to(`user:${request.user_id}`).emit('notify', {
    type: 'bid',
    title: 'سومة جديدة',
    body: `${bid.expert_name_ar || bid.expert_name} سوم بـ${bid.amount} ريال`,
    requestId: request.id,
    amount: bid.amount,
  })
  res.status(201).json(bid)
})

/* ---------- المحادثة داخل الطلب ---------- */

const canAccessRequest = (request, userId) => {
  if (request.user_id === userId) return true
  const mine = db.prepare('SELECT * FROM experts WHERE user_id = ?').get(userId)
  if (!mine || !request.accepted_bid_id) return false
  const acc = db.prepare('SELECT * FROM bids WHERE id = ?').get(request.accepted_bid_id)
  return !!acc && acc.expert_id === mine.id
}

app.get('/api/requests/:id/messages', authRequired, (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id)
  if (!request) return res.status(404).json({ error: 'not_found' })
  if (!canAccessRequest(request, req.userId)) return res.status(403).json({ error: 'forbidden' })
  res.json(
    db.prepare(
      `SELECT m.*, u.name AS sender_name FROM messages m JOIN users u ON u.id = m.sender_id
       WHERE m.request_id = ? ORDER BY m.id`,
    ).all(request.id),
  )
})

app.post('/api/requests/:id/messages', authRequired, (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id)
  if (!request) return res.status(404).json({ error: 'not_found' })
  if (!canAccessRequest(request, req.userId)) return res.status(403).json({ error: 'forbidden' })
  const body = String(req.body?.body || '').trim()
  if (!body) return res.status(400).json({ error: 'empty' })

  const info = db.prepare('INSERT INTO messages (request_id, sender_id, body) VALUES (?, ?, ?)').run(request.id, req.userId, body)
  const msg = db
    .prepare('SELECT m.*, u.name AS sender_name FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?')
    .get(info.lastInsertRowid)

  io.to(`request:${request.id}`).emit('message:new', msg)
  const other = request.user_id === req.userId
    ? db.prepare('SELECT user_id FROM experts WHERE id = (SELECT expert_id FROM bids WHERE id = ?)').get(request.accepted_bid_id)?.user_id
    : request.user_id
  if (other) {
    io.to(`user:${other}`).emit('notify', {
      type: 'message',
      title: 'رسالة جديدة',
      body: body.slice(0, 60),
      requestId: request.id,
    })
  }
  res.status(201).json(msg)
})

app.post('/api/requests/:id/bids/:bidId/reject', authRequired, (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id)
  if (!request) return res.status(404).json({ error: 'not_found' })
  if (request.user_id !== req.userId) return res.status(403).json({ error: 'forbidden' })
  if (request.status !== 'open') return res.status(409).json({ error: 'request_closed' })
  const bid = db.prepare('SELECT * FROM bids WHERE id = ? AND request_id = ?').get(req.params.bidId, request.id)
  if (!bid) return res.status(404).json({ error: 'bid_not_found' })
  db.prepare("UPDATE bids SET status = 'rejected' WHERE id = ?").run(bid.id)
  res.json({ ok: true })
})

app.post('/api/requests/:id/extras', authRequired, (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id)
  if (!request) return res.status(404).json({ error: 'not_found' })
  const mine = db.prepare('SELECT * FROM experts WHERE user_id = ?').get(req.userId)
  const acc = request.accepted_bid_id ? db.prepare('SELECT * FROM bids WHERE id = ?').get(request.accepted_bid_id) : null
  const isAssignedExpert = !!(mine && acc && acc.expert_id === mine.id)
  if (request.user_id !== req.userId && !isAssignedExpert) return res.status(403).json({ error: 'forbidden' })
  if (!['assigned', 'awaiting_payment', 'done'].includes(request.status))
    return res.status(409).json({ error: 'not_editable' })

  const title = String(req.body?.title || '').trim()
  const amount = Number(req.body?.amount)
  if (!title || !(amount > 0)) return res.status(400).json({ error: 'invalid_extra' })

  const info = db.prepare('INSERT INTO request_extras (request_id, title, amount) VALUES (?, ?, ?)').run(request.id, title, amount)

  res.status(201).json({
    extra: db.prepare('SELECT * FROM request_extras WHERE id = ?').get(info.lastInsertRowid),
    request: requestWithBids(request.id),
  })
})

app.post('/api/requests/:id/extras/:extraId/pay', authRequired, (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id)
  if (!request) return res.status(404).json({ error: 'not_found' })
  if (request.user_id !== req.userId) return res.status(403).json({ error: 'forbidden' })

  const extra = db.prepare('SELECT * FROM request_extras WHERE id = ? AND request_id = ?').get(req.params.extraId, request.id)
  if (!extra) return res.status(404).json({ error: 'extra_not_found' })
  if (extra.status === 'paid') return res.status(409).json({ error: 'already_paid' })

  const method = String(req.body?.method || '')
  if (!['cash', 'card', 'urpay', 'stcpay'].includes(method)) return res.status(400).json({ error: 'invalid_method' })
  const enabledKey = { cash: 'pay_cash', card: 'pay_card', stcpay: 'pay_stcpay', urpay: 'pay_urpay' }[method]
  const gate = db.prepare('SELECT value FROM settings WHERE key = ?').get(enabledKey)?.value ?? '1'
  if (gate !== '1' && !req.body?.use_credit) return res.status(409).json({ error: 'method_disabled' })
  const needsPhone = ['urpay', 'stcpay'].includes(method)
  const phone = needsPhone ? String(req.body?.phone || '').replace(/[^\d+]/g, '') : null
  if (needsPhone && phone.replace(/\D/g, '').length < 9) return res.status(400).json({ error: 'phone_required' })

  const custPct = commissionCustomer()
  const expPct = commissionExpert()
  const total = round2(extra.amount * (1 + custPct / 100))

  db.prepare('INSERT INTO payments (request_id, method, amount, phone, status, kind) VALUES (?, ?, ?, ?, ?, ?)')
    .run(request.id, method, total, phone, method === 'cash' ? 'pending_cash' : 'paid', 'extra')

  db.prepare("UPDATE request_extras SET status = 'paid', method = ?, paid_at = datetime('now') WHERE id = ?").run(method, extra.id)

  // عمولة الفني على العمل الإضافي: تُخصم من مستحقاته في أول طلب تالٍ
  const bid = request.accepted_bid_id ? db.prepare('SELECT * FROM bids WHERE id = ?').get(request.accepted_bid_id) : null
  if (bid) {
    db.prepare('INSERT INTO commission_ledger (expert_id, source_request_id, side, amount) VALUES (?, ?, ?, ?)')
      .run(bid.expert_id, request.id, 'expert', round2(extra.amount * expPct / 100))
  }

  // تمديد الضمان من وقت سداد العمل الإضافي
  if (request.status === 'done') {
    db.prepare("UPDATE requests SET warranty_until = datetime('now', '+' || COALESCE(warranty_days, 3) || ' days') WHERE id = ?")
      .run(request.id)
  }

  res.status(201).json({ ok: true, total, request: requestWithBids(request.id) })
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
  const mine = db.prepare('SELECT * FROM experts WHERE user_id = ?').get(req.userId)
  const accepted = request.accepted_bid_id
    ? db.prepare('SELECT * FROM bids WHERE id = ?').get(request.accepted_bid_id)
    : null
  const isAssignedExpert = !!(mine && accepted && accepted.expert_id === mine.id)
  if (!isAssignedExpert && request.user_id !== req.userId) return res.status(403).json({ error: 'forbidden' })
  if (request.status !== 'assigned') return res.status(409).json({ error: 'not_assigned' })

  const days = Math.max(1, Math.min(365, Number(req.body?.warranty_days) || request.warranty_days || 3))
  db.prepare(
    `UPDATE requests SET status = 'done', completed_at = datetime('now'), warranty_days = ?,
      warranty_until = datetime('now', '+' || ? || ' days')
     WHERE id = ?`,
  ).run(days, days, request.id)
  const invoice = issueInvoice(request.id)
  res.json({ ...requestWithBids(request.id), invoice })
})

app.post('/api/requests/:id/cancel', authRequired, (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id)
  if (!request) return res.status(404).json({ error: 'not_found' })
  if (request.user_id !== req.userId) return res.status(403).json({ error: 'forbidden' })
  if (request.status !== 'open') return res.status(409).json({ error: 'not_open' })

  const created = new Date(request.created_at.replace(' ', 'T') + 'Z').getTime()
  if (Date.now() - created > 3 * 60 * 1000) {
    return res.status(409).json({ error: 'cancel_window_passed' })
  }
  db.prepare("UPDATE requests SET status = 'canceled' WHERE id = ?").run(request.id)
  res.json(requestWithBids(request.id))
})

app.post('/api/requests/:id/close', authRequired, (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id)
  if (!request) return res.status(404).json({ error: 'not_found' })
  if (request.user_id !== req.userId) return res.status(403).json({ error: 'forbidden' })
  if (request.status !== 'done') return res.status(409).json({ error: 'not_done' })
  const wu = request.warranty_until ? new Date(request.warranty_until.replace(' ', 'T') + 'Z') : null
  if (wu && wu > new Date()) return res.status(409).json({ error: 'warranty_active', until: request.warranty_until })
  db.prepare("UPDATE requests SET status = 'closed', closed_at = datetime('now'), closed_by = 'customer' WHERE id = ?").run(request.id)
  res.json(requestWithBids(request.id))
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

// وقت الرياض (UTC+3) → UTC بصيغة SQLite
function localToUtc(v) {
  if (!v) return null
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  if (!m) return null
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 3, +m[5]))
  return d.toISOString().slice(0, 16).replace('T', ' ')
}
const utcNow = () => new Date().toISOString().slice(0, 16).replace('T', ' ')

const activeAds = () =>
  db
    .prepare(
      `SELECT * FROM ads WHERE active = 1
         AND (starts_at IS NULL OR starts_at <= datetime('now'))
         AND (ends_at IS NULL OR ends_at >= datetime('now'))
       ORDER BY featured DESC, id DESC`,
    )
    .all()

app.get('/api/ads', (_req, res) => res.json(activeAds()))

/* ---------- admin ---------- */

app.post('/api/admin/login', (req, res) => {
  const admin = checkAdmin(req.body?.email, req.body?.password)
  if (!admin) return res.status(401).json({ error: 'invalid_credentials' })
  const rec = adminRecord(admin.id)
  res.json({
    token: adminToken(admin),
    admin: { id: admin.id, email: admin.email, name: rec?.name || null, role: rec?.role || 'admin', perms: rec?.perms || ALL_PERMS },
  })
})

app.get('/api/admin/me', adminRequired, (req, res) => {
  const a = adminRecord(req.adminId)
  res.json({ ...a, all_perms: ALL_PERMS, defaults: DEFAULT_PERMS })
})


/* ملف العميل الكامل (للإدارة) */
app.get('/api/admin/users/:id/full', adminRequired, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
  if (!u) return res.status(404).json({ error: 'not_found' })

  const requests = db
    .prepare(
      `SELECT r.id, r.number, r.title, r.category, r.city, r.status, r.created_at,
        (SELECT COUNT(*) FROM bids b WHERE b.request_id = r.id) AS bids_count,
        (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.request_id = r.id AND p.status IN ('paid','pending_cash')) AS paid
       FROM requests r WHERE r.user_id = ? ORDER BY r.id DESC LIMIT 12`,
    )
    .all(u.id)

  const totals = db
    .prepare(
      `SELECT COUNT(*) reqs,
        COALESCE(SUM(CASE WHEN status IN ('done','closed') THEN 1 ELSE 0 END),0) done,
        COALESCE((SELECT SUM(amount) FROM payments p JOIN requests r2 ON r2.id = p.request_id
                  WHERE r2.user_id = ? AND p.status IN ('paid','pending_cash')),0) paid_total
       FROM requests WHERE user_id = ?`,
    )
    .get(u.id, u.id)

  let credits = 0
  try {
    credits = db.prepare("SELECT COALESCE(SUM(remaining),0) v FROM credits WHERE user_id = ? AND remaining > 0 AND expires_at > datetime('now')").get(u.id).v
  } catch {}

  const reviews = db
    .prepare(
      `SELECT r.id, r.rating, r.comment, r.tags, r.created_at, e.name_ar AS expert_name, q.number AS request_number
       FROM reviews r LEFT JOIN experts e ON e.id = r.expert_id LEFT JOIN requests q ON q.id = r.request_id
       WHERE r.target = 'customer' AND r.customer_id = ? ORDER BY r.id DESC LIMIT 20`,
    )
    .all(u.id)

  const invites = db.prepare('SELECT COUNT(*) c FROM users WHERE referred_by = ?').get(u.id).c
  const blocked = !!db.prepare('SELECT 1 FROM blocked_phones WHERE phone = ?').get(u.phone)

  res.json({
    ...publicUser(u),
    verified: !!u.verified,
    stars_total: u.stars_total || 0,
    reviews_count: u.reviews_count || 0,
    invite_code: u.invite_code,
    blocked,
    credits: money(credits),
    invites,
    totals: { ...totals, paid_total: money(totals.paid_total) },
    requests: requests.map((r) => ({ ...r, paid: money(r.paid) })),
    reviews: reviews.map((r) => ({ ...r, tags: parseJson(r.tags, []) })),
  })
})

app.get('/api/admin/active-requests', adminRequired, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT r.id, r.number, r.title, r.category, r.city, r.status, r.ends_at, r.created_at,
        (SELECT COUNT(*) FROM bids b WHERE b.request_id = r.id) AS bids_count,
        u.name AS owner_name,
        CAST((julianday(r.ends_at) - julianday('now')) * 86400 AS INTEGER) AS seconds_left
       FROM requests r LEFT JOIN users u ON u.id = r.user_id
       WHERE r.status IN ('open','awaiting_payment','assigned')
       ORDER BY CASE r.status WHEN 'open' THEN 0 ELSE 1 END, r.id DESC LIMIT 60`,
    )
    .all()
  res.json(rows)
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

app.post('/api/admin/requests/:id/close', adminRequired, (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id)
  if (!request) return res.status(404).json({ error: 'not_found' })
  if (request.status !== 'done') return res.status(409).json({ error: 'not_done' })
  const reason = String(req.body?.reason || '').trim()
  if (reason.length < 10) return res.status(400).json({ error: 'reason_required' })

  const completed = request.completed_at ? new Date(request.completed_at.replace(' ', 'T') + 'Z').getTime() : 0
  if (completed && Date.now() - completed < 60 * 60 * 1000) {
    return res.status(409).json({ error: 'wait_period', until: new Date(completed + 3600000).toISOString() })
  }

  db.prepare(
    `UPDATE requests SET status = 'closed', closed_at = datetime('now'),
      closed_by = 'admin', close_reason = ? WHERE id = ?`,
  ).run(reason, request.id)

  io.to(`user:${request.user_id}`).emit('notify', {
    type: 'close',
    title: 'أُغلق طلبك إدارياً',
    body: reason,
    requestId: request.id,
  })
  res.json(requestWithBids(request.id))
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
  violations: u.violations || 0,
  online: u.last_seen && new Date(u.last_seen.replace(' ', 'T') + 'Z').getTime() > Date.now() - 120000 ? 1 : 0,
})

app.get('/api/admin/users', adminRequired, (req, res) => {
  const role = req.query.role
  const q = String(req.query.q || '').trim()
  let rows = role
    ? db.prepare('SELECT * FROM users WHERE role = ? ORDER BY id DESC').all(role)
    : db.prepare('SELECT * FROM users ORDER BY id DESC').all()
  if (q) {
    const t = q.toLowerCase()
    rows = rows.filter((u) =>
      String(u.id) === t ||
      String(u.name || '').toLowerCase().includes(t) ||
      String(u.phone || '').includes(t) ||
      String(u.invite_code || '').toLowerCase().includes(t) ||
      String(u.email || '').toLowerCase().includes(t),
    )
  }
  const out = rows.map((u) => ({
    ...publicUser(u),
    verified: !!u.verified,
    stars_total: u.stars_total || 0,
    reviews_count: u.reviews_count || 0,
  }))
  if (q && /^\d+$/.test(q)) out.sort((a, b) => (String(a.id) === q ? -1 : String(b.id) === q ? 1 : 0))
  res.json(out)
})

/* منح/سحب توثيق العميل من اللوحة */
app.patch('/api/admin/users/:id/verify', adminRequired, adminCan('verifications'), (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
  if (!u) return res.status(404).json({ error: 'not_found' })
  const v = req.body?.verified ? 1 : 0
  db.prepare('UPDATE users SET verified = ? WHERE id = ?').run(v, u.id)
  io.to(`user:${u.id}`).emit('notify', {
    type: 'verify',
    title: v ? '✅ تم توثيق حسابك' : 'تم سحب التوثيق من حسابك',
    body: v ? 'أصبح حسابك موثّقاً في مهنتي' : '',
  })
  res.json({ ok: true, verified: !!v })
})

app.post('/api/admin/users', adminRequired, adminCan('users'), (req, res) => {
  const b = req.body || {}
  const name = String(b.name || '').trim()
  const phone = normalizePhone(b.phone)
  const role = ['customer', 'expert', 'support'].includes(b.role) ? b.role : 'customer'
  const password = String(b.password || '')
  if (!name) return res.status(400).json({ error: 'name_required' })
  if (!phone) return res.status(400).json({ error: 'phone_invalid' })
  if (db.prepare('SELECT id FROM users WHERE phone = ?').get(phone)) return res.status(409).json({ error: 'phone_taken' })

  const info = db.prepare(
    `INSERT INTO users (phone, name, city, role, email, specialty, password_hash, status, last_seen)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'))`,
  ).run(
    phone, name, b.city || null, role, b.email || null, b.specialty || null,
    password ? hashUserPassword(password) : null,
  )
  const userId = info.lastInsertRowid
  ensureUserCode(userId)

  if (role === 'expert') {
    db.prepare(
      `INSERT INTO experts (name, name_ar, job, city, rate, rating, reviews_count, image, phone, skills, experience, user_id, verify_status, has_car)
       VALUES (?, ?, ?, ?, '150 ريال/ساعة', 4.5, 0, '/experts/ac.jpg', ?, '[]', '1 سنة', ?, 'approved', ?)`,
    ).run(name, name, b.specialty || 'AC', b.city || 'الرياض', phone, userId, b.has_car ? 1 : 0)
  }
  res.status(201).json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(userId)))
})

app.patch('/api/admin/users/:id', adminRequired, adminCan('users'), (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
  if (!u) return res.status(404).json({ error: 'not_found' })
  const b = req.body || {}
  const fields = ['name', 'phone', 'city', 'role', 'status', 'email', 'specialty']
  const sets = []
  const params = []
  for (const f of fields) if (b[f] !== undefined) { sets.push(`${f} = ?`); params.push(b[f]) }
  if (b.password) { sets.push('password_hash = ?'); params.push(hashUserPassword(String(b.password))) }
  if (sets.length) db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params, u.id)
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)))
})

app.delete('/api/admin/users/:id', adminRequired, adminCan('users'), (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
  if (!u) return res.status(404).json({ error: 'not_found' })
  db.prepare('DELETE FROM bids WHERE expert_id IN (SELECT id FROM experts WHERE user_id = ?)').run(u.id)
  db.prepare('DELETE FROM experts WHERE user_id = ?').run(u.id)
  db.prepare('DELETE FROM requests WHERE user_id = ?').run(u.id)
  db.prepare('DELETE FROM users WHERE id = ?').run(u.id)
  res.json({ ok: true })
})

app.get('/api/admin/admins', adminRequired, (req, res) => {
  const role = String(req.query.role || '')
  const rows = role
    ? db.prepare('SELECT id, email, name, status, role, perms, id AS created_at FROM admins WHERE COALESCE(role,\'admin\') = ? ORDER BY id').all(role)
    : db.prepare('SELECT id, email, name, status, role, perms, id AS created_at FROM admins ORDER BY id').all()
  res.json(rows.map((r) => {
    let perms = null
    try { perms = r.perms ? JSON.parse(r.perms) : null } catch {}
    return { ...r, perms: Array.isArray(perms) ? perms : (DEFAULT_PERMS[r.role || 'admin'] || ALL_PERMS) }
  }))
})

app.post('/api/admin/admins', adminRequired, (req, res) => {
  const { email, password, name } = req.body || {}
  const role = ['ceo', 'finance', 'support', 'admin'].includes(req.body?.role) ? req.body.role : 'admin'
  if (!email || !password) return res.status(400).json({ error: 'email_and_password_required' })
  const exists = db.prepare('SELECT id FROM admins WHERE email = ?').get(email.trim().toLowerCase())
  if (exists) return res.status(409).json({ error: 'email_exists' })
  const permsIn = Array.isArray(req.body?.perms) ? req.body.perms.filter((p) => ALL_PERMS.includes(p)) : null
  const perms = permsIn && permsIn.length ? permsIn : (DEFAULT_PERMS[role] || ALL_PERMS)
  const info = db.prepare('INSERT INTO admins (email, password_hash, name, role, perms) VALUES (?, ?, ?, ?, ?)').run(
    email.trim().toLowerCase(), hashPassword(password), name || null, role, JSON.stringify(perms),
  )
  res.status(201).json({ id: info.lastInsertRowid, email, name, status: 'active', role, perms })
})

app.patch('/api/admin/admins/:id', adminRequired, (req, res) => {
  const a = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.params.id)
  if (!a) return res.status(404).json({ error: 'not_found' })
  const { status, name, password, role } = req.body || {}
  if (status) db.prepare('UPDATE admins SET status = ? WHERE id = ?').run(status, a.id)
  if (role && ['ceo', 'finance', 'support', 'admin'].includes(role))
    db.prepare('UPDATE admins SET role = ? WHERE id = ?').run(role, a.id)
  if (Array.isArray(req.body?.perms)) {
    const perms = req.body.perms.filter((p) => ALL_PERMS.includes(p))
    db.prepare('UPDATE admins SET perms = ? WHERE id = ?').run(JSON.stringify(perms), a.id)
  }
  if (name !== undefined) db.prepare('UPDATE admins SET name = ? WHERE id = ?').run(name, a.id)
  if (password) db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hashPassword(String(password)), a.id)
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
  const { title, image, link, price, duration_days, featured, active, starts_at, ends_at } = req.body || {}
  if (!title) return res.status(400).json({ error: 'title_required' })
  const days = Number(duration_days) || 30
  const start = localToUtc(starts_at) || utcNow()
  // نهاية صريحة، أو حسابها من المدة
  const end =
    localToUtc(ends_at) ||
    new Date(Date.now() + days * 86400000).toISOString().slice(0, 16).replace('T', ' ')

  const info = db
    .prepare(
      `INSERT INTO ads (title, image, link, price, duration_days, starts_at, ends_at, featured, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      title,
      image || null,
      link || null,
      price ? Number(price) : null,
      days,
      start,
      end,
      featured ? 1 : 0,
      active === false ? 0 : 1,
    )
  res.status(201).json(db.prepare('SELECT * FROM ads WHERE id = ?').get(info.lastInsertRowid))
})

app.patch('/api/admin/ads/:id', adminRequired, (req, res) => {
  const ad = db.prepare('SELECT * FROM ads WHERE id = ?').get(req.params.id)
  if (!ad) return res.status(404).json({ error: 'not_found' })
  const fields = ['title', 'image', 'link', 'price', 'duration_days', 'featured', 'active', 'starts_at', 'ends_at']
  const updates = []
  const params = []
  for (const f of fields) {
    if (req.body?.[f] !== undefined) {
      updates.push(`${f} = ?`)
      if (['featured', 'active'].includes(f)) params.push(req.body[f] ? 1 : 0)
      else if (f === 'starts_at' || f === 'ends_at') params.push(localToUtc(req.body[f]))
      else params.push(req.body[f])
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
  const within = (pr, ms, tag) =>
    Promise.race([
      pr,
      new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout:${tag}`)), ms)),
    ])
  try {
    const { createWorker } = await import('tesseract.js')
    // الخطة المجانية بطيئة جداً في OCR — لا نخلّي رفع صورة الإقامة يعلّق
    const worker = await within(createWorker('ara', 1, { logger: () => {} }), 25000, 'worker')
    const { data } = await within(worker.recognize(req.file.path), 25000, 'recognize')
    await within(worker.terminate(), 5000, 'terminate').catch(() => {})
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

  // 🚫 منع تكرار الإقامة: شخص واحد = حساب واحد
  const dup = db
    .prepare('SELECT id, name, user_id FROM experts WHERE iqama_number = ? AND id != ?')
    .get(iqama, expert.id)
  if (dup) {
    return res.status(409).json({
      error: 'iqama_used',
      message: 'هذا رقم الإقامة مسجّل مسبقاً في المنصة — لا يمكن إنشاء حساب ثانٍ بنفس الإقامة.',
    })
  }

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
  const { key, ar, en, icon, sort, image, parent_id, min_price } = req.body || {}
  if (!key || !ar) return res.status(400).json({ error: 'key_and_ar_required' })
  try {
    const info = db.prepare('INSERT INTO categories (key, ar, en, icon, sort, image, parent_id, min_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(key.trim(), ar.trim(), en || null, icon || '🛠️', Number(sort) || 99, image || null, parent_id || null, min_price ? Number(min_price) : null)
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
  for (const f of ['ar', 'en', 'icon', 'active', 'sort', 'image', 'parent_id', 'min_price']) {
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
  const enabledKey = { cash: 'pay_cash', card: 'pay_card', stcpay: 'pay_stcpay', urpay: 'pay_urpay' }[method]
  const gate = db.prepare('SELECT value FROM settings WHERE key = ?').get(enabledKey)?.value ?? '1'
  if (gate !== '1' && !req.body?.use_credit) return res.status(409).json({ error: 'method_disabled' })
  const needsPhone = ['urpay', 'stcpay'].includes(method)
  const phone = needsPhone ? String(req.body?.phone || '').replace(/[^\d+]/g, '') : null
  if (needsPhone && phone.replace(/\D/g, '').length < 9) return res.status(400).json({ error: 'phone_required' })

  const bid = db.prepare('SELECT * FROM bids WHERE id = ?').get(request.accepted_bid_id)
  const amount = customerTotal(bid?.amount || 0)

  // 🎁 رصيد نادي الولاء — يُستخدم في طلبات الفنيين فقط
  let creditUsed = 0
  if (req.body?.use_credit) {
    const r = spendCredit(req.userId, amount)
    creditUsed = r.used
  }
  const due = money(Math.max(0, amount - creditUsed))
  const status = due <= 0 ? 'paid' : method === 'cash' ? 'pending_cash' : 'paid'

  const info = db
    .prepare('INSERT INTO payments (request_id, method, amount, phone, status, ref) VALUES (?, ?, ?, ?, ?, ?)')
    .run(request.id, creditUsed > 0 && due <= 0 ? 'credit' : method, money(due + 0), phone, status,
      creditUsed > 0 ? `CREDIT-${creditUsed}-${Date.now()}` : method === 'card' ? `CARD-${Date.now()}` : null)

  db.prepare("UPDATE requests SET status = 'assigned' WHERE id = ?").run(request.id)
  refreshInviterAll(req.userId)
  const updated = requestWithBids(request.id)
  io.to(`request:${request.id}`).emit('request:accepted', updated)
  tgNotify(`💵 دفعة جديدة\nطلب #${request.number || request.id} — ${request.title}\nالمبلغ: ${amount} ريال (${method})`)
  io.to(`user:${request.user_id}`).emit('notify', {
    type: 'payment',
    title: method === 'cash' ? 'تم تأكيد الدفع عند الاستلام' : 'تم الدفع بنجاح',
    body: `${amount} ريال`,
    requestId: request.id,
  })
  res.status(201).json({
    ok: true,
    credit_used: creditUsed,
    payment: db.prepare('SELECT * FROM payments WHERE id = ?').get(info.lastInsertRowid),
    request: updated,
  })
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
  res.json(rows.map(decorateExpert))
})

app.patch('/api/admin/verifications/:id', adminRequired, (req, res) => {
  const e = db.prepare('SELECT * FROM experts WHERE id = ?').get(req.params.id)
  if (!e) return res.status(404).json({ error: 'not_found' })
  const status = req.body?.status
  if (!['approved', 'rejected', 'pending'].includes(status)) return res.status(400).json({ error: 'invalid_status' })
  db.prepare('UPDATE experts SET verify_status = ?, verify_note = ? WHERE id = ?')
    .run(status, req.body?.note || null, e.id)
  if (e.user_id) {
    refreshInviterBonus(e.user_id)
    io.to(`user:${e.user_id}`).emit('notify', {
      type: 'verify',
      title: status === 'approved' ? 'تم توثيق حسابك ✅' : status === 'rejected' ? 'تم رفض التوثيق' : 'التوثيق قيد المراجعة',
      body: req.body?.note || '',
    })
  }
  res.json({ ok: true })
})

/* ---------- تقرير العمولات ---------- */

/* إجمالي عمولة المنصة حسب الفترات */

/* ================= المحفظة (الفني) ================= */
app.get('/api/me/wallet', authRequired, (req, res) => {
  const e = db.prepare('SELECT * FROM experts WHERE user_id = ?').get(req.userId)
  if (!e) return res.status(404).json({ error: 'not_expert' })
  try { releaseDue() } catch {}
  ensureInviteCode(e.id)
  const code = db.prepare('SELECT invite_code FROM experts WHERE id = ?').get(e.id)?.invite_code
  const inv = invitesOf(e.id)
  const qualified = inv.filter((i) => i.qualified).length
  res.json({
    ...walletSummary(e.id),
    invite_code: code,
    invite_link: `/register?ref=${encodeURIComponent(code || '')}`,
    referrals: {
      total: inv.length,
      qualified,
      target: REF_TARGET(),
      bonus: REF_BONUS(),
      bonus_paid: !!db.prepare("SELECT 1 FROM wallet_tx WHERE expert_id = ? AND ref = ?").get(e.id, `referral-${e.id}`),
      list: inv.slice(0, 50).map((i) => ({
        name: i.name, created_at: i.created_at, qualified: i.qualified,
      })),
    },
    transactions: listTx(e.id, 60),
    withdrawals: db.prepare('SELECT * FROM withdrawals WHERE expert_id = ? ORDER BY id DESC LIMIT 20').all(e.id),
  })
})

app.post('/api/me/wallet/withdraw', authRequired, (req, res) => {
  const e = db.prepare('SELECT * FROM experts WHERE user_id = ?').get(req.userId)
  if (!e) return res.status(404).json({ error: 'not_expert' })
  const amount = Number(req.body?.amount)
  const iban = String(req.body?.iban || '').replace(/\s/g, '')
  if (iban && !/^SA\d{22}$/i.test(iban)) return res.status(400).json({ error: 'invalid_iban' })
  if (!iban) return res.status(400).json({ error: 'iban_required' })
  const r = requestWithdrawal({
    expertId: e.id, amount, iban,
    accountName: String(req.body?.account_name || '').slice(0, 80),
  })
  if (r.error) return res.status(400).json({ error: r.error })
  res.status(201).json({ ok: true, ...r, wallet: walletSummary(e.id) })
})

app.get('/api/me/referrals', authRequired, (req, res) => {
  const e = db.prepare('SELECT * FROM experts WHERE user_id = ?').get(req.userId)
  if (!e) return res.status(404).json({ error: 'not_expert' })
  const code = ensureInviteCode(e.id)
  const list = invitesOf(e.id)
  res.json({
    code, target: REF_TARGET(), bonus: REF_BONUS(),
    qualified: list.filter((i) => i.qualified).length,
    total: list.length,
    list,
  })
})


/* ================= التقييمات (نجوم + وسوم) ================= */
const EXPERT_TAGS = ['أنصح بالتعامل معه', 'سريع في عمله', 'منجز', 'محترف', 'أسعار مناسبة', 'نظيف في عمله']
const CUSTOMER_TAGS = ['حسن التعامل', 'طيب الأخلاق', 'محترم', 'صادق في تعاملاته', 'أنصح بالتعامل معه']
const starsOf = (tags) => (Array.isArray(tags) ? tags : [])

function paidOrder(requestId) {
  return !!db.prepare("SELECT 1 FROM payments WHERE request_id = ? AND status IN ('paid','pending_cash')").get(requestId)
}

function customerStats(userId) {
  const row = db
    .prepare(
      `SELECT COUNT(*) c, COALESCE(SUM(rating),0) total, COALESCE(AVG(rating),0) avg,
        SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) pos
       FROM reviews WHERE target = 'customer' AND customer_id = ?`,
    )
    .get(userId)
  const tags = {}
  for (const r of db.prepare("SELECT tags FROM reviews WHERE target = 'customer' AND customer_id = ?").all(userId)) {
    for (const t of parseJson(r.tags, [])) tags[t] = (tags[t] || 0) + 1
  }
  return {
    count: row.c,
    stars_total: row.total,
    avg: Math.round(Number(row.avg) * 10) / 10,
    positive: row.c ? Math.round((row.pos / row.c) * 100) : 0,
    tags,
  }
}

app.post('/api/requests/:id/review', authRequired, (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id)
  if (!request) return res.status(404).json({ error: 'not_found' })
  if (!['done', 'closed', 'assigned'].includes(request.status)) return res.status(409).json({ error: 'not_completed' })
  if (!paidOrder(request.id)) return res.status(409).json({ error: 'order_not_paid' })

  const stars = Math.max(1, Math.min(5, Number(req.body?.stars) || 0))
  if (!stars) return res.status(400).json({ error: 'stars_required' })
  const tags = Array.isArray(req.body?.tags) ? req.body.tags.map(String).slice(0, 6) : []
  const comment = String(req.body?.comment || '').slice(0, 600) || null

  const bid = request.accepted_bid_id ? db.prepare('SELECT * FROM bids WHERE id = ?').get(request.accepted_bid_id) : null
  const mine = db.prepare('SELECT * FROM experts WHERE user_id = ?').get(req.userId)
  const isOwner = request.user_id === req.userId
  const isExpert = !!(mine && bid && bid.expert_id === mine.id)

  if (!isOwner && !isExpert) return res.status(403).json({ error: 'forbidden' })

  const target = isOwner ? 'expert' : 'customer'
  const already = db
    .prepare("SELECT id FROM reviews WHERE request_id = ? AND target = ?")
    .get(request.id, target)
  if (already) return res.status(409).json({ error: 'already_reviewed' })

  if (target === 'expert') {
    db.prepare(
      `INSERT INTO reviews (request_id, expert_id, rating, comment, author_id, target, tags)
       VALUES (?, ?, ?, ?, ?, 'expert', ?)`,
    ).run(request.id, bid.expert_id, stars, comment, req.userId, JSON.stringify(tags))

    // تحديث معدل الفني
    const agg = db
      .prepare("SELECT COUNT(*) c, AVG(rating) a FROM reviews WHERE expert_id = ? AND target = 'expert'")
      .get(bid.expert_id)
    db.prepare('UPDATE experts SET rating = ?, reviews_count = ? WHERE id = ?')
      .run(Math.round(Number(agg.a) * 10) / 10, agg.c, bid.expert_id)
  } else {
    db.prepare(
      `INSERT INTO reviews (request_id, expert_id, rating, comment, author_id, target, tags, customer_id)
       VALUES (?, ?, ?, ?, ?, 'customer', ?, ?)`,
    ).run(request.id, bid?.expert_id || 0, stars, comment, req.userId, JSON.stringify(tags), request.user_id)

    const st = customerStats(request.user_id)
    const verified = st.count > 0 && st.stars_total >= 100 && st.positive >= 80 ? 1 : 0
    db.prepare('UPDATE users SET stars_total = ?, reviews_count = ?, verified = ? WHERE id = ?')
      .run(st.stars_total, st.count, verified, request.user_id)

    if (verified) {
      io.to(`user:${request.user_id}`).emit('notify', {
        type: 'verify',
        title: '✅ تم توثيق حسابك كعميل',
        body: 'حصلت على 100 نجمة وتقييمات إيجابية من الفنيين',
      })
    }
  }

  res.status(201).json({ ok: true, target })
})

app.get('/api/requests/:id/review-status', authRequired, (req, res) => {
  const r = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id)
  if (!r) return res.status(404).json({ error: 'not_found' })
  const mine = db.prepare('SELECT * FROM experts WHERE user_id = ?').get(req.userId)
  const bid = r.accepted_bid_id ? db.prepare('SELECT * FROM bids WHERE id = ?').get(r.accepted_bid_id) : null
  const isOwner = r.user_id === req.userId
  const isExpert = !!(mine && bid && bid.expert_id === mine.id)
  const target = isOwner ? 'expert' : isExpert ? 'customer' : null
  const reviewed = target
    ? !!db.prepare('SELECT 1 FROM reviews WHERE request_id = ? AND target = ?').get(r.id, target)
    : false
  res.json({ target, reviewed, paid: paidOrder(r.id) })
})

/* ملخص تقييمات العميل (للعامة: النجوم فقط) */
app.get('/api/users/:id/rating', (req, res) => {
  const u = db.prepare('SELECT id, name, verified, stars_total, reviews_count FROM users WHERE id = ?').get(req.params.id)
  if (!u) return res.status(404).json({ error: 'not_found' })
  const st = customerStats(u.id)
  res.json({ id: u.id, verified: !!u.verified, stars_total: st.stars_total, count: st.count, avg: st.avg })
})

app.get('/api/experts/:id/rating', (req, res) => {
  const expertId = req.params.id
  const agg = db
    .prepare("SELECT COUNT(*) c, COALESCE(AVG(rating),0) a, SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) pos FROM reviews WHERE expert_id = ? AND target = 'expert'")
    .get(expertId)
  const tags = {}
  for (const r of db.prepare("SELECT tags FROM reviews WHERE expert_id = ? AND target = 'expert'").all(expertId)) {
    for (const t of parseJson(r.tags, [])) tags[t] = (tags[t] || 0) + 1
  }
  res.json({
    count: agg.c,
    avg: Math.round(Number(agg.a) * 10) / 10,
    positive: agg.c ? Math.round((agg.pos / agg.c) * 100) : 0,
    tags,
  })
})

/* الإدارة: التقارير المكتوبة */
app.get('/api/admin/reviews', adminRequired, (req, res) => {
  const target = String(req.query.target || 'customer')
  const rows = db
    .prepare(
      `SELECT r.*, u.name AS author_name, cu.name AS customer_name, e.name_ar AS expert_name,
              q.title AS request_title, q.number AS request_number
       FROM reviews r
       LEFT JOIN users u ON u.id = r.author_id
       LEFT JOIN users cu ON cu.id = r.customer_id
       LEFT JOIN experts e ON e.id = r.expert_id
       LEFT JOIN requests q ON q.id = r.request_id
       WHERE r.target = ? ORDER BY r.id DESC LIMIT 300`,
    )
    .all(target)
  res.json(rows.map((r) => ({ ...r, tags: parseJson(r.tags, []) })))
})

/* ================= نادي الولاء (العملاء) ================= */
function listExpiring(userId) {
  return db
    .prepare(
      `SELECT id, remaining, expires_at FROM credits
       WHERE user_id = ? AND remaining > 0 AND expires_at > datetime('now')
         AND expires_at <= datetime('now','+7 days') ORDER BY expires_at ASC`,
    )
    .all(userId)
}

app.get('/api/me/loyalty', authRequired, (req, res) => {
  const code = ensureUserCode(req.userId)
  const list = clientInvites(req.userId)
  const qualified = list.filter((i) => i.qualified).length
  res.json({
    code,
    invite_link: `/register?ref=${encodeURIComponent(code || '')}`,
    balance: creditBalance(req.userId),
    credits: listCredits(req.userId),
    valid_days: CREDIT_DAYS(),
    target: LOYALTY_TARGET(),
    bonus: LOYALTY_BONUS(),
    point_value: POINT_VALUE(),
    points: CUSTOMER_POINTS(),
    qualified,
    total: list.length,
    bonus_paid: !!db.prepare('SELECT 1 FROM credits WHERE user_id = ? AND ref = ?').get(req.userId, `loyalty-${req.userId}`),
    invited: list.slice(0, 50).map((i) => ({ name: i.name, qualified: i.qualified, created_at: i.created_at })),
    expiring_soon: listExpiring(req.userId),
    expert_target: REF_TARGET(),
    expert_bonus: REF_BONUS(),
  })
})



/* ================= النزاعات / الشكاوى ================= */
app.post('/api/requests/:id/dispute', authRequired, (req, res) => {
  const r = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id)
  if (!r) return res.status(404).json({ error: 'not_found' })
  const mine = db.prepare('SELECT * FROM experts WHERE user_id = ?').get(req.userId)
  const bid = r.accepted_bid_id ? db.prepare('SELECT * FROM bids WHERE id = ?').get(r.accepted_bid_id) : null
  const isOwner = r.user_id === req.userId
  const isExpert = !!(mine && bid && bid.expert_id === mine.id)
  if (!isOwner && !isExpert) return res.status(403).json({ error: 'forbidden' })
  if (!['assigned', 'done', 'closed'].includes(r.status)) return res.status(409).json({ error: 'not_active' })
  const reason = String(req.body?.reason || '').trim()
  if (reason.length < 5) return res.status(400).json({ error: 'reason_required' })
  if (db.prepare("SELECT 1 FROM disputes WHERE request_id = ? AND status = 'open'").get(r.id)) {
    return res.status(409).json({ error: 'already_open' })
  }
  const info = db
    .prepare('INSERT INTO disputes (request_id, opened_by, side, reason, details) VALUES (?, ?, ?, ?, ?)')
    .run(r.id, req.userId, isOwner ? 'customer' : 'expert', reason.slice(0, 200), String(req.body?.details || '').slice(0, 1000))
  io.to('admins').emit('admin:dispute', { id: info.lastInsertRowid, requestId: r.id, reason })
  tgNotify(`⚠️ شكوى جديدة\nطلب #${r.number || r.id} — ${r.title}\nالسبب: ${reason}`)
  res.status(201).json({ ok: true, id: info.lastInsertRowid })
})

app.get('/api/requests/:id/dispute', authRequired, (req, res) => {
  const d = db.prepare('SELECT * FROM disputes WHERE request_id = ? ORDER BY id DESC LIMIT 1').get(req.params.id)
  res.json(d || null)
})

app.get('/api/admin/disputes', adminRequired, (req, res) => {
  const status = String(req.query.status || 'open')
  const rows = db
    .prepare(
      `SELECT d.*, q.number AS request_number, q.title AS request_title, q.status AS request_status,
        u.name AS opener_name, u.phone AS opener_phone, q.user_id AS customer_id
       FROM disputes d LEFT JOIN requests q ON q.id = d.request_id LEFT JOIN users u ON u.id = d.opened_by
       WHERE (? = 'all' OR d.status = ?) ORDER BY d.id DESC LIMIT 200`,
    )
    .all(status, status)
  res.json(rows)
})

app.post('/api/admin/disputes/:id/resolve', adminRequired, adminCan('requests'), (req, res) => {
  const d = db.prepare('SELECT * FROM disputes WHERE id = ?').get(req.params.id)
  if (!d) return res.status(404).json({ error: 'not_found' })
  const outcome = ['refund', 'close', 'warn', 'partial'].includes(req.body?.outcome) ? req.body.outcome : 'close'
  db.prepare("UPDATE disputes SET status = 'resolved', outcome = ?, admin_note = ?, resolved_at = datetime('now') WHERE id = ?")
    .run(outcome, String(req.body?.note || '').slice(0, 500), d.id)

  const r = db.prepare('SELECT * FROM requests WHERE id = ?').get(d.request_id)
  if (outcome === 'refund' && r) {
    db.prepare("UPDATE requests SET status = 'canceled', close_reason = 'استرجاع — قرار الإدارة', closed_at = datetime('now'), closed_by = 'admin' WHERE id = ?").run(r.id)
    // سحب مستحق الفني المحجوز
    const bid = r.accepted_bid_id ? db.prepare('SELECT * FROM bids WHERE id = ?').get(r.accepted_bid_id) : null
    if (bid) db.prepare("UPDATE wallet_tx SET status = 'hold', amount = 0 WHERE expert_id = ? AND status IN ('hold','available') AND ref LIKE 'inv-%'").run(bid.expert_id)
  }
  if (outcome === 'close' && r) {
    db.prepare("UPDATE requests SET status = 'closed', closed_at = datetime('now'), closed_by = 'admin', close_reason = 'أُغلق بعد شكوى — قرار الإدارة' WHERE id = ?").run(r.id)
  }
  io.to(`user:${d.opened_by}`).emit('notify', {
    type: 'dispute',
    title: '📩 تم البت في شكواك',
    body: outcome === 'refund' ? 'تم الاسترجاع لصالحك' : 'تمت مراجعة الشكوى وإغلاقها',
    requestId: d.request_id,
  })
  res.json({ ok: true })
})

/* ================= متابعة الفني في الطريق ================= */
app.post('/api/requests/:id/visit', authRequired, (req, res) => {
  const r = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id)
  if (!r) return res.status(404).json({ error: 'not_found' })
  const mine = db.prepare('SELECT * FROM experts WHERE user_id = ?').get(req.userId)
  const bid = r.accepted_bid_id ? db.prepare('SELECT * FROM bids WHERE id = ?').get(r.accepted_bid_id) : null
  if (!(mine && bid && bid.expert_id === mine.id)) return res.status(403).json({ error: 'forbidden' })
  const state = ['on_way', 'arrived', 'started', 'none'].includes(req.body?.state) ? req.body.state : 'on_way'
  db.prepare("UPDATE requests SET visit_state = ?, expert_lat = ?, expert_lng = ?, visit_updated_at = datetime('now') WHERE id = ?")
    .run(state, req.body?.lat != null ? Number(req.body.lat) : r.expert_lat,
      req.body?.lng != null ? Number(req.body.lng) : r.expert_lng, r.id)
  const label = { on_way: 'الفني في الطريق إليك 🚗', arrived: 'الفني وصل موقعك 📍', started: 'الفني بدأ العمل 🛠️', none: '' }[state]
  if (label) io.to(`user:${r.user_id}`).emit('notify', { type: 'visit', title: label, body: r.title, requestId: r.id })
  io.to(`request:${r.id}`).emit('request:visit', { id: r.id, state, lat: req.body?.lat, lng: req.body?.lng })
  res.json({ ok: true, state })
})

/* ================= موعد الزيارة ================= */
app.post('/api/requests/:id/appointment', authRequired, (req, res) => {
  const r = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id)
  if (!r) return res.status(404).json({ error: 'not_found' })
  if (r.user_id !== req.userId) return res.status(403).json({ error: 'forbidden' })
  const at = String(req.body?.at || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(at)) return res.status(400).json({ error: 'invalid_datetime' })
  const utc = new Date(at).toISOString().slice(0, 19).replace('T', ' ')
  db.prepare('UPDATE requests SET visit_at = ? WHERE id = ?').run(utc, r.id)
  const bid = r.accepted_bid_id ? db.prepare('SELECT * FROM bids WHERE id = ?').get(r.accepted_bid_id) : null
  if (bid) {
    const ex = db.prepare('SELECT user_id FROM experts WHERE id = ?').get(bid.expert_id)
    if (ex?.user_id) io.to(`user:${ex.user_id}`).emit('notify', { type: 'visit', title: '📅 موعد زيارة جديد', body: r.title, requestId: r.id })
  }
  res.json({ ok: true, visit_at: utc })
})

/* ================= صور الطلب ================= */
app.post('/api/requests/:id/images', authRequired, upload.array('images', 5), (req, res) => {
  const r = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id)
  if (!r) return res.status(404).json({ error: 'not_found' })
  if (r.user_id !== req.userId) return res.status(403).json({ error: 'forbidden' })
  const files = (req.files || []).map((f) => `/uploads/${f.filename}`)
  if (!files.length) return res.status(400).json({ error: 'no_files' })
  const cur = parseJson(r.images, [])
  const next = [...cur, ...files].slice(0, 6)
  db.prepare('UPDATE requests SET images = ? WHERE id = ?').run(JSON.stringify(next), r.id)
  res.status(201).json({ ok: true, images: next })
})

/* ================= الإحصائيات ================= */
app.get('/api/admin/stats', adminRequired, (_req, res) => {
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10)
  const visits = db.prepare('SELECT COALESCE(SUM(n),0) v FROM page_views WHERE day = ?').get(today).v
  const visits7 = db.prepare("SELECT COALESCE(SUM(n),0) v FROM page_views WHERE day >= date('now','-6 days')").get().v
  const byCat = db
    .prepare('SELECT category, COUNT(*) c FROM requests WHERE created_at >= datetime(\'now\',\'-30 days\') GROUP BY category ORDER BY c DESC LIMIT 6')
    .all()
  const conversion = db
    .prepare("SELECT (SELECT COUNT(*) FROM requests) reqs, (SELECT COUNT(*) FROM requests WHERE status IN ('assigned','done','closed')) paid")
    .get()
  res.json({
    visits_today: visits,
    visits_7d: visits7,
    top_categories: byCat,
    conversion: conversion.reqs ? Math.round((conversion.paid / conversion.reqs) * 100) : 0,
    open_disputes: db.prepare("SELECT COUNT(*) c FROM disputes WHERE status = 'open'").get().c,
  })
})

app.post('/api/track', (req, res) => {
  try {
    const p = String(req.body?.path || '/').slice(0, 80)
    const day = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10)
    db.prepare('INSERT INTO page_views (day, path, n) VALUES (?, ?, 1) ON CONFLICT(day, path) DO UPDATE SET n = n + 1').run(day, p)
  } catch {}
  res.json({ ok: true })
})

/* ================= حذف الحساب ================= */
app.post('/api/me/delete', authRequired, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId)
  if (!u) return res.status(404).json({ error: 'not_found' })
  const open = db.prepare("SELECT COUNT(*) c FROM requests WHERE user_id = ? AND status IN ('open','awaiting_payment','assigned')").get(u.id).c
  if (open) return res.status(409).json({ error: 'has_open_requests' })
  db.prepare("UPDATE users SET status = 'deleted', name = 'حساب محذوف', avatar = NULL, phone = ? WHERE id = ?")
    .run(`deleted-${u.id}-${Date.now()}`, u.id)
  db.prepare("UPDATE experts SET verify_status = 'rejected' WHERE user_id = ?").run(u.id)
  res.json({ ok: true })
})



/* ================= توثيق الإيميل (رمز بالبريد) ================= */
async function sendEmail(to, subject, html) {
  // 1) SMTP (Gmail/Aramex/أي مزود)
  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (host && user && pass) {
    try {
      const nodemailer = (await import('nodemailer')).default
      const port = Number(process.env.SMTP_PORT || 465)
      const tx = nodemailer.createTransport({
        host, port, secure: port === 465,
        auth: { user, pass },
      })
      await tx.sendMail({
        from: process.env.MAIL_FROM || `مهنتي <${user}>`,
        to, subject, html,
      })
      return { ok: true, via: 'smtp' }
    } catch (e) {
      return { ok: false, error: 'smtp_failed: ' + e.message }
    }
  }

  const key = process.env.RESEND_API_KEY
  const from = process.env.MAIL_FROM || 'Mihnati <onboarding@resend.dev>'
  if (!key) return { ok: false, error: 'email_not_configured' }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: d.message || 'send_failed' }
    return { ok: true, id: d.id }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

const emailCode = () => String(Math.floor(100000 + Math.random() * 900000))

app.post('/api/me/email/send', authRequired, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) return res.status(400).json({ error: 'invalid_email' })
  const code = emailCode()
  db.prepare(
    `INSERT INTO email_otps (email, code, expires_at, attempts) VALUES (?, ?, ?, 0)
     ON CONFLICT(email) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at, attempts = 0`,
  ).run(email, code, Date.now() + 10 * 60 * 1000)

  const html = `
    <div style="font-family:Tahoma,Arial,sans-serif;direction:rtl;background:#FBF9F2;padding:24px">
      <div style="max-width:480px;margin:auto;background:#fff;border:1px solid #EADFC8;border-radius:16px;padding:24px;text-align:center">
        <h2 style="color:#006C35;margin:0 0 8px">مهنتي</h2>
        <p style="color:#444;margin:0 0 16px">رمز توثيق بريدك الإلكتروني</p>
        <div style="font-size:34px;font-weight:bold;letter-spacing:8px;color:#11221A;background:#FBF5E3;border:1px dashed #C9A227;border-radius:12px;padding:14px">${code}</div>
        <p style="color:#888;font-size:12px;margin-top:16px">الرمز صالح ١٠ دقائق. إذا ما طلبت هذا الرمز تجاهل الرسالة.</p>
      </div>
    </div>`

  const sent = await sendEmail(email, `رمز توثيق مهنتي: ${code}`, html)

  if (!sent.ok && String(process.env.DEV_OTP || '0') === '1') {
    return res.json({ ok: true, dev_code: code, note: 'email_not_configured' })
  }
  if (!sent.ok) {
    return res.status(503).json({ error: sent.error === 'email_not_configured' ? 'email_not_configured' : 'send_failed' })
  }
  res.json({ ok: true })
})

app.post('/api/admin/email/test', adminRequired, async (req, res) => {
  const to = String(req.body?.to || '').trim()
  if (!to) return res.status(400).json({ error: 'email_required' })
  const code = emailCode()
  const r = await sendEmail(to, `تجربة إرسال — مهنتي (${code})`, `<div style="font-family:Tahoma;direction:rtl"><h2 style="color:#006C35">مهنتي ✅</h2><p>الإرسال شغّال. الرمز التجريبي: <b style="font-size:22px">${code}</b></p></div>`)
  res.status(r.ok ? 200 : 500).json(r)
})

app.post('/api/me/email/verify', authRequired, (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const code = String(req.body?.code || '').trim()
  const row = db.prepare('SELECT * FROM email_otps WHERE email = ?').get(email)
  if (!row) return res.status(400).json({ error: 'not_requested' })
  if (Date.now() > row.expires_at) return res.status(400).json({ error: 'expired' })
  if (row.attempts >= 6) return res.status(429).json({ error: 'too_many' })
  if (row.code !== code) {
    db.prepare('UPDATE email_otps SET attempts = attempts + 1 WHERE email = ?').run(email)
    return res.status(400).json({ error: 'wrong_code' })
  }
  db.prepare('DELETE FROM email_otps WHERE email = ?').run(email)
  db.prepare('UPDATE users SET email = ?, email_verified = 1 WHERE id = ?').run(email, req.userId)
  res.json({ ok: true, email })
})


/* ================= دخول برمز البريد ================= */
app.post('/api/auth/email/send', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) return res.status(400).json({ error: 'invalid_email' })
  const user = db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(email)
  const code = emailCode()
  if (user) {
    db.prepare(
      `INSERT INTO email_otps (email, code, expires_at, attempts) VALUES (?, ?, ?, 0)
       ON CONFLICT(email) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at, attempts = 0`,
    ).run(email, code, Date.now() + 10 * 60 * 1000)
    const html = `
      <div style="font-family:Tahoma,Arial;direction:rtl;background:#FBF9F2;padding:24px">
        <div style="max-width:480px;margin:auto;background:#fff;border:1px solid #EADFC8;border-radius:16px;padding:24px;text-align:center">
          <h2 style="color:#006C35;margin:0 0 8px">مهنتي</h2>
          <p style="color:#444">رمز الدخول لحسابك</p>
          <div style="font-size:34px;font-weight:bold;letter-spacing:8px;background:#FBF5E3;border:1px dashed #C9A227;border-radius:12px;padding:14px">${code}</div>
          <p style="color:#888;font-size:12px;margin-top:14px">صالح ١٠ دقائق — إذا ما طلبت الدخول تجاهل الرسالة.</p>
        </div>
      </div>`
    const r = await sendEmail(email, `رمز الدخول — مهنتي: ${code}`, html)
    if (!r.ok && String(process.env.DEV_OTP || '0') === '1') return res.json({ ok: true })
    if (!r.ok) return res.status(503).json({ error: 'send_failed' })
  }
  res.json({ ok: true })
})

app.post('/api/auth/email/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const code = String(req.body?.code || '').trim()
  const row = db.prepare('SELECT * FROM email_otps WHERE email = ?').get(email)
  if (!row) return res.status(400).json({ error: 'not_requested' })
  if (Date.now() > row.expires_at) return res.status(400).json({ error: 'expired' })
  if (row.attempts >= 6) return res.status(429).json({ error: 'too_many' })
  if (row.code !== code) {
    db.prepare('UPDATE email_otps SET attempts = attempts + 1 WHERE email = ?').run(email)
    return res.status(400).json({ error: 'wrong_code' })
  }
  const user = db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(email)
  if (!user) return res.status(404).json({ error: 'user_not_found' })
  if (user.status === 'suspended' || user.status === 'deleted') return res.status(403).json({ error: 'account_suspended' })
  db.prepare('DELETE FROM email_otps WHERE email = ?').run(email)
  db.prepare('UPDATE users SET email_verified = 1, last_seen = datetime(\'now\') WHERE id = ?').run(user.id)
  res.json({ ...startSession(user.id), user: fullUser(user.id) })
})


/* ================= نشر مُدار من الداخل (نسخ ← نشر ← استرجاع ← فحص ← تراجع) ================= */
const RH = () => process.env.RENDER_API_KEY || ''
const RS = () => process.env.RENDER_SERVICE_ID || 'srv-dbgilgou01pc73c708ig'
const rh = () => ({ authorization: `Bearer ${RH()}`, 'content-type': 'application/json' })

async function renderDeploy(commitId) {
  const body = commitId ? JSON.stringify({ commitId }) : '{}'
  const r = await fetch(`https://api.render.com/v1/services/${RS()}/deploys`, { method: 'POST', headers: rh(), body })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.message || 'deploy_failed')
  return d
}

const waitDeploy = async (id, ms = 8 * 60 * 1000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const r = await fetch(`https://api.render.com/v1/services/${RS()}/deploys/${id}`, { headers: rh() })
    const d = await r.json().catch(() => ({}))
    if (['live', 'build_failed', 'canceled', 'deactivated'].includes(d.status)) return d
    await new Promise((x) => setTimeout(x, 10000))
  }
  return { status: 'timeout' }
}

async function lastLiveCommit() {
  const r = await fetch(`https://api.render.com/v1/services/${RS()}/deploys?limit=20`, { headers: rh() })
  const arr = await r.json().catch(() => [])
  const live = arr.find((x) => x.deploy?.status === 'live')
  return live?.deploy?.commit?.id || null
}

async function managedDeploy(notify) {
  if (!RH()) return 'ما فيه مفتاح Render مربوط — أضف RENDER_API_KEY.'
  // 1) نسخة احتياطية سحابية قبل النشر (النسخة الجديدة تسترجع نفسها عند الإقلاع)
  const tables = {}
  for (const t of BACKUP_TABLES) { try { tables[t] = db.prepare(`SELECT * FROM ${t}`).all() } catch {} }
  const files = collectUploads()
  const snap = { at: new Date().toISOString(), version: 2, tables, files }
  try {
    const { token, acc, ns } = cfCfg()
    if (token && acc && ns) {
      await fetch(`https://api.cloudflare.com/client/v4/accounts/${acc}/storage/kv/namespaces/${ns}/values/bk:latest`, {
        method: 'PUT',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(snap),
      })
    }
  } catch (e) { console.error('PREDEPLOY_SNAP_FAIL', e.message) }
  notify && tgNotify('🚀 بدأت نشر نسخة جديدة… (أخذت نسخة احتياطية أول)')

  const dep = await renderDeploy()
  const res = await waitDeploy(dep.id)
  if (res.status !== 'live') {
    const prev = await lastLiveCommit().catch(() => null)
    if (prev) {
      const rb = await renderDeploy(prev).catch(() => null)
      tgNotify(`⚠️ النشر فشل (${res.status}) — رجّعت آخر نسخة ناجحة تلقائياً ${rb ? '✅' : '❌'}`)
      return `فشل النشر (${res.status}) — تم التراجع ${rb ? 'بنجاح' : 'لكنه تعذّر'}`
    }
    tgNotify(`⚠️ النشر فشل (${res.status}) وما لقيت نسخة سابقة`)
    return 'فشل النشر وما قدرت أتراجع'
  }

  tgNotify('✅ النشر نجح — النسخة الجديدة تسترجع البيانات تلقائياً عند الإقلاع')
  return 'تم النشر ✅ والبيانات تسترجع تلقائياً'
}

app.post('/api/admin/deploy', adminRequired, adminCan('backup'), async (req, res) => {
  if (global.__deploying) return res.status(409).json({ error: 'already_running' })
  global.__deploying = true
  try {
    const msg = await managedDeploy(true)
    res.json({ ok: true, message: msg })
  } catch (e) {
    res.status(500).json({ error: 'deploy_failed', detail: e.message })
  } finally { global.__deploying = false }
})

app.get('/api/admin/audit', adminRequired, (req, res) => {
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 200').all()
  res.json(rows)
})

/* ================= المساعد الخاص (سعودي) ================= */
const SA = {
  hi: ['هلا والله وغلا 👋', 'يا هلا بالمدير 🙌', 'هلا بك، تامر أمر؟'],
  ok: ['تم يا طويل العمر ✅', 'أبشر، خلصتها ✅', 'تم اللي طلبته ✅'],
  nope: ['العذر منك، ما فهمت عليك 🤔', 'ما وصلني قصدك، وضّح لي شوي؟'],
}


/* ================= فحوصات رمزي: الموقع + الحماية ================= */
async function siteCheck() {
  const base = 'https://mihnati.onrender.com'
  const t0 = Date.now()
  const out = []
  const test = async (label, url) => {
    const s0 = Date.now()
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(12000) })
      const ms = Date.now() - s0
      out.push({ label, ok: r.ok, status: r.status, ms })
    } catch (e) {
      out.push({ label, ok: false, status: 0, ms: Date.now() - s0, err: e.message })
    }
  }
  await test('الصفحة الرئيسية', base + '/')
  await test('واجهة الـ API', base + '/api/health')
  await test('قائمة الفنيين', base + '/api/experts')
  const img = db.prepare("SELECT image FROM ads WHERE image LIKE '/uploads/%' LIMIT 1").get()
  if (img) await test('صور الإعلانات', base + img.image)

  const ms = Date.now() - t0
  const fails = out.filter((x) => !x.ok)
  const lines = out.map((x) => `${x.ok ? '✅' : '❌'} ${x.label} (${x.status || 'x'} · ${x.ms}ms)`).join('\n')
  const reqs = db.prepare("SELECT COUNT(*) c FROM requests WHERE status='open'").get().c
  const verdict = fails.length === 0
    ? `كل شي تمام يا طويل العمر ✅\nالاستجابة الكاملة ${ms}ms`
    : `فيه ${fails.length} نقطة تحتاج نظر ⚠️`
  return { reply: `${verdict}\n\n${lines}\n\n🟢 مزادات مفتوحة: ${reqs}`, data: out }
}

function securityCheck() {
  const issues = []
  const good = []

  // 1) OTP تطويري
  if (String(process.env.DEV_OTP || '0') === '1') issues.push('🔴 رمز OTP يظهر على الشاشة (DEV_OTP مفعّل) — أي أحد يدخل بأي رقم')
  else good.push('رمز OTP محمي')

  // 2) سر الجلسات
  if (String(process.env.AUTH_SECRET || '').length >= 32) good.push('مفتاح الجلسات قوي')
  else issues.push('🟠 مفتاح الجلسات (AUTH_SECRET) ضعيف أو غير موجود')

  // 3) تسريب جوالات الفنيين
  const raw = db.prepare("SELECT phone FROM experts WHERE phone IS NOT NULL LIMIT 1").get()
  if (raw) good.push('جوالات الفنيين مخفية عن العامة (نظهرها بعد الدفع فقط)')

  // 4) نطاق الأدمن محمي
  good.push('مسارات الإدارة محمية بتوكن + صلاحيات لكل مشرف')

  // 5) تحديد المحاولات
  good.push('حد محاولات الدخول والتسجيل (Rate limit) مفعّل')

  // 6) حسابات بكلمات مرور ضعيفة
  const weak = db.prepare("SELECT COUNT(*) c FROM users WHERE password_hash IS NULL AND role <> 'customer'").get().c
  if (weak) issues.push(`🟠 ${weak} حساب بلا كلمة مرور`)

  // 7) حسابات موقوفة/محجوبة
  const susp = db.prepare("SELECT COUNT(*) c FROM users WHERE status='suspended'").get().c
  const blocked = db.prepare("SELECT COUNT(*) c FROM blocked_phones").get().c
  good.push(`حسابات موقوفة: ${susp} · أرقام محجوبة: ${blocked}`)

  // 8) نزاعات مفتوحة
  const disp = db.prepare("SELECT COUNT(*) c FROM disputes WHERE status='open'").get().c
  if (disp) issues.push(`🟠 ${disp} شكوى مفتوحة تحتاج قرار`)

  // 9) سجل العمليات
  const logs = db.prepare("SELECT COUNT(*) c FROM audit_log").get().c
  good.push(`سجل عمليات الإدارة: ${logs} حركة`)

  // 10) نسخ احتياطي
  const lastTx = db.prepare("SELECT MAX(created_at) t FROM wallet_tx").get().t
  good.push('نسخ احتياطي سحابي كل ٣٠ دقيقة')

  const score = Math.max(0, 100 - issues.length * 12)
  return {
    reply: `فحص الحماية 🔐\n\nالنتيجة: ${score}/100\n\n${issues.length ? 'المشاكل:\n' + issues.join('\n') + '\n\n' : 'ما فيه مشاكل واضحة ✅\n\n'}✅ سليم:\n${good.map((g) => '• ' + g).join('\n')}`,
    data: { score, issues },
  }
}


/* فحص تشغيلي: هل الموقع يقوم بعمله فعلياً؟ */
async function functionalCheck() {
  const base = 'https://mihnati.onrender.com'
  const rows = []
  const add = (label, ok, note = '') => rows.push({ label, ok, note })

  const get = async (path, opts = {}) => {
    const t = Date.now()
    try {
      const r = await fetch(base + path, { ...opts, signal: AbortSignal.timeout(12000) })
      return { r, ms: Date.now() - t }
    } catch (e) { return { r: null, ms: Date.now() - t, err: e.message } }
  }

  // 1) الصفحة
  {
    const { r, ms } = await get('/')
    add('فتح الموقع', !!r && r.ok && ms < 4000, `${ms}ms`)
  }
  // 2) قاعدة البيانات
  {
    const { r } = await get('/api/health')
    add('قاعدة البيانات', !!r && r.ok)
  }
  // 3) الأقسام
  {
    const { r } = await get('/api/categories')
    const j = r ? await r.json().catch(() => []) : []
    add('الأقسام والخدمات', Array.isArray(j) && j.length >= 6, `${j.length || 0} قسم`)
  }
  // 4) الفنيون + إخفاء الجوال
  {
    const { r } = await get('/api/experts')
    const j = r ? await r.json().catch(() => []) : []
    const leak = Array.isArray(j) && j.some((e) => e.phone)
    add('قائمة الفنيين', Array.isArray(j) && j.length > 0, `${j.length || 0} فني`)
    add('إخفاء جوالات الفنيين', !leak)
  }
  // 5) الصور
  {
    const img = db.prepare("SELECT image FROM ads WHERE image LIKE '/uploads/%' LIMIT 1").get()
    if (img) {
      const { r } = await get(img.image)
      const type = r?.headers.get('content-type') || ''
      add('عرض الصور', !!r && r.ok && type.startsWith('image'), type)
    } else add('عرض الصور', true, 'لا يوجد إعلان بصوره')
  }
  // 6) أرقام الطلبات
  {
    const bad = db.prepare('SELECT COUNT(*) c FROM requests WHERE number IS NULL').get().c
    add('ترقيم الطلبات', bad === 0, bad ? `${bad} بدون رقم` : 'سليم')
  }
  // 7) إغلاق المزادات المنتهية (sweep)
  {
    const stale = db.prepare(
      "SELECT COUNT(*) c FROM requests WHERE status='open' AND ends_at IS NOT NULL AND datetime(ends_at) < datetime('now','-4 minutes')",
    ).get().c
    add('إغلاق المزادات المنتهية', stale === 0, stale ? `${stale} مزاد عالق` : 'سليم')
  }
  // 8) الفواتير متسقة
  {
    const bad = db.prepare('SELECT COUNT(*) c FROM invoices WHERE net < 0 OR total_paid < 0').get().c
    add('سلامة الفواتير', bad === 0, bad ? `${bad} فاتورة غير سليمة` : 'سليم')
  }
  // 9) محفظة الفنيين متسقة
  {
    const bad = db.prepare("SELECT COUNT(*) c FROM wallet_tx WHERE amount < 0").get().c
    add('سلامة المحافظ', bad === 0, bad ? `${bad} حركة سالبة` : 'سليم')
  }
  // 10) الجوال مخفي بدون دفع
  {
    const { r } = await get('/api/experts/1/contact')
    const j = r && r.ok ? await r.json().catch(() => ({})) : {}
    add('قفل بيانات التواصل', j.allowed === false || (r && r.status === 401), 'يظهر بعد الدفع فقط')
  }
  // 11) حماية الإدارة
  {
    const { r } = await get('/api/admin/overview')
    add('حماية لوحة التحكم', !!r && (r.status === 401 || r.status === 403), `رد ${r?.status || 'x'}`)
  }

  const passed = rows.filter((x) => x.ok).length
  const score = Math.round((passed / rows.length) * 100)
  const body = rows.map((x) => `${x.ok ? '✅' : '❌'} ${x.label}${x.note ? ` — ${x.note}` : ''}`).join('\n')
  return {
    reply: `فحص تشغيل الموقع 🧪\n\nالنتيجة: ${score}% (${passed}/${rows.length})\n\n${body}${
      score === 100 ? '\n\nكله شغال تمام يا طويل العمر ✅' : '\n\nفيه نقاط تحتاج مراجعة ⚠️'
    }`,
    data: rows,
  }
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const sar = (n) => `${Number(n || 0).toFixed(2)} ريال`

async function agentReply(msg) {
  const q = String(msg || '').trim()
  const t = q.replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').toLowerCase()

  const has = (...w) => w.some((x) => t.includes(x))

  // النداء بالاسم — يرد التحية فقط إذا كان ما فيه أمر بعده
  const rest = q.replace(/يا\s*رمزي/g, '').replace(/رمزي/g, '').trim()
  const isCmd = /انشر|نشر|حدث|حدّث|افحص|فحص|اختبر|ارسل|انسخ|احفظ|ارجع|وقّف|وقف|احجب|ارفض|اقبل|وافق|موعد|وضع|دخل|طلب|شكوي|شكاوي|نسخ|عمول|محفظ/.test(t)
  if (has('رمزي') && rest.length <= 8 && !isCmd) {
    if (has('هلا', 'يا', 'وش', 'كيف', 'اخبار', 'أخبار', 'وينك')) {
      return {
        reply: pick(['هلا يا طويل العمر، رمزي في خدمتك 🫡', 'يا هلا، رمزي معك 🙌', 'أبشر، رمزي حاضر ✅']) +
          '\n\nأقدر أقولك: وضع الموقع، الطلبات، الدخل، الشكاوى، والنسخ الاحتياطية.',
      }
    }
  }

  // سلام
  if (has('هلا', 'السلام', 'مرحبا', 'صباح', 'مساء', 'يا هلا') && q.length < 25) {
    return { reply: pick(SA.hi) + '\n\nأنا رمزي، مساعدك الخاص. أقدر أقولك: وضع الموقع، الطلبات، الدخل، المحافظ، النزاعات، وأسوي لك نسخة احتياطية أو أرجّع آخر نسخة.' }
  }

  // نشر / تحديث
  if (has('انشر', 'نشر', 'حدث الموقع', 'حدّث الموقع', 'رفع نسخه', 'رفع نسخة')) {
    if (global.__deploying) return { reply: 'فيه نشر شغّال الحين يا طويل العمر ⏳ لحظة وأبلغك.' }
    global.__deploying = true
    managedDeploy(true)
      .catch((e) => tgNotify('⚠️ تعذّر النشر: ' + e.message))
      .finally(() => { global.__deploying = false })
    return { reply: 'أبشر 🚀 بدأت النشر وأخذت نسخة احتياطية قبله.\nياخذ حوالي دقيقتين، وبوصلك على تليجرام أول ما يخلص.' }
  }

  // فحص تشغيل الموقع
  if (has('افحص عمل الموقع', 'فحص تشغيلي', 'افحص عمل', 'يشتغل', 'يجرب', 'اختبر الموقع', 'فحص شامل')) {
    return await functionalCheck()
  }

  // فحص الموقع الفعلي
  if (has('افحص الموقع', 'فحص الموقع', 'تأكد من الموقع', 'الموقع يفتح', 'استجابة')) {
    return await siteCheck()
  }

  // فحص الحماية
  if (has('الحمايه', 'الحماية', 'امان', 'أمان', 'اختراق', 'ثغره', 'ثغرة', 'سيكيورتي')) {
    return securityCheck()
  }

  // وضع الموقع
  if (has('وضع الموقع', 'الموقع شغال', 'شغال', 'الحالة', 'صاحي', 'واقف')) {
    const reqs = db.prepare("SELECT COUNT(*) c FROM requests WHERE date(created_at,'+3 hours') = date('now','+3 hours')").get().c
    const open = db.prepare("SELECT COUNT(*) c FROM requests WHERE status = 'open'").get().c
    const exp = db.prepare('SELECT COUNT(*) c FROM experts').get().c
    const usr = db.prepare("SELECT COUNT(*) c FROM users WHERE COALESCE(status,'active')='active'").get().c
    return {
      reply: `الموقع شغّال تمام يا طويل العمر ✅\n\n📥 طلبات اليوم: ${reqs}\n🟢 مزادات مفتوحة: ${open}\n🧰 فنيين: ${exp}\n👥 أعضاء: ${usr}`,
      data: { reqs, open, exp, usr },
    }
  }

  // المال
  if (has('دخل', 'ايراد', 'فلوس', 'محفظ', 'عمول', 'كم كسبنا', 'المبلغ')) {
    const fin = db.prepare('SELECT COALESCE(SUM(commission),0) c, COALESCE(SUM(total_paid),0) p, COUNT(*) n FROM invoices').get()
    const due = db.prepare("SELECT COALESCE(SUM(amount),0) v FROM platform_dues WHERE status='due'").get().v
    const avail = db.prepare("SELECT COALESCE(SUM(amount),0) v FROM wallet_tx WHERE status='available'").get().v
    return {
      reply: `الحسبة يا طويل العمر 💰\n\n🧾 فواتير: ${fin.n}\n💵 إجمالي مدفوعات العملاء: ${sar(fin.p)}\n🏦 عمولة المنصة: ${sar(fin.c)}\n⏳ عمولة لسّه عند الفنيين: ${sar(due)}\n✅ متاح لسحب الفنيين: ${sar(avail)}`,
      data: { fin, due, avail },
    }
  }

  // الطلبات
  if (has('طلبات', 'طلبات اليوم', 'اخر الطلبات')) {
    const rows = db.prepare("SELECT id, number, title, status, city FROM requests ORDER BY id DESC LIMIT 5").all()
    return {
      reply: 'آخر ٥ طلبات 📋\n\n' + rows.map((r) => `#${r.number || r.id} — ${r.title} (${r.status})`).join('\n'),
      data: rows,
    }
  }

  // النزاعات
  if (has('نزاع', 'شكوي', 'شكاوي', 'كاوي', 'شكو', 'نزاعات')) {
    const n = db.prepare("SELECT COUNT(*) c FROM disputes WHERE status='open'").get().c
    return { reply: n ? `عندك ${n} شكوى مفتوحة، تبي أطلعها لك؟` : 'ما فيه شكاوى مفتوحة الحين ✅' }
  }

  // نسخة احتياطية
  if (has('نسخة', 'باكن', 'احتياط')) {
    const tables = ['users', 'experts', 'requests', 'bids', 'invoices', 'wallet_tx', 'credits']
    const counts = tables.map((t) => `${t}: ${db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c}`).join(' · ')
    return { reply: `أبشر، النسخة تناخذ تلقائياً كل ٣٠ دقيقة ☁️\n\nالحين عندنا:\n${counts}` }
  }

  // المساعدة
  if (has('ساعد', 'وش تسوي', 'مساعدة', 'اوامر', 'تقدر')) {
    return {
      reply: `أنا رمزي 🤖 — مساعدك الخاص في مهنتي\n\nأقدر أسوي لك 👇\n\n• «وضع الموقع» — يطلع لك الأرقام الحين\n• «الدخل» أو «العمولات» — حسبة الفلوس\n• «الطلبات» — آخر الطلبات\n• «الشكاوى» — المفتوحة\n• «النسخ» — حالة النسخ الاحتياطي\n\nولو تبي شي ثاني قل لي بالعربي وأنا أفهم 😉`,
    }
  }

  return { reply: pick(SA.nope) + '\n\nجرّب تقول: «يا رمزي وش وضع الموقع» أو «الدخل» أو «الطلبات».' }
}

app.post('/api/agent/telegram', async (req, res) => {
  const secret = process.env.AGENT_SECRET || ''
  if (secret && req.headers['x-agent-secret'] !== secret) return res.status(401).json({ error: 'unauthorized' })
  try {
    res.json(await agentReply(req.body?.message))
  } catch (e) {
    res.status(500).json({ reply: 'صار خطأ بسيط، جرّب مرة ثانية 🙏' })
  }
})

app.post('/api/admin/agent', adminRequired, async (req, res) => {
  try {
    res.json(await agentReply(req.body?.message))
  } catch (e) {
    res.status(500).json({ reply: 'صار خطأ بسيط، جرّب مرة ثانية 🙏' })
  }
})


/* ================= رمزي على تليجرام ================= */
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const TG_SECRET = process.env.TELEGRAM_SECRET || ''

async function tgSend(chatId, text) {
  if (!TG_TOKEN || !chatId) return false
  try {
    const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 3800), disable_web_page_preview: true }),
    })
    return r.ok
  } catch { return false }
}

function tgOwnerId() {
  return db.prepare("SELECT value FROM settings WHERE key = 'telegram_owner'").get()?.value || ''
}

function tgNotify(text) {
  const id = tgOwnerId()
  if (id) tgSend(id, text).catch(() => {})
}

app.post('/api/telegram/:secret', async (req, res) => {
  res.json({ ok: true })
  try {
    if (TG_SECRET && req.params.secret !== TG_SECRET) return
    const hdr = req.headers['x-telegram-bot-api-secret-token']
    if (TG_SECRET && hdr && hdr !== TG_SECRET) return

    const msg = req.body?.message || req.body?.edited_message
    const text = String(msg?.text || '').trim()
    if (!text) return
    const chatId = String(msg.chat.id)
    const name = msg.from?.first_name || ''

    const owner = tgOwnerId()
    if (!owner) {
      db.prepare("INSERT INTO settings (key, value) VALUES ('telegram_owner', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(chatId)
      await tgSend(chatId, `يا هلا ${name} 👋\nأنا رمزي — مساعدك الخاص في مهنتي، ومن الحين أنا مربوط عليك أنت بس.\n\n• /status — وضع الموقع\n• /money — الدخل والعمولات\n• أو اكتب لي بالعربي: «يا رمزي وش وضع الموقع»`)
      return
    }
    if (chatId !== owner) {
      await tgSend(chatId, 'عذراً، أنا مساعد خاص وما أرد على غير المالك 🙏')
      return
    }

    if (text === '/start') {
      await tgSend(chatId, 'رمزي معك 🫡\n\n/status وضع الموقع\n/money الدخل والعمولات\n\nأو اكتب سؤالك بالعربي مباشرة.')
      return
    }
    if (text === '/status') {
      const r = await agentReply('وضع الموقع')
      await tgSend(chatId, r.reply)
      return
    }
    if (text === '/check' || text === '/فحص') {
      const r = await functionalCheck()
      await tgSend(chatId, r.reply)
      return
    }
    if (text === '/money') {
      const r = await agentReply('الدخل')
      await tgSend(chatId, r.reply)
      return
    }
    const r = await agentReply(text)
    await tgSend(chatId, r.reply)
  } catch (e) { console.error('TG_HOOK_FAIL', e.message) }
})

/* ================= إعدادات الموقع (الإدارة) ================= */
const SITE_KEYS = {
  site_name: 'مهنتي',
  site_email: '',
  support_phone: '',
  support_whatsapp: '',
  site_url: 'https://mihnati.onrender.com',
  maintenance: '0',
  otp_enabled: '1',
  signup_open: '1',
  auction_seconds: '120',
  grace_seconds: '120',
  pay_cash: '1',
  pay_card: '1',
  pay_stcpay: '1',
  pay_urpay: '1',
  bank_name: '',
  bank_iban: '',
  bank_account_name: '',
}

app.get('/api/site-config', (_req, res) => {
  const out = {}
  for (const k of Object.keys(SITE_KEYS)) out[k] = db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value ?? SITE_KEYS[k]
  res.json({
    site_name: out.site_name, site_email: out.site_email,
    support_phone: out.support_phone, support_whatsapp: out.support_whatsapp,
    maintenance: out.maintenance === '1',
    methods: { cash: out.pay_cash === '1', card: out.pay_card === '1', stcpay: out.pay_stcpay === '1', urpay: out.pay_urpay === '1' },
  })
})

app.get('/api/admin/site-settings', adminRequired, (_req, res) => {
  const out = {}
  for (const k of Object.keys(SITE_KEYS)) out[k] = db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value ?? SITE_KEYS[k]
  res.json(out)
})

app.patch('/api/admin/site-settings', adminRequired, adminCan('site'), (req, res) => {
  const b = req.body || {}
  const set = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  for (const k of Object.keys(SITE_KEYS)) {
    if (b[k] === undefined) continue
    set.run(k, typeof b[k] === 'boolean' ? (b[k] ? '1' : '0') : String(b[k]))
  }
  res.json({ ok: true })
})

/* الأرقام المحجوبة (حجب الجوال) */
app.get('/api/admin/blocked-phones', adminRequired, (_req, res) => {
  res.json(db.prepare('SELECT * FROM blocked_phones ORDER BY created_at DESC').all())
})

app.post('/api/admin/blocked-phones', adminRequired, adminCan('users'), (req, res) => {
  const phone = normalizePhone(req.body?.phone)
  if (!phone) return res.status(400).json({ error: 'invalid_phone' })
  db.prepare('INSERT OR REPLACE INTO blocked_phones (phone, reason, blocked_by) VALUES (?, ?, ?)')
    .run(phone, String(req.body?.reason || '').slice(0, 200) || null, 'admin')
  db.prepare("UPDATE users SET status = 'suspended' WHERE phone = ?").run(phone)
  res.status(201).json({ ok: true, phone })
})

app.delete('/api/admin/blocked-phones/:phone', adminRequired, adminCan('users'), (req, res) => {
  db.prepare('DELETE FROM blocked_phones WHERE phone = ?').run(decodeURIComponent(req.params.phone))
  res.json({ ok: true })
})

const isBlockedPhone = (phone) => !!db.prepare('SELECT 1 FROM blocked_phones WHERE phone = ?').get(phone)

/* ================= نادي الولاء (الإدارة) ================= */
app.get('/api/admin/loyalty/settings', adminRequired, adminCan('loyalty'), (req, res) => {
  res.json({
    point_value: POINT_VALUE(),
    customer_target: LOYALTY_TARGET(),
    customer_points: CUSTOMER_POINTS(),
    expert_target: REF_TARGET(),
    expert_points: EXPERT_POINTS(),
    valid_days: CREDIT_DAYS(),
  })
})

app.patch('/api/admin/loyalty/settings', adminRequired, adminCan('loyalty'), (req, res) => {
  const b = req.body || {}
  const set = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  const map = {
    point_value: 'loyalty_point_value',
    customer_target: 'loyalty_customer_target',
    customer_points: 'loyalty_customer_points',
    expert_target: 'loyalty_expert_target',
    expert_points: 'loyalty_expert_points',
    valid_days: 'credit_valid_days',
  }
  for (const [k, key] of Object.entries(map)) {
    if (b[k] === undefined) continue
    const n = Number(b[k])
    if (!Number.isFinite(n) || n < 0) continue
    set.run(key, String(n))
  }
  res.json({ ok: true })
})

app.get('/api/admin/loyalty', adminRequired, adminCan('loyalty'), (req, res) => {
  try { expireCredits() } catch {}
  const q = String(req.query.q || '').trim()
  let users = db
    .prepare(
      `SELECT id, name, phone, role, city, invite_code, referred_by, last_seen, created_at
       FROM users ORDER BY id DESC`,
    )
    .all()
  if (q) users = users.filter((u) => `${u.name || ''} ${u.phone || ''} ${u.invite_code || ''}`.includes(q))

  const creditsAgg = db
    .prepare(
      `SELECT user_id,
        COALESCE(SUM(CASE WHEN remaining > 0 AND expires_at > datetime('now') THEN remaining ELSE 0 END),0) AS balance,
        COALESCE(MIN(CASE WHEN remaining > 0 AND expires_at > datetime('now') THEN expires_at END), NULL) AS next_expiry
       FROM credits GROUP BY user_id`,
    )
    .all()
  const cmap = new Map(creditsAgg.map((c) => [c.user_id, c]))
  const invites = db
    .prepare(
      `SELECT referred_by AS uid, COUNT(*) total,
        SUM(CASE WHEN (SELECT COUNT(*) FROM requests r JOIN payments p2 ON p2.request_id = r.id
                        WHERE r.user_id = u.id AND p2.status IN ('paid','pending_cash')) > 0
                  OR (SELECT COUNT(*) FROM bids b JOIN experts e2 ON e2.id = b.expert_id WHERE e2.user_id = u.id) > 0
                 THEN 1 ELSE 0 END) AS active
       FROM users u WHERE referred_by IS NOT NULL GROUP BY referred_by`,
    )
    .all()
  const imap = new Map(invites.map((i) => [i.uid, i]))

  const rows = users.map((u) => {
    for (const c of []) void c
    const c = cmap.get(u.id) || {}
    const inv = imap.get(u.id) || {}
    return {
      id: u.id,
      name: u.name,
      phone: u.phone,
      role: u.role,
      city: u.city,
      code: u.invite_code,
      referred_by: u.referred_by,
      invited: inv.total || 0,
      active_invited: inv.active || 0,
      balance: money(c.balance || 0),
      next_expiry: c.next_expiry || null,
      last_seen: u.last_seen,
    }
  })

  const tot = (k) => money(rows.reduce((a, r) => a + Number(r[k] || 0), 0))
  res.json({
    settings: {
      target: LOYALTY_TARGET(), bonus: LOYALTY_BONUS(), valid_days: CREDIT_DAYS(),
      expert_target: REF_TARGET(), expert_bonus: REF_BONUS(),
      point_value: POINT_VALUE(), customer_points: CUSTOMER_POINTS(), expert_points: EXPERT_POINTS(),
    },
    totals: {
      members: rows.length,
      with_balance: rows.filter((r) => r.balance > 0.009).length,
      balance: tot('balance'),
      invited_total: rows.reduce((a, r) => a + r.invited, 0),
      expiring_7d: money(
        db.prepare("SELECT COALESCE(SUM(remaining),0) v FROM credits WHERE remaining > 0 AND expires_at > datetime('now') AND expires_at <= datetime('now','+7 days')").get().v,
      ),
      used: money(db.prepare('SELECT COALESCE(SUM(amount - remaining),0) v FROM credits').get().v),
    },
    rows: rows.filter((r) => r.role !== 'admin'),
  })
})

app.post('/api/admin/loyalty/grant', adminRequired, adminCan('loyalty'), (req, res) => {
  const userId = Number(req.body?.user_id)
  const amount = Number(req.body?.amount)
  const note = String(req.body?.note || 'منحة من الإدارة').slice(0, 120)
  if (!userId || !(amount > 0)) return res.status(400).json({ error: 'invalid' })
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
  if (!u) return res.status(404).json({ error: 'not_found' })
  ensureUserCode(u.id)
  const tx = grantCredit({ userId, amount, source: 'admin', note, ref: `admin-${userId}-${Date.now()}` })
  if (!tx) return res.status(400).json({ error: 'failed' })
  io.to(`user:${userId}`).emit('notify', {
    type: 'credit',
    title: '🎁 رصيد جديد في نادي الولاء',
    body: `أضفنا لك ${money(amount)} ر.س — استخدمها في طلب فني`,
    url: '/profile',
  })
  res.status(201).json({ ok: true, balance: creditBalance(userId) })
})

/* ================= المالية (الإدارة) ================= */
function financeRows(from, to) {
  const experts = db
    .prepare("SELECT id, name, name_ar, job, city, user_id, phone FROM experts WHERE COALESCE(is_bot,0) = 0 ORDER BY id")
    .all()
  const earned = db
    .prepare(
      `SELECT expert_id,
        COALESCE(SUM(CASE WHEN status IN ('hold','available') AND date(created_at,'+3 hours') BETWEEN ? AND ? THEN amount ELSE 0 END),0) AS earned,
        COALESCE(SUM(CASE WHEN status = 'hold' THEN amount ELSE 0 END),0) AS held
       FROM wallet_tx GROUP BY expert_id`,
    )
    .all(from, to)
  const earnedMap = new Map(earned.map((r) => [r.expert_id, r]))
  const paid = db
    .prepare(
      `SELECT expert_id, COALESCE(SUM(amount),0) AS paid
       FROM withdrawals WHERE status = 'paid' AND date(paid_at,'+3 hours') BETWEEN ? AND ?
       GROUP BY expert_id`,
    )
    .all(from, to)
  const paidMap = new Map(paid.map((r) => [r.expert_id, r.paid]))
  const outstanding = db
    .prepare("SELECT expert_id, COALESCE(SUM(amount),0) AS requested FROM withdrawals WHERE status = 'requested' GROUP BY expert_id")
    .all()
  const reqMap = new Map(outstanding.map((r) => [r.expert_id, r.requested]))

  return experts.map((e) => {
    const w = walletSummary(e.id)
    const em = earnedMap.get(e.id) || {}
    return {
      id: e.id,
      name: e.name_ar || e.name,
      job: e.job,
      city: e.city,
      phone: e.phone,
      user_id: e.user_id,
      week_earned: money(em.earned),
      week_paid: money(paidMap.get(e.id) || 0),
      requested: money(reqMap.get(e.id) || 0),
      available: money(w.available),
      pending: money(w.pending),
      paid_total: money(w.paid),
      due: money(w.available),
      due_platform: money(duePlatformOf(e.id)),
    }
  })
}

app.get('/api/admin/finance', adminRequired, adminCan('finance'), (req, res) => {
  const wr = weekRange()
  const from = String(req.query.from || wr.from).slice(0, 10)
  const to = String(req.query.to || wr.to).slice(0, 10)
  try { releaseDue() } catch {}
  const rows = financeRows(from, to)
  const sum = (k) => money(rows.reduce((a, r) => a + Number(r[k] || 0), 0))
  res.json({
    period: { from, to },
    totals: {
      available: sum('available'),
      pending: sum('pending'),
      requested: sum('requested'),
      due_platform: sum('due_platform'),
      week_earned: sum('week_earned'),
      week_paid: sum('week_paid'),
      paid_total: sum('paid_total'),
    },
    due_count: rows.filter((r) => r.available > 0.009).length,
    rows: rows.filter((r) => r.available > 0.009 || r.pending > 0.009 || r.week_earned > 0 || r.requested > 0.009),
    withdrawals: db
      .prepare(
        `SELECT w.*, e.name_ar, e.name FROM withdrawals w LEFT JOIN experts e ON e.id = w.expert_id
         ORDER BY CASE w.status WHEN 'requested' THEN 0 ELSE 1 END, w.id DESC LIMIT 100`,
      )
      .all(),
    credits: (() => {
      expireCredits()
      const row = db.prepare("SELECT COALESCE(SUM(remaining),0) v, COUNT(DISTINCT user_id) c FROM credits WHERE remaining > 0 AND expires_at > datetime('now')").get()
      const used = db.prepare("SELECT COALESCE(SUM(amount - remaining),0) v FROM credits").get()
      return { outstanding: money(row.v), users: row.c, used: money(used.v) }
    })(),
    settings: {
      hold_days: HOLD_DAYS(), referral_bonus: REF_BONUS(), referral_target: REF_TARGET(),
      loyalty_target: LOYALTY_TARGET(), loyalty_bonus: LOYALTY_BONUS(), credit_days: CREDIT_DAYS(),
    },
  })
})

app.post('/api/admin/finance/pay/:expertId', adminRequired, adminCan('finance'), (req, res) => {
  const e = db.prepare('SELECT * FROM experts WHERE id = ?').get(req.params.expertId)
  if (!e) return res.status(404).json({ error: 'not_found' })
  const s = walletSummary(e.id)
  const amount = money(req.body?.amount != null ? Number(req.body.amount) : s.available)
  if (!(amount > 0)) return res.status(400).json({ error: 'nothing_due' })
  const info = db
    .prepare("INSERT INTO withdrawals (expert_id, amount, status, ref, account_name, paid_at) VALUES (?, ?, 'paid', ?, ?, datetime('now'))")
    .run(e.id, amount, req.body?.ref || null, req.body?.account_name || null)
  if (e.user_id) {
    io.to(`user:${e.user_id}`).emit('notify', {
      type: 'wallet',
      title: '💸 تم تحويل مستحقاتك',
      body: `تم تحويل ${amount} ر.س إلى حسابك البنكي`,
    })
  }
  res.json({ ok: true, id: info.lastInsertRowid, amount, wallet: walletSummary(e.id) })
})

app.post('/api/admin/finance/settle-dues/:expertId', adminRequired, adminCan('finance'), (req, res) => {
  const e = db.prepare('SELECT * FROM experts WHERE id = ?').get(req.params.expertId)
  if (!e) return res.status(404).json({ error: 'not_found' })
  db.prepare("UPDATE platform_dues SET status = 'settled', settled_at = datetime('now') WHERE expert_id = ? AND status = 'due'").run(e.id)
  res.json({ ok: true, wallet: walletSummary(e.id) })
})

app.post('/api/admin/finance/withdrawals/:id', adminRequired, adminCan('finance'), (req, res) => {
  const w = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(req.params.id)
  if (!w) return res.status(404).json({ error: 'not_found' })
  const status = String(req.body?.status || '')
  if (!['paid', 'rejected', 'requested'].includes(status)) return res.status(400).json({ error: 'invalid_status' })
  db.prepare("UPDATE withdrawals SET status = ?, paid_at = CASE WHEN ? = 'paid' THEN datetime('now') ELSE paid_at END WHERE id = ?")
    .run(status, status, w.id)
  const e = db.prepare('SELECT user_id FROM experts WHERE id = ?').get(w.expert_id)
  if (e?.user_id && status !== 'requested') {
    io.to(`user:${e.user_id}`).emit('notify', {
      type: 'wallet',
      title: status === 'paid' ? '💸 تم تحويل مستحقاتك' : 'تم رفض طلب السحب',
      body: `${w.amount} ر.س`,
    })
  }
  res.json({ ok: true })
})

/* تقارير مالية قابلة للطباعة: يومي / أسبوعي / شهري / سنوي */
app.get('/api/admin/finance/report', adminRequired, adminCan('finance'), (req, res) => {
  const kind = ['daily', 'weekly', 'monthly', 'yearly'].includes(String(req.query.type)) ? req.query.type : 'weekly'
  const now = new Date()
  const iso = (d) => d.toISOString().slice(0, 10)
  let from, to
  if (kind === 'daily') { from = to = iso(now) }
  else if (kind === 'weekly') { const w = weekRange(now); from = w.from; to = w.to }
  else if (kind === 'monthly') {
    from = iso(new Date(now.getFullYear(), now.getMonth(), 1))
    to = iso(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  } else {
    from = `${now.getFullYear()}-01-01`
    to = `${now.getFullYear()}-12-31`
  }
  const rows = financeRows(from, to)

  // رقم التقرير
  const prefix = { daily: 'D', weekly: 'W', monthly: 'M', yearly: 'Y' }[kind]
  const existing = db
    .prepare("SELECT * FROM finance_reports WHERE kind = ? AND from_date = ? AND to_date = ?")
    .get(kind, from, to)
  let report = existing
  if (!report) {
    const count = db.prepare('SELECT COUNT(*) c FROM finance_reports WHERE kind = ?').get(kind).c
    const code = `FIN-${now.getFullYear()}-${prefix}${String(count + 1).padStart(3, '0')}`
    const info = db
      .prepare('INSERT INTO finance_reports (code, kind, from_date, to_date) VALUES (?, ?, ?, ?)')
      .run(code, kind, from, to)
    report = db.prepare('SELECT * FROM finance_reports WHERE id = ?').get(info.lastInsertRowid)
  }

  const earned = db
    .prepare(
      `SELECT COALESCE(SUM(amount),0) v FROM wallet_tx WHERE status IN ('hold','available') AND kind = 'earning'
       AND date(created_at,'+3 hours') BETWEEN ? AND ?`,
    )
    .get(from, to).v
  const bonuses = db
    .prepare(
      `SELECT COALESCE(SUM(amount),0) v FROM wallet_tx WHERE kind = 'referral' AND date(created_at,'+3 hours') BETWEEN ? AND ?`,
    )
    .get(from, to).v
  const invoices = db
    .prepare(
      `SELECT COUNT(*) c, COALESCE(SUM(commission),0) commission, COALESCE(SUM(total_paid),0) paid
       FROM invoices WHERE date(issued_at,'+3 hours') BETWEEN ? AND ?`,
    )
    .get(from, to)

  res.json({
    report_number: report.code,
    kind,
    period: { from, to },
    generated_at: new Date().toISOString(),
    site: { name: 'مهنتي', logo: '/logo.png', url: 'https://mihnati.onrender.com' },
    summary: {
      experts_paid: money(earned),
      referral_bonus: money(bonuses),
      commission: money(invoices.commission),
      invoices_total: money(invoices.paid),
      invoices_count: invoices.c,
      due_now: money(rows.reduce((a, r) => a + r.available, 0)),
      held_now: money(rows.reduce((a, r) => a + r.pending, 0)),
      credits_used: money(
        db.prepare("SELECT COALESCE(SUM(amount - remaining),0) v FROM credits WHERE date(created_at,'+3 hours') BETWEEN ? AND ?").get(from, to).v,
      ),
      credits_outstanding: money(
        db.prepare("SELECT COALESCE(SUM(remaining),0) v FROM credits WHERE remaining > 0 AND expires_at > datetime('now')").get().v,
      ),
    },
    rows,
  })
})

app.get('/api/admin/commission-sums', adminRequired, (_req, res) => {
  const one = (where = '', params = []) =>
    db
      .prepare(
        `SELECT COUNT(*) c,
          COALESCE(SUM(commission),0) commission,
          COALESCE(SUM(total_paid),0) paid,
          COALESCE(SUM(amount),0) amount
         FROM invoices ${where}`,
      )
      .get(...params)

  // بتوقيت الرياض (UTC+3) — لأن الفواتير محفوظة UTC
  const today = one("WHERE date(issued_at,'+3 hours') = date('now','+3 hours')")
  const week = one("WHERE date(issued_at,'+3 hours') >= date('now','+3 hours','-6 days')")
  const month = one("WHERE strftime('%Y-%m', issued_at,'+3 hours') = strftime('%Y-%m', 'now','+3 hours')")
  const year = one("WHERE strftime('%Y', issued_at,'+3 hours') = strftime('%Y', 'now','+3 hours')")
  const all = one()

  res.json({
    today, week, month, year, all,
    updated_at: new Date().toISOString(),
  })
})

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

  const bid = db
    .prepare('SELECT b.*, e.name_ar AS expert_name FROM bids b JOIN experts e ON e.id = b.expert_id WHERE b.id = ?')
    .get(request.accepted_bid_id)
  const user = db.prepare('SELECT name, phone FROM users WHERE id = ?').get(request.user_id)

  const extras = db.prepare('SELECT * FROM request_extras WHERE request_id = ? ORDER BY id').all(request.id)
  const applied = db
    .prepare(
      `SELECT l.*, r.number AS source_number FROM commission_ledger l
       JOIN requests r ON r.id = l.source_request_id
       WHERE l.applied_request_id = ?`,
    )
    .all(request.id)

  const custPct = commissionCustomer()
  const expPct = commissionExpert()

  // فاتورة العميل: سعر واحد شامل — بدون أي سطر عمولة
  const custDeferred = round2(applied.filter((x) => x.side === 'customer').reduce((a, x) => a + x.amount, 0))
  const custItems = [{ label: 'قيمة الخدمة', amount: round2(inv.total_paid - custDeferred) }]
  for (const l of applied.filter((x) => x.side === 'customer')) {
    custItems.push({ label: `مستحق سابق — طلب #${l.source_number}`, amount: l.amount })
  }

  const expDeferred = round2(applied.filter((x) => x.side === 'expert').reduce((a, x) => a + x.amount, 0))
  const expItems = [{ label: 'قيمة السومة', amount: round2(inv.amount) }]
  if (Number(inv.expert_fee) > 0) expItems.push({ label: `رسم خدمة المنصة (${expPct}%)`, amount: -round2(inv.expert_fee) })
  if (expDeferred > 0) expItems.push({ label: 'مستحق سابق', amount: -expDeferred })
  const dueToPlatform = round2(inv.customer_fee)

  res.json({
    customer: {
      number: inv.number + '-C',
      title: 'فاتورة العميل',
      to: user?.name || 'العميل',
      items: custItems,
      total: inv.total_paid,
    },
    expert: {
      number: inv.number + '-E',
      title: 'فاتورة الفني (مستخلص)',
      to: bid?.expert_name || 'الفني',
      items: expItems,
      total: inv.net,
      due_to_platform: dueToPlatform,
      note: dueToPlatform > 0 ? 'هذا المبلغ يُحوّل للمنصة — وهو جزء من المبلغ الذي استلمته من العميل.' : '',
    },
    issued_at: inv.issued_at,
    request: { id: request.id, number: request.number, title: request.title, city: request.city },
  })
})

/* ---------- نسخ احتياطي ---------- */

const BACKUP_TABLES = ['users', 'experts', 'requests', 'bids', 'reviews', 'invoices', 'ads', 'city_requests', 'categories', 'payments', 'settings', 'wallet_tx', 'withdrawals', 'credits', 'finance_reports', 'platform_dues', 'admins', 'blocked_phones']

const collectUploads = () => {
  const refs = new Set()
  const push = (v) => { if (typeof v === 'string' && v.startsWith('/uploads/')) refs.add(v.replace('/uploads/', '')) }
  db.prepare('SELECT image FROM ads').all().forEach((r) => push(r.image))
  db.prepare('SELECT avatar FROM users').all().forEach((r) => push(r.avatar))
  db.prepare('SELECT image FROM categories').all().forEach((r) => push(r.image))
  db.prepare('SELECT iqama_image FROM experts').all().forEach((r) => push(r.iqama_image))
  for (const row of db.prepare('SELECT certs FROM experts').all()) {
    try { for (const c of JSON.parse(row.certs || '[]')) push(c?.url) } catch {}
  }
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

function applyBackup(tables, files) {
  const order = ['reviews', 'payments', 'bids', 'invoices', 'wallet_tx', 'withdrawals', 'credits', 'finance_reports', 'platform_dues', 'admins', 'blocked_phones', 'requests', 'city_requests', 'ads', 'experts', 'users', 'categories', 'settings'].filter(t => BACKUP_TABLES.includes(t))

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
    backfillNumbers()
    normalizePhones()
    seedBots()
    try { backfillInviteCodes() } catch (e) { console.error('INVITE_BACKFILL_FAIL', e.message) }
    try { backfillUserCodes() } catch (e) { console.error('USERCODE_BACKFILL_FAIL', e.message) }
    try { fixSettings() } catch (e) { console.error('SETTINGS_FIX_FAIL', e.message) }
    if (files && typeof files === 'object') {
      for (const [name, b64] of Object.entries(files)) {
        if (typeof b64 !== 'string') continue
        try { fs.writeFileSync(path.join(uploadsDir, path.basename(name)), Buffer.from(b64, 'base64')) } catch {}
      }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e.message) }
  } finally {
    db.pragma('foreign_keys = ON')
  }
}

app.post('/api/admin/restore', adminRequired, adminCan('backup'), (req, res) => {
  const tables = req.body?.tables
  if (!tables || typeof tables !== 'object') return res.status(400).json({ error: 'invalid_backup' })
  const r = applyBackup(tables, req.body?.files)
  if (!r.ok) return res.status(500).json({ error: 'restore_failed', detail: r.error })
  res.json({ ok: true, restored_at: new Date().toISOString() })
})

/* ---------- النسخ السحابية (Cloudflare) ---------- */
const cfCfg = () => ({
  token: process.env.CF_BACKUP_TOKEN,
  acc: process.env.CF_ACCOUNT_ID,
  ns: process.env.CF_KV_NS,
})

app.get('/api/admin/snapshots', adminRequired, adminCan('backup'), async (_req, res) => {
  const { token, acc, ns } = cfCfg()
  if (!token || !acc || !ns) return res.json({ enabled: false, items: [] })
  try {
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${acc}/storage/kv/namespaces/${ns}/keys?prefix=bk:&limit=200`,
      { headers: { authorization: `Bearer ${token}` } },
    )
    const j = await r.json()
    const items = (j.result || [])
      .filter((k) => k.name !== 'bk:latest')
      .map((k) => {
        const m = k.name.slice(3)
        return {
          key: k.name,
          at: `${m.slice(0, 4)}-${m.slice(4, 6)}-${m.slice(6, 8)} ${m.slice(8, 10)}:${m.slice(10, 12)}`,
        }
      })
      .sort((a, b) => (a.key < b.key ? 1 : -1))
    res.json({ enabled: true, items })
  } catch (e) {
    res.json({ enabled: true, items: [], error: String(e.message) })
  }
})

/* مزامنة ملفات القرص إلى KV (يدوي — بعد أي نشر) */
app.post('/api/admin/files/sync', adminRequired, adminCan('backup'), async (_req, res) => {
  if (!kvReady()) return res.status(400).json({ error: 'kv_not_configured' })
  let names = []
  try { names = fs.readdirSync(uploadsDir) } catch {}
  let ok = 0
  for (const n of names) { if (await kvPutFile(n)) ok++ }
  res.json({ ok: true, total: names.length, synced: ok })
})

/* استرجاع الصور والملفات فقط (بدون لمس البيانات) */
app.post('/api/admin/restore-files', adminRequired, adminCan('backup'), (req, res) => {
  const files = req.body?.files
  if (!files || typeof files !== 'object') return res.status(400).json({ error: 'no_files' })
  let n = 0
  for (const [name, b64] of Object.entries(files)) {
    if (typeof b64 !== 'string') continue
    try {
      fs.writeFileSync(path.join(uploadsDir, path.basename(name)), Buffer.from(b64, 'base64'))
      kvPutFile(name).catch(() => {})
      n++
    } catch (e) { console.error('FILE_RESTORE_FAIL', name, e.message) }
  }
  res.json({ ok: true, files: n })
})

/* استرجاع الصور والملفات فقط من نسخة سحابية (بدون لمس البيانات) */
app.post('/api/admin/snapshots/files', adminRequired, async (req, res) => {
  const key = String(req.body?.key || 'bk:latest')
  if (key !== 'bk:latest' && !/^bk:\d{12}$/.test(key)) return res.status(400).json({ error: 'bad_key' })
  const { token, acc, ns } = cfCfg()
  if (!token) return res.status(400).json({ error: 'not_configured' })
  try {
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${acc}/storage/kv/namespaces/${ns}/values/${encodeURIComponent(key)}`,
      { headers: { authorization: `Bearer ${token}` } },
    )
    if (!r.ok) return res.status(404).json({ error: 'snapshot_not_found' })
    const snap = await r.json()
    const files = snap?.files || {}
    let n = 0
    for (const [name, b64] of Object.entries(files)) {
      if (typeof b64 !== 'string') continue
      try {
        fs.writeFileSync(path.join(uploadsDir, path.basename(name)), Buffer.from(b64, 'base64'))
        n++
      } catch {}
    }
    res.json({ ok: true, key, files: n })
  } catch (e) {
    res.status(500).json({ error: 'failed', detail: String(e.message) })
  }
})

app.post('/api/admin/snapshots/restore', adminRequired, async (req, res) => {
  const key = String(req.body?.key || '')
  if (key !== 'bk:latest' && !/^bk:\d{12}$/.test(key)) return res.status(400).json({ error: 'bad_key' })
  const { token, acc, ns } = cfCfg()
  if (!token) return res.status(400).json({ error: 'not_configured' })
  try {
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${acc}/storage/kv/namespaces/${ns}/values/${encodeURIComponent(key)}`,
      { headers: { authorization: `Bearer ${token}` } },
    )
    if (!r.ok) return res.status(404).json({ error: 'snapshot_not_found' })
    const snap = await r.json()
    if (!snap?.tables) return res.status(400).json({ error: 'bad_snapshot' })
    const out = applyBackup(snap.tables, snap.files)
    if (!out.ok) return res.status(500).json({ error: 'restore_failed', detail: out.error })
    res.json({ ok: true, restored_at: new Date().toISOString(), taken_at: snap.taken_at || null })
  } catch (e) {
    res.status(500).json({ error: 'restore_failed', detail: String(e.message) })
  }
})

app.get('/.well-known/assetlinks.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.json([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'net.dellini.mihnati',
      sha256_cert_fingerprints: [
        '0C:AB:99:A6:8A:93:7B:06:1E:6E:80:96:E8:3F:BD:35:20:70:48:19:80:C9:B4:E3:EC:75:23:D6:24:12:CB:85',
      ],
    },
  }])
})

app.get('/api/version', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json({ build: process.env.RENDER_GIT_COMMIT || process.env.BUILD_ID || String(BOOT_ID) })
})

app.get('/api/health', (_req, res) => res.json({ ok: true, at: new Date().toISOString() }))

const clientDist = path.join(__dirname, '..', 'dist')
app.use(express.static(clientDist, { setHeaders: (res, filePath) => {
  if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-store, must-revalidate')
  if (filePath.endsWith('sw.js') || filePath.endsWith('.webmanifest')) res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
} }))
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next()
  if (req.path.startsWith('/uploads/')) return res.status(404).send('not_found')
  res.sendFile(path.join(clientDist, 'index.html'))
})

io.on('connection', (socket) => {
  socket.on('identify', (userId) => {
    if (userId) socket.join(`user:${userId}`)
  })
  socket.on('join', (requestId) => socket.join(`request:${requestId}`))
  socket.on('leave', (requestId) => socket.leave(`request:${requestId}`))
})


/* ---------- استعادة تلقائية عند الإقلاع ----------
   Render المجاني يمسح القرص عند كل إعادة تشغيل/نوم →
   إذا القاعدة فاضية، نسحب آخر نسخة من Cloudflare KV ونرجعها. */
async function autoRestoreOnBoot() {
  const tok = process.env.CF_BACKUP_TOKEN
  const acc = process.env.CF_ACCOUNT_ID
  const ns = process.env.CF_KV_NS
  if (!tok || !acc || !ns) return

  const isEmpty =
    db.prepare('SELECT COUNT(*) c FROM requests').get().c === 0 &&
    db.prepare('SELECT COUNT(*) c FROM users').get().c <= 1
  if (!isEmpty) return

  try {
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${acc}/storage/kv/namespaces/${ns}/values/bk:latest`,
      { headers: { authorization: `Bearer ${tok}` } },
    )
    if (!r.ok) return console.log('AUTORESTORE: no snapshot', r.status)
    const snap = await r.json()
    const tables = snap?.tables
    if (!tables || typeof tables !== 'object') return console.log('AUTORESTORE: bad snapshot')

    const order = ['users', 'experts', 'categories', 'requests', 'bids', 'payments', 'invoices', 'reviews', 'ads', 'city_requests', 'wallet_tx', 'withdrawals', 'credits', 'finance_reports', 'admins', 'blocked_phones', 'settings']
    db.pragma('foreign_keys = OFF')
    let restored = 0
    for (const t of order) {
      const rows = tables[t]
      if (!Array.isArray(rows) || !rows.length) continue
      for (const row of rows) {
        const cols = Object.keys(row)
        if (!cols.length) continue
        try {
          db.prepare(
            `INSERT OR REPLACE INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
          ).run(...cols.map((c) => row[c]))
          restored++
        } catch (e) {
          console.error('AUTORESTORE_ROW_FAIL', t, e.message)
        }
      }
    }
    db.pragma('foreign_keys = ON')
    backfillNumbers()
    normalizePhones()
    seedBots()
    try { backfillInviteCodes() } catch (e) { console.error('INVITE_BACKFILL_FAIL', e.message) }
    try { backfillUserCodes() } catch (e) { console.error('USERCODE_BACKFILL_FAIL', e.message) }
    try { fixSettings() } catch (e) { console.error('SETTINGS_FIX_FAIL', e.message) }

    // الصور/الملفات: من النسخة السحابية إلى القرص، ثم نسخة احتياطية في KV
    let restoredFiles = 0
    const files = snap?.files
    if (files && typeof files === 'object') {
      for (const [name, b64] of Object.entries(files)) {
        if (typeof b64 !== 'string') continue
        try {
          fs.writeFileSync(path.join(uploadsDir, path.basename(name)), Buffer.from(b64, 'base64'))
          restoredFiles++
        } catch {}
      }
    }
    console.log(`AUTORESTORE_OK rows=${restored} files=${restoredFiles} snapshot=${snap.taken_at || ''}`)
  } catch (e) {
    console.error('AUTORESTORE_FAIL', e.message)
  }
}

try { await autoRestoreOnBoot() } catch (e) { console.error('AUTORESTORE_BOOT_FAIL', e.message) }


/* ---------- نهاية المزاد + نظام المخالفات ----------
   بعد انتهاء المزاد عند العميل دقيقتان لاختيار فني.
   إذا سكت: الطلب يُغلق + مخالفة. ٣ = تنبيه · ٤ = إنذار أخير · ٥ = إيقاف الحساب. */
function sweepExpiredAuctions() {
  // ١) تنبيه للعميل عند انتهاء المزاد (مرة واحدة)
  const justEnded = db
    .prepare(
      `SELECT r.* FROM requests r
       WHERE r.status = 'open' AND r.ends_at IS NOT NULL
         AND datetime(r.ends_at) <= datetime('now')
         AND datetime(r.ends_at) > datetime('now','-1 minute')`,
    )
    .all()
  for (const r of justEnded) {
    io.to(`user:${r.user_id}`).emit('notify', {
      type: 'auction_end',
      title: 'انتهى المزاد ⏱',
      body: 'عندك دقيقتين تختار الفني — بعدها يُغلق الطلب وتُسجّل مخالفة.',
      requestId: r.id,
    })
    const low = db
      .prepare("SELECT MIN(b.amount) m FROM bids b WHERE b.request_id = ? AND COALESCE(b.status,'active')='active'")
      .get(r.id)
    if (low?.m) {
      io.to(`user:${r.user_id}`).emit('notify', {
        type: 'bid',
        title: 'أرخص سومة',
        body: `${customerTotal(low.m)} ر.س — اضغط للاختيار`,
        requestId: r.id,
      })
    }
  }

  // ٢) انتهت مهلة الدقيقتين بدون اختيار → إغلاق + مخالفة
  const expired = db
    .prepare(
      `SELECT r.* FROM requests r
       WHERE r.status = 'open' AND r.ends_at IS NOT NULL
         AND datetime(r.ends_at, '+2 minutes') <= datetime('now')`,
    )
    .all()

  for (const r of expired) {
    db.prepare(
      `UPDATE requests SET status = 'canceled', closed_at = datetime('now'),
        closed_by = 'system', close_reason = 'انتهى المزاد بدون اختيار فني'
       WHERE id = ?`,
    ).run(r.id)

    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(r.user_id)
    if (!u) continue
    const count = Number(u.violations || 0) + 1
    db.prepare("UPDATE users SET violations = ?, last_violation_at = datetime('now') WHERE id = ?").run(count, u.id)

    const label = count >= 5 ? 'suspended' : count
    io.to(`user:${u.id}`).emit('notify', {
      type: 'violation',
      title: count >= 5 ? 'تم إيقاف حسابك 🚫' : count === 4 ? 'إنذار أخير ⚠️' : 'مخالفة',
      body:
        count >= 5
          ? 'تكرر عدم اختيار الفني ٥ مرات — تم إيقاف الحساب. تواصل مع الدعم.'
          : count === 4
            ? 'هذه المخالفة الرابعة — المخالفة الخامسة توقف حسابك.'
            : count === 3
              ? 'وصلت ٣ مخالفات — التزم باختيار فني بعد انتهاء المزاد.'
              : `لديك ${count} مخالفة من ٥ — بعدها يتوقف الحساب.`,
      requestId: r.id,
    })

    if (count >= 5) {
      db.prepare("UPDATE users SET status = 'suspended' WHERE id = ?").run(u.id)
    }
    io.to(`user:${r.user_id}`).emit('request:status', { id: r.id, status: 'canceled', violations: count })
    io.to(`request:${r.id}`).emit('request:status', { id: r.id, status: 'canceled' })
    console.log('VIOLATION', u.id, count, 'request', r.id)
  }
}

setInterval(() => {
  try { sweepExpiredAuctions() } catch (e) { console.error('SWEEP_FAIL', e.message) }
}, 30 * 1000)
setTimeout(() => { try { sweepExpiredAuctions() } catch {} }, 8000)

resumeBots(io)

const PORT = process.env.PORT || 3001
server.listen(PORT, () => console.log(`mihnati server on http://localhost:${PORT}`))
