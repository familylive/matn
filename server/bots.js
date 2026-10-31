import { db } from './db.js'
import { autoSettle } from './flow.js'

const timers = new Map()

/* الفنيون الوهميون (بوتات المزاد) — للتجربة فقط.
   في الإنتاج تكون مطفية إلا إذا DEMO_BOTS=1 صراحةً. */
export const demoBotsOn = () => process.env.DEMO_BOTS === '1'

const BOT_TEMPLATES = {
  AC: ['أبو خالد للتبريد', 'مؤسسة النسيم للتكييف', 'فني التكييف السريع', 'مركز البرودة'],
  Plumber: ['مؤسسة المياه الذهبية', 'سباك الرياض السريع'],
  Electrician: ['كهرباء النخبة', 'فني الكهرباء المحترف'],
  Carpenter: ['نجارة الإتقان', 'ورشة الخشب الحديثة'],
  Painter: ['دهانات الضياء', 'لمسات الألوان'],
  Mechanic: ['ورشة الطريق السريع', 'ميكانيكي متنقل'],
}

const BOTS = [
  { name: 'أبو خالد للتبريد', name_ar: 'أبو خالد للتبريد', lat: 24.7460, lng: 46.6520, note: 'متوفر اليوم — فحص مجاني' },
  { name: 'مؤسسة النسيم للتكييف', name_ar: 'مؤسسة النسيم للتكييف', lat: 24.6900, lng: 46.7100, note: 'ضمان ٣ أشهر على الإصلاح' },
  { name: 'فني التكييف السريع', name_ar: 'فني التكييف السريع', lat: 24.7800, lng: 46.6300, note: 'أوصل خلال ساعتين' },
  { name: 'مركز البرودة', name_ar: 'مركز البرودة', lat: 24.6600, lng: 46.7000, note: 'شغل نظيف وقطع أصلية' },
]

export function seedBots() {
  if (!demoBotsOn()) return
  try { markBotCars() } catch {}
  const insert = db.prepare(
    `INSERT INTO experts (name, name_ar, job, city, rate, rating, reviews_count, image, phone, skills, experience, lat, lng, is_bot, has_car)
     VALUES (?, ?, ?, 'الرياض', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
  )
  // بوتات التكييف الأساسية (بإحداثيات محددة)
  for (const b of BOTS) {
    const exists = db.prepare("SELECT id FROM experts WHERE name = ? AND job = 'AC' AND is_bot = 1").get(b.name)
    if (exists) continue
    insert.run(b.name, b.name_ar, 'AC', '170 ريال/ساعة', 4.6 + Math.random() * 0.3,
      40 + Math.floor(Math.random() * 90), '/experts/ac.jpg',
      '+966 55 000 0' + Math.floor(100 + Math.random() * 899),
      JSON.stringify(['تركيب', 'صيانة', 'إصلاح']), '6 سنوات', b.lat, b.lng,
      // أول بوتين يملكان سيارة (وصول أسرع)
      BOTS.indexOf(b) < 2 ? 1 : 0)
  }
  // بوتات بقية الأقسام
  for (const [job, names] of Object.entries(BOT_TEMPLATES)) {
    if (job === 'AC') continue
    for (let i = 0; i < names.length; i++) {
      const name = names[i]
      const exists = db.prepare('SELECT id FROM experts WHERE name = ? AND is_bot = 1').get(name)
      if (exists) continue
      insert.run(
        name, name, job, '150 ريال/ساعة',
        4.4 + Math.random() * 0.4, 20 + Math.floor(Math.random() * 80),
        '/experts/ac.jpg', '+966 55 000 1' + Math.floor(100 + Math.random() * 899),
        JSON.stringify(['خدمة سريعة', 'ضمان']), '5 سنوات',
        24.7136 + (Math.random() - 0.5) * 0.12, 46.6753 + (Math.random() - 0.5) * 0.12,
        i === 0 ? 1 : 0,
      )
    }
  }
}

// تأكيد ملكية السيارة لبوت داخل* (لبوتات موجودة مسبقاً)
export function markBotCars() {
  const names = [BOTS[0].name, BOTS[1].name, ...Object.entries(BOT_TEMPLATES).filter(([j]) => j !== 'AC').map(([, n]) => n[0])]
  const st = db.prepare(`UPDATE experts SET has_car = 1 WHERE is_bot = 1 AND name = ?`)
  for (const n of names) st.run(n)
}

// أصحاب السيارات يُرشّحون أولاً (وصول أسرع للعميل)
const botsForRequest = (category) =>
  db.prepare('SELECT * FROM experts WHERE job = ? AND is_bot = 1 ORDER BY has_car DESC, rating DESC').all(category)

// السعر المرجعي: الخدمة الفرعية أولاً (لأن الأسعار تختلف من خدمة لخدمة)
function basePrice(request) {
  try {
    // 1) الخدمة الفرعية المختارة
    if (request.subcategory) {
      const sub = db
        .prepare('SELECT min_price FROM categories WHERE (ar = ? OR key = ?) AND parent_id IS NOT NULL')
        .get(request.subcategory, request.subcategory)
      if (sub && Number(sub.min_price) > 0) return Number(sub.min_price)
    }
    // 2) القسم الرئيسي
    const row = db
      .prepare(
        `SELECT c.min_price AS own, p.min_price AS parent
         FROM categories c LEFT JOIN categories p ON p.id = c.parent_id
         WHERE c.key = ?`,
      )
      .get(request.category)
    const base = Number(row?.own || row?.parent || 0)
    if (base > 0) return base
  } catch {}
  return 250
}

// أرضية المزاد للبوتات فقط (ما تمنع الفنيين) — ٥٠٪ من المرجع
function floorPrice(request) {
  return Math.max(30, Math.round(basePrice(request) * 0.5))
}

function placeBotBid(io, request, bot, amount, note) {
  const info = db
    .prepare('INSERT INTO bids (request_id, expert_id, amount, note) VALUES (?, ?, ?, ?)')
    .run(request.id, bot.id, amount, note)
  const bid = db
    .prepare(
      `SELECT b.*, e.name AS expert_name, e.name_ar AS expert_name_ar, e.job AS expert_job,
        e.rating AS expert_rating, e.image AS expert_image, e.lat AS lat, e.lng AS lng
       FROM bids b JOIN experts e ON e.id = b.expert_id WHERE b.id = ?`,
    )
    .get(info.lastInsertRowid)
  // سري: للعميل فقط
  io.to(`user:${request.user_id}`).emit('bid:new', bid)
  return bid
}

function tick(io, requestId) {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId)
  if (!request || request.status !== 'open') return stop(requestId)
  const demo = db.prepare("SELECT value FROM settings WHERE key = 'demo_auto_accept'").get()?.value === '1'

  const endMs = request.ends_at ? new Date(request.ends_at.replace(' ', 'T') + 'Z').getTime() : null
  if (endMs && endMs < Date.now()) return stop(requestId)

  const bids = db.prepare('SELECT * FROM bids WHERE request_id = ? ORDER BY amount ASC').all(requestId)
  const botIds = new Set(bids.map((b) => b.expert_id))
  const bots = botsForRequest(request.category)
  if (!bots.length) return stop(requestId)
  const floor = floorPrice(request)
  const lowest = bids[0]?.amount

  if (lowest !== undefined && lowest <= floor) {
    stop(requestId)
    if (demo) autoSettle(io, requestId)
    return
  }

  const candidate = bots.find((b) => !botIds.has(b.id))
  if (candidate) {
    const amount =
      lowest === undefined
        ? Math.max(floor, Math.round(basePrice(request)))
        : Math.max(floor, lowest - (5 + Math.floor(Math.random() * 11)))
    if (amount >= floor) placeBotBid(io, request, candidate, amount, BOTS.find((x) => x.name === candidate.name)?.note)
    return
  }

  const anyBot = bots[Math.floor(Math.random() * bots.length)]
  if (anyBot && lowest > floor) {
    const amount = Math.max(floor, lowest - (5 + Math.floor(Math.random() * 11)))
    if (amount < lowest) placeBotBid(io, request, anyBot, amount, 'نفس السعر مع ضمان')
  }
}

export function onNewRequest(io, request) {
  if (!demoBotsOn()) return
  if (timers.has(request.id)) return
  let n = 0
  const demoOn = () => db.prepare("SELECT value FROM settings WHERE key = 'demo_auto_accept'").get()?.value === '1'
  const timer = setInterval(() => {
    n += 1
    if (n > 14) {
      stop(request.id)
      if (demoOn()) autoSettle(io, request.id)
      return
    }
    tick(io, request.id)
  }, 6000 + Math.random() * 3000)
  timers.set(request.id, timer)
  setTimeout(() => tick(io, request.id), 2500)
}

function stop(requestId) {
  const t = timers.get(requestId)
  if (t) clearInterval(t)
  timers.delete(requestId)
}

export function resumeBots(io) {
  if (!demoBotsOn()) return
  const open = db.prepare("SELECT * FROM requests WHERE status = 'open'").all()
  for (const r of open) onNewRequest(io, r)
  console.log(`bots resumed on ${open.length} open AC request(s)`)
}
