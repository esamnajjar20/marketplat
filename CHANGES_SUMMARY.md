# ملخص إصلاحات الفئة الأولى (1.1 – 1.12)

هذا الأرشيف يحوي **فقط** الملفات المعدَّلة أو الجديدة، بنفس مسارها
داخل المشروع (`backend/...`) — انسخها فوق نسختك الحالية من المشروع.

## ملفات معدَّلة

| الملف | ماذا تغيّر |
|---|---|
| `backend/src/config/env.ts` | إضافة `IMAGE_LOCK_TTL_SECONDS` و`ANALYTICS_QUERY_TIMEOUT_MS` |
| `backend/.env.example` | توثيق المتغيرين الجديدين |
| `backend/src/shared/utils/adLock.ts` | استخدام `env.ads.imageLockTtlSeconds` بدل الثابت الصلب `30` |
| `backend/src/modules/search/search.repository.ts` | `suggest()`: `ILIKE` → `lower() LIKE lower()` لمطابقة فهرس 1.2 |
| `backend/src/shared/utils/queryTimeout.ts` | **ملف جديد** — `runWithQueryTimeout` (SET LOCAL statement_timeout) |
| `backend/src/modules/analytics/analytics.repository.ts` | `trendByEvent`/`topCategories` ملفوفتين بـ `runWithQueryTimeout` |
| `backend/src/modules/audit-logs/audit-logs.validation.ts` | إضافة `userId` إلى `AUDIT_LOG_SORT_FIELDS` |
| `backend/prisma/schema.prisma` | فهرس `UserBlock` العكسي (1.6) + تعليق قرار 1.11 على `Notification.data` |
| `backend/src/modules/saved-searches/saved-searches.repository.ts` | `HARD_MATCHING_CEILING = 5000` + تحذير log |
| `backend/src/shared/utils/unreadNotificationsCache.ts` | **ملف جديد** — كاش Redis لعدد الإشعارات غير المقروءة |
| `backend/src/modules/notifications/notifications.repository.ts` | ربط الكاش بـ `countUnreadForUser`/`create`/`createMany`/`markRead`/`markAllRead` |

## ميغريشنز جديدة (لازم `prisma migrate deploy` أو ما يعادلها)

- `backend/prisma/migrations/20260806170000_add_autocomplete_prefix_indexes/migration.sql`
  فهارس B-tree جزئية (`text_pattern_ops`) لدعم autocomplete (1.2)
- `backend/prisma/migrations/20260806180000_add_user_block_reverse_index/migration.sql`
  فهرس `(blockedId, blockerId)` على `user_blocks` (1.6)

## بنود بلا تعديل كود (قرار موثّق بعد تحقق فعلي من الكود)

- **1.5** — حد `limit=50` بالبحث الموحّد: قرار أداء مقصود وموثّق (تكلفة UNION رباعي)
- **1.7** — `arabic_normalize` بالاستعلام الرئيسي `search()`: يستخدم الفهارس بشكل صحيح أصلاً، محلولة ضمنيًا بـ 1.2
- **1.9** — الاعتماد على `coalesce` بفهرس `ads.repository.ts`: توثيق كافٍ موجود، ملاحظة صيانة لا خلل
- **1.11** — راجعت كل مسارات القراءة على `Notification`؛ لا يوجد أي استعلام حالي يفلتر على عمود `data`
  (كلها تفلتر بـ `userId`/`readAt`/`createdAt`، وهذي مفهرسة أصلاً). فهرس GIN على `data` الآن
  سيكون تكلفة كتابة بلا فائدة قراءة فعلية — وثّقت هذا كتعليق بالـ schema بدل إضافة فهرس غير مُستخدَم.

## ⚠️ قيد مهم لم يُحَل

لم تتوفر شبكة إنترنت في بيئة التنفيذ (تعذّر `npm install`/`prisma generate`/`tsc --noEmit`
الحقيقي)، فلم يتم **تجميع (compile) أو تشغيل الاختبارات فعليًا** على هذه التعديلات.
كل تعديل روجع يدويًا بعناية (فحص الأنواع، تتبع كل استخدام لكل رمز مُعدَّل)، لكن يُنصح
بشدة بتشغيل `npm run build` و`npm test` على نسختك المحلية قبل الدمج، وتشغيل
`npx prisma migrate deploy` (أو `migrate dev` بالتطوير) لتطبيق الميغريشنز الجديدتين.
