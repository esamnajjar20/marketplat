# معمارية الكاش والأوفلاين — MarketPlat

## القاعدة الذهبية

> الكاش يحسّن السرعة ويعطي offline، لكنه **ليس** مصدر الحقيقة بدل السيرفر.

| الحالة | مصدر الحقيقة |
|--------|----------------|
| Online | السيرفر (API) ثم تحديث الكاش المحلي |
| Offline | Cache / IndexedDB + مؤشر «قد تكون قديمة» |
| عودة النت | مزامنة الطوابير → تحديث البيانات المهمة → UI |

لا نحاول جعل التطبيق نسخة كاملة من السوق أوفلاين.

---

## طبقات الكاش

### 1) Versioned (تُمسَح عند activate لإصدار SW جديد)

| الكاش | المحتوى | الاستراتيجية |
|-------|---------|----------------|
| `market-static-vN` | JS/CSS/أصول ثابتة + shells عامة | شبكة أولًا للصفحات؛ كاش للأصول |
| `market-core-vN` | حزمة استباقية (APIs عامة محدودة) | تسخين أونلاين |
| `market-personal-shell-vN` | أشكال صفحات محمية (هيكل فقط) | شبكة أولًا؛ كاش عند النجاح؛ مسح عند logout |
| `market-images-vN` | صور شوهدت | Cache-first + حد 80 (FIFO) |
| `market-api-vN` | آخر استجابات GET | Network-first + حد 60 (FIFO) |

**نت ضعيف (غير منقطع لكن بطيء):** `networkFirstApi`/`networkFirstPage`/
`handleProtectedPage` تتسابق بين `fetch()` ومهلة `NETWORK_TIMEOUT_MS` (5
ثوانٍ). لو فازت المهلة، يُعرض الكاش فورًا — لكن `fetch()` الحقيقي لا يُلغى
ويستمر بالخلفية؛ إن نجح لاحقًا فعلًا يُحدَّث الكاش من نتيجته. هذا يمنع
انتظار المستخدم لعشرات الثواني على 2G/3G قبل أن يرى بيانات مخزَّنة أصلاً
جاهزة فورًا. لا يشمل هذا مسار الكتابة (`handleMutation`) — يبقى بلا مهلة
عمدًا (إلغاء الانتظار هناك يخاطر بتكرار عملية قد تكون نجحت فعلًا عند
السيرفر رغم انتهاء مهلتنا؛ ولمسار الكتابة أصلًا قائمة انتظار offlineQueue).

### 2) Unversioned (لا تُمسَح مع رفع إصدار SW)

| الكاش | المحتوى |
|-------|---------|
| `market-saved-ads` | إعلانات حفظها المستخدم صراحةً للعمل دون اتصال |

### 3) IndexedDB / localStorage

| المخزن | الحد | ملاحظات |
|--------|------|---------|
| المحادثات / الرسائل | 50 × 100 | `offlineMessagesStore` |
| طابور العمليات | — | لا تُعرض كـ Success قبل السيرفر |
| قوائم محدودة | انظر `offlineCachePolicy` | activity, ads, ranking… |
| إشعارات | 30 | `notificationsCache` |
| فهرس بحث محلي | من CORE_CACHE | ليس كل عمليات البحث |

---

## متى نرفع `CACHE_VERSION`؟

**نعم:** تغيّر سياسة كاش، أسماء كاشات، shells، استراتيجيات fetch، حدود مهمة في SW.

**لا:** typo، منطق أعمال، endpoint جديد لا يغيّر SW.

المسار الآمن للتحديث:

1. SW جديد → `install` → `waiting` (بدون `skipWaiting` من install)
2. المستخدم: «تحديث الآن» → `SKIP_WAITING`
3. `activate` → حذف `market-*` القديمة (ما عدا unversioned)
4. `controllerchange` → reload مرة واحدة

---

## الأمان عند Logout

- مسح `API_CACHE` + `PERSONAL_SHELL_CACHE` عبر SW
- مسح قوائم offline + رسائل IndexedDB + إشعارات محلية
- مسح حالة المستخدم من Zustand

---

## العمليات (Mutations)

Offline → طابور → حالة **Pending** (ليس «تم بنجاح») → عند عودة النت → API → Success/Fail.


## المرحلة 1 — إنجاز العمل Offline

- **مسودات الإعلانات** (`offlineAdDrafts`): إنشاء/تعديل بدون نت → محفوظ محليًا بانتظار الاتصال (ليس «تم النشر»).
- **المفضلة**: تبديل متفائل + طابور SW عند الأوفلاين (موجود).
- **مركز المزامنة** `/settings/sync`: طابور pending/failed + مسودات + مزامنة الآن.
- **الصفحة الشخصية / متجري**: ضمن personal shells (`settings/profile`, `my-store/*`).


## المرحلة 2 — مكتملة جزئيًا

- **حسابي** `/profile/:id`: شكل الصفحة في personal shell (يُمسَح عند logout).
- **Dashboard attention**: كاش JSON محدود.
- **المواعيد** (`useMyAppointments`): آخر ~30 موعدًا محليًا.
- **Nearby**: حفظ آخر موقع معروف + استخدامه أوفلاين.
- **بحث offline**: `searchOfflineWithMeta` مع ملاحظة بيانات محفوظة.
- **مسودات + مركز مزامنة**: المرحلة 1.

لا ننفّذ حجز موعد جديد أوفلاين كنجاح نهائي (يتطلب توفر السيرفر).

---

## إصلاحات نهائية (2026-09-25)

### التوكن والجلسة
- **COOKIE-POLICY-01**: `authCookies.ts` يستخدم `authCookieBase()` من `COOKIE_DOMAIN` + `COOKIE_SAMESITE` في env. على دومين حقيقي مشترك اضبط `COOKIE_SAMESITE=lax` و `COOKIE_DOMAIN=.example.com`.
- **NATIVE-SESSION-01**: `lib/capacitor/nativeSessionStorage.ts` يخزّن فقط `userId` + `hasSession` (بدون أسرار) عبر `@capacitor/preferences` على Native أو localStorage على الويب. يُحدَّث من `setAuth` / `setUser` ويُمسَح من `logout` و `clearSensitiveLocalData`.

### الأوفلاين
- **OFFLINE-FRESHNESS-01**: `lib/offlineFreshness.ts` — `isOfflineStale` + `formatOfflineSavedAt` + `offlineFreshnessLabel` موحّدة لكل الواجهات. `offlineJsonCache` يعيد التصدير للتوافق.
- **CONFLICT-UX-01**: `lib/conflictResolver.ts` — تصنيف 409/422/4xx لواجهات الطابور الفاشل (retry / discard / edit).

### الاستخدام المقترح في الواجهة
```ts
import { offlineFreshnessLabel, isOfflineStale } from '@/lib/offlineFreshness';
import { conflictFromUnknown } from '@/lib/conflictResolver';

// شارة تحت قائمة أوفلاين
const label = offlineFreshnessLabel(envelope?.savedAt, { kind: 'list' });

// بعد فشل mutation
const conflict = conflictFromUnknown(error);
if (conflict.isTerminal) { /* discard / edit */ } else { /* retry */ }
```


---

## إغلاق البنود المتبقية (2026-09-25)

### تبسيط الاستيراد (OFFLINE-BARREL-01)
- `lib/offline/index.ts` — واجهة واحدة للكود الجديد.
- الملفات القديمة تبقى كما هي (لا كسر للاستيرادات الحالية).
- لا دمج قسري لـ SW أو ملفات warming (سلوك مجرَّب).

### Conflict UX (CONFLICT-UX-01)
- `SyncCenterClient`: أزرار retry/discard حسب `queueFailureAction`.
- `ChatWindow`: فقاعات الرسائل الفاشلة تستخدم `classifyHttpConflict`.
- `hooks/useMutationConflict.ts` لـ onError في أي mutation أونلاين.

### شارات freshness (OFFLINE-FRESHNESS-01)
- `components/offline/OfflineFreshnessBadge.tsx`
- مربوطة في مركز المزامنة + إعدادات الأوفلاين.
- للاستخدام في أي شاشة:
  ```tsx
  <OfflineFreshnessBadge savedAt={envelope?.savedAt} kind="list" />
  ```

### اختبار الكوكي (COOKIE-POLICY-01)
- `e2e/tests/auth.spec.ts` — suite «Session cookie resilience»:
  - idle + reload
  - تبويب جديد بنفس الـ context
  - logout يزيل الجلسة

### Secure Storage (SECURE-STORAGE-01)
- **مغلق بالتصميم:** لا تخزين لـ access/refresh في Preferences.
- httpOnly cookie = مسار الأمان على Web و Native WebView.
- `nativeSessionStorage` = hints فقط (userId / hasSession).

### Conflict resolution للـ Mutations
- لا diff/merge تلقائي (قرار منتج).
- التصنيف + CTA موحّد عبر `conflictResolver` + `useMutationConflict`.

### Background Sync على iOS
- غير مدعوم بشكل موثوق من المنصة.
- المسار المعتمد: `requestQueueReplay()` + زر «مزامنة الآن» + أزرار إعادة المحاولة في الفقاعات/مركز المزامنة.
- لا حل بالكود وحده؛ هذا هو الإغلاق التشغيلي.


---

## تدقيق الكاش والتسخين (2026-09-29) — CACHE_VERSION = v42

- **WARM-AUTH-01**: `warmUserData` يرسل `Authorization: Bearer` (الباك إند لا يقبل الكوكي وحده)، مع تجديد الجلسة مرة واحدة عند 401، ولا يحتسب في التقدم إلا النجاح الفعلي، ولا يكتب بعد تسجيل الخروج.
- **SW-API-AUTH-TIMEOUT-01**: بوابة `!hadAuth` تشمل مسار الرد المتأخر بعد المهلة أيضًا.
- **SW-TIMEOUT-NOCACHE-01**: بعد المهلة وبلا نسخة مخزنة يُنتظر `fetch` الأصلي بدل `Response.error()`.
- **SW-VARY-01**: مطابقة `API_CACHE`/`USER_DATA_CACHE` بـ `ignoreVary` (الردود العامة تحمل `Vary: Authorization`).
- **SW-IMAGE-DEBUG-BYPASS-01**: حُذف تجاوز كاش الصور المؤقت؛ الصور المسخّنة في `CORE_CACHE` تُخدم قبل الشبكة.
- **LOGOUT-CACHE-DIRECT-01**: مسح Cache Storage مباشرة من الصفحة وانتظاره (لا اعتماد على `controller.postMessage`)، ويشمل `market-saved-ads` و`market-auto-read-ads` عند نهاية الجلسة/تبديل الحساب فقط (قرار منتج: أزل `clearUnversionedOfflineBuckets` إن أردت بقاءها).
- **الباك إند**: `USERCACHE-RACE-01` (إبطال أثناء القراءة)، `CACHE.LIVE` (30+30) للإعلانات، `ADS-CACHE-STAMPEDE/POLLUTION/KEY`، `HOME-CACHE-JITTER-01`.

### تخفيف التسخين (WARM-LIGHT)

- **WARM-LIGHT-01**: كانت ميزانية "أهم 25 صفحة" تُطبَّق على القائمة العامة (18) والشخصية (~37) كلٌّ على حدة، فكان وضع `fast` يسخّن عمليًا كل المسارات (~55 مسارًا × ~58 ملفًا). صارت الميزانية لكل قائمة: عامة 12 + شخصية 8 = 20 على `core`، و8 + 4 على `critical`. وضع `full` (اختيار المستخدم) لم يتغيّر. أي صفحة خارج الميزانية تُخزَّن عند أول زيارة أو من زر إعادة المحاولة في `/settings/offline`.
- **WARM-LIGHT-02**: إعادة ترتيب `PRIORITY_ROUTES` (نشر إعلان/طلب ورسائل وإشعارات قبل أدوات البائع)، وإضافة `/shared` لأنه مستقبِل QR.
- **WARM-SIZE-DEDUPE-01**: "إجمالي الكاش المسخَّن" كان مجموع أحجام المسارات مع تكرار الملفات المشتركة بينها؛ صار مجموع الملفات الفريدة.
- الصور المصغّرة المسخّنة في `CORE_CACHE`: 24 → 12.

---

## تدقيق الكاش والتسخين (2026-09-30)

- **WARM-TIMEOUT-PLAN-01**: مهلة جلب الـ shells صارت `max(15s, plan.requestTimeoutMs)` بدل 15ث ثابتة تتجاهل الخطة (18ث على `fast`).
- **WARM-CHUNK-POOL-01**: chunks المسار الواحد كانت تُطلق دفعة واحدة (40–60 طلبًا) خلف حد المتصفح (6 اتصالات/origin)، والمؤقّت يبدأ عند استدعاء `fetch` فيحترق أثناء الانتظار في الطابور، فيفشل ذيل الطابور على الشبكة البطيئة رغم أنها تعمل، ويزاحم طلبات الصفحة نفسها. صار الجلب عبر `settlePool` بحد 4 متزامنة (نفس دلالات `allSettled`).
- **WARM-DEADCODE-01**: حُذفت من `getWarmingPlan` الفروع التي لا تُنفَّذ أبدًا (مقاسة/`effectiveType`/`downlink`/auto) لأن `getWarmingMode()` يعيد `off|fast|full` فقط وكلها تُعالَج قبلها. الخطة تتبع اختيار المستخدم فقط (مع `saveData` وoffline)، وهذا هو السلوك الفعلي من قبل. `critical` بقيت في النوع `WarmingTier` لأن مستهلكين واختبارات تتفرع عليها؛ إن أردت تكيّفًا مع الشبكة أضف وضع `auto` صريحًا.
- **توثيق**: تعليق `warmingPreferences` عن "كل 6 ساعات" استُبدل بوصف الـ scheduler الفعلي (tick كل 10 دقائق ببوابات طزاجة لكل مرحلة).


### Phase 2 — User-data cache partitioning

User-scoped API warming caches are partitioned by authenticated user subject (`market-user-data-<version>-<encoded-user-id>`). This prevents a force-closed session from leaving User A's authenticated response under the same cache key that User B would later read. Opaque/non-JWT Authorization requests do not use the user-data cache. Each user-data cache is bounded to 40 entries / 8 MB.
