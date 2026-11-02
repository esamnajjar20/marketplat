# MarketPlat Smart Gateway — تقرير المرحلة الثانية

## ملخص التنفيذ

استُكملت المرحلة الثانية فوق Worker الحالي `workers/cf-api-proxy/worker.js` دون إنشاء Proxy موازٍ. أضيفت واجهة إدارة للبنية التحتية داخل لوحة الإدارة، وأضيف مسار Next.js خادمي يربط اللوحة بمسار Registry المحمي في API Worker.

## ما تم تنفيذه

1. **لوحة إدارة داخل المنصة** على `/admin?tab=infrastructure`، مرئية لدوري `ADMIN` و`SUPER_ADMIN` فقط. يستطيع المشرف إضافة سيرفر Backend أو إزالته، وتعديل الوزن، وتفعيله/تعطيله، ومراجعة مصدر الإعدادات ورقم النسخة وآخر تحديث.
2. **فحص صحة يدوي** من اللوحة. يطلب Worker `/health` من كل Backend مفعّل بمهلة 4 ثوانٍ ويعرض HTTP status وزمن الاستجابة. الفحص يدوي فقط؛ لم يُضف Cron أو فحص خلفي دوري، ولم يُفعّل Warmup.
3. **طبقة مصادقة خادمية** في `frontend/app/api/admin/gateway/registry/route.ts`. تتحقق من المستخدم عبر `GET /api/v1/users/me` باستخدام `API_WORKER` Service Binding، ولا تسمح إلا بـ `ADMIN` و`SUPER_ADMIN`. رمز الوصول الحالي يمر إلى هذا التحقق فقط، ولا يُمرر إلى Registry Worker.
4. **حماية CSRF** لعمليات PUT وPOST: تتطلب Origin مطابقًا لنطاق الواجهة، وترفض الطلب عند غيابه أو اختلافه.
5. **سر منفصل للبوابة** باسم `GATEWAY_ADMIN_TOKEN` يُقرأ داخل Worker الواجهة من جهة الخادم ويُرسل إلى API Worker؛ لا يظهر السر في كود المتصفح أو الاستجابة. أُضيف توثيق إعداد السر في `frontend/.env.example` و`frontend/wrangler.jsonc`.
6. **حماية من تعارض التحرير**: يمكن لطلب PUT إرسال رقم `version` الذي قرأته اللوحة. إذا اكتشف Worker اختلاف النسخة يرجع `409 REGISTRY_VERSION_CONFLICT` بدل الاستبدال الصامت. هذه حماية تفاؤلية مفيدة، لكنها ليست قفلًا ذريًا موزعًا لأن KV ذات اتساق نهائي؛ لا تعتمد عليها كضمان لمنع كل سباقات الكتابة العابرة للمناطق.
7. **تكامل واجهة الإدارة**: إضافة تبويب وإظهار رابط جانبي وإضافة redirect legacy واختبارات لصلاحيات ظهور الرابط.

## الملفات الرئيسية

- `workers/cf-api-proxy/worker.js`
- `workers/cf-api-proxy/cache-policy.test.mjs`
- `workers/cf-api-proxy/SMART-GATEWAY-IMPLEMENTATION-AR.md`
- `frontend/app/api/admin/gateway/registry/route.ts`
- `frontend/components/admin/AdminInfrastructureGateway.tsx`
- `frontend/components/admin/AdminTabsHub.tsx`
- `frontend/components/admin/AdminSidebar.tsx`
- `frontend/lib/adminHubTabs.ts`
- `frontend/lib/constants.ts`
- `frontend/next.config.ts`
- `frontend/wrangler.jsonc`
- `frontend/.env.example`
- اختبارات تبويب الإدارة وSidebar ومسار Registry.

## نتائج التحقق المنفذ

| الفحص | النتيجة |
|---|---:|
| `workers/cf-api-proxy`: `npm test` | ناجح |
| `workers/cf-api-proxy`: `npm run type-check` (Node syntax checks) | ناجح |
| `frontend`: `node scripts/navigation-integrity-audit.mjs` | 26/26 ناجح |
| TypeScript/TSX transpile syntax للملفات المعدلة | 9/9 ناجح |

## ما لم يُنفذ أو لم يمكن التحقق منه

- لم تُشغّل اختبارات Vitest الجديدة الخاصة بمسار الإدارة، ولا `tsc --noEmit` أو `next build`؛ الحزمة لا تحتوي على `node_modules` للواجهة.
- لم يتم النشر إلى Cloudflare ولم يتم فحص خوادم الإنتاج الحقيقية.
- فحص الصحة يدوي و`/health` هو Liveness Check فقط؛ لا يثبت جاهزية قاعدة البيانات أو Redis.
- حالة Circuit Breaker ما زالت محلية لكل Worker isolate، وKV لا تضمن انتشارًا فوريًا عالميًا.
- توجيه Frontend Pool لم يُنفذ. ما زالت هذه المرحلة خاصة بتوجيه API Backend.

## إعداد السر قبل النشر

يجب إعداد **القيمة السرية نفسها** كـ Secret مستقل في كلا الـ Workerين، دون إضافتها لأي متغير `NEXT_PUBLIC_`:

```bash
# API Worker
cd workers/cf-api-proxy
npx wrangler secret put GATEWAY_ADMIN_TOKEN

# Next.js Frontend Worker
cd frontend
npx wrangler secret put GATEWAY_ADMIN_TOKEN
```

أبقِ Service Binding `API_WORKER` في `frontend/wrangler.jsonc` موجّهًا إلى Worker الخدمة `marketplat-api`. انشر API Worker أولًا، ثم انشر Frontend Worker بالطريقة المعتمدة في مشروعك. لا تشارك الرمز في المحادثات أو سجلات CI.

## القرار المعماري للمرحلة التالية

قبل بناء Frontend Pool أو مراقبة دورية مركزية، يوصى باختبار لوحة الإدارة على بيئة staging، والتحقق من صلاحيات ADMIN/SUPER_ADMIN، وإضافة سيرفر Backend تجريبي، وتنفيذ فحص يدوي، وتجربة failover وKV propagation. بعد ذلك يمكن تصميم Frontend Pool بشكل مستقل مع التعامل صراحةً مع توافق نسخ Next.js وRSC وServer Actions والملفات الثابتة.
