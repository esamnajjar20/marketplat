# Phase 3 — ملخص التسليم

## المحتوى

| الملف | الوظيفة |
|--------|---------|
| `lib/filterSavedSearch.ts` | تحويل state ↔ SavedSearchFilters + تسمية تلقائية |
| `lib/filterAnalytics.ts` | أحداث فلاتر عبر track SEARCH + metadata |
| `components/search/SaveFilterPresetButton.tsx` | حفظ البحث الحالي (API موجود) |
| `types/categoryAttributes.ts` | نموذج خصائص ديناميكية + parse/write لـ attr.* |
| `components/search/CategoryAttributesFilter.tsx` | UI للخصائص حسب الفئة |
| `docs/PHASE3_INSTRUMENTATION.md` | أين تُزرع الأحداث والخصائص |
| `docs/PHASE3_SUMMARY_AR.md` | هذا الملف |

## لماذا بدون migration الآن؟

- **Saved searches**: الـ Backend جاهز (POST /saved-searches) — نربط الواجهة فقط.
- **Analytics**: توسيع Prisma AnalyticsEventType يحتاج migration؛ نستخدم SEARCH + metadata غني.
- **Attributes**: يحتاج schema على Category/Ad — نجهّز العقد والـ UI بـ map ثابت للتجربة.

## Checklist

- [ ] زر «حفظ البحث» يظهر عند وجود فلاتر نشطة
- [ ] المستخدم المسجّل يحفظ ويسترجع من /saved-searches
- [ ] أحداث filter_apply / quick_filter تظهر في batch التحليلات (مع موافقة)
- [ ] CategoryAttributesFilter لا يعرض شيئاً حتى تُملأ CATEGORY_ATTRIBUTE_SCHEMAS

## Phase 4 (اختياري)

- Radius slider + خريطة في الـ Sheet
- Multi-select للفئات
- A/B لترتيب أقسام الـ Sheet
- توسيع facets لـ UNION كل الكيانات
- Prisma enum لأحداث الفلاتر إن لزم تقارير أدق
