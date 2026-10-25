# Marketplat — تقرير المرحلة الأولى: API وHooks وطبقة البيانات

## الحالة

- **تم تنفيذ جولة الإصلاح الأولى** على ملفات المرحلة الأولى الـ19.
- **لم يتم اعتماد المرحلة نهائيًا بعد** لأن تشغيل Vitest غير متاح في بيئة العمل الحالية: `vitest: not found`، ومجلد `apps/web/node_modules` غير موجود/غير مكتمل. لذلك لا أصف الاختبارات بأنها ناجحة.
- فحصت صياغة TypeScript/TSX للملفات المعدّلة باستخدام TypeScript transpile: **23 ملفًا تم تحليلها دون أخطاء صياغية**. هذا فحص صياغة فقط وليس بديلًا عن type-check أو الاختبارات.

## أهم التغييرات

1. **For You feed** (`lib/forYouFeed.ts`): الحفاظ على ترتيب الأولوية بحيث تظهر العناصر المرتبة من التوصيات قبل عناصر fallback؛ قبل الإصلاح كان ترتيب المزج قد يقدّم fallback على عنصر ranked. أصبحت الدالة تتعامل أيضًا مع مصدر علوي فارغ (`null`/`undefined`).
2. **Presence query** (`api/users.api.ts`, `hooks/queries/usePresence.ts`): تمرير `AbortSignal` إلى طلب الحضور الجماعي لدعم إلغاء React Query للطلبات غير اللازمة.
3. **Pagination metadata** (`lib/apiPagination.ts`): الصفحة الفارغة offline تعيد `totalPages: 0` بدل `1` عندما يكون عدد العناصر صفرًا.
4. **تصحيح اختبارات متقادمة** لتطابق العقود الحالية بدل إجبار التطبيق على سلوك قديم:
   - اختبارات API/hooks تراعي وسيط `signal` الاختياري في React Query.
   - اختبارات saved searches تستخدم القيمة التي تعيدها طبقة API بعد فك غلاف Axios، لا غلاف Axios نفسه.
   - اختبارات GPS تراعي سياسة عدم طلب الموقع تلقائيًا حتى عند منح الإذن؛ جلب GPS يتم بعد إجراء صريح.
   - اختبارات favorites تنتظر اكتمال `onMutate` غير المتزامن، وتتحقق من الاحتفاظ بآخر نية optimistic عند الفشل بدل استعادة snapshot قديم.
   - اختبارات mutation تميّز أخطاء HTTP عن أخطاء الشبكة التي تُعامل كحالة offline.
   - تحديث توقعات مفاتيح الإبطال لتطابق root-prefix invalidation الحالي.
   - اختبار FormData يقيس ترويسة الطلب بعد interceptor عبر adapter مخصص، لتجنّب تعليق XHR/MSW في jsdom مع multipart.

## ملفات المرحلة الأولى التي شملتها الجولة

- `__tests__/unit/api/client.test.ts`
- `__tests__/unit/api/stores.api.test.ts`
- `__tests__/hooks/useLocationResolver.test.tsx`
- `__tests__/hooks/useOnlineStatus.test.tsx`
- `__tests__/unit/forYouFeed.test.ts`
- `__tests__/unit/hooks/useAdMutations.test.tsx`
- `__tests__/unit/hooks/useAdminMutations.test.tsx`
- `__tests__/unit/hooks/useAds.test.tsx`
- `__tests__/unit/hooks/useAppointmentMutations.test.tsx`
- `__tests__/unit/hooks/useCategoriesAndListings.test.tsx`
- `__tests__/unit/hooks/useFavoriteLists.test.ts`
- `__tests__/unit/hooks/useFavorites.test.tsx`
- `__tests__/unit/hooks/useMoreQueries.test.tsx`
- `__tests__/unit/hooks/useNotificationsReportsConversations.test.tsx`
- `__tests__/unit/hooks/usePresence.test.tsx`
- `__tests__/unit/hooks/useProductMutations.test.tsx`
- `__tests__/unit/hooks/useProductServiceStoreRecommendations.test.tsx`
- `__tests__/unit/hooks/usePromotionMutations.test.tsx`
- `__tests__/unit/hooks/useSavedSearches.test.tsx`

## بوابة القبول المتبقية

قبل اعتبار المرحلة مغلقة، شغّل في بيئة فيها الاعتماديات المثبتة:

```bash
cd apps/web
npm ci
npm test -- --run __tests__/unit/api/client.test.ts __tests__/unit/api/stores.api.test.ts __tests__/hooks/useLocationResolver.test.tsx __tests__/hooks/useOnlineStatus.test.tsx __tests__/unit/forYouFeed.test.ts __tests__/unit/hooks/useAdMutations.test.tsx __tests__/unit/hooks/useAdminMutations.test.tsx __tests__/unit/hooks/useAds.test.tsx __tests__/unit/hooks/useAppointmentMutations.test.tsx __tests__/unit/hooks/useCategoriesAndListings.test.tsx __tests__/unit/hooks/useFavoriteLists.test.ts __tests__/unit/hooks/useFavorites.test.tsx __tests__/unit/hooks/useMoreQueries.test.tsx __tests__/unit/hooks/useNotificationsReportsConversations.test.tsx __tests__/unit/hooks/usePresence.test.tsx __tests__/unit/hooks/useProductMutations.test.tsx __tests__/unit/hooks/useProductServiceStoreRecommendations.test.tsx __tests__/unit/hooks/usePromotionMutations.test.tsx __tests__/unit/hooks/useSavedSearches.test.tsx
```

ثم شغّل type-check وlint. إذا بقي أي فشل، يُصلح بناءً على الخطأ الجديد الفعلي قبل بدء المرحلة الثانية.
