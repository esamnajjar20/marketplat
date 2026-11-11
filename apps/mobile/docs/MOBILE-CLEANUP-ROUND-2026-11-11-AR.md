# جولة التنظيف الشاملة — الدفعة 1 (2026-11-11)

## نُفّذ
- **إصلاح حرج:** إنشاء `src/features/settings/{preferences.ts, settings.styles.ts, ThemeSection, NotificationPreferencesSection, AccountLinksSection, HelpSection}`. كانت غائبة وكان `app/settings.tsx` يستوردها فيفشل Metro. بُنيت وفق عقد الـ API ونموذج الويب `NotificationSettingsForm.tsx` (14 تفضيلًا + البريد الاحتياطي + ساعات الهدوء مع تثبيت منطقة الجهاز).
- **tokens:** حذف 10 ألوان دلالية مكررة غير مستخدمة في أي ملف (`primary, secondary, background, elevatedSurface, textPrimary, textSecondary, error, information, disabled, disabledText`) من الفاتح والداكن.
- **زوايا ومسافات:** استبدال القيم الحرفية المطابقة تمامًا لقيمة token بالـ token (24 ملفًا، بلا تغيير بصري).
- **الفحوصات الثابتة:** `verify-account-storage-store` يفحص الآن وحدات الإعدادات لا `settings.tsx` وحده. نتيجة `verify:static`: 55 → 59 ناجحًا من 75.
- **التوثيق:** `scripts/cleanup-root-docs.sh` يحذف 70 تقريرًا مكررًا في جذر apps/mobile (نسخها محفوظة في docs/history). يبقى 8 ملفات غير مكررة.

## لم يُنفَّذ (وسبب كل بند)
- **tsc / vitest / eslint:** لم تُشغَّل (لا شبكة ولا node_modules). فُحصت الصياغة فقط.
- **قيم خارج المقياس:** ما تبقى من المسافات (10، 6، 3، 14، 5، 7…) والزوايا (22، 26، 27، 52…) خارج مقياس tokens؛ تقريبها يغيّر الشكل فيحتاج قرارًا بصريًا ومراجعة على جهاز.
- **الأيقونات:** تحتاج مكتبة جديدة متوافقة مع SDK 58 (`expo install`).
- **دمج ScreenFrame/PageShell/DetailScaffold، وتفكيك search.tsx وindex.tsx، وتنسيق الملفات المضغوطة:** لم تُنفَّذ بلا tsc.
- **16 فحصًا ثابتًا فاشلًا** ما زالت (قديمة، تتحقق من نصوص لم تعد موجودة).
