import { useState } from 'react'
import { api } from '../lib/api.js'
import TradesEditor from './TradesEditor.jsx'
import { ExpertBadge } from './Trades.jsx'
import { tradesOf } from '../data/services.js'

/** مساحة عمل الفني: التخصصات والأعمال + سنوات الخبرة + الشهادات */
export default function ExpertWorkspace({ expert, onChange }) {
  const [trades, setTrades] = useState(tradesOf(expert))
  const [years, setYears] = useState(expert.exp_years ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [uploading, setUploading] = useState(false)

  const certs = Array.isArray(expert.certs) ? expert.certs : []

  const save = async () => {
    setBusy(true); setMsg('')
    try {
      const updated = await api.patch('/api/me/expert', { trades, exp_years: years === '' ? 0 : Number(years) })
      onChange(updated)
      setMsg('✅ تم الحفظ — راح توصلك طلبات كل التخصصات اللي اخترتها')
    } catch {
      setMsg('تعذّر الحفظ، حاول مرة ثانية')
    } finally {
      setBusy(false)
    }
  }

  const uploadCert = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setUploading(true); setMsg('')
    try {
      const updated = await api.uploadCert(f, f.name)
      onChange(updated)
      setMsg('✅ تم رفع الشهادة')
    } catch (err) {
      setMsg(err.message === 'too_many_certs' ? 'الحد الأقصى ١٠ شهادات' : 'تعذّر رفع الملف')
    } finally {
      setUploading(false)
    }
  }

  const removeCert = async (i) => {
    try {
      const updated = await api.deleteCert(i)
      onChange(updated)
    } catch {}
  }

  return (
    <div className="card-lux p-4 mt-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-extrabold text-sm text-[#11221A]">🧰 تخصصاتي وأعمالي</p>
        {!!(expert.badge_label || expert.is_company) && (
          <ExpertBadge color={expert.badge_color} label={expert.badge_label || (expert.is_company ? 'شركة معتمدة' : '')} />
        )}
      </div>

      <TradesEditor value={trades} onChange={setTrades} />

      <div>
        <label className="text-xs font-bold text-gray-600">سنوات الخبرة في المجال</label>
        <input
          type="number" min="0" max="60" inputMode="numeric"
          value={years}
          onChange={(e) => setYears(e.target.value)}
          placeholder="مثال: 7"
          className="w-full mt-1 px-3 py-2.5 border border-[#E3D9BF] rounded-xl outline-none focus:border-[#006C35]"
        />
      </div>

      <button onClick={save} disabled={busy} className="btn-primary">
        {busy ? 'جارٍ الحفظ…' : 'حفظ التخصصات والخبرة'}
      </button>
      {msg && <p className="text-[11px] text-[#006C35] font-bold">{msg}</p>}

      <div className="pt-2 border-t border-[#F0E9D8]">
        <p className="font-extrabold text-sm text-[#11221A]">📄 شهاداتي</p>
        <p className="text-[11px] text-gray-500 mt-1">ارفع صور أو PDF لشهاداتك — تظهر للعميل في ملفك وتزيد فرص قبولك.</p>

        {certs.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {certs.map((c, i) => (
              <li key={c.url} className="flex items-center gap-2 bg-[#FBF9F2] border border-[#EADFC8] rounded-xl px-3 py-2">
                <span className="text-lg">{(c.url || '').toLowerCase().endsWith('.pdf') ? '📄' : '🖼️'}</span>
                <a href={c.url} target="_blank" rel="noreferrer" className="flex-1 text-[12px] font-bold text-[#11221A] truncate">
                  {c.name || 'شهادة'}
                </a>
                <button onClick={() => removeCert(i)} className="text-[11px] text-red-500 font-bold">حذف</button>
              </li>
            ))}
          </ul>
        )}

        <label className="mt-2 flex items-center justify-center gap-2 border-2 border-dashed border-[#E3D9BF] rounded-xl py-3 text-[12px] font-bold text-[#006C35] cursor-pointer bg-[#FBF9F2]">
          {uploading ? 'جارٍ الرفع…' : '＋ رفع شهادة من جهازي'}
          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={uploadCert} />
        </label>
      </div>
    </div>
  )
}
