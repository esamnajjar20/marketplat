# المرحلة 3 — Auth + أداء القوائم + أساس Query

## ما تم

### 1) تنظيف Auth
- `src/features/auth/session-storage.ts` — قراءة/كتابة/مسح الجلسة
- `src/features/auth/private-data-cleanup.ts` — تنظيف بيانات الحساب + أقفال الأمان
- `src/features/auth/AuthContext.tsx` — أصبح أنحف ويعتمد على الملفين أعلاه  
  **الواجهة `useAuth()` لم تتغير.**

### 2) أداء القوائم
- `src/lib/listPerformance.ts` موسّع:
  - `fixedItemLayout(height)`
  - `listItemHeights`
  - `adListProps` / `chatListProps`

مثال:

```tsx
import { adListProps } from '@/lib/listPerformance';

<FlatList
  data={ads}
  keyExtractor={(item) => item.id}
  renderItem={({ item }) => <AdCard ... />}
  {...adListProps}
/>
```

### 3) أساس TanStack Query (اختياري)
- `src/lib/queryKeys.ts`
- `src/providers/QueryProvider.tsx` (يعمل كـ no-op حتى تثبيت الحزمة)

```bash
cd apps/mobile && npx expo install @tanstack/react-query
```

ثم في `_layout.tsx`:

```tsx
import { QueryProvider } from '@/providers/QueryProvider';
// ...
<QueryProvider>
  <ConnectivityProvider>…</ConnectivityProvider>
</QueryProvider>
```

### 4) اختبارات
- `src/storage/__tests__/outbox-constants.test.ts`

```bash
cd apps/mobile && npx vitest run src/storage/__tests__/outbox-constants.test.ts
```

## خطوات الدمج

```bash
cp path/to/phase3/src/features/auth/* apps/mobile/src/features/auth/
cp path/to/phase3/src/lib/listPerformance.ts apps/mobile/src/lib/
cp path/to/phase3/src/lib/queryKeys.ts apps/mobile/src/lib/
mkdir -p apps/mobile/src/providers
cp path/to/phase3/src/providers/QueryProvider.tsx apps/mobile/src/providers/
cp path/to/phase3/src/storage/__tests__/outbox-constants.test.ts apps/mobile/src/storage/__tests/

cd apps/mobile && npx tsc --noEmit
```

**ملاحظة:** ملفات المرحلة 3 تعتمد على وجود `src/storage/outbox/` من المرحلة 2 للاختبار.
