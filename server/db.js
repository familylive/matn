import Database from 'better-sqlite3'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.DATA_DIR || __dirname
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
const dbPath = process.env.DB_PATH || path.join(dataDir, 'mihnati.db')

export const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE NOT NULL,
  name TEXT,
  city TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS otps (
  phone TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS experts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_ar TEXT,
  job TEXT NOT NULL,
  city TEXT,
  rate TEXT,
  rating REAL DEFAULT 0,
  reviews_count INTEGER DEFAULT 0,
  image TEXT,
  phone TEXT,
  lat REAL,
  lng REAL,
  skills TEXT,
  experience TEXT,
  verified INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  city TEXT,
  budget REAL,
  status TEXT NOT NULL DEFAULT 'open',
  accepted_bid_id INTEGER,
  lat REAL,
  lng REAL,
  ends_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  expert_id INTEGER NOT NULL REFERENCES experts(id),
  amount REAL NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES requests(id),
  expert_id INTEGER NOT NULL REFERENCES experts(id),
  rating INTEGER NOT NULL,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  image TEXT,
  link TEXT,
  price REAL,
  duration_days INTEGER DEFAULT 30,
  starts_at TEXT NOT NULL DEFAULT (datetime('now')),
  ends_at TEXT,
  featured INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  views INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS city_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city TEXT NOT NULL,
  phone TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT UNIQUE NOT NULL,
  request_id INTEGER NOT NULL REFERENCES requests(id),
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued',
  issued_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  ar TEXT NOT NULL,
  en TEXT,
  icon TEXT,
  active INTEGER DEFAULT 1,
  sort INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS request_extras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  method TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS commission_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  expert_id INTEGER,
  source_request_id INTEGER NOT NULL,
  side TEXT NOT NULL,
  amount REAL NOT NULL,
  applied_request_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES requests(id),
  method TEXT NOT NULL,
  amount REAL NOT NULL,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'paid',
  ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_bids_request ON bids(request_id);

CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
`)

/* ترقية قواعد البيانات القديمة */
function addColumn(table, col, type) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`)
}
addColumn('experts', 'lat', 'REAL')
addColumn('experts', 'lng', 'REAL')
addColumn('requests', 'lat', 'REAL')
addColumn('requests', 'lng', 'REAL')
addColumn('requests', 'ends_at', 'TEXT')
addColumn('experts', 'is_bot', 'INTEGER DEFAULT 0')
addColumn('users', 'role', "TEXT DEFAULT 'customer'")
addColumn('users', 'email', 'TEXT')
addColumn('users', 'nationality', 'TEXT')
addColumn('users', 'specialty', 'TEXT')
addColumn('users', 'lat', 'REAL')
addColumn('users', 'lng', 'REAL')
addColumn('users', 'last_seen', 'TEXT')
addColumn('users', 'avatar', 'TEXT')
addColumn('users', 'sound_on', 'INTEGER DEFAULT 1')
addColumn('experts', 'user_id', 'INTEGER')
addColumn('experts', 'iqama_number', 'TEXT')
addColumn('experts', 'iqama_name', 'TEXT')
addColumn('experts', 'iqama_issue', 'TEXT')
addColumn('experts', 'iqama_expiry', 'TEXT')
addColumn('experts', 'nationality', 'TEXT')
addColumn('experts', 'profession', 'TEXT')
addColumn('experts', 'iqama_image', 'TEXT')
addColumn('experts', 'verify_status', "TEXT DEFAULT 'approved'")
addColumn('experts', 'verify_note', 'TEXT')
addColumn('categories', 'image', 'TEXT')
addColumn('categories', 'parent_id', 'INTEGER')
addColumn('requests', 'subcategory', 'TEXT')
addColumn('requests', 'warranty_days', 'INTEGER')
addColumn('requests', 'completed_at', 'TEXT')
addColumn('requests', 'warranty_until', 'TEXT')
addColumn('requests', 'closed_at', 'TEXT')
addColumn('requests', 'close_reason', 'TEXT')
addColumn('requests', 'closed_by', 'TEXT')
addColumn('requests', 'number', 'INTEGER')
addColumn('invoices', 'extras_total', 'REAL DEFAULT 0')
addColumn('invoices', 'deferred_customer', 'REAL DEFAULT 0')
addColumn('invoices', 'deferred_expert', 'REAL DEFAULT 0')
addColumn('request_extras', 'status', "TEXT DEFAULT 'pending'")
addColumn('request_extras', 'method', 'TEXT')
addColumn('request_extras', 'paid_at', 'TEXT')
addColumn('payments', 'kind', "TEXT DEFAULT 'service'")
addColumn('users', 'username', 'TEXT')
addColumn('users', 'password_hash', 'TEXT')
addColumn('users', 'status', "TEXT DEFAULT 'active'")
addColumn('invoices', 'commission', 'REAL DEFAULT 0')
addColumn('invoices', 'net', 'REAL DEFAULT 0')
addColumn('invoices', 'customer_fee', 'REAL DEFAULT 0')
addColumn('invoices', 'expert_fee', 'REAL DEFAULT 0')
addColumn('invoices', 'total_paid', 'REAL DEFAULT 0')
addColumn('admins', 'status', "TEXT DEFAULT 'active'")
addColumn('admins', 'name', 'TEXT')

export default db
