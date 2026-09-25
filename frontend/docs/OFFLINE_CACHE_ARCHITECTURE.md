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
`handleProtectedPage` تتسابق بين `fetch()` ومهلة `NETWORK_TIMEOUT_MS` (4
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
