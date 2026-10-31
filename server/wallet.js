import { db } from './db.js'

/* ---------------- جداول المحفظة والدعوات ---------------- */
db.exec(`
CREATE TABLE IF NOT EXISTS wallet_tx (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expert_id INTEGER NOT NULL,
  kind TEXT NOT NULL,              -- earning | referral | adjust
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'hold',   -- hold | available
  ref TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  available_at TEXT
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expert_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested', -- requested | paid | rejected
  iban TEXT,
  account_name TEXT,
  ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at TEXT
);

CREATE TABLE IF NOT EXISTS credits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  remaining REAL NOT NULL,
  source TEXT,
  note TEXT,
  ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_dues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expert_id INTEGER NOT NULL,
  invoice_id INTEGER,
  request_id INTEGER,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'due',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  settled_at TEXT
);

CREATE TABLE IF NOT EXISTS finance_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL,
  from_date TEXT,
  to_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`)

// عمود إشعار انتهاء الرصيد (بعد إنشاء الجداول مباشرة)
try {
  const cols = db.prepare('PRAGMA table_info(credits)').all().map((c) => c.name)
  if (!cols.includes('expiry_notified')) db.exec('ALTER TABLE credits ADD COLUMN expiry_notified INTEGER DEFAULT 0')
} catch (e) { console.error('CREDITS_ALTER_FAIL', e.message) }

const setting = (k, d) => db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value ?? d
const setSetting = (k, v) =>
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v))

export const HOLD_DAYS = () => Number(setting('wallet_hold_days', 7))
/* سعر النقطة + نقاط كل طرف (قابلة للتعديل من اللوحة) */
export const POINT_VALUE = () => {
  const v = Number(setting('loyalty_point_value', 1))
  return v > 0 ? v : 1
}
export const CUSTOMER_POINTS = () => Number(setting('loyalty_customer_points', setting('loyalty_bonus', 50)))
export const EXPERT_POINTS = () => Number(setting('loyalty_expert_points', setting('referral_bonus', 50)))
export const REF_BONUS = () => money(EXPERT_POINTS() * POINT_VALUE())
export const REF_TARGET = () => Math.max(1, Number(setting('loyalty_expert_target', setting('referral_target', 20))) || 20)

for (const [k, v] of [
  ['wallet_hold_days', 7],
  ['referral_bonus', 50],
  ['referral_target', 20],
  ['loyalty_target', 30],
  ['loyalty_bonus', 50],
  ['credit_valid_days', 365],
]) {
  if (setting(k, null) == null) setSetting(k, v)
}
// ترقية هدف الفنيين من 10 إلى 20 (طلب عبدالله 2026-10-30)
export function fixSettings() {
  if (Number(setting('referral_target', 20)) === 10) setSetting('referral_target', 20)
  for (const [k, v] of [
    ['loyalty_target', 30], ['loyalty_bonus', 50], ['credit_valid_days', 365],
    ['loyalty_point_value', 1], ['loyalty_customer_target', 30], ['loyalty_customer_points', 50],
    ['loyalty_expert_target', 20], ['loyalty_expert_points', 50],
  ]) {
    if (setting(k, null) == null) setSetting(k, v)
  }
}
fixSettings()

export const LOYALTY_TARGET = () => Math.max(1, Number(setting('loyalty_customer_target', setting('loyalty_target', 30))) || 30)
export const REQUIRE_REAL_ORDER = () => setting('loyalty_require_order', '1') === '1'
export const LOYALTY_BONUS = () => money(CUSTOMER_POINTS() * POINT_VALUE())
export const CREDIT_DAYS = () => Number(setting('credit_valid_days', 365))

/* ---------------- أكواد الدعوة ---------------- */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const rand = (n) => Array.from({ length: n }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('')

export function ensureInviteCode(expertId) {
  const e = db.prepare('SELECT id, invite_code FROM experts WHERE id = ?').get(expertId)
  if (!e) return null
  if (e.invite_code) return e.invite_code
  let code = null
  for (let i = 0; i < 20; i++) {
    const c = `MH-${String(expertId).padStart(3, '0')}${rand(4)}`
    if (!db.prepare('SELECT 1 FROM experts WHERE invite_code = ?').get(c)) { code = c; break }
  }
  if (!code) code = `MH-${expertId}-${Date.now().toString(36).toUpperCase()}`
  db.prepare('UPDATE experts SET invite_code = ? WHERE id = ?').run(code, expertId)
  return code
}

export function backfillInviteCodes() {
  const rows = db.prepare('SELECT id FROM experts WHERE invite_code IS NULL').all()
  for (const r of rows) ensureInviteCode(r.id)
  if (rows.length) console.log('invite codes backfilled:', rows.length)
}

export const expertByCode = (code) =>
  code ? db.prepare('SELECT * FROM experts WHERE invite_code = ?').get(String(code).trim().toUpperCase()) : null

/* ---------------- الرصيد ---------------- */
export function walletSummary(expertId) {
  const sum = (status) =>
    db.prepare('SELECT COALESCE(SUM(amount),0) v FROM wallet_tx WHERE expert_id = ? AND status = ?').get(expertId, status).v
  const withdrawals = db
    .prepare("SELECT COALESCE(SUM(amount),0) v FROM withdrawals WHERE expert_id = ? AND status IN ('requested','paid')")
    .get(expertId).v
  const paid = db
    .prepare("SELECT COALESCE(SUM(amount),0) v FROM withdrawals WHERE expert_id = ? AND status = 'paid'")
    .get(expertId).v
  const pending = Number(sum('hold')) || 0
  const availableRaw = Number(sum('available')) || 0
  const due = duePlatformOf(expertId)
  return {
    due_platform: due,
    available: Math.max(0, Math.round((availableRaw - Number(withdrawals || 0) - due) * 100) / 100),
    pending: Math.round(pending * 100) / 100,
    paid: Math.round(Number(paid || 0) * 100) / 100,
    hold_days: HOLD_DAYS(),
  }
}

export function listTx(expertId, limit = 50) {
  return db
    .prepare(
      `SELECT id, kind, amount, status, ref, note, created_at, available_at
       FROM wallet_tx WHERE expert_id = ? ORDER BY id DESC LIMIT ?`,
    )
    .all(expertId, limit)
}

/** يضيف مبلغ معلّق (محجوز عند الموقع) لمدة HOLD_DAYS ثم يصبح متاحاً */
export function creditHold({ expertId, amount, ref, note }) {
  const amt = Math.round(Number(amount) * 100) / 100
  if (!expertId || !(amt > 0)) return null
  if (ref && db.prepare('SELECT 1 FROM wallet_tx WHERE expert_id = ? AND ref = ?').get(expertId, ref)) return null
  const days = HOLD_DAYS()
  return db
    .prepare(
      `INSERT INTO wallet_tx (expert_id, kind, amount, status, ref, note, available_at)
       VALUES (?, 'earning', ?, 'hold', ?, ?, datetime('now', '+' || ? || ' days'))`,
    )
    .run(expertId, amt, ref || null, note || null, days)
}

/** مبلغ متاح فوراً (مكافأة دعوة) */
export function creditAvailable({ expertId, amount, ref, note, kind = 'referral' }) {
  const amt = Math.round(Number(amount) * 100) / 100
  if (!expertId || !(amt > 0)) return null
  if (ref && db.prepare('SELECT 1 FROM wallet_tx WHERE expert_id = ? AND ref = ?').get(expertId, ref)) return null
  return db
    .prepare(
      `INSERT INTO wallet_tx (expert_id, kind, amount, status, ref, note, available_at)
       VALUES (?, ?, ?, 'available', ?, ?, datetime('now'))`,
    )
    .run(expertId, kind, amt, ref || null, note || null)
}

/** تحرير المبالغ المعلّقة بعد انتهاء مدة الحجز */
export function releaseDue() {
  const r = db
    .prepare("UPDATE wallet_tx SET status = 'available' WHERE status = 'hold' AND available_at IS NOT NULL AND available_at <= datetime('now')")
    .run()
  if (r.changes) console.log('wallet released:', r.changes)
  return r.changes
}

/* ---------------- الدعوات ---------------- */
/** الفنيون الذين سجلوا عبر كود هذا الفني */
export function invitesOf(expertId) {
  const rows = db
    .prepare(
      `SELECT u.id AS user_id, u.name, u.phone, u.created_at, u.last_seen, u.phone_verified, u.status,
              e.id AS expert_id, COALESCE(e.verify_status,'approved') AS verify_status,
              (SELECT COUNT(*) FROM bids b WHERE b.expert_id = e.id) AS bids,
              (SELECT COUNT(*) FROM bids b WHERE b.expert_id = e.id AND b.created_at >= datetime('now','-30 days')) AS bids30,
              (SELECT COUNT(*) FROM requests r2 JOIN payments p2 ON p2.request_id = r2.id
                 WHERE r2.user_id = u.id AND p2.status IN ('paid','pending_cash')) AS paid_orders
       FROM users u LEFT JOIN experts e ON e.user_id = u.id
       WHERE u.referred_by = ?
       ORDER BY u.id DESC`,
    )
    .all(expertId)
  return rows.map((r) => {
    const active = !!r.last_seen && new Date(String(r.last_seen).replace(' ', 'T') + 'Z').getTime() > Date.now() - 30 * 864e5
    return {
      ...r,
      real_orders: r.paid_orders || 0,
      qualified: !!(
        r.expert_id && r.status !== 'suspended' && r.verify_status === 'approved' &&
        ((r.bids || 0) > 0 || (r.paid_orders || 0) > 0) && active
      ),
    }
  })
}

/** يصرف مكافأة الدعوة عند وصول العدد المؤهل للهدف (مرة واحدة) */
export function checkReferralBonus(expertId) {
  const list = invitesOf(expertId)
  const qualified = list.filter((i) => i.qualified).length
  const target = REF_TARGET()
  if (qualified < target) return { qualified, target, credited: 0 }
  const tx = creditAvailable({
    expertId,
    amount: REF_BONUS(),
    ref: `referral-${expertId}`,
    note: `مكافأة دعوة: ${qualified} فني نشط سجّل بكودك`,
  })
  return { qualified, target, credited: tx ? REF_BONUS() : 0 }
}

/* ---------------- عمولة المنصة على الفني (يحصّلها كاش من العميل) ---------------- */
export function addPlatformDue({ expertId, amount, invoiceId, requestId }) {
  const amt = money(amount)
  if (!expertId || !(amt > 0)) return null
  if (invoiceId && db.prepare('SELECT 1 FROM platform_dues WHERE invoice_id = ?').get(invoiceId)) return null
  return db
    .prepare('INSERT INTO platform_dues (expert_id, invoice_id, request_id, amount) VALUES (?, ?, ?, ?)')
    .run(expertId, invoiceId || null, requestId || null, amt)
}

export function duePlatformOf(expertId) {
  return money(
    db.prepare("SELECT COALESCE(SUM(amount),0) v FROM platform_dues WHERE expert_id = ? AND status = 'due'").get(expertId).v,
  )
}

/* ---------------- السحب ---------------- */
export function requestWithdrawal({ expertId, amount, iban, accountName }) {
  const s = walletSummary(expertId)
  const amt = Math.round(Number(amount) * 100) / 100
  if (!(amt > 0)) return { error: 'invalid_amount' }
  if (amt > s.available + 0.001) return { error: 'insufficient' }
  const info = db
    .prepare("INSERT INTO withdrawals (expert_id, amount, status, iban, account_name) VALUES (?, ?, 'requested', ?, ?)")
    .run(expertId, amt, iban || null, accountName || null)
  return { ok: true, id: info.lastInsertRowid, amount: amt }
}

/* ---------------- أسبوع السبت → الجمعة ---------------- */
/** يرجع بداية ونهاية الأسبوع (السبت 00:00 → الجمعة 23:59:59) بصيغة YYYY-MM-DD */
export function weekRange(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay() // 0=الأحد … 6=السبت
  const daysSinceSat = (day + 1) % 7
  const start = new Date(d)
  start.setDate(d.getDate() - daysSinceSat)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const fmt = (x) => x.toISOString().slice(0, 10)
  return { from: fmt(start), to: fmt(end) }
}

export const money = (n) => Math.round(Number(n || 0) * 100) / 100

/* ================= نادي الولاء (رصيد العملاء) ================= */
export function ensureUserCode(userId) {
  const u = db.prepare('SELECT id, invite_code FROM users WHERE id = ?').get(userId)
  if (!u) return null
  if (u.invite_code) return u.invite_code
  let code = null
  for (let i = 0; i < 20; i++) {
    const c = `CL-${String(userId).padStart(4, '0')}${rand(4)}`
    if (!db.prepare('SELECT 1 FROM users WHERE invite_code = ?').get(c)) { code = c; break }
  }
  if (!code) code = `CL-${userId}-${Date.now().toString(36).toUpperCase()}`
  db.prepare('UPDATE users SET invite_code = ? WHERE id = ?').run(code, userId)
  return code
}

export function backfillUserCodes() {
  const rows = db.prepare('SELECT id FROM users WHERE invite_code IS NULL').all()
  for (const r of rows) ensureUserCode(r.id)
  if (rows.length) console.log('user codes backfilled:', rows.length)
}

export const userByCode = (code) =>
  code ? db.prepare('SELECT * FROM users WHERE invite_code = ?').get(String(code).trim().toUpperCase()) : null

export const inviterUserOf = (code) => {
  const e = expertByCode(code)
  if (e?.user_id) return db.prepare('SELECT * FROM users WHERE id = ?').get(e.user_id)
  return userByCode(code)
}

/** يُصفّر أرصدة نادي الولاء المنتهية (سنة من تاريخ الكسب) */
export function expireCredits() {
  const r = db
    .prepare("UPDATE credits SET remaining = 0 WHERE remaining > 0 AND expires_at <= datetime('now')")
    .run()
  if (r.changes) console.log('credits expired:', r.changes)
  return r.changes
}

export function creditBalance(userId) {
  expireCredits()
  const row = db
    .prepare('SELECT COALESCE(SUM(remaining),0) v FROM credits WHERE user_id = ? AND remaining > 0 AND expires_at > datetime(\'now\')')
    .get(userId)
  return money(row.v)
}

export function listCredits(userId) {
  expireCredits()
  return db
    .prepare('SELECT id, amount, remaining, source, note, created_at, expires_at FROM credits WHERE user_id = ? ORDER BY expires_at ASC, id ASC LIMIT 40')
    .all(userId)
}

export function grantCredit({ userId, amount, source, note, ref }) {
  const amt = money(amount)
  if (!userId || !(amt > 0)) return null
  if (ref && db.prepare('SELECT 1 FROM credits WHERE user_id = ? AND ref = ?').get(userId, ref)) return null
  const days = CREDIT_DAYS()
  return db
    .prepare(
      `INSERT INTO credits (user_id, amount, remaining, source, note, ref, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+' || ? || ' days'))`,
    )
    .run(userId, amt, amt, source || 'loyalty', note || null, ref || null, days)
}

/** خصم رصيد الولاء عند دفع طلب — الأقدم انتهاءً أولاً (FIFO) */
export function spendCredit(userId, maxAmount) {
  expireCredits()
  let need = money(maxAmount)
  if (!(need > 0)) return { used: 0 }
  const rows = db
    .prepare("SELECT * FROM credits WHERE user_id = ? AND remaining > 0 AND expires_at > datetime('now') ORDER BY expires_at ASC, id ASC")
    .all(userId)
  let used = 0
  const upd = db.prepare('UPDATE credits SET remaining = ? WHERE id = ?')
  for (const r of rows) {
    if (need <= 0) break
    const take = Math.min(Number(r.remaining), need)
    upd.run(money(Number(r.remaining) - take), r.id)
    used = money(used + take)
    need = money(need - take)
  }
  return { used }
}

/** من دعاهم العميل + هل هم مؤهلون (نشِطون فعلاً) */
export function clientInvites(inviterUserId) {
  const rows = db
    .prepare(
      `SELECT u.id, u.name, u.phone, u.created_at, u.last_seen, u.role, u.status, u.phone_verified,
              (SELECT COUNT(*) FROM requests r WHERE r.user_id = u.id) AS orders,
              (SELECT COUNT(*) FROM requests r2 JOIN payments p ON p.request_id = r2.id
                 WHERE r2.user_id = u.id AND p.status IN ('paid','pending_cash')) AS paid_orders,
              (SELECT COUNT(*) FROM bids b JOIN experts e2 ON e2.id = b.expert_id WHERE e2.user_id = u.id) AS bids
       FROM users u WHERE u.referred_by = ? ORDER BY u.id DESC`,
    )
    .all(inviterUserId)
  const active = (last) =>
    !!last && new Date(String(last).replace(' ', 'T') + 'Z').getTime() > Date.now() - 30 * 864e5
  return rows.map((r) => ({
    ...r,
    real_orders: r.paid_orders || 0,
    // ✅ لا يُحتسب إلا بعد طلب حقيقي (مدفوع) — الأرقام الوهمية والمجرد تسجيل لا تُحسب
    qualified: r.status !== 'suspended' && (r.paid_orders > 0 || r.bids > 0) && active(r.last_seen),
  }))
}

/** يصرف مكافأة نادي الولاء عند وصول العدد المطلوب (مرة واحدة) */
export function checkLoyaltyBonus(inviterUserId) {
  const list = clientInvites(inviterUserId)
  const qualified = list.filter((i) => i.qualified).length
  const target = LOYALTY_TARGET()
  if (qualified < target) return { qualified, target, credited: 0 }
  const tx = grantCredit({
    userId: inviterUserId,
    amount: LOYALTY_BONUS(),
    source: 'loyalty',
    ref: `loyalty-${inviterUserId}`,
    note: `مكافأة نادي الولاء: ${qualified} عضو نشط سجّل بكودك`,
  })
  return { qualified, target, credited: tx ? LOYALTY_BONUS() : 0 }
}
