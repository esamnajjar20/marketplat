# تحسين طلباتي في صفحة نشاطي

## ما أثبته سجل الشبكة

- طلب `/service-requests/me?page=1&limit=10` هو القائمة غير المفلترة.
- الطلبات اللاحقة ذات `status=PENDING/ACCEPTED/IN_PROGRESS/COMPLETED` تطابق تغيير مرشح الحالة؛ `MyServiceRequestsList` يستدعي `useMyServiceRequests` مرة واحدة حسب حالة URL، ولا يحمّل كل الحالات معًا.
- الأزمنة 3982ms و6822ms و1611ms لا يمكن تفسيرها من Network وحده، لكن استعلام المستودع يجري `findMany` و`count` بالتوازي ويضم علاقات القائمة.

## التغيير

إضافة فهرسين مركبين لجدول `service_requests`:
- `(customerId, createdAt DESC)` للقائمة العامة.
- `(customerId, status, createdAt DESC)` لقوائم الحالات والعدّ المفلتر.

لا يغيّر ذلك النتائج أو الصلاحيات أو الترقيم. يجب نشر ترحيل Prisma على قاعدة البيانات قبل توقع أي تحسن.

## التحقق وحدوده

التحقق هنا ساكن من مخطط Prisma وSQL ومسار الاستعلام. لم تتوفر قاعدة البيانات الإنتاجية أو خطة `EXPLAIN ANALYZE`، لذلك لا توجد نسبة تحسن أو زمن جديد مثبت. ينبغي مقارنة `EXPLAIN (ANALYZE, BUFFERS)` قبل/بعد الترحيل على استعلامات customerId والحالات.
