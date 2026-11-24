# نظام التصميم — MarketPlat Web

> المرجع الحي لنظام تصميم الويب. مرجع Native Mobile المقابل في `apps/mobile/docs/DESIGN-SYSTEM-AR.md`.

## 1. المبادئ

- استخدم الأدوار الدلالية بدل القيم اللونية المباشرة أو أسماء الألوان القديمة.
- تتغير قيم الأدوار نفسها بين Light وDark؛ لا تضف overrides محلية للون دلالي إلا إذا كان له معنى مستقل موثق.
- استخدم مكونات `frontend/components/ui` ومكونات المجال المشتركة قبل إنشاء عنصر بصري مكرر.
- استخدم RTL الطبيعي، وخصائص `start/end` عند الحاجة بدل ربط التصميم بـ`left/right`.
- يجب ألا يقل الهدف التفاعلي الأساسي عن 44px، مع السماح للمحتوى والنصوص المكبرة بتوسيع العنصر.

## 2. الألوان الدلالية

مصدر اللون هو `frontend/app/globals.css`. القيم أدناه في Light، وتُستبدل تلقائيًا بقيم `.dark` عند تفعيل الوضع الداكن.

| الدور | CSS token | استخدامه في Native | Light |
|---|---|---|---|
| اللون الأساسي | `--primary` | `colors.brand` | `#397F56` |
| النص الأساسي | `--foreground` | `colors.ink` | `#241E19` |
| النص الثانوي | `--muted-foreground` | `colors.muted` | `#6B6358` |
| خلفية الصفحة | `--background` | `colors.canvas` | `#FDFCF9` |
| السطح/البطاقة | `--card` | `colors.surface` | `#FFFFFF` |
| الحدود | `--border` | `colors.border` | `#E6E0D6` |
| التمييز | `--accent` | `colors.accent` | `#AD531F` |
| الخطر | `--destructive` | `colors.danger` | `#C1443A` |
| نص الخطر على سطح خفيف | `--destructive-text` | `colors.dangerText` | `#9B2C2C` |
| النص على خلفية الخطر | `--destructive-foreground` | `colors.onDanger` | `#FDFBF7` |
| النجاح | `--success` | `colors.success` | `#3D7A54` |
| التحذير | `--warning` | `colors.warning` | `#D19A3D` |
| نص التحذير على سطح خفيف | `--warning-text` | `colors.warningText` | `#9C4221` |
| المعلومات | `--info` | `colors.info` | `#265FD9` |

تُحوّل أدوار HSL في الويب إلى قيم HEX مقابلة في `apps/mobile/src/theme/tokens.ts`. أدوار `--destructive-text` و`--warning-text` مخصصة للنص فوق الأسطح الناعمة، ولا تستبدل `*-foreground` المخصص للنص فوق زر/خلفية الحالة. يختبر `verify-design-system-cross-platform.mts` تكافؤ Light وDark وتباين نصوص الحالات آليًا. لا تضع قيمة HEX جديدة في شاشة Native؛ أضفها إلى Tokens واختبر التباين.

للاستخدام في Tailwind، فضّل utilities مثل `bg-background`, `text-foreground`, `border-border`, `bg-primary`, `text-muted-foreground`. للاستخدامات التي تحتاج CSS custom property في class أو inline style، استخدم aliases الدلالية `--color-*` المعرفة في `globals.css`. هذه aliases مشتقة من Tokens الحالية وتعمل في الوضعين؛ لا تُعد نظام ألوان منفصلًا.

**ممنوع:** إعادة إنشاء `--legacy-*` أو إدخال متغيرات ألوان مرتبطة بصفحة. تُستخدم أدوار مثل `--color-danger-soft` و`--color-surface-muted` بدل ذلك.

## 3. الزوايا (Radius)

| الدور | Web | Native Mobile | القيمة المرجعية |
|---|---|---|---:|
| Control | `rounded-control` / `--radius-control` | `radius.control` | 9.6px / 10dp |
| Card | `rounded-card` / `--radius-card` | `radius.card` | 14px / 14dp |
| Shell | `rounded-shell` / `--radius-shell` | `radius.shell` | 20px / 20dp |
| Modal | `rounded-modal` / `--radius-modal` | `radius.modal` | 16px / 16dp |
| Hero | `rounded-hero` / `--radius-hero` | `radius.hero` | 24px / 24dp |

Native button/input use the `control` value through `radius.button` and `radius.input`. `Card` on Web consumes `rounded-card`; do not substitute `rounded-xl` because it bypasses the declared token.

## 4. Typography policy: Web vs Native

الاختلاف في عائلة الخط قرار منصّي مقصود، وليس نقصًا غير موثق:

- **Web:** Cairo Variable للنصوص العربية واللاتينية، وIBM Plex Mono للمحتوى أحادي المسافة/الأرقام التي تتطلب ذلك، عبر `next/font` في `frontend/app/layout.tsx`.
- **Native Mobile:** خط النظام الافتراضي على Android وiOS. لا يضمّن التطبيق ملف Cairo إضافيًا في APK/IPA، لتجنّب زيادة حجم الحزمة والاحتفاظ بتكامل النص مع النظام. لا يُفرض `fontFamily` يدويًا على الشاشات.
- **الحجم والإيقاع:** لكل منصة مقياس يناسب كثافتها؛ Native يحدد `typography`, `fontSizes`, `fontWeights` وارتفاعات السطر في `apps/mobile/src/theme/tokens.ts`، والويب يحدد المقاييس الدلالية في `frontend/tailwind.config.ts`.

مرجع التكافؤ الهرمي للأدوار، مع السماح بكثافة أعلى على شاشة الهاتف:

| الدور | Web | Native Mobile | القاعدة |
|---|---|---|---|
| عنوان الشاشة | `page-title` (30px) | `screenTitle` (20dp) | أعلى عنوان داخل الشاشة؛ لا تكرر عنوانين رئيسيين |
| عنوان القسم | `section-title` (20px) | `sectionTitle` (17dp) | يسبق مجموعة محتوى واضحة |
| عنوان البطاقة | `card-title` (15px) | `cardTitle` (15dp) | وزن متوسط/شبه عريض دون منافسة عنوان القسم |
| النص الأساسي | `base` (16px) أو `body-compact` (14px) | `body` (15dp) | يختار حسب كثافة المحتوى |
| النص المساند | `meta` (12px) أو `sm-tight` (13px) | `supporting` (13dp) أو `caption` (13dp) | لا يُستخدم للنص الأساسي أو الإجراء المهم |
| تسمية الزر | `base` / `sm` بحسب المكوّن | `buttonLabel` (16dp) | وضوح الإجراء والحجم أهم من تطابق الرقم |

عند مقارنة الشاشتين، يجب أن تتطابق الأولوية الهرمية والقراءة والوزن النسبي، وليس بالضرورة قياسًا نقطيًا واحدًا أو شكل حروف متطابقًا. أي تغيير مستقبلي لعائلة الخط Native يحتاج اختبار حجم الحزمة ولقطات Android فعلية قبل اعتماده.

## 5. المكونات والحقول

- استخدم `Button`, `Input`, `Card`, `FormField` ومكونات Radix/Shadcn المشتركة بدل بناء عناصر منفصلة في كل صفحة.
- استخدم `rounded-card` مع `Card`.
- يجب أن تحافظ عناصر التحكم على focus-visible، حالة disabled، ورسائل الخطأ، وألا تزيل مؤشر التركيز.
- أزرار الأيقونات يجب أن توفر اسمًا accessible label ومنطقة تفاعل 44px على الأقل.
- حافظ على ارتفاعات الأسطر والمساحات قابلة للتمدد عند تكبير النص أو ظهور ترجمة أطول.

## 6. الاختبارات والحوكمة

نفّذ من جذر المستودع:

```bash
pnpm --filter frontend design-system:token-audit
pnpm --filter @marketplat/mobile verify:design-system-parity
pnpm --filter @marketplat/mobile verify:a11y
pnpm --filter @marketplat/mobile report:tokens
```

`verify-design-system-cross-platform.mts` يقارن الألوان الدلالية في Light/Dark، أدوار radius، نسب التباين الأساسية، توحيد `Field`، حدود اللمس، واختفاء المراجع التشغيلية لـ`--legacy-*`.

`report:tokens` تقرير استكشافي غير حاجب؛ يرصد القيم الرقمية للزوايا والمسافات والخطوط والأبعاد/التموضع ومواضع `TextInput` الخام. وجود نتيجة لا يعني تلقائيًا وجود خطأ؛ يجب التمييز بين الحقول القياسية والاستثناءات المتخصصة.
