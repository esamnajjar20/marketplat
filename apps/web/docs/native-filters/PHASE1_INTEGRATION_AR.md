# Phase 1 — فلاتر Native: دليل الدمج الكامل

## هيكل التسليم

```
native-filters/
├── types/filter.types.ts
├── lib/filterUrl.ts
├── lib/capacitor/nativeHaptics.ts
├── store/filter.store.ts
├── components/search/
│   ├── NativeFilterSheet.tsx      ← بديل SearchFiltersSheet (موبايل)
│   ├── QuickFiltersBar.tsx        ← شريط chips سريعة
│   ├── SearchFilters.tsx          ← لوحة الديسكتوب (محدثة)
│   └── SearchActiveFilters.tsx    ← chips النشطة (محدثة)
├── app/search/page.patch.tsx      ← مرجع تعديل صفحة البحث
├── __tests__/filterUrl.test.ts
└── docs/PHASE1_INTEGRATION_AR.md
```

انسخ كل ملف إلى المسار المقابل تحت `apps/web/`:

| المصدر | الوجهة |
|--------|--------|
| `types/filter.types.ts` | `apps/web/types/filter.types.ts` |
| `lib/filterUrl.ts` | `apps/web/lib/filterUrl.ts` |
| `lib/capacitor/nativeHaptics.ts` | `apps/web/lib/capacitor/nativeHaptics.ts` |
| `store/filter.store.ts` | `apps/web/store/filter.store.ts` |
| `components/search/*` | `apps/web/components/search/*` (استبدال عند التطابق) |
| `__tests__/filterUrl.test.ts` | `apps/web/__tests__/lib/filterUrl.test.ts` |

---

## خطوات الدمج

### 1) Haptics (Native فقط)

```bash
cd apps/web
npm i @capacitor/haptics
npx cap sync
```

بدون الحزمة يعمل التطبيق؛ الاهتزاز يصبح no-op.

### 2) صفحة البحث

في `app/(public)/search/page.tsx`:

```diff
- import { SearchFiltersSheet } from '@/components/search/SearchFiltersSheet';
+ import { NativeFilterSheet } from '@/components/search/NativeFilterSheet';
+ import { QuickFiltersBar } from '@/components/search/QuickFiltersBar';
```

```diff
- <SearchFiltersSheet />
+ <NativeFilterSheet />
```

أضف بعد شريط التصفية/الترتيب:

```tsx
<Suspense>
  <QuickFiltersBar />
</Suspense>
```

راجع الملف الكامل: `app/search/page.patch.tsx`.

### 3) استبدال المكوّنات

- استبدل `SearchFilters.tsx` بالنسخة الجديدة (presets سعر + helpers موحّدة).
- استبدل `SearchActiveFilters.tsx` (تسميات أوضح للترتيب والحالة + نطاق كم).
- يمكنك الإبقاء على `SearchFiltersSheet.tsx` مؤقتاً دون استخدامه.

### 4) الاختبارات

```bash
cd apps/web
npx vitest run __tests__/lib/filterUrl.test.ts
```

---

## ملخص السلوك

| السطح | متى يُحدَّث الـ URL |
|-------|---------------------|
| NativeFilterSheet (موبايل) | عند «عرض النتائج» فقط (draft في Zustand) |
| SearchFilters (ديسكتوب) | فوراً عند كل تغيير (replace) |
| QuickFiltersBar | فوراً عند الضغط على chip |
| SearchActiveFilters | حذف chip → replace فوري |

---

## Checklist قبول Phase 1

- [ ] موبايل: فتح Sheet → تعديل → عرض النتائج → URL مرة واحدة
- [ ] موبايل: Quick chips تعمل (قريب مني / سعر / جديد)
- [ ] ديسكتوب: الشريط الجانبي يحدّث النتائج فوراً
- [ ] Chips النشطة تعرض «قريب مني (10 كم)» وسم ترتيب عربي
- [ ] مسح الكل يحافظ على `q` و `type`
- [ ] Android: haptic عند الفتح والتطبيق
- [ ] Web: لا أخطاء Capacitor في الـ console
- [ ] `vitest` لـ filterUrl يمر

---

## Phase 2 (التالي)

1. **Facet counts** من Backend (عدد لكل مدينة/فئة داخل الـ Sheet)
2. **Saved filter presets** مرتبطة بـ `saved-searches`
3. **Attributes ديناميكية** حسب الفئة
4. تخزين Preferences عبر `@capacitor/preferences` بدل localStorage فقط
5. Playwright: سيناريو تصفية كامل على viewport 390px

---

## ملاحظات تقنية

- `NativeFilterSheet` يعتمد على `Sheet` الموجود في `components/shared/ui/Sheet` أو `components/ui/sheet` — تأكد من مسار الاستيراد في مشروعك (قد يكون أحدهما re-export للآخر).
- إن كان مسار الـ Sheet هو `@/components/ui/sheet` عدّل الاستيراد في `NativeFilterSheet.tsx`.
- `CONDITION_LABELS` من `@/lib/constants` يجب أن يبقى متوافقاً مع `filter.types.ts`.

## سياسة GPS
هذه الحزمة **بدون GPS**. راجع GPS_FREE_POLICY_AR.md.
