# توحيد إعادة التصيير في MarketPlat — V2

## الهدف

تقليل إعادة التصيير الناتجة عن تغيّر حالة لا يحتاجها المكوّن، وتوحيد آلية التحسين التلقائي بين Next.js وExpo، مع إبقاء القياس الفعلي شرطاً لإعلان أي تحسن رقمي.

## ما تم تطبيقه

### 1. React Compiler

- Web: المشروع على Next.js `15.5.x`؛ لذلك تم تفعيل `experimental.reactCompiler` وإضافة `babel-plugin-react-compiler@1.0.0` إلى `frontend`.
- Mobile: المشروع على Expo SDK `58`; تم تفعيل `expo.experiments.reactCompiler` وإضافة نسخة صريحة من الإضافة في `apps/mobile` بدلاً من الاعتماد على اعتماد انتقالي.
- Web يستخدم `panicThreshold: 'NONE'` حتى يتجاوز المترجم المكوّنات التي لا تحقق قواعد React بدلاً من إيقاف البناء. يجب معالجة التحذيرات تدريجياً.
- أبقينا المكونات اليدوية المحسّنة و`useMemo` و`useCallback` الحالية؛ لا تحذف memoization يدوياً كجزء من هذا التغيير دون مقارنة Profiler واختبارات السلوك.

### 2. تقسيم AuthContext في الموبايل

تم فصل الحالة إلى أربعة سياقات:

| Hook | ما يشترك به |
|---|---|
| `useAuthUser()` | هوية المستخدم فقط |
| `useAuthSession()` | access token وCSRF وبيانات انتهاء الجلسة |
| `useAuthStatus()` | isBusy وisRestoring |
| `useAuthActions()` | دوال الدخول والخروج والتحديث وgetAccessToken المستقرة |

تم نقل مستهلكي `useAuth()` الحاليين إلى أضيق Hook مناسب. بقي `useAuth()` كواجهة توافقية قديمة، لكنه يجمع السياقات الأربعة، لذلك لا تستخدمه في مكوّن جديد إلا عند الحاجة الفعلية إلى معظم حقول المصادقة.

تم جعل `logout` يعتمد على مرجع الهوية الحالي بدلاً من التقاط `user?.id` في dependencies، لتجنب إعادة إنشاء دالة الخروج عند كل تغيير لهوية المستخدم أو تجدد الجلسة.

## قواعد التطوير

1. لا تجعل مكوّناً يشترك في `useAuthSession()` إذا كان يحتاج `user` فقط؛ استخدم `useAuthUser()`.
2. استخدم `useAuthActions()` للدوال فقط؛ `getAccessToken()` مصمم ليبقى مستقراً عند تدوير الرمز.
3. لا تضف `React.memo` أو `useMemo` أو `useCallback` آلياً. استخدمها عند ثبوت وجود كلفة أو هوية مرجعية تؤثر في مكوّن تابع.
4. لا تحوّل كل `map()` إلى قائمة افتراضية. اختر FlashList للقوائم الطويلة أو غير المحدودة فقط؛ القوائم القصيرة ذات العدد المحدود لا تحتاج افتراضياً إلى ذلك.
5. لا تنقل state إلى Context عام إذا كان تغيّرها متكرراً؛ قسّم السياق أو استخدم اشتراكاً انتقائياً.
6. حافظ على قواعد Hooks ونقاء render. المترجم لا يصلح الآثار الجانبية داخل render أو تحديثات الحالة غير الصحيحة.

## التدقيق

شغّل من جذر المشروع:

```bash
pnpm run perf:render-unification-audit
npm --prefix frontend run perf:render-regression
npm --prefix frontend run type-check
pnpm --filter @marketplat/mobile type-check
pnpm --filter @marketplat/mobile test
```

لفحص التوافق مع React Compiler على الموبايل:

```bash
pnpm dlx react-compiler-healthcheck@latest
```

## القياس قبل/بعد

لا يوجد رقم تحسين مصطنع في هذه الحزمة. لقياس الأثر:

1. افتح نسخة Development أو Profile build مع بيانات اختبار ثابتة.
2. سجّل React DevTools Profiler لسيناريوهات: تدوير access token، تعديل الملف الشخصي، الانتقال بين صفحات القوائم، وفتح Drawer.
3. قارن عدد commits ومدة render للمكونات التي تستخدم AuthContext.
4. أعد القياس بعد Build إنتاجي؛ لا تقارن أرقام development بأرقام production.

## التحقق المطلوب قبل النشر

- تثبيت الاعتماديات باستخدام `pnpm install --frozen-lockfile` و`npm ci` داخل `frontend`.
- تشغيل Build الويب وExpo Android bundle.
- مراجعة رسائل React Compiler وأي مكوّن تم تخطيه.
- مراجعة Profiler على جهاز Android فعلي، خصوصاً الشاشات والقوائم الثقيلة.
