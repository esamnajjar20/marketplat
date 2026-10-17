# نظام التحميل الموحّد

مصدر واحد لكل حالات الانتظار. **لا تستورد `Loader2`/`LoaderCircle` مباشرة، ولا تكتب `animate-spin` يدوياً.**

| الحالة | الأداة |
|---|---|
| زر ينتظر عملية (حفظ/حذف/إرسال) | `<Button loading loadingText={LOADING_COPY.saving}>` |
| مؤشر صغير داخل نص/أيقونة/تحميل المزيد | `<Spinner size="xs\|sm\|md" />` |
| تحميل أول لقائمة/قسم داخل صفحة | `<LoadingGate loading={isLoading} fallback={<…Skeleton/>}>` |
| تحميل مسار كامل (`loading.tsx`) | `<PageLoadingState variant="cards\|list\|detail\|table\|minimal" />` |
| قسم أو صفحة بحجم كامل (مؤشر فقط) | `<LoadingSpinner fullPage \| overlay />` |
| قرار مخصّص «اعرض المؤشر؟» | `useDelayedLoading(isLoading)` |
| نصوص التحميل | `LOADING_COPY` من `@/lib/loadingCopy` |

## القواعد
1. **`isLoading` للتحميل الأول فقط** (لا بيانات بعد) ⇒ هيكل Skeleton. **`isFetching`** (تحديث خلفي) ⇒ لا هيكل؛ مؤشر صغير أو لا شيء. أنماط `keepPreviousData` تبقى كما هي.
2. **لا وميض:** أي مؤشر يظهر بعد 500ms ويبقى 500ms على الأقل (`useDelayedLoading` / `.loading-delayed`). الهيكل يحجز مكانه فوراً فلا قفزة تخطيط.
3. **إعلان واحد لقارئ الشاشة:** `role="status"` على الحاوية فقط؛ الـ Spinner بدون `label` زخرفي (`aria-hidden`). لا تضع `label` على Spinner داخل حاوية status.
4. **`prefers-reduced-motion`:** مدعوم داخل Spinner وCSS التأخير؛ لا حاجة لشيء إضافي.
5. **`RefreshCw`** الدوّارة في أزرار «تحديث» أيقونة معنوية (إعادة تحميل) وليست مؤشر انتظار — تبقى كما هي.

## تفعيل `loading.tsx` (قرار منفصل)
ملفات `loading.tsx.disabled` الخمسة في `app/(public)` معطّلة عمداً (انظر تعليق `PageTransition`: تجنّب الوميض). `PageLoadingState` الآن لا يومض (CSS فقط، 500ms)، فإعادة التفعيل = إزالة اللاحقة `.disabled`. اختبرها على `/ads` أولاً (تعليق @418-FIX في `app/(public)/ads/page.tsx`).
