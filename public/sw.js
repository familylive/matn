const CACHE = 'mihnati-v3'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) return

  // صفحات: من الشبكة دائماً (عشان التحديثات تظهر فوراً)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('/index.html', copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match('/index.html')),
    )
    return
  }

  // ملفات الـ build (بها بصمة) → كاش، وغيرها من الشبكة
  const hashed = /\/assets\/.+-[A-Za-z0-9_]{6,}\.(js|css)$/.test(url.pathname)
  if (!hashed) {
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => caches.match(request)))
    return
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {})
          return res
        }),
    ),
  )
})

/* ---------- إشعارات الدفع (Web Push) ---------- */
self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch (e) {}
  const title = d.title || 'مهنتي'
  const body = d.body || 'لديك تحديث جديد'
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      dir: 'rtl',
      lang: 'ar',
      vibrate: [250, 120, 250, 120, 250, 120, 250],
      requireInteraction: true,
      renotify: true,
      tag: d.tag || 'mihnati',
      data: { url: d.url || '/' },
      actions: [{ action: 'open', title: 'عرض' }],
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.indexOf(self.location.origin) === 0) {
          c.focus()
          if (c.navigate) c.navigate(url)
          return
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
