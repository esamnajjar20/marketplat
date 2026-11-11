# إعدادات البناء الأصلية لتطبيق MarketPlat

## إشعارات Android (FCM)

ملفات Gradle وManifest أصبحت مهيّأة لدعم FCM، لكن لا يمكن تفعيل إرسال الإشعارات فعليًا دون ملف Firebase الخاص بمشروع التطبيق.

1. سجّل تطبيق Android بالمعرّف `com.marketplat.mobile` داخل مشروع Firebase الصحيح.
2. نزّل ملف `google-services.json` الخاص بهذا التطبيق.
3. ضعه في أحد المسارين التاليين:
   - `apps/mobile/google-services.json` (المسار المفضّل؛ يستخدمه Expo config وينسخه Gradle إلى مجلد التطبيق عند البناء)، أو
   - `apps/mobile/android/app/google-services.json` (للبناء الأصلي المباشر).
4. لا ترفع الملف إلى Git؛ المساران مستثنيان في `.gitignore`.
5. أعد بناء تطبيق Android بعد إضافة الملف. وجود إذن `POST_NOTIFICATIONS` لا يغني عن إعداد Firebase أو عن منح المستخدم إذن الإشعارات من النظام.

عند غياب الملف، يبقى بناء التطبيق ممكنًا، لكن الحصول على رمز FCM لا يعمل، وستعرض طبقة الإشعارات رسالة توضح مكان وضع إعداد Firebase.

## تشغيل الفحوص

- `pnpm test`: اختبارات Vitest السلوكية.
- `pnpm test:storage`: اختبارات Node المخصصة لوحدات التخزين/outbox.
- `pnpm verify:static`: فحوص العقود الثابتة `verify-*.mjs`؛ لا تُعد بديلًا عن اختبارات السلوك أو اختبار التطبيق على جهاز.
- `pnpm test:all`: يشغّل مجموعات الاختبارات والفحوص الثابتة كلها.

يجب تشغيل `pnpm install --frozen-lockfile` ثم `pnpm type-check` و`npx expo-doctor` و`pnpm test:all` في بيئة التطوير المتصلة قبل إصدار نسخة إنتاجية.
