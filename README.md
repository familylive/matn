# مهنتي (Mihnati) — تطبيق كامل: واجهة + باكند

منصة طلبات خدمات مع **مزاد لحظي**: العميل ينشر طلب، والحرفيون يسومون عليه مباشرة (WebSocket).

## المكوّنات
| الطبقة | التقنية |
|---|---|
| الواجهة | React 19 + Vite + Tailwind |
| الباكند | Node + Express |
| قاعدة البيانات | SQLite (better-sqlite3) |
| اللحظي | Socket.IO |

## التشغيل محلياً
```bash
npm install
cd server && npm install && node seed.js && cd ..
npm run build
node server/index.js          # http://localhost:3001
```
للتطوير مع إعادة التحميل:
```bash
node server/index.js          # طرفية 1
npm run dev                   # طرفية 2 (Vite على 5173، يوجّه /api تلقائياً؟ استخدم VITE_API_URL=http://localhost:3001)
```

## الحساب
تسجيل بالجوال + رمز OTP. في وضع التطوير الرمز يظهر على الشاشة (devCode).
في الإنتاج اربط مزوّد SMS (Unifonic / Msegat) داخل `server/index.js` عند `request-otp`.

## واجهات API
```
POST /api/auth/request-otp   { phone }
POST /api/auth/verify        { phone, code, name? }  → { token, user }
GET  /api/me
GET  /api/experts?category=&q=
GET  /api/requests?status=
POST /api/requests           { title, category, description, city, budget }
GET  /api/requests/:id
POST /api/requests/:id/bids  { expertId, amount, note }
POST /api/requests/:id/accept   { bidId }
POST /api/requests/:id/complete
POST /api/requests/:id/review   { rating, comment }
```
Socket.IO: `join` الغرفة `request:<id>` ← أحداث `bid:new` و`request:accepted`.

## النشر (Render — خدمة واحدة)
1. ارفع المشروع على GitHub.
2. Render → New → Web Service → اختر المستودع.
3. Build: `npm install && npm run build && cd server && npm install && node seed.js`
4. Start: `node server/index.js`
5. أضف متغير البيئة `AUTH_SECRET` بقيمة عشوائية طويلة.
   (ملف `render.yaml` جاهز لهذا الغرض.)

## البيانات التجريبية
٥ حرفيين + عميل تجريبي (`+216000000000`). الصور محلية داخل `public/`.

## الناقص (المرحلة التالية)
- ربط مزوّد SMS حقيقي.
- لوحة إدارة (توثيق الحرفيين، فض النزاعات، العمولة).
- دفع إلكتروني.
- تحويل الواجهة إلى العربية RTL.
