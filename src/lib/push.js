// تفعيل إشعارات الويب (تشتغل والتطبيق مسكّر — أندرويد، وآيفون بعد الإضافة للشاشة الرئيسية)
export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function enablePush(token) {
  if (!pushSupported()) throw new Error('unsupported')

  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('denied')

  const { key } = await (await fetch('/api/push/key')).json()
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    })
  }

  const r = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ subscription: sub }),
  })
  if (!r.ok) throw new Error('subscribe_failed')
  return true
}

export async function testPush(token) {
  const r = await fetch('/api/push/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  })
  return r.json().catch(() => ({}))
}
