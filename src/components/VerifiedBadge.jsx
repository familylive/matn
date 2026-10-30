/**
 * شارة التوثيق: حلقة ذهبية دوّارة + أجنحة ثابتة + علامة صح بيضاء ثابتة في المنتصف
 */
export default function VerifiedBadge({ size = 20, className = '', title = 'موثّق' }) {
  const s = size
  return (
    <span
      title={title}
      className={`relative inline-flex items-center justify-center align-middle shrink-0 ${className}`}
      style={{ width: s * 1.5, height: s }}
    >
      {/* الجناحان */}
      <span
        className="absolute inset-y-0 start-0"
        style={{
          width: s * 0.42,
          background: 'linear-gradient(90deg, rgba(201,162,39,0), #C9A227)',
          clipPath: 'polygon(100% 50%, 0% 0%, 30% 50%, 0% 100%)',
          opacity: 0.95,
        }}
      />
      <span
        className="absolute inset-y-0 end-0"
        style={{
          width: s * 0.42,
          background: 'linear-gradient(270deg, rgba(201,162,39,0), #C9A227)',
          clipPath: 'polygon(0% 50%, 100% 0%, 70% 50%, 100% 100%)',
          opacity: 0.95,
        }}
      />
      {/* الحلقة الدوّارة */}
      <span
        className="mh-ring absolute rounded-full"
        style={{ width: s, height: s }}
      />
      {/* علامة الصح البيضاء الثابتة */}
      <svg viewBox="0 0 24 24" style={{ width: s * 0.62, height: s * 0.62 }} className="relative">
        <path d="M20 6L9 17l-5-5" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}
