import { db } from './db.js'

export const getSetting = (k, d) =>
  db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value ?? d

export const round2 = (n) => Math.round(n * 100) / 100

export function issueInvoice(requestId) {
  const existing = db.prepare('SELECT * FROM invoices WHERE request_id = ?').get(requestId)
  if (existing) return existing
  const bid = db
    .prepare('SELECT * FROM bids WHERE id = (SELECT accepted_bid_id FROM requests WHERE id = ?)')
    .get(requestId)
  if (!bid) return null

  const year = new Date().getFullYear()
  const count = db.prepare("SELECT COUNT(*) c FROM invoices WHERE number LIKE ?").get(`MIH-${year}-%`).c
  const number = `MIH-${year}-${String(count + 1).padStart(4, '0')}`

  const custPct = Number(getSetting('commission_customer', 7.5))
  const expPct = Number(getSetting('commission_expert', 7.5))
  const customerFee = round2((bid.amount * custPct) / 100)
  const expertFee = round2((bid.amount * expPct) / 100)
  const totalPaid = round2(bid.amount + customerFee)
  const net = round2(bid.amount - expertFee)
  const commission = round2(customerFee + expertFee)

  db.prepare(
    `INSERT INTO invoices (number, request_id, amount, commission, net, customer_fee, expert_fee, total_paid)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(number, requestId, bid.amount, commission, net, customerFee, expertFee, totalPaid)

  return db.prepare('SELECT * FROM invoices WHERE number = ?').get(number)
}

// وضع العرض: قبول أقل سومة + دفع بالبطاقة + إكمال + إصدار الفواتير
export function autoSettle(io, requestId) {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId)
  if (!request || request.status !== 'open') return null
  const bid = db.prepare('SELECT * FROM bids WHERE request_id = ? ORDER BY amount ASC LIMIT 1').get(requestId)
  if (!bid) return null

  db.prepare("UPDATE requests SET status = 'assigned', accepted_bid_id = ? WHERE id = ?").run(bid.id, request.id)

  const custPct = Number(getSetting('commission_customer', 7.5))
  const total = round2(bid.amount * (1 + custPct / 100))
  db.prepare('INSERT INTO payments (request_id, method, amount, status, ref) VALUES (?, ?, ?, ?, ?)')
    .run(request.id, 'card', total, 'paid', `DEMO-${Date.now()}`)

  db.prepare("UPDATE requests SET status = 'done' WHERE id = ?").run(request.id)
  const invoice = issueInvoice(request.id)

  io.to(`request:${request.id}`).emit('request:accepted', {
    ...request,
    status: 'done',
    accepted_bid_id: bid.id,
  })
  io.to(`user:${request.user_id}`).emit('notify', {
    type: 'payment',
    title: 'تم إكمال الطلب وفاتورتك جاهزة',
    body: `فاتورة ${invoice?.number || ''} — ${invoice?.total_paid || ''} ريال`,
    requestId: request.id,
  })
  return invoice
}
