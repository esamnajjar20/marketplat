# قرار RTL لتطبيق MarketPlat Mobile (محدَّث 2026-11-11)

**الحالة الفعلية في الكود:** RTL أصلي. `app/_layout.tsx` يستدعي `I18nManager.allowRTL(true)` و`forceRTL(true)`، و`app.json` فيه `supportsRTL: true`، ولا يوجد `row-reverse` في `app/` و`src/`. التوثيق السابق كان يصف تخطيطًا يدويًا (`forceRTL(false)`) وهو لم يعد صحيحًا.

## قواعد العمل
1. استخدم `AppHeader`, `PageShell`, `Field`, `PrimaryButton`, `ListRow` بدل هياكل مخصصة.
2. استخدم `AccessiblePressable` لكل عنصر تفاعلي، و`AppText` للنصوص.
3. لا تكتب `row-reverse`؛ الصفوف العادية تنعكس تلقائيًا.
4. الأوزان من `fontWeights` في `tokens.ts` (لا `'700'` حرفية).
5. حالات القوائم المُرقَّمة: `ListEmpty` + `ListStaleError` + `PaginatedFooter` من `@/components/ui`.

## نقاط تحتاج اختبار جهاز (لم تُغيَّر عمدًا)
- `textAlign: 'right'` مكتوبة حرفيًا في نحو 240 موضعًا و`AppText` يفرضها (`MANAGED_ALIGN`). قد تتصرف عكس المتوقع تحت RTL الأصلي حسب المنصة.
- `MobileDrawer` يستخدم `isRTL = true` ثابتة مع منطق إيماءات يدوي.
- اختبر على Android وiOS: الحقول المختلطة، الإيماءات، انتقالات الصفحات، القوائم الأفقية. ثم استبدل المحاذاة الحرفية بـ `textAlign: 'auto'` أو ركّزها في `AppText`.
