# المرحلة 4 — Hooks مشتركة + مسارات + مفضلة + Logger

## ما تم

| الملف | الوصف |
|--------|--------|
| `src/lib/routes.ts` | مسارات مركزية (`routes.ads.detail(id)` …) |
| `src/lib/logger.ts` | تسجيل آمن مع إخفاء الحقول الحساسة |
| `src/lib/navigation.ts` | محدّث لاستخدام `routes` + اختصارات `nav.*` |
| `src/hooks/useStableCallback.ts` | مرجع دالة ثابت لـ memo / FlatList |
| `src/hooks/useAsyncResource.ts` | نمط loading/error/refresh موحّد للشاشات |
| `src/features/ads/useFavorites.ts` | مفضلة قابلة لإعادة الاستخدام |
| `src/features/discovery/useHomeScreenState.ts` | يعتمد على `useFavorites` |
| `src/features/auth/__tests__/session-storage.test.ts` | اختبارات الجلسة |

## أمثلة استخدام

### مسارات

```ts
import { routes } from '@/lib/routes';
import { openScreen, nav } from '@/lib/navigation';

openScreen(routes.ads.detail(ad.id));
nav.login();
```

### مورد غير متزامن

```ts
const { data, loading, error, reload, refreshing } = useAsyncResource(
  () => fetchMyAds(token),
  { key: user?.id ?? 'guest', tag: 'my-ads' },
);
```

### مفضلة في أي شاشة

```ts
const { isFavorite, toggleFavorite } = useFavorites();
```

## الدمج

```bash
cp src/lib/routes.ts src/lib/logger.ts src/lib/navigation.ts → apps/mobile/src/lib/
cp -R src/hooks → apps/mobile/src/hooks/
cp src/features/ads/useFavorites.ts → apps/mobile/src/features/ads/
cp src/features/discovery/useHomeScreenState.ts → (استبدال إن وُجد من مرحلة 1)
cp src/features/auth/__tests__/session-storage.test.ts → apps/mobile/src/features/auth/__tests/
```

```bash
cd apps/mobile && npx tsc --noEmit
npx vitest run src/features/auth/__tests__/session-storage.test.ts
```

**اعتماد:** ملفات المرحلة 3 (`session-storage.ts`) مطلوبة لاختبار الجلسة.
