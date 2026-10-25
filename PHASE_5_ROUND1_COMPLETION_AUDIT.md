# Marketplat — تدقيق استكمال الملفات المتبقية، الجولة الخامسة (1)

التاريخ: 2026-10-15

## النطاق والنتيجة

تمت مراجعة قائمة الـ95 ملف اختبار الواردة في `marketplat_plan_all_95_remaining_tests.md` ومقارنتها بالنسخة الأصلية وبآخر حزمة المرحلة الرابعة.

- المرحلة 1: تغيّر/عولجت ملفات الاختبار الـ19 من أصل 19.
- المرحلة 2: تغيّر/عولجت ملفات الاختبار الـ19 من أصل 19.
- المرحلة 3: تغيّر/عولجت ملفات الاختبار الـ19 من أصل 19.
- المرحلة 4: تغيّر/عولجت ملفات الاختبار الـ19 من أصل 19.
- المرحلة 5: تغيّر 18 ملف اختبار من أصل 19. ملف `__tests__/unit/lib/prefetch.test.ts` بقي كما هو لأن توقعات TTL فيه صحيحة؛ تم إصلاح تنفيذ الإنتاج `lib/prefetch.ts` ليتوافق معها.

هذه الأرقام تقيس المراجعة والتعديلات على الملفات مقارنةً بالنسخة الأصلية، **ولا تعني أن الاختبارات أصبحت ناجحة**. لا يمكن إعلان اكتمال الإصلاح النهائي قبل تشغيل Vitest.

## تغييرات هذه الجولة

1. `lib/prefetch.ts`: توحيد `staleTime` في prefetch التصنيفات وقائمة الإعلانات وتفاصيل الإعلان مع `CACHE_TTL`؛ أصلح ذلك عدم تطابق TTL الذي كانت اختبارات `prefetch.test.ts` تكشفه.
2. `lib/pwa.ts`: أصبحت ذاكرة منع تكرار تسجيل Service Worker مرتبطة بكائن `ServiceWorkerContainer` نفسه، بدلًا من مشاركة نتيجة استدعاء سابق من بيئة غير مدعومة أو من حاوية مختلفة.
3. `__tests__/unit/lib/pwa.test.ts`: إضافة اختبار رجعي للتحقق من إمكانية التسجيل بعد استدعاء سابق في بيئة غير مدعومة.
4. `__tests__/unit/lib/offlineMessagesStore.test.ts`: نقل إشارة اكتمال المعاملة الوهمية إلى macrotask، كي تُسجّل معالجات `oncomplete` قبل إطلاق الحدث ولا ينتهي الاختبار بمهلة زمنية.
5. `__tests__/unit/lib/offlineQueue.test.ts`: تثبيت عقد السلامة المهم—أن نقاط المصادقة والحضور والتحليلات والنقل المجمّع لا تُضاف إلى الطابور—دون افتراض سبب رفض داخلي واحد لكل نقطة.
6. `__tests__/components/OfflineBootstrap.test.tsx`: جعل mock لدورة الشبكة يرسل حدث الاتصال فعلًا، وإزالة الاعتماد على استدعاء تهيئة عالمي لمرة واحدة من اختبار mount مستقل.
7. `__tests__/components/search/SearchResults.test.tsx` و`__tests__/components/StoresGrid.test.tsx`: تحديث الاختبارات لتتعامل مع `useInfiniteQuery` وصفحات النتائج و`InfiniteScrollTrigger` بدل واجهات hooks القديمة التي لم تعد تستخدمها المكونات.
8. اختبارات الفلاتر والفرز: إصلاح mock `router.replace`، وفتح قائمة Select الصحيحة قبل فحص الخيارات، واختيار محدد المدينة الصحيح، وتفعيل GPS داخل اختباراته فقط مع بقاء علم الإنتاج معطّلًا افتراضيًا.
9. اختبارات واجهة أخرى: تحديث رسالة تسجيل الدخول في `SellerCard`، والتحقق من shimmer الفعلي في `SellerTodayTasks`، والسماح بتكرار ظهور اسم المدينة في `StoreHeader`، واختبار لوحة المراجعات بعد اختيار تبويبها، وتقوية فحص شبكة المتاجر المحمولة، وتحديث توقع fallback لرسائل المحادثة.

## الملفات التي تغيّرت في هذه الجولة

- `apps/web/lib/prefetch.ts`
- `apps/web/lib/pwa.ts`
- `apps/web/__tests__/components/OfflineBootstrap.test.tsx`
- `apps/web/__tests__/components/SellerCard.test.tsx`
- `apps/web/__tests__/components/SellerTodayTasks.test.tsx`
- `apps/web/__tests__/components/ServiceCategoryFilter.test.tsx`
- `apps/web/__tests__/components/StoreHeader.test.tsx`
- `apps/web/__tests__/components/StoreStorefront.test.tsx`
- `apps/web/__tests__/components/StoresFilters.test.tsx`
- `apps/web/__tests__/components/StoresGrid.test.tsx`
- `apps/web/__tests__/components/ads/SearchSortBarWrapper.test.tsx`
- `apps/web/__tests__/components/search/SearchNearbyToggle.test.tsx`
- `apps/web/__tests__/components/search/SearchResults.test.tsx`
- `apps/web/__tests__/components/search/SearchSortBarWrapper.test.tsx`
- `apps/web/__tests__/components/shared/DetailSafetyTips.test.tsx`
- `apps/web/__tests__/components/shared/SearchSortBar.test.tsx`
- `apps/web/__tests__/components/stores/SearchSortBarWrapper.test.tsx`
- `apps/web/__tests__/unit/hooks/useNotificationsReportsConversations.test.tsx`
- `apps/web/__tests__/unit/lib/offlineMessagesStore.test.ts`
- `apps/web/__tests__/unit/lib/offlineQueue.test.ts`
- `apps/web/__tests__/unit/lib/pwa.test.ts`

## التحقق

- فحص تحويل TypeScript/TSX للصياغة: **97/97 ملفًا** من ملفات الاختبار المخططة وملفي الإنتاج `prefetch.ts` و`pwa.ts` اجتازت التحويل دون أخطاء صياغية.
- لم تُشغّل اختبارات Vitest: `apps/web/node_modules/.bin/vitest` و`apps/api/node_modules/.bin/vitest` غير موجودين في هذه البيئة.
- لذلك لا توجد نتيجة تشغيل تؤكد نجاح الاختبارات، ولم يتم الادعاء بأن CI أصبح أخضر.

## المتبقي لإغلاق العمل نهائيًا

1. تثبيت الاعتماديات من ملفات القفل في بيئة تسمح بذلك.
2. تشغيل ملفات الاختبار الـ95 فرديًا ثم المجموعة كاملة.
3. إصلاح أي إخفاقات جديدة اعتمادًا على رسالة الفشل الفعلية، ثم تشغيل lint وtype-check وbuild واختبار الخادم `tests/unit/pushService.test.ts`.
