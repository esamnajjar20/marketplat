# تقرير المرحلة 78 — إصلاح فحوصات بناء تطبيق Expo

## ما تم إصلاحه

1. **إغلاق SQL الخاص بجدول `ad_drafts`:** كان تعريف الجدول في `apps/mobile/src/storage/ad-draft-store.ts` ينتهي بإغلاق template literal دون إغلاق تعريف الجدول SQL نفسه. أُضيف `);` داخل SQL قبل إغلاق الـ template literal، ما يعالج سبب سلسلة أخطاء TypeScript النحوية التي ظهرت عند السطر 19 وما بعده.
2. **تصحيح حارس المرحلة 77:** تم تحديث `verify-phase77.mjs` ليتحقق من إغلاق SQL الصحيح (`);`) وليس فقط من إغلاق template literal.
3. **إزالة هشاشة فحص نص واجهة الطابور:** كان `verify-phase61.mjs` يشترط عبارة عربية حرفية واحدة لشرح حجب FIFO، رغم أن الواجهة قد تستخدم صياغة عربية أخرى تؤدي المعنى نفسه. أصبح الفحص يقبل الصياغتين المعتمدتين، دون تغيير سلوك الطابور أو إضعاف فحوصات النقل والتكرار الآمن.

## التحقق المنفذ

- `verify-phase61.mjs`: ناجح.
- `verify-phase77.mjs`: ناجح.
- سلسلة `test` الكاملة في `apps/mobile/package.json`: جميع سكربتات التحقق الثابت من scaffold إلى المرحلة 77 نجحت في بيئة العمل هذه.

## ما لم يتم التحقق منه

- لم يتم تشغيل `tsc --noEmit` أو Expo/Metro build هنا، لأن بيئة العمل الحالية لا تحتوي على `pnpm` أو `node_modules`.
- لا تعتبر اختبارات `verify-phase*.mjs` بديلًا عن اختبار TypeScript، أو تشغيل SQLite على جهاز، أو اختبار API حقيقي، أو اختبار Android/iOS.
- ما زال يلزم ضبط توافق Expo الذي أظهره جهاز المطوّر: `react-native` المتوقع `0.81.5` و`@react-native-community/netinfo` المتوقع `11.4.1`. لم تُحدّث الإصدارات تلقائيًا في هذه المرحلة لتجنب تغيير الاعتماديات قبل إعادة تشغيل TypeScript.

## الخطوات التالية بعد استبدال الملفات

من جذر المستودع:

```bash
pnpm --filter @marketplat/mobile type-check
pnpm --filter @marketplat/mobile test
pnpm --filter @marketplat/mobile exec expo install --check
```

في فحص Expo، راجع تغييرات الاعتماديات المقترحة أولًا. لا توافق على تحديث تلقائي قبل التأكد من أن `type-check` نجح.
