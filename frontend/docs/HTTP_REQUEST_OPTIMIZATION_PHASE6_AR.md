# تقرير تحسين طلبات HTTP في MarketPlat — Phase 6

**تاريخ الفحص:** 6 نوفمبر 2026  
**النطاق:** Frontend HTTP lifecycle، TanStack Query، مراقبة الشبكة، وجرد مواضع الاستدعاء. كما تحققت من تدقيقات Backend الموجودة في النسخة.

## 1. ما كان موجودًا قبل هذه المرحلة

النسخة المرفقة تحتوي أصلًا على عدة طبقات لتحسين الطلبات، لذلك لم أعد تنفيذها من الصفر:

- عميل Axios مركزي في `frontend/api/client.ts` يربط طلبات GET المتزامنة عندما لا يمرر المستدعي `AbortSignal`، مع فصل الطلبات حسب المستخدم وإصدار تنظيف الجلسة.
- QueryClient مركزي في `frontend/lib/queryClient.ts` بإعدادات Cache عامة واستثناءات حسب مجال البيانات، ومنع إعادة الجلب عند التركيز، وإعادة الجلب عند Mount وفق حداثة البيانات، وإعادة محاولات مقيدة بالأخطاء المؤقتة.
- تدقيق AST وجد أن 154 Query Functions في 61 ملفًا تقبل `AbortSignal` وتمرره إلى النقل؛ لا توجد حالة مفقودة في نطاق ذلك التدقيق.
- تدقيق مفاتيح Query يتحقق من 144 تعريفًا يستخدم مصنع `queryKeys`، ومن 251 عملية كاش تستخدم مفاتيح مشتقة من المصنع.
- الصفحة الرئيسية تختار Endpoint مجمعًا واحدًا بحسب حالة الهوية (`/home/feed` أو `/home/static`) بدل توزيع طلبات مستقلة، وصفحة المتجر تحمّل بيانات التبويب النشط فقط.
- يوجد Endpoint اختياري `batchGet` محدود بثمانية GETs ومسارات مسموح بها، لكن لا توجد له استدعاءات من واجهة التطبيق في هذه النسخة. لم أضف batching عشوائيًا دون Trace يثبت أنه يقلل إجمالي البيانات وزمن الاستجابة ولا يرفع التزامن على الخادم.
- Backend يحتوي إسقاطًا محددًا لحقول دليل المتاجر، وتجميع قراءة صلاحيات المتاجر في استعلام محدود، وقياسًا لعمليات Prisma حسب المسار.
- مرحلة Backend السابقة خفّضت انتهاء طلبات الخدمة المجدولة من حتى 200 UPDATE منفصل إلى UPDATE واحد مشروط يعيد السجلات التي تغيرت فعلًا. هذه نسبة 99.5% أقل في عمليات UPDATE الخاصة بهذه الدفعة القصوى تحديدًا، وليست نسبة خفض كل استعلامات المنصة.
- مرحلة Backend السابقة حسّنت نقطة البيع بجلب المنتجات المطلوبة باستعلام `findMany` واحد بدل طلب لكل سطر، كما نقلت تجميع بعض تكاليف المبيعات إلى PostgreSQL.

## 2. جرد مواضع استدعاءات HTTP وHooks

أنشأت مولّدًا ثابتًا:

`frontend/scripts/export-http-request-inventory.cjs`

والملف الناتج:

`frontend/docs/HTTP_REQUEST_CALLSITE_INVENTORY.csv`

يحتوي CSV على نوع الاستدعاء، HTTP method، Endpoint أو Query Key، التعبير البرمجي، مسار الملف، ورقم السطر.

| النوع | العدد في الشفرة |
|---|---:|
| Axios API Client | 366 |
| Server API reads | 19 |
| Native `fetch` | 27 |
| `fetchWithTimeout` | 15 |
| TanStack Query / queryOptions | 156 |
| TanStack Mutations | 160 |
| **إجمالي مواضع المصدر** | **743** |

هذه الأعداد تمثل مواضع برمجية في ملفات متعددة، وليست 743 طلبًا عند فتح صفحة واحدة. كما أن 156 سجل Query في CSV أوسع نطاقًا من تدقيق Query Functions البالغ 154؛ لأن CSV يشمل `queryOptions` ونطاقات ملفات إضافية. لا ينبغي مقارنة الرقمين باعتبارهما المقياس نفسه.

ملف الجرد قابل لإعادة التوليد بالأمر:

```bash
npm --prefix frontend run network:request-inventory
```

## 3. إصلاح دورة إلغاء الطلب أثناء تجديد الجلسة

في `frontend/lib/fetchClient.ts` كان مسار `401` ينتظر Promise تجديد الجلسة المشتركة مباشرة. عند مغادرة الصفحة أثناء انتظار التجديد، قد يستمر المستدعي في الانتظار ثم يصل إلى محاولة إعادة الطلب بإشارة `AbortSignal` ملغاة.

أضفت `waitForPromiseWithSignal` لتصبح عملية الانتظار قابلة للإلغاء لكل طلب بصورة مستقلة:

- إلغاء الطلب يرفض انتظار هذا المستدعي مباشرة بـ `AbortError`.
- لا يلغي Promise تجديد الجلسة المشتركة، حتى لا يعطل مستدعيات أخرى تنتظر تدوير Token/CSRF.
- يوجد فحص إضافي بعد اكتمال التجديد وقبل دخول محاولة الإعادة، لإغلاق سباق التوقيت.
- أضفت اختبار Regression يغطي الإلغاء أثناء انتظار التجديد، ويتحقق أن `fetch` لا يُستدعى مرة ثانية لهذا المستدعي.

هذا يمنع استدعاء `fetch` زائدًا بعد إلغاء الطلب؛ لكن لا أصفه بأنه خفض مقاس في عدد HTTP الفعلي، لأن `fetch` بإشارة ملغاة مسبقًا يُفترض أن يرفض قبل إرسال الشبكة.

## 4. تحسين مراقبة الأداء والكاش

في:

- `frontend/lib/networkRequestMonitor.ts`
- `frontend/components/admin/AdminNetworkRequestsPanel.tsx`

أضفت ملخصات حسب صفحة المصدر:

- P50 وP95 وP99 لزمن الاستجابة، بجانب المتوسط.
- عدد استجابات Cache من نوع HIT وMISS وSTALE وBYPASS.
- معدل Cache Hit محسوب هكذا:

\[
\text{Hit Rate} = \frac{HIT}{HIT + MISS + STALE} \times 100
\]

لا تدخل BYPASS في مقام معدل الإصابة؛ لأنه ليس محاولة استفادة من Cache. وإذا لم تتوفر عينات قابلة للحساب، تظهر القيمة غير متاحة بدل إظهار 0% مضلل.

كذلك أصلحت خطأ قياس الواجهة: كانت بعض بطاقات زمن الاستجابة تعتمد على السجل الكامل حتى عند استخدام فلاتر؛ أصبحت تعتمد على العينة المفلترة نفسها.

لم تضف هذه القياسات أي طلبات API جديدة. وهي لا تحفظ أجسام الطلبات أو الاستجابات أو بيانات المصادقة.

## 5. نتائج التدقيقات

| الفحص | النتيجة |
|---|---:|
| Phase 6 focused audit | 9/9 |
| Fetch Client CSRF/Auth/Retry | 14/14 |
| HTTP Request Phase 3 | 15/15 |
| Network Request Monitor | 21/21 |
| GET Deduplication / Concurrency | 9/9 |
| Query AbortSignal | 154/154 |
| Store HTTP payload / authorization | 13/13 |
| Prisma query phase 5 | 16/16 |
| Prisma query phase 6 | 15/15 |
| Package script references | 111/111 |
| TypeScript parser scan | 2,434 ملفًا، صفر أخطاء Syntax |

فشل سابق ظهر في فحص `fetchClient` كان من Regex داخل سكربت التدقيق لا يطابق `options.signal ?? undefined`، رغم وجود إلغاء صحيح لفترة الانتظار. تم تصحيح الفحص، ثم أضيف اختبارًا مستقلًا للحالة التي كانت ناقصة فعلًا: الإلغاء خلال انتظار تجديد الجلسة.

## 6. مقارنة قبل/بعد هذه المرحلة

| الجانب | قبل Phase 6 | بعد Phase 6 |
|---|---|---|
| إلغاء طلب GET أثناء Refresh | قد ينتظر استدعاء التجديد المشترك ثم يصل إلى مسار الإعادة بإشارة ملغاة | ينتهي انتظار هذا المستدعي مباشرة، دون إلغاء Refresh المشترك، ولا يبدأ محاولة إعادة جديدة |
| زمن كل صفحة | ملخص المسار يعرض المتوسط فقط | المتوسط + P50 + P95 + P99 لكل مسار صفحة |
| فعالية Cache | تحفظ حالة `X-Cache` على الطلب الفردي | تعرض معدل HIT على مستوى العينة والمسار مع فصل BYPASS |
| الفلاتر في لوحة المراقبة | بعض بطاقات الزمن تحسب من كامل السجل | كل الملخصات تحسب من العينة المفلترة |
| خريطة مصدر الطلبات | جرد Query إجمالي/حسب الملف | CSV يولّد مواضع HTTP/Query/Mutation مع الملف والسطر والتعبير |

**لا توجد مقارنة رقمية موثوقة لعدد طلبات صفحات الإنتاج أو حجم النقل قبل/بعد**؛ لأن الأرشيف لا يحتوي سجل Browser Network Traces قبل التعديل وبعده، ولا جلسة إنتاج موثقة. لن أختلق هذه الأرقام. يمكن إكمالها بعد نشر النسخة وتشغيل نفس السيناريوهات بنفس الحساب والبيانات والشبكة، مع استخدام مراقب الشبكة وDevTools.

## 7. الفحوصات التي لا يمكن إكمالها في هذه البيئة

لم تكن `node_modules` موجودة، ولم يكن `pnpm` أو `vitest` مثبتًا في بيئة التنفيذ. لذلك:

- نفذت تدقيقات Node الساكنة المسجلة أعلاه بنجاح.
- نفذت فحص Parser على 2,434 ملف مصدر دون أخطاء صياغة.
- لم أنفذ Vitest، أو TypeScript semantic type-check، أو Production Build.
- لم أتصل بـRender/Cloudflare/Neon، ولم أستخرج قياس SQL حيًا.

لتشغيل التدقيقات في بيئة المشروع بعد تثبيت اعتمادياته:

```bash
npm --prefix frontend run network:phase6-audit
pnpm audit:http-requests
```

الأمر الثاني يشغّل التدقيقات الجامعة للـFrontend وBackend من جذر Monorepo في بيئة يتوفر فيها pnpm.

## 8. الملفات الأساسية في هذه الحزمة

- `frontend/lib/fetchClient.ts`
- `frontend/__tests__/unit/lib/fetchClient.test.ts`
- `frontend/scripts/fetch-client-csrf-audit.mjs`
- `frontend/lib/networkRequestMonitor.ts`
- `frontend/components/admin/AdminNetworkRequestsPanel.tsx`
- `frontend/__tests__/unit/lib/networkRequestMonitor.test.ts`
- `frontend/scripts/http-request-phase3-audit.mjs`
- `frontend/scripts/network-request-monitor-audit.mjs`
- `frontend/scripts/http-request-phase6-audit.mjs`
- `frontend/scripts/export-http-request-inventory.cjs`
- `frontend/scripts/http-request-inventory.cjs`
- `frontend/package.json` و`package.json`
- `frontend/docs/HTTP_REQUEST_OPTIMIZATION_AUDIT.md`
- `frontend/docs/HTTP_REQUEST_CALLSITE_INVENTORY.csv`
