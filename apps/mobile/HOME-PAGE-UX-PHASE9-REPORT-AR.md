# تقرير المرحلة التاسعة — تقليل طلبات الاكتشاف عند انقطاع الاتصال

## التغييرات
- إضافة فحص اتصال باستخدام `@react-native-community/netinfo` قبل طلب توصيات السوق الاختيارية.
- تخطي طلبات المتاجر والقصص الاختيارية عندما يؤكد الجهاز أنه غير متصل؛ لا يتغير سلوك قائمة الإعلانات الأساسية.
- إذا كانت حالة الاتصال غير معروفة في قسم الاكتشاف المختلط، يستمر الطلب بدل افتراض انقطاع الشبكة.
- إبقاء القصص مشروطة بوجود جلسة دخول صالحة.
- لم تتم إضافة مكتبات أو نقاط API جديدة.

## التحقق
شغّل:

```sh
node ./scripts/verify-homepage-ux-phase9.mjs
node ./scripts/verify-homepage-ux-phase8.mjs
node ./scripts/verify-homepage-ux-phase7.mjs
node ./scripts/verify-homepage-community-sections.mjs
node ./scripts/verify-homepage-multi-section.mjs
```

هذه اختبارات ثابتة للكود، وليست اختبارًا على جهاز حقيقي أو تأكيدًا لبناء Expo الكامل.
