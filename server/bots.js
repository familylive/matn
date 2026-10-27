import { db } from './db.js'

const timers = new Map()

const BOTS = [
  { name: 'أبو خالد للتبريد', name_ar: 'أبو خالد للتبريد', lat: 24.7460, lng: 46.6520, note: 'متوفر اليوم — فحص مجاني' },
  { name: 'مؤسسة النسيم للتكييف', name_ar: 'مؤسسة النسيم للتكييف', lat: 24.6900, lng: 46.7100, note: 'ضمان ٣ أشهر على الإصلاح' },
  { name: 'فني التكييف السريع', name_ar: 'فني التكييف السريع', lat: 24.7800, lng: 46.6300, note: 'أوصل خلال ساعتين' },
  { name: 'مركز البرودة', name_ar: 'مركز البرودة', lat: 24.6600, lng: 46.7000, note: 'شغل نظيف وقطع أصلية' },
]

export function seedBots() {
  const insert = db.prepare(
    `INSERT INTO experts (name, name_ar, job, city, rate, rating, reviews_count, image, phone, skills, experience, lat, lng, is_bot)
     VALUES (?, ?, 'AC', 'الرياض', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
  )
  for (const b of BOTS) {
    const exists = db.prepare("SELECT id FROM experts WHERE name = ? AND job = 'AC' AND is_bot = 1").get(b.name)
    if (exists) continue
    insert.run(
      b.name,
      b.name_ar,
      '170 ريال/ساعة',
      4.6 + Math.random() * 0.3,
      40 + Math.floor(Math.random() * 90),
      '/experts/ac.jpg',
      '+966 55 000 0' + Math.floor(100 + Math.random() * 899),
      JSON.stringify(['تركيب مكيف', 'صيانة', 'تعبئة غاز', 'تنظيف']),
      '6 سنوات',
      b.lat,
      b.lng,
    )
  }
}

const botsForRequest = () => db.prepare("SELECT * FROM experts WHERE job = 'AC' AND is_bot = 1").all()

function floorPrice(request) {
  if (request.budget && request.budget > 0) return Math.max(60, Math.round(request.budget * 0.55))
  return 90
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
  io.to(`request:${request.id}`).emit('bid:new', bid)
  return bid
}

function tick(io, requestId) {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId)
  if (!request || request.status !== 'open') return stop(requestId)

  const endMs = request.ends_at ? new Date(request.ends_at.replace(' ', 'T') + 'Z').getTime() : null
  if (endMs && endMs < Date.now()) return stop(requestId)

  const bids = db.prepare('SELECT * FROM bids WHERE request_id = ? ORDER BY amount ASC').all(requestId)
  const botIds = new Set(bids.map((b) => b.expert_id))
  const bots = botsForRequest()
  const floor = floorPrice(request)
  const lowest = bids[0]?.amount

  if (lowest !== undefined && lowest <= floor) return stop(requestId)

  const candidate = bots.find((b) => !botIds.has(b.id))
  if (candidate) {
    const amount =
      lowest === undefined
        ? Math.max(floor, Math.round((request.budget || 260) * 0.92))
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
  if (request.category !== 'AC') return
  if (timers.has(request.id)) return
  let n = 0
  const timer = setInterval(() => {
    n += 1
    if (n > 14) return stop(request.id)
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
  const open = db
    .prepare("SELECT * FROM requests WHERE status = 'open' AND category = 'AC'")
    .all()
  for (const r of open) onNewRequest(io, r)
  console.log(`bots resumed on ${open.length} open AC request(s)`)
}
