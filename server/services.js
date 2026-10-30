/* خدمات كل تخصص (بنود فرعية) + أدوات قراءة تخصصات الفني */

export const DEFAULT_SERVICES = {
  AC: ['تركيب مكيفات', 'صيانة وتنظيف', 'تمديدات نحاس جديدة', 'تعبئة فريون', 'إصلاح تسريب ماء', 'لوحات تحكم'],
  Plumber: ['تسليك مجاري', 'خلاطات وصنابير', 'سخانات', 'كشف تسربات', 'أدوات صحية', 'مضخات مياه'],
  Electrician: ['تمديدات كهرباء', 'إنارة وثريات', 'لوحات كهربائية', 'أعطال وتوصيلات', 'قواطع وحمايات'],
  Carpenter: ['مطابخ خشب', 'أبواب ونوافذ', 'غرف نوم', 'ديكورات خشبية', 'صيانة أثاث'],
  Painter: ['دهان داخلي', 'دهان خارجي', 'جبس وديكورات', 'ورق جدران', 'معجون وتأسيس'],
  Mechanic: ['ميكانيكا عامة', 'كهرباء سيارة', 'تكييف سيارة', 'سمكرة ودهان', 'فحص كمبيوتر'],
}

/** يزرع الخدمات الافتراضية كأقسام فرعية (مرة واحدة لكل خدمة) */
export function seedServices(db) {
  const parents = db.prepare('SELECT id, key, ar FROM categories WHERE parent_id IS NULL').all()
  const find = db.prepare("SELECT id FROM categories WHERE parent_id = ? AND (ar = ? OR \"key\" = ?)")
  const ins = db.prepare('INSERT INTO categories ("key", ar, en, icon, sort, parent_id, active) VALUES (?, ?, NULL, ?, ?, ?, 1)')
  let added = 0
  for (const p of parents) {
    const list = DEFAULT_SERVICES[p.key] || []
    list.forEach((ar, i) => {
      if (find.get(p.id, ar, ar)) return
      ins.run(`${p.key}-${i + 1}`, ar, p.key === 'AC' ? '❄️' : '🛠️', 10 + i, p.id)
      added++
    })
  }
  if (added) console.log('services seeded:', added)
  return added
}

export const parseJson = (v, d) => {
  try {
    const x = typeof v === 'string' ? JSON.parse(v) : v
    return x == null ? d : x
  } catch {
    return d
  }
}

/** تخصصات الفني: [{cat, subs:[]}] + التخصص الأساسي job */
export const tradesOf = (e) => {
  if (!e) return []
  const raw = parseJson(e.trades, [])
  const arr = (Array.isArray(raw) ? raw : [])
    .filter((t) => t && t.cat)
    .map((t) => ({ cat: String(t.cat), subs: Array.isArray(t.subs) ? t.subs.map(String) : [] }))
  if (e.job && !arr.some((t) => t.cat === e.job)) arr.unshift({ cat: e.job, subs: [] })
  return arr
}

export const catsOf = (e) => [...new Set(tradesOf(e).map((t) => t.cat))]

export const certsOf = (e) => {
  const raw = parseJson(e?.certs, [])
  return Array.isArray(raw) ? raw.filter((c) => c && c.url) : []
}

export const decorateExpert = (e) => ({
  ...e,
  skills: parseJson(e?.skills, []),
  trades: tradesOf(e),
  certs: certsOf(e),
  cats: catsOf(e),
  exp_years: e?.exp_years ?? null,
})
