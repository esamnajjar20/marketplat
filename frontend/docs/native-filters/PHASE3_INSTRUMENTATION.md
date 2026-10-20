# Phase 3 — Instrumentation في المكوّنات الحالية

## 1) عند تطبيق الفلاتر من NativeFilterSheet

في `handleApply`:

```ts
import { trackFilterEvent } from '@/lib/filterAnalytics';

// بعد بناء params وقبل closeSheet:
trackFilterEvent({
  action: 'filter_apply',
  activeCount: count,
  type: draft.type,
  city: draft.city,
  categoryId: draft.categoryId,
  condition: draft.condition,
  sort: draft.sort,
  nearby: draft.lat != null,
  keys: ['city', 'categoryId', 'minPrice', 'maxPrice', 'condition', 'sort', 'lat']
    .filter((k) => {
      if (k === 'lat') return draft.lat != null;
      if (k === 'sort') return Boolean(draft.sort && draft.sort !== 'relevance');
      return (draft as Record<string, unknown>)[k] != null && (draft as Record<string, unknown>)[k] !== '';
    }),
});
```

عند `handleOpen`:

```ts
trackFilterEvent({ action: 'sheet_open', type: draft.type });
```

عند `handleReset`:

```ts
trackFilterEvent({ action: 'filter_reset' });
```

## 2) QuickFiltersBar

بعد نجاح `applyPreset`:

```ts
trackFilterEvent({
  action: 'quick_filter',
  presetId: preset.id,
  presetLabel: preset.label,
});
```

## 3) SaveFilterPresetButton

يُرسل `save_preset` تلقائياً داخل المكوّن.

## 4) صفحة البحث — زر الحفظ

```tsx
import { SaveFilterPresetButton } from '@/components/search/SaveFilterPresetButton';
import { useAuthStore } from '@/store/auth.store'; // أو ما يعادله

// بجانب SearchActiveFilters:
<SaveFilterPresetButton isAuthenticated={Boolean(user)} />
```

## 5) CategoryAttributesFilter

أضفه داخل قسم «خيارات أكثر» في الـ Sheet والشريط الجانبي:

```tsx
<CategoryAttributesFilter categoryId={draft.categoryId} />
```

أو في draft mode:

```tsx
<CategoryAttributesFilter
  categoryId={draft.categoryId}
  draftMode
  draftAttrs={draftAttrs}
  onDraftChange={setDraftAttrs}
/>
```

ثم عند Apply ادمج `attr.*` في URL عبر `writeAttributesToParams`.

## 6) Backend attributes (لاحقاً)

1. Migration: `Category.attributeSchema Json?`, `Ad.attributes Json?`
2. Admin UI لتحرير schema
3. search.validation: قبول `attr.*` أو `attributes` object
4. search.repository: فلترة JSON بـ Prisma path filters أو raw SQL

حتى ذلك الحين الواجهة جاهزة والـ schema الثابت `CATEGORY_ATTRIBUTE_SCHEMAS` يكفي للتجربة على فئات محددة.
EOF

cat > /home/workdir/artifacts/native-filters/docs/PHASE3_SUMMARY_AR.md << 'EOF'
# Phase 3 — ملخص التسليم

## المحتوى

| الملف | الوظيفة |
|--------|---------|
| `lib/filterSavedSearch.ts` | تحويل state ↔ SavedSearchFilters + تسمية تلقائية |
| `lib/filterAnalytics.ts` | أحداث فلاتر عبر `track('SEARCH', { source: 'native_filters', action })` |
| `components/search/SaveFilterPresetButton.tsx` | حفظ البحث الحالي (API موجود) |
| `types/categoryAttributes.ts` | نموذج خصائص ديناميكية + parse/write لـ `attr.*` |
| `components/search/CategoryAttributesFilter.tsx` | UI للخصائص حسب الفئة |
| `docs/PHASE3_INSTRUMENTATION.md` | أين تُزرع الأحداث والخصائص |
| `docs/PHASE3_SUMMARY_AR.md` | هذا الملف |

## لماذا بدون migration الآن؟

- **Saved searches**: الـ Backend جاهز (`POST /saved-searches`) — نربط الواجهة فقط.
- **Analytics**: توسيع Prisma `AnalyticsEventType` يحتاج migration؛ نستخدم `SEARCH` + metadata غني.
- **Attributes**: يحتاج schema على Category/Ad — نجهّز العقد والـ UI بـ map ثابت للتجربة.

## Checklist

- [ ] زر «حفظ البحث» يظهر عند وجود فلاتر نشطة
- [ ] المستخدم المسجّل يحفظ ويسترجع من `/saved-searches`
- [ ] أحداث `filter_apply` / `quick_filter` تظهر في batch التحليلات (مع موافقة المستخدم)
- [ ] `CategoryAttributesFilter` لا يعرض شيئاً حتى تُملأ `CATEGORY_ATTRIBUTE_SCHEMAS`

## Phase 4 (اختياري)

- Radius slider + خريطة في الـ Sheet
- Multi-select للفئات
- A/B لترتيب أقسام الـ Sheet
- توسيع facets لـ UNION كل الكيانات
- Prisma enum لأحداث الفلاتر إن لزم تقارير أدق
EOF

find /home/workdir/artifacts/native-filters -type f | sort | wc -l
find /home/workdir/artifacts/native-filters -type f | sort
EOF
# fix accidental EOF in command - the second cat already closed. Just list files.
find /home/workdir/artifacts/native-filters -type f | sort
echo COUNT=$(find /home/workdir/artifacts/native-filters -type f | wc -l)