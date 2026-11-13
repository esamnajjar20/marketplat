# تغييرات الأداء (مراجعة التقرير)

## قوائم → FlashList
- following / my-stores / sessions / ads / profile/[id]: صارت PageList مع صفوف memo.
- sales-costs: AppFlashList + صف memo + مسوّدات في الـ parent + معالجات ثابتة.

## memo والـ callbacks
- HorizontalMarketCard: دعم id + onPressItem؛ أقسام الرئيسية تستعمل معالجات ثابتة؛ StoreCard صار memo.

## السكرول
- useOnlineResync: خيار deferWhileScrolling (مفعّل لقسمي الرئيسية فقط).

## الصور
- src/lib/image-variants.ts: نسخة 480px من Cloudinary لصور القوائم (مع اختبار).
- AppImage (variant="list"): يستعمل النسخة المصغّرة ويعود للأصل عند فشلها.
- variant="list" على ~15 صورة صغيرة فقط (لا العريضة ولا المحررات).

## عمدًا لم يُطبَّق
- getItemLayout: ارتفاع البطاقات غير ثابت وFlashList v2 لا يستعمله.
- TanStack Query: تغيير معماري؛ التطبيق يعتمد useAsyncResource/usePaginatedList.
- store-team / store-promotions / store-collections / stores/[id]: قوائم صغيرة ومحدودة داخل شاشات نماذج/تبويبات.

## قبل الدمج
pnpm type-check:mobile && pnpm test:mobile && pnpm --filter @marketplat/mobile lint
واختبر يدويًا: sales-costs (الكتابة داخل الصفوف)، حقل البحث في ads، وتحميل الصور على حساب Cloudinary الفعلي.
