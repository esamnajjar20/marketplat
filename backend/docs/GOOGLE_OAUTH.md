# تسجيل الدخول عبر Google (Google OAuth)

> FIX OAUTH-01 — دليل الإعداد والمعمارية لميزة "المتابعة باستخدام Google".

## نظرة عامة

يضيف هذا التكامل طريقة دخول ثانية اختيارية إلى جانب نظام البريد الإلكتروني
وكلمة المرور الحالي، دون أي تغيير على الأخير. يعتمد على
[Passport.js](http://www.passportjs.org/) مع
[`passport-google-oauth20`](https://github.com/jaredhanson/passport-google-oauth2)
في **الوضع اللاحالة (stateless)** — لا يوجد `express-session` في هذا المشروع،
ولا حاجة له: الجلسة الفعلية بعد نجاح تسجيل الدخول عبر Google تُصدر عبر نفس
آلية JWT + Refresh Token الموجودة مسبقًا (`issueSession()` في
`auth.service.ts`)، بالضبط كما يحدث بعد تسجيل الدخول المحلي.

## يعمل التطبيق طبيعيًا بدون إعداد Google

إذا لم تُضبط متغيرات البيئة الثلاثة (انظر أدناه)، فإن:

- التطبيق **يستمر بالعمل بشكل طبيعي** بتسجيل الدخول المحلي فقط — لا crash عند
  الإقلاع.
- عند الإقلاع، تُطبع رسالة تحذير واضحة في السجلات (`logger.warn`) توضح أن
  Google OAuth غير مُفعّل وما هي المتغيرات الناقصة.
- طلبات `GET /api/v1/auth/google` و`GET /api/v1/auth/google/callback` تُعيد
  `503` مع `code: "GOOGLE_OAUTH_NOT_CONFIGURED"` بدلًا من الانهيار بخطأ داخلي
  غامض.
- زر "المتابعة باستخدام Google" في الواجهة الأمامية **لا يظهر أصلًا** ما لم
  يُضبط `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED` عند البناء (`next build`).

## إعداد بيانات اعتماد Google

1. اذهب إلى [Google Cloud Console](https://console.cloud.google.com/) →
   **APIs & Services → Credentials**.
2. أنشئ **OAuth client ID** من نوع **Web application**.
3. أضف رابط الـ callback الخاص بالباك-إند (وليس الفرونت-إند) ضمن
   **Authorized redirect URIs**، بنفس القيمة المضبوطة في
   `GOOGLE_CALLBACK_URL` تمامًا (بما فيها `http`/`https` والمسار الكامل):
   - تطوير محلي: `http://localhost:5000/api/v1/auth/google/callback`
   - إنتاج: `https://api.your-domain.com/api/v1/auth/google/callback`
4. انسخ `Client ID` و`Client Secret` الناتجين.

## متغيرات البيئة

### الباك-إند (`backend/.env`)

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:5000/api/v1/auth/google/callback
```

الثلاثة اختيارية معًا — إما أن تُضبط كلها، أو تُترك فارغة. ضبط بعضها فقط
يُعامل كأنها غير مُفعّلة بالكامل (انظر `env.googleOAuth.isConfigured` في
`src/config/env.ts`).

### الفرونت-إند (`frontend/.env`)

```env
NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=true
```

⚠️ **يجب إبقاء هذا متزامنًا يدويًا مع إعداد الباك-إند** — فهو مجرد علم واجهة
لإظهار/إخفاء الزر (نفس نمط `NEXT_PUBLIC_VAPID_PUBLIC_KEY` الموجود مسبقًا
لإشعارات الدفع)، ولا يتحقق فعليًا من إعداد الباك-إند. ضبطه إلى `true` بينما
الباك-إند غير مُعدّ سيُظهر زرًا يفشل دائمًا بخطأ 503.

## المعمارية

### تدفّق الطلب (Request Flow)

```
المستخدم يضغط "المتابعة باستخدام Google" (GoogleAuthButton.tsx)
        │  window.location.href = `${API_BASE_URL}/auth/google`
        │  (تنقّل صفحة كامل، وليس axios/fetch — إلزامي)
        ▼
GET /api/v1/auth/google  (auth.routes.ts)
        │  requireGoogleOAuthConfigured (503 إن لم يُضبط)
        │  passport.authenticate('google', { session:false, scope:[...] })
        ▼
       يُحوّل المتصفح إلى شاشة موافقة Google
        │
        ▼  المستخدم يوافق (أو يرفض)
GET /api/v1/auth/google/callback  (auth.routes.ts)
        │  passport.authenticate('google', { session:false }, customCallback)
        │  google.strategy.ts's verify callback: extractGoogleProfile(profile)
        │      → req.googleProfile = { googleId, email, name, avatarUrl }
        ▼
authController.googleCallback (auth.controller.ts)
        │  authService.loginWithGoogle(profile, ip, userAgent)
        │      1) googleId موجود مسبقًا؟         → تسجيل دخول مباشر
        │      2) لا، لكن email موجود؟           → ربط حساب Google بالحساب المحلي
        │      3) لا هذا ولا ذاك؟                → إنشاء مستخدم جديد (بدون SellerProfile)
        │  issueSession(user, ip, userAgent)  ← نفس الدالة المستخدمة في
        │                                          التسجيل/الدخول المحلي بالضبط
        │  setSessionCookies(res, refreshToken)  ← نفس الكوكيز (refreshToken,
        │                                          csrfToken, app_has_session)
        ▼
       redirect(FRONTEND_URL)  ← وليس JSON — تنقّل متصفح فعلي
        │
        ▼
AuthHydrationProvider (موجود مسبقًا، لم يُعدَّل) يقرأ كوكي refreshToken
تلقائيًا عبر /auth/refresh عند تحميل الصفحة — تمامًا كما يفعل بعد أي
تحديث صفحة عادي.
```

### لماذا "إعادة توجيه" وليس JSON؟

كل نقاط النهاية الأخرى في `auth.controller.ts` (`register`, `login`, ...)
تُستدعى عبر `axios` من كود JavaScript في الواجهة الأمامية، وتُعيد استجابة
JSON يقرأها ذلك الكود مباشرة. أما `GET /auth/google/callback` فتُستدعى بعد
تنقّل متصفح فعلي من Google — لا يوجد كود JavaScript "بالانتظار" على هذه
الصفحة بالتحديد لاستقبال JSON. لذلك تضبط `googleCallback` نفس الكوكيز التي
تضبطها `respondWithSession` (عبر دالة `setSessionCookies` المشتركة)، ثم تُصدر
إعادة توجيه HTTP حقيقية (302) إلى `FRONTEND_URL` بدلًا من `res.json(...)`.

### لماذا لا يُنشأ SellerProfile تلقائيًا؟

النظام الحالي **لا** ينشئ `SellerProfile` عند التسجيل المحلي أيضًا — يبقى ذلك
اختياريًا دائمًا عبر `POST /sellers` عندما يقرر المستخدم فتح متجر. تسجيل
الدخول عبر Google يتبع نفس القاعدة تمامًا: يُنشئ `User` فقط، بغض النظر عن
طريقة تسجيل الدخول.

### حالات الحساب الثلاث في `loginWithGoogle()`

| الحالة | الشرط | الإجراء |
|---|---|---|
| **دخول مباشر** | `googleId` من الملف الشخصي موجود مسبقًا في قاعدة البيانات | تسجيل دخول عادي، بدون أي إنشاء أو تعديل |
| **ربط حساب** | لا يوجد `googleId` مطابق، لكن `email` موجود مسبقًا (حساب محلي أو Google سابق) | ربط `googleId` بالحساب الموجود؛ **لا يُنشأ مستخدم مكرر أبدًا**؛ كلمة المرور المحلية (إن وجدت) تبقى سليمة تمامًا |
| **مستخدم جديد** | لا `googleId` ولا `email` مطابقان | إنشاء `User` جديد بـ `provider: "google"` و`passwordHash: null`؛ **بدون** `SellerProfile` |

### الحماية من التسابق (Race Conditions)

عمليتا "دخول Google" متزامنتان لنفس البريد الإلكتروني (نقرة مزدوجة، تبويبان
مفتوحان) قد تجتازان معًا فحص "لا يوجد حساب بهذا البريد بعد" قبل أن تُكمل أي
منهما إدراج السجل، مما قد ينتج عنه إما خطأ P2002 غير معالَج أو حسابين
متسابقين. لمعالجة ذلك، تُغلَّف `loginWithGoogle()` بالكامل بقفل Redis
(`withOAuthAccountResolutionLock` في `shared/utils/oauthLock.ts`)، بنفس آلية
القفل المستخدمة مسبقًا في `sellerLock.ts`/`adLock.ts` — مفتاح القفل مبني على
البريد الإلكتروني (بأحرف صغيرة)، مع مهلة قصيرة (15 ثانية)، ويُطلَق تلقائيًا
عند انتهاء العملية أو فشلها.

## المسارات (Endpoints)

| Method | Path | الوصف |
|---|---|---|
| `GET` | `/api/v1/auth/google` | يبدأ تدفّق OAuth، يُحوّل المتصفح إلى Google |
| `GET` | `/api/v1/auth/google/callback` | يستقبل رد Google، يُنشئ/يربط/يُسجّل الدخول، ثم يُحوّل إلى الواجهة الأمامية |
| `GET` | `/api/v1/auth/google/failure` | هدف داخلي لإعادة التوجيه عند فشل Passport نفسه (رفض الموافقة، فشل تبادل الرمز) |

كلا المسارين الأولين محميان بـ `requireGoogleOAuthConfigured` (يُعيد `503` إن
لم يُضبط Google OAuth) وبنفس الـ rate limiting المستخدم في `/auth/login`
(`authRateLimit`).

## الاختبارات

| الملف | يغطي |
|---|---|
| `tests/unit/google.strategy.test.ts` | `extractGoogleProfile` (استخراج البريد/الاسم/الصورة، حالات الحافة)، وتفعيل/تعطيل الاستراتيجية حسب متغيرات البيئة |
| `tests/unit/oauthLock.test.ts` | سلوك قفل Redis (تسلسل، تحرير عند النجاح/الفشل، عدم حجب بريد إلكتروني مختلف) |
| `tests/unit/auth.repository.google.test.ts` | `findByGoogleId`, `createWithGoogle`, `linkGoogleAccount` |
| `tests/unit/auth.service.google.test.ts` | الحالات الثلاث لـ `loginWithGoogle` + التسابق المتزامن + تراجع الدخول المحلي لحساب Google-only |
| `tests/unit/auth.controller.google.test.ts` | `googleCallback` (نجاح، ملف شخصي مفقود، فشل الخدمة) |
| `tests/integration/auth.google.test.ts` | تدفّق HTTP كامل: 503 عند عدم الإعداد، إنشاء مستخدم جديد، ربط حساب موجود، فشل بلا بريد إلكتروني — عبر Strategy مُموَّهة (stubbed) بدلًا من اتصال شبكي حقيقي بـ Google |

## استكشاف الأخطاء

- **"Google OAuth is not configured" (503)** — تحقق من ضبط المتغيرات الثلاثة
  في `backend/.env`، وأن `GOOGLE_CALLBACK_URL` صالح (`z.string().url()`).
- **`redirect_uri_mismatch` من Google** — القيمة في `GOOGLE_CALLBACK_URL` يجب
  أن تُطابق حرفيًا واحدة من "Authorized redirect URIs" في Google Cloud
  Console (بما فيها البروتوكول والمنفذ والمسار).
- **الزر لا يظهر رغم ضبط الباك-إند** — تأكد من ضبط
  `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=true` في `frontend/.env` **وإعادة بناء**
  التطبيق (`next build`) — متغيرات `NEXT_PUBLIC_*` تُضمَّن وقت البناء، وليس
  وقت التشغيل.
