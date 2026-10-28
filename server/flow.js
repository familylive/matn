import { db } from './db.js'

export const getSetting = (k, d) =>
  db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value ?? d

export const round2 = (n) => Math.round(n * 100) / 100

export function issueInvoice(requestId) {
  const existing = db.prepare('SELECT * FROM invoices WHERE request_id = ?').get(requestId)
  if (existing) return existing

  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId)
  const bid = db
    .prepare('SELECT * FROM bids WHERE id = (SELECT accepted_bid_id FROM requests WHERE id = ?)')
    .get(requestId)
  if (!bid || !request) return null

  const extras = db.prepare('SELECT * FROM request_extras WHERE request_id = ?').all(requestId)
  const extrasTotal = extras.reduce((a, e) => a + e.amount, 0)
  const base = round2(bid.amount + extrasTotal)

  const custPct = Number(getSetting('commission_customer', 7.5))
  const expPct = Number(getSetting('commission_expert', 7.5))
  const customerFee = round2((base * custPct) / 100)
  const expertFee = round2((base * expPct) / 100)

  // عمولات أعمال إضافية مؤجلة من طلبات سابقة (نفس العميل / نفس الفني)
  const pendingCust = db
    .prepare(
      "SELECT * FROM commission_ledger WHERE side = 'customer' AND user_id = ? AND applied_request_id IS NULL AND source_request_id <> ?",
    )
    .all(request.user_id, requestId)
  const pendingExp = db
    .prepare(
      "SELECT * FROM commission_ledger WHERE side = 'expert' AND expert_id = ? AND applied_request_id IS NULL AND source_request_id <> ?",
    )
    .all(bid.expert_id, requestId)
  const deferredCustomer = round2(pendingCust.reduce((a, r) => a + r.amount, 0))
  const deferredExpert = round2(pendingExp.reduce((a, r) => a + r.amount, 0))

  const totalPaid = round2(base + customerFee + deferredCustomer)
  const net = round2(base - expertFee - deferredExpert)
  const commission = round2(customerFee + expertFee + deferredCustomer + deferredExpert)

  const year = new Date().getFullYear()
  const count = db.prepare('SELECT COUNT(*) c FROM invoices WHERE number LIKE ?').get(`MIH-${year}-%`).c
  const number = `MIH-${year}-${String(count + 1).padStart(4, '0')}`

  db.prepare(
    `INSERT INTO invoices (number, request_id, amount, commission, net, customer_fee, expert_fee, total_paid, extras_total, deferred_customer, deferred_expert)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(number, requestId, base, commission, net, customerFee, expertFee, totalPaid, round2(extrasTotal), deferredCustomer, deferredExpert)

  const markApplied = db.prepare('UPDATE commission_ledger SET applied_request_id = ? WHERE id = ?')
  for (const r of [...pendingCust, ...pendingExp]) markApplied.run(requestId, r.id)

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

  db.prepare(
    `UPDATE requests SET status = 'done', completed_at = datetime('now'),
      warranty_until = datetime('now', '+' || COALESCE(warranty_days, 3) || ' days')
     WHERE id = ?`,
  ).run(request.id)
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
