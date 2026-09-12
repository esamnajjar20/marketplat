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
