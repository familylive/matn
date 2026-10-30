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

CREATE TABLE IF NOT EXISTS finance_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL,
  from_date TEXT,
  to_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`)

const setting = (k, d) => db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value ?? d
const setSetting = (k, v) =>
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v))

export const HOLD_DAYS = () => Number(setting('wallet_hold_days', 7))
export const REF_BONUS = () => Number(setting('referral_bonus', 50))
export const REF_TARGET = () => Number(setting('referral_target', 10))

for (const [k, v] of [['wallet_hold_days', 7], ['referral_bonus', 50], ['referral_target', 10]]) {
  if (setting(k, null) == null) setSetting(k, v)
}

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
  return {
    available: Math.max(0, Math.round((availableRaw - Number(withdrawals || 0)) * 100) / 100),
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
      `SELECT u.id AS user_id, u.name, u.phone, u.created_at, u.last_seen,
              e.id AS expert_id, COALESCE(e.verify_status,'approved') AS verify_status,
              (SELECT COUNT(*) FROM bids b WHERE b.expert_id = e.id) AS bids,
              (SELECT COUNT(*) FROM bids b WHERE b.expert_id = e.id AND b.created_at >= datetime('now','-7 days')) AS bids7
       FROM users u LEFT JOIN experts e ON e.user_id = u.id
       WHERE u.referred_by = ?
       ORDER BY u.id DESC`,
    )
    .all(expertId)
  return rows.map((r) => ({
    ...r,
    qualified: !!(r.expert_id && 'approved' === r.verify_status && r.bids > 0 && r.last_seen &&
      new Date(r.last_seen.replace(' ', 'T') + 'Z').getTime() > Date.now() - 7 * 864e5),
  }))
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
