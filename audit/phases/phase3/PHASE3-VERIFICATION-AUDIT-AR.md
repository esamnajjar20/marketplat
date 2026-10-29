# المرحلة الثالثة — تصنيف فحوص التحقق (29-10-2026)

## النتيجة الفعلية

- تشغيل `node scripts/run-all-verifications.mjs`: **141 فحصًا، 45 ناجحًا، 96 فاشلًا** قبل إصلاح فحص التواصل أدناه.
- لا تعني حالات الفشل الـ96 وجود 96 عيبًا في التطبيق؛ كثير من السكربتات تتحقق من نص حرفي ضيق أو توقعات قديمة، ويجب فحصها على حدة.
- إصلاح مؤكد في هذه المرحلة: فحص التواصل بالمنتج كان يرفض الكود الصحيح بسبب المسافات/تنسيق TypeScript، رغم أن السياق والتنقل موجودان. عُدّل الفحص ليستخدم تعبيرًا مرنًا، ثم نجح بجميع تحققاته الستة.
- لم أغيّر منطق التطبيق لمجرد جعل اختبارات نصية قديمة تنجح، ولم أضعف أمانًا أو حدود طلبات.

## توزيع الفحوص الفاشلة حسب المجال (تصنيف أولي بالأسماء)

### المحادثات والمزامنة (13)
- `verify-chat-dead-letter-recovery-audit.mjs`
- `verify-chat-idempotent-retry-audit.mjs`
- `verify-chat-live-stream-audit.mjs`
- `verify-chat-pagination-audit.mjs`
- `verify-chat-persistent-outbox-audit.mjs`
- `verify-chat-refresh-race-audit.mjs`
- `verify-chat-session-abort-audit.mjs`
- `verify-conversation-pagination-audit.mjs`
- `verify-inbox-refresh-race-audit.mjs`
- `verify-native-chat-parity-audit.mjs`
- `verify-offline-first-all-creations.mjs`
- `verify-offline-first-deep-audit-fixes.mjs`
- `verify-unread-counts-lifecycle-audit.mjs`

### الصفحة الرئيسية والتنقل والتصميم (19)
- `verify-bottom-navigation-organization.mjs`
- `verify-homepage-community-sections.mjs`
- `verify-homepage-marketplace-sections.mjs`
- `verify-homepage-mixed-removal-navigation.mjs`
- `verify-homepage-multi-section.mjs`
- `verify-homepage-ux-phase10.mjs`
- `verify-homepage-ux-phase11.mjs`
- `verify-homepage-ux-phase12.mjs`
- `verify-homepage-ux-phase13.mjs`
- `verify-homepage-ux-phase14.mjs`
- `verify-homepage-ux-phase3.mjs`
- `verify-homepage-ux-phase4.mjs`
- `verify-homepage-ux-phase5.mjs`
- `verify-homepage-ux-phase6.mjs`
- `verify-homepage-ux-phase7.mjs`
- `verify-homepage-ux-phase8.mjs`
- `verify-homepage-ux-phase9.mjs`
- `verify-navigation-information-hierarchy.mjs`
- `verify-scaffold.mjs`

### الميزات والصفحات (10)
- `verify-discovery-add-pages.mjs`
- `verify-feature-phase1.mjs`
- `verify-feature-phase4.mjs`
- `verify-feature-phase5.mjs`
- `verify-feature-phase6.mjs`
- `verify-feature-phase7.mjs`
- `verify-feature-remaining-account-pages.mjs`
- `verify-order-cancellation-stage-audit.mjs`
- `verify-product-contact-flow.mjs`
- `verify-store-services-audit-fixes.mjs`

### فحوص المراحل المتراكمة (53)
- `verify-phase10.mjs`
- `verify-phase11.mjs`
- `verify-phase12.mjs`
- `verify-phase13.mjs`
- `verify-phase14.mjs`
- `verify-phase17.mjs`
- `verify-phase18.mjs`
- `verify-phase19.mjs`
- `verify-phase20.mjs`
- `verify-phase21.mjs`
- `verify-phase22.mjs`
- `verify-phase23.mjs`
- `verify-phase24.mjs`
- `verify-phase26.mjs`
- `verify-phase27.mjs`
- `verify-phase28.mjs`
- `verify-phase29.mjs`
- `verify-phase30.mjs`
- `verify-phase31.mjs`
- `verify-phase32.mjs`
- `verify-phase33.mjs`
- `verify-phase34.mjs`
- `verify-phase36.mjs`
- `verify-phase37.mjs`
- `verify-phase38.mjs`
- `verify-phase41.mjs`
- `verify-phase42.mjs`
- `verify-phase43.mjs`
- `verify-phase44.mjs`
- `verify-phase45.mjs`
- `verify-phase46.mjs`
- `verify-phase47.mjs`
- `verify-phase48.mjs`
- `verify-phase49.mjs`
- `verify-phase50.mjs`
- `verify-phase51.mjs`
- `verify-phase52.mjs`
- `verify-phase53.mjs`
- `verify-phase54.mjs`
- `verify-phase55.mjs`
- `verify-phase56.mjs`
- `verify-phase57.mjs`
- `verify-phase58.mjs`
- `verify-phase59.mjs`
- `verify-phase60.mjs`
- `verify-phase61.mjs`
- `verify-phase62.mjs`
- `verify-phase7.mjs`
- `verify-phase70.mjs`
- `verify-phase71.mjs`
- `verify-phase74.mjs`
- `verify-phase76.mjs`
- `verify-phase77.mjs`

### فحوص أخرى (1)
- `verify-mutation-csrf-audit.mjs`

## الخطوة التالية

1. استبدال الفحوص النصية الهشة بفحوص تتحقق من السلوك أو AST بدل مطابقة تنسيق حرفي.
2. تدقيق أعطال المحادثة والطوابير وSQLite أولًا، مع اختبارات حالات متزامنة وفشل الشبكة.
3. عدم اعتبار أي خطأ API محلولًا دون تتبع الطلب والاستجابة وسجل الخادم.
4. تشغيل TypeScript وVitest والبناء بعد تثبيت الاعتماديات في بيئة تسمح بذلك.
