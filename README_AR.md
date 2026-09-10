# تحديث: التحكم بعدد VUs من واجهة GitHub Actions + إصلاح فشل التشغيل السابق

## المشكلة اللي انحلّت أولًا: 94.86% http_req_failed
التشغيل السابق فشل لأن الباك اند خلف globalRateLimit (600 طلب/15 دقيقة
لكل IP على كامل /api — app.ts)، وk6 يضرب من IP واحد (الـrunner) فيصطدم
بالسقف بسرعة وتظهر 429 كأنها فشل أداء وهي ليست كذلك. الحل: تفعيل
DISABLE_RATE_LIMIT=true (مدعوم أصلًا في rateLimit.middleware.ts) عند
تشغيل الباك اند، لكل سيناريو ما عدا auth-rate-limit (يحتاج الـlimiter
فعّالًا لأنه يختبره هو نفسه).

## الطلب: تحكّم بعدد الـVUs من صفحة Run workflow
أُضيف مُدخَل واحد اسمه "vus" (افتراضيًا 100). من Actions -> Load Test ->
Run workflow تكتب الرقم اللي تريده (200 / 500 / 1000...) بدون أي تعديل
أو commit على أي ملف.

هذا المُدخَل يمرَّر كـ LOAD_TEST_VUS إلى k6، وعدّلت 4 ملفات سكربتات
لتقرأه بدل رقم ثابت:
- backend/load-tests/scenarios/browsing.js  (ذروة، افتراضي 100)
- backend/load-tests/scenarios/search.js    (ذروة، افتراضي 60)
- backend/load-tests/scenarios/spike.js     (ذروة الـspike، افتراضي 500)
- backend/load-tests/scenarios/connection-pool-stress.js (ذروة، افتراضي 150)

كل ملف يحافظ على نسبة warm-up/baseline الأصلية نسبةً للذروة (مثلاً
browsing.js: warm-up = 20% من VUS، تمامًا كنسبة 20/100 الأصلية) — حتى
رقم ذروة كبير جدًا يمر بتسخين حقيقي بدل قفزة مباشرة لكامل الحمل.

## سيناريوهات لا يؤثر بها مُدخَل "vus" (بتصميم متعمد، ليس نسيانًا)
- **auth-rate-limit.js**: VUs ثابتة (25) عمدًا — يختبر صحة الـlimiter
  نفسه عند تجاوز بسيط لسقفه (10/15 دقيقة)، لا سعة القراءة. تغيير الرقم
  هنا يُبطل معنى الاختبار.
- **ad-creation.js**: يحاكي عددًا واقعيًا صغيرًا من البائعين (3)، ومُقيَّد
  أصلًا بـ createAdRateLimit (20/ساعة/IP) بغض النظر عن الـVUs.
- **stress-ramp.js**: له مُدخَله الخاص أصلًا (stress_scale) — نسبة تصغير
  لسلّم كامل من 100 حتى 5000، آلية مختلفة عن رقم ذروة واحد.
- **soak.js**: يستخدم SOAK_VUS (VUs ثابتة طوال مدة soak، لا سلّم) —
  مُدخَل "vus" نفسه يُمرَّر إليه أيضًا (نفس القيمة، متغيّر بيئة مختلف)
  فلا تحتاج مُدخَلًا منفصلًا لهذا.
- **max-payload-upload.js**: له مُدخَل خاص جديد اسمه "upload_vus"
  (افتراضي 5) بدل "vus" — لأن كل طلب رفع هنا 5 ملفات × 5 ميجا، فليس حملًا
  قابلًا للمقارنة مع طلب GET عادي.

## الملفات المعدَّلة في هذا التسليم
- .github/workflows/load-test.yml (DISABLE_RATE_LIMIT + مُدخَلا vus/upload_vus)
- backend/load-tests/scenarios/browsing.js
- backend/load-tests/scenarios/search.js
- backend/load-tests/scenarios/spike.js
- backend/load-tests/scenarios/connection-pool-stress.js
- backend/load-tests/README.md (توثيق LOAD_TEST_VUS + تحديث فقرة GitHub Actions)

تحقّقت من صحة الصياغة (syntax) لكل ملف k6 المعدَّل عبر `node --check`،
ومن صحة YAML عبر `yaml.safe_load` — لم يُشغَّل أي منها فعليًا ضد سيرفر
حي في هذه البيئة (لا شبكة/Docker متاحة هنا)؛ أول تشغيل حقيقي سيكون على
GitHub Actions نفسه.

## طريقة التطبيق
انسخ الملفات إلى نفس المسارات في المستودع (استبدال) والتزم (commit).
لا حاجة لأي migration أو خطوة إضافية.
