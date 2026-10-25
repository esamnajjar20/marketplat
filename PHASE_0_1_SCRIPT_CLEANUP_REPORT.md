# MarketPlat — ملفات المراحل السابقة وتنظيف السكربتات

## نطاق العمل
- طُبقت ملفات التسليم السابقة المتاحة في هذه المحادثة: إصلاح أداتي تدقيق المراقبة في Phase 0، ودفعة رموز التصميم في Phase 1.
- حُذفت ملفات السكربت الموجودة تحت `apps/web/scripts/` التي لا يرد اسمها في `apps/web/package.json`. لم تُحذف ملفات خارج هذا المجلد.
- معيار الحذف كان ظهور اسم الملف حرفيًا في `apps/web/package.json`، وليس تحليل كل الاستدعاءات الممكنة داخل ملفات أخرى.

## الملفات المعدّلة/المضافة من المراحل السابقة
- `apps/web/app/globals.css`
- `apps/web/package.json`
- `apps/web/scripts/design-system-token-contract-audit.mjs`
- `apps/web/scripts/device-error-monitor-audit.mjs`
- `apps/web/scripts/network-request-monitor-audit.mjs`

## السكربتات المحذوفة
- `apps/web/scripts/cache-layer-audit.mjs`
- `apps/web/scripts/favorite-optimistic-race-audit.mjs`
- `apps/web/scripts/favorite-session-cache-consistency-audit.mjs`
- `apps/web/scripts/followed-store-cache-consistency-audit.mjs`
- `apps/web/scripts/homepage-entity-cache-consistency-audit.mjs`
- `apps/web/scripts/mutation-rollback-concurrency-audit.mjs`
- `apps/web/scripts/offline-all-operations-audit.mjs`
- `apps/web/scripts/offline-idempotency-contract-audit.mjs`
- `apps/web/scripts/offline-queue-resilience-audit.mjs`
- `apps/web/scripts/periodic-network-lifecycle-audit.mjs`
- `apps/web/scripts/product-status-cache-consistency-audit.mjs`
- `apps/web/scripts/promotion-invalidation-scope-audit.mjs`
- `apps/web/scripts/query-abort-signal-audit.mjs`
- `apps/web/scripts/query-abort-signal-phase12-audit.mjs`
- `apps/web/scripts/query-abort-signal-phase13-audit.mjs`
- `apps/web/scripts/query-invalidation-semantic-audit.mjs`
- `apps/web/scripts/request-dedup-concurrency-audit.mjs`
- `apps/web/scripts/service-listing-status-cache-consistency-audit.mjs`
- `apps/web/scripts/session-queue-lifecycle-fence-audit.mjs`
- `apps/web/scripts/session-queue-owner-isolation-audit.mjs`
- `apps/web/scripts/store-profile-cache-consistency-audit.mjs`
- `apps/web/scripts/sync-cache-policy.mjs`
- `apps/web/scripts/toggle-ordering-lifecycle-audit.mjs`
- `apps/web/scripts/warming-scheduler-lifecycle-audit.mjs`

## العدد
- ملفات السكربت المحذوفة: **24**
- ملفات المراحل السابقة التي طُبقت: **5**

## ملاحظات التحقق
- لم يتم حذف السكربتات المذكورة في `apps/web/package.json` وفق معيار الاسم أعلاه.
- لم يتم تشغيل build أو type-check أو Vitest؛ لا توجد `node_modules` ضمن الأرشيف الأصلي.
- لا يحتوي ZIP الأصلي على `.git`؛ لذلك لا يمكن التحقق من سجل Git أو استعادة ملفات من commits عبر هذا الأرشيف وحده.
- حذف سكربت غير مذكور في package.json قد يؤثر إذا كان ملف آخر يستدعيه مباشرة؛ راجع قائمة الحذف قبل الدمج النهائي.
