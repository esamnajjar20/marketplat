# دليل الحذف اليدوي — نظام service-broadcasts (القديم)

> نفّذ هذا **فقط بعد**:
> 1. نجاح `npm run report:migrate-service-broadcasts-to-requests` على الإنتاج
> 2. التحقق أن عدد `Request` (type=SERVICE, migrated) ≈ عدد البثوث القديمة
> 3. مراقبة أسبوع بدون اعتماد على `/service-broadcasts` للكتابة
> 4. الإبقاء على redirects في `next.config.ts` لفترة أو تحويلها إلى permanent

الكتابة على الـ API القديم معطّلة افتراضيًا (`LEGACY_SERVICE_BROADCASTS_DEPRECATED`) إلا إذا ضبطت `LEGACY_SERVICE_BROADCASTS_WRITES=1`.

---

## المرحلة A — حذف فرونت (آمن أولًا)

### صفحات
احذف المجلد كاملًا:
```
frontend/app/(protected)/service-broadcasts/
```

### أدمن
```
frontend/app/(admin)/admin/service-broadcasts/
frontend/components/admin/AdminServiceBroadcastsTable.tsx
```

### مكوّنات / API / hooks
```
frontend/components/services/CreateServiceBroadcastForm.tsx
frontend/api/service-broadcasts.api.ts
frontend/hooks/mutations/useServiceBroadcastMutations.ts
frontend/lib/serviceQuoteStatus.ts
```

### اختبارات
```
frontend/__tests__/unit/api/service-broadcasts.api.test.ts
frontend/__tests__/unit/hooks/useServiceBroadcastMutations.test.ts
```

### تنظيف مراجع (عدّل السطور — لا تحذف الملف كاملًا)

| ملف | ماذا تحذف/تعدّل |
|-----|------------------|
| `frontend/lib/constants.ts` | `ROUTES.serviceBroadcasts`, `serviceBroadcastNew`, `myServiceBroadcasts`, `myServiceBroadcastQuotes`, `admin.serviceBroadcasts` |
| `frontend/lib/navigation.ts` | أي `ROUTES.serviceBroadcast*` |
| `frontend/lib/offlineAdDrafts.ts` | kind `service-broadcast` |
| `frontend/lib/offlineDraftResume.ts` | فرع service-broadcast |
| `frontend/lib/offlineRouteShells.ts` | مسارات service-broadcasts |
| `frontend/public/sw.js` | مسارات `/service-broadcasts` |
| `frontend/api/admin.api.ts` | getAdminServiceBroadcasts, cancelServiceBroadcast |
| `frontend/hooks/queries/useAdmin.ts` | useAdminServiceBroadcasts |
| `frontend/hooks/mutations/useAdminMutations.ts` | useAdminCancelServiceBroadcast |
| `frontend/types/service.types.ts` | أنواع Broadcast/Quote إن وجدت |
| `frontend/middleware.ts` | مسارات service-broadcasts |
| `frontend/next.config.ts` | بعد الاستقرار: احذف redirects الخاصة بـ service-broadcasts |
| اختبارات CreateSheet / sw | توقعات قديمة |

---

## المرحلة B — حذف باك اند

### الموديول
```
backend/src/modules/service-broadcasts/
```

### routes.ts
احذف import و `router.use('/service-broadcasts', ...)`

### أدمن
- admin.routes: GET/PATCH service-broadcasts
- admin.controller + admin.service: دوال البث

### اختبارات
```
backend/tests/integration/service-broadcasts.test.ts
backend/tests/unit/service-broadcasts.*.test.ts
```

### Rate limits + notifications
راجع rateLimit.middleware و notifications.service لأنواع SERVICE_QUOTE القديمة فقط.

---

## المرحلة C — Prisma (آخر خطوة)

1. لا يوجد استيراد لـ ServiceRequestBroadcast / ServiceQuote
2. احذف الموديلات والـ enum من schema.prisma
3. العلاقات على User / ServiceProviderDetails / ServiceCategory
4. `npx prisma migrate dev --name drop_legacy_service_broadcasts`

جداول متوقعة: `service_quotes`, `service_request_broadcasts`

---

## الترتيب

1. ترحيل بيانات  
2. Deploy redirects + /requests  
3. Deploy تعطيل الكتابة  
4. مراقبة 7–14 يوم  
5. حذف فرونت (A)  
6. حذف باك (B)  
7. Prisma drop (C)  
8. إزالة redirects  

## لا تحذف

- Request / RequestOffer  
- ServiceRequest (الطلب المباشر لمزوّد)  
- المحادثات  
- سكربت الترحيل (أرشفة)  

## طوارئ
`LEGACY_SERVICE_BROADCASTS_WRITES=1`
