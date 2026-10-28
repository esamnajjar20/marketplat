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


## Expanded offline storage limits (v55)

The configured Service Worker bounds are now: static assets 1,200 entries / 100 MiB; authenticated JSON data 600 entries / 80 MiB per user partition; public API responses 200 entries; viewed images 300 entries; personal page shells 750 entries; and explicitly cached ads up to 1,500 entries. Offline list snapshots were also increased (for example, up to 60 browse pages for ads/products/services/stores, 100 conversations, and 200 messages per conversation). These are cache ceilings, not a guarantee that every item will be retained: browser quota, storage pressure, response eligibility, and device eviction still apply.

## Visited-page and authenticated-data guarantee (v55)

Every successfully visited non-admin route that is eligible for document caching refreshes its shell cache after the server returns a valid same-origin HTML/RSC response and the required JS/CSS chunks are verified. Protected visited routes use the account-cleared `PERSONAL_SHELL_CACHE`; `/admin/**` is never persisted; ad-edit routes use the per-user personal shell cache. Warming is only a preparation mechanism and must not replace a newer real visit.

Successful authenticated JSON GET responses are persisted in the JWT-subject-partitioned `USER_DATA_CACHE`, rather than the shared `API_CACHE`. This now covers safe private reads (for example, the user's own listings, profile-related reads, saved lists, messages, and order history) as well as public lists. On network failure, an authenticated request may only read its subject-partitioned cache, never another user's shared API response. Logout clears personal shells and per-user data caches. Auth/session/CSRF/token/payment-confirmation and admin endpoints are excluded. Opaque bearer tokens without a verifiable subject are not persisted.

The limits are finite (600 entries / 80 MiB per user partition; static assets up to 1,200 entries / 100 MiB; images up to 300 entries; public API up to 200 entries), so this is a best-effort local snapshot, not an unlimited archive. Browser storage eviction, unavailable assets, an endpoint without a bearer subject, or an API response that is not JSON can still make data unavailable offline. Mutations are not treated as successful until the server confirms them; offline writes continue through the explicit mutation queue policy.


## Cache privacy hardening (v56)

- `Cache-Control: no-store` is now an unconditional prohibition on Service Worker persistence, including JWT-subject-partitioned caches.
- Responses marked `private`, `Vary: Cookie`, `Vary: Authorization`, `Vary: *`, or `Set-Cookie` are never written to the shared API cache. Responses varying by Cookie are not persisted in the per-user API cache either, because the Service Worker cannot inspect the Cookie request header and cannot safely reproduce that variant offline.
- Shared API and core-cache fallbacks validate cached response headers before returning a snapshot, preventing a private/identity-varying response from being served as public data.
- Cookie-authenticated requests cannot be identified by reading the request Cookie header from a Service Worker. The backend must therefore consistently send `private`/`no-store` and `Vary: Cookie` for identity-dependent responses; `v56` clears old `market-*` cache entries so pre-fix snapshots are not reused.
- Trade-off: routes using `CACHE.NONE` (`no-store`) are deliberately not available from the Service Worker API cache offline. If offline access is required for a particular personal read, expose a separate explicit offline-storage contract that does not use `no-store` and carefully partitions by verified user identity.


## Revalidation and offline fallback hardening (v57)

- Responses with `no-store`, `no-cache`, `must-revalidate`, `proxy-revalidate`, `max-age=0`, or `s-maxage=0` are not saved as API snapshots. In particular, `no-cache` permits storage under HTTP semantics but requires validation before reuse; offline fallback cannot validate, so this app deliberately does not cache it.
- User-partitioned snapshots are also rejected when `Vary` includes `Authorization`. Partitioning by JWT subject alone is not enough to reproduce a representation that varies by token or authorization context.
- Offline fallback re-checks the same policy for existing snapshots, so a legacy cached response with restrictive directives is not served after network failure.
- Added unit coverage for strict revalidation directives, authorization-varying responses, and legacy no-cache fallback. Real-browser/offline-device testing remains a separate release check.


## Aggregate offline queue limits (v58)

- The IndexedDB mutation queue is capped at 500 entries and an estimated 20 MiB of payload plus metadata. This queue limit intentionally remains unchanged when disposable caches are enlarged; queued user mutations must not be evicted to free cache space. The existing per-request 6 MiB body limit remains in place.
- When the aggregate limit is reached, the Service Worker rejects the new enqueue with `QUEUE_LIMIT_EXCEEDED` and a visible 503 response. It does not silently delete pending, failed, or cancelled user actions.
- The estimate counts Blob/ArrayBuffer/string payloads by their byte lengths and adds serialized metadata. Browser storage accounting differs by engine, so this is an application-level guard, not a guarantee of physical disk usage.
- Before release, run the unit tests with the project's installed Vitest version and test real IndexedDB quota failures in at least one mobile browser. The fake IndexedDB test harness cannot fully emulate transaction scheduling or device quota behavior.


## Account-bound queue replay guard (v59)

- Queue rows with a recorded owner are deferred when the current access token cannot be refreshed or its subject cannot be verified. They are never sent as an anonymous operation or implicitly attributed to another account.
- A confirmed owner mismatch remains blocked by the existing mismatch guard. If the refresh explicitly fails due to authentication, the Service Worker asks the user to sign in again; transient refresh failures leave the row pending.
- This is defense in depth alongside logout queue clearing and `ownerUserId` checks. Validate with the Vitest Service Worker harness and real multi-account browser testing before release.


## Queue drain resilience and failure retention (v60)

- Queue-drain notifications are best-effort: failure to enumerate clients or post a message cannot leave the in-memory drain lock permanently set.
- Unexpected drain/storage errors are logged and reported with `QUEUE_DRAIN_FAILED`; the lock is always released in `finally`, allowing a later online/background-sync/manual trigger to retry.
- Failed queue rows are retained until the user explicitly retries or discards them. The service worker must not silently delete failed operations to make room. The queue's entry/byte caps reject new work with a clear capacity error instead.
- The offline page still limits the visible failed-request list to 20 rows for UI performance; discarding visible entries and refreshing reveals additional rows.


## v61 — stable operation identity during replay

New queued mutations receive a stable `operationId` before they are persisted, and
`X-Offline-Op-Id` is stored alongside it. The Service Worker restores this header
for every replay; the page fallback writes the same header/field pair. This helps
backend routes that explicitly implement offline idempotency return the original
result when a server commit succeeded but its response was lost. It does **not**
make every mutation globally idempotent: each endpoint must enforce the key with a
durable, user-scoped uniqueness boundary. Routes without that server-side support
can still duplicate an action after an ambiguous network failure.
