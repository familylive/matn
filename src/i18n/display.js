export const expertName = (expert, lang) =>
  (lang === 'ar' && (expert?.name_ar || expert?.nameAr)) || expert?.personName || expert?.name || ''

export const jobName = (t, job) => t(`cat.${job}`, job)
export const cityName = (t, city) => t(`city.${city}`, city)
