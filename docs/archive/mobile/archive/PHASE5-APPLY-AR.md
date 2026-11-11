# المرحلة 5 — البنود المتبقية

## ما تم تنفيذه

1. **توحيد ثوابت طابور الدردشة** مع نواة outbox  
   `storage/chat-message-outbox.ts` → `OUTBOX_MAX_*` + `computeRetryDelayMs`

2. **طبقة إبلاغ أخطاء**  
   `lib/error-reporting.ts` — جاهزة لـ Sentry لاحقًا + مربوطة بـ ErrorBoundary في المقتطف

3. **تحسين useHomeAds**  
   logger + captureException + `queryKey` / `homeAdsQueryKey`

4. **غلاف Query للرئيسية**  
   `features/discovery/useHomeAdsQuery.ts`

5. **أنماط شاشة مشتركة**  
   `theme/screenStyles.ts`

6. **مقتطف _layout** مع QueryProvider + captureException  
   `app/_layout.QUERY-SNIPPET.tsx`

7. **اختبارات routes**  
   `lib/__tests__/routes-logger.test.ts`

## ملاحظات عن order-outbox

لم نعدّل ملف الطلبات بالكامل هنا لتجنّب كسر منطق المزامنة المضغوط؛ استخدم نفس الثوابت يدويًا عند المراجعة:

```ts
import { OUTBOX_MAX_PENDING, OUTBOX_MAX_ATTEMPTS, computeRetryDelayMs } from '@/storage/outbox';
```

## الدمج

انسخ الملفات إلى `apps/mobile/` حسب المسارات، ثم:

```bash
npx tsc --noEmit
npx vitest run src/lib/__tests__/routes-logger.test.ts
```

اختياري:

```bash
npx expo install @tanstack/react-query
```

ثم طبّق مقتطف `_layout` أو أضف فقط:

```tsx
import { QueryProvider } from '@/providers/QueryProvider';
// ...
<QueryProvider>…</QueryProvider>
```
