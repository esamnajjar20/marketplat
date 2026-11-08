# إصلاح تعطل تغيير الفلاتر والتنقل داخل القوائم

## التشخيص المؤكد

المشكلة كانت في الدالة المشتركة `frontend/lib/urlWithParams.ts` داخل `writeClientUrl()`، وليس في كل صفحة فلترة على حدة.

قبل الإصلاح كانت الدالة تستدعي:

```ts
window.history[method](window.history.state, '', nextUrl);
```

في Next.js `15.5.29`، يقوم App Router بتركيب طبقة على `history.pushState` و`history.replaceState`. إذا كانت قيمة الوسيط الأول تحمل علامة `__NA` أو `_N`، يتعامل Next معها ككتابة داخلية صادرة منه ويعود مباشرةً دون مزامنة عنوان URL الجديد مع حالة Router. هذا موضح في مصدر النسخة المثبتة من Next.js في `packages/next/src/client/components/app-router.tsx`، داخل معالجي `pushState` و`replaceState` (تجاوز `__NA` / `_N` في السطرين 342 و364 تقريبًا، ثم نسخ حالة Router ومزامنة الرابط عندما تكون البيانات الخارجية بلا هذه العلامات).

حالة `window.history.state` في صفحة App Router تحتوي عادةً علامة `__NA`. لذلك كان العنوان يتغير عبر History API، لكن تحديث `useSearchParams()` لا يصل إلى مكونات القوائم. وبما أن عدة صفحات ومكونات تشترك في `writeClientUrl()`، ظهر العطل على مستوى الموقع.

## الإصلاح

أصبحت الدالة تستدعي:

```ts
window.history[method](null, '', nextUrl);
```

هذا هو النمط الذي توثقه Next.js للـ Native History API. عندما تكون الحالة `null`، لا يتفعل تجاوز الكتابة الداخلية؛ ينسخ Next.js بياناته الداخلية من سجل الصفحة الحالي إلى المدخل الجديد، ثم يزامن `useSearchParams()` و`usePathname()` مع الرابط الجديد.

## نطاق الأثر

الإصلاح مشترك ويغطي **41 ملف مصدر و97 موضع استدعاء** لـ `writeClientUrl()` في النسخة المرفوعة، ومنهم فلاتر وترتيب وقوائم:

- البحث والإعلانات والمنتجات والمتاجر والخدمات.
- الطلبات وقوائم الحساب والخدمات والمخزون.
- المفضلة والملف الشخصي ولوحات الإدارة.
- الترقيم وتبديل طريقة عرض القوائم.

لم أغير فلاتر الصفحات نفسها، أو شروط API، أو مفاتيح React Query؛ المطلوب أن تصل حالة URL الجديدة إلى المكونات كما صُمم أصلًا، فتُشتق مفاتيح الاستعلام والنتائج من القيم الجديدة.

## التحقق

- أضيف اختبار regression يتأكد من تمرير `null` حتى لا تُمرر علامة Next الداخلية إلى History API.
- تم التحقق من صياغة ملفات TypeScript المتغيرة باستخدام TypeScript transpile.
- لم تُشغّل Vitest أو `tsc --noEmit` أو بناء Next في هذه البيئة لعدم توفر `node_modules`.
- يلزم بعد النشر التحقق من أن اختيار فلتر يحدّث URL وواجهة النتائج دون طلب RSC إضافي، مع بقاء طلب API اللازم للنتائج الجديدة.

## مرجع Next.js

- توثيق Native History API: https://nextjs.org/docs/app/getting-started/linking-and-navigating#native-history-api
- مصدر Next.js 15.5.29: https://github.com/vercel/next.js/blob/v15.5.29/packages/next/src/client/components/app-router.tsx
