# اختبارات رفع تغطية الفرونت إند — الدفعة الأولى

## الهدف
بدء سد فجوات التغطية للوصول إلى **80%** (الهدف الحالي في `vitest.config.ts` هو 75%).

## الملفات المضافة

انسخ محتويات `__tests__/` إلى مجلد `frontend/__tests__/` في المشروع (دمج مع الموجود).

### Components (كانت 0%)
| الملف | يغطي |
|-------|------|
| `FavoriteListsSidebar.test.tsx` | إنشاء / إعادة تسمية / حذف قوائم، اختيار قائمة، loading |
| `AssignFavoriteToListDialog.test.tsx` | حل favoriteId، تعيين لقائمة، إنشاء قائمة، تخطي |
| `MoveToListMenu.test.tsx` | قائمة النقل، تعطيل القائمة الحالية، حالة فارغة |
| `FavoritesPageLayout.test.tsx` | العنوان + الشريط + التبويبات |
| `NotificationsPage.test.tsx` | تبويبات، تعليم الكل، مسح المقروء، offline، load-more |
| `NotificationToasts.test.tsx` | toasts للأحداث الحرجة عبر SSE |
| `DownloadsPageClient.test.tsx` | عرض التحميلات، فتح offline، حذف، مسح السجل |
| `LegalPageShell.test.tsx` | صفحات قانونية + روابط التنقل |
| `SkipLink.test.tsx` | رابط تخطي إلى المحتوى |

### Unit — hooks / api / lib (كانت 0%)
| الملف | يغطي |
|-------|------|
| `useFavoriteLists.test.ts` | تفعيل الاستعلام حسب المصادقة |
| `useFavoriteListMutations.test.ts` | create/rename/delete/move + toasts |
| `useDataSaver.test.ts` | حالة data-saver + أحداث التخزين |
| `favorite-lists.api.test.ts` | list/create/rename/remove/moveFavorite |
| `ads-republish.api.test.ts` | POST republish |
| `products-stock.api.test.ts` | PATCH stock |
| `serviceQuoteStatus.test.ts` | تسميات وحالات عرض عروض الخدمة |
| `profileSurface.test.ts` | ألوان أسطح الملف الشخصي |

## التشغيل

```bash
cd frontend
# انسخ ملفات الاختبار أولاً
cp -r ../path-to/frontend-tests/__tests__/* __tests__/

npm run test -- FavoriteListsSidebar AssignFavorite MoveToList FavoritesPage Notifications NotificationToasts DownloadsPage LegalPage SkipLink useFavoriteLists useFavoriteListMutations useDataSaver favorite-lists ads-republish products-stock serviceQuoteStatus profileSurface

# أو التغطية الكاملة
npm run test:coverage
```

## التأثير المتوقع على التغطية

| المجال | أسطر كانت غير مغطاة (تقريبي) | بعد هذه الدفعة |
|--------|------------------------------|----------------|
| favorites (components + hooks + api) | ~650+ | مغطى بالكامل تقريباً |
| notifications | ~260+ | مغطى بالكامل تقريباً |
| downloads | ~119 | مغطى |
| shared/legal + a11y | ~40 | مغطى |
| api الصغيرة + lib constants | ~50 | مغطى |

**تقدير**: هذه الدفعة تغطي نحو **1100–1500 سطر** كانت عند 0%، ما يرفع النسبة الكلية بعدة نقاط مئوية (حسب وزنها في المجموع).

## الدفعة التالية (موصى بها)
1. **Stores**: `ProductDetail`, `MyStoreInventory`, `MyStoreMembersList`, `MyStoreHub`
2. **Payments**: `SavedPaymentsPageClient`, `QrCodeImage`, `PayWithQRDialog` (مع mocks للكاميرا/QR)
3. **Admin**: `AdminServiceListingsTable`, `AdminProductsTable`, `AdminOpsQueue`
4. **Offline/Capacitor**: `lib/offline*`, `lib/capacitor/*` مع mocks

## ملاحظات
- الأنماط مطابقة لاختبارات المشروع الحالية (Vitest + Testing Library + `setupUser`).
- كل الـ hooks والـ API تُعمل mock — لا حاجة لخادم حقيقي.
- بعض اختبارات UI تعتمد على نصوص عربية ظاهرة في المكونات؛ إن تغيّرت النصوص حدّث الـ matchers.
