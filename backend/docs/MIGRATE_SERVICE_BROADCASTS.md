# ترحيل سوق الطلبات → Open Requests

## الهدف

نسخ `ServiceRequestBroadcast` + `ServiceQuote` إلى `Request` (type=SERVICE) + `RequestOffer` مع **الحفاظ على نفس الـ id**.

بعد الترحيل يمكن توجيه `/service-broadcasts/*` إلى `/requests/*`.

## الخطوات

```bash
cd backend
npx prisma migrate deploy   # تأكد أن جداول requests موجودة
npx prisma generate

# تجربة بدون كتابة
DRY_RUN=1 npm run report:migrate-service-broadcasts-to-requests

# تنفيذ فعلي
npm run report:migrate-service-broadcasts-to-requests
```

## السلوك

| المصدر | الهدف |
|--------|--------|
| broadcast.id | request.id |
| quote.id | request_offer.id |
| provider → sellerProfile.userId | offererUserId |
| status OPEN/ACCEPTED/CANCELLED | نفس القيم (لا EXPIRED من القديم) |
| acceptedQuoteId | acceptedOfferId |

- إعادة التشغيل آمنة: يتخطى الصفوف الموجودة.
- `attributes.migratedFrom = service-request-broadcast`

## بعد الترحيل

1. نشر توجيهات الفرونت (next.config أو صفحات redirect).
2. الإبقاء على API القديم للقراءة فقط لفترة انتقالية إن لزم.
3. لاحقًا: إيقاف الكتابة على `/service-broadcasts` ثم أرشفة الجداول.

## التراجع

لا يوجد drop تلقائي. للتراجع اليدوي: حذف `Request` حيث `attributes.migratedFrom = service-request-broadcast` (احذر إن وُجدت عروض جديدة بعد الترحيل).
