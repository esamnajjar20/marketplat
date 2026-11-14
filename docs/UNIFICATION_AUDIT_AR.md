# تقرير توحيد الأنظمة غير الموحّدة

## ما تم توحيده (منفّذ في هذه الحزمة)

| النظام | قبل | بعد |
|---|---|---|
| تسميات الحالات في الموبايل | 14 خريطة نصية مكرّرة داخل الشاشات + `statusLabel` عامة بصياغة واحدة لكل النطاقات | سجل واحد `domainLabel(domain, value, fallback)` في `apps/mobile/src/lib/status-labels.ts` |
| تسمية الطلب/العرض في الموبايل | `my-requests` و`my-offers` تعرضان صياغة مختلفة عن شاشة التفاصيل | نفس الصياغة في كل الشاشات |
| حالة البلاغ بين الويب والموبايل | الويب «تم الحل/تم الرفض»، الموبايل «تمت المعالجة/أُغلق البلاغ» | الموبايل يطابق الويب |
| حالة عضو المتجر (ويب) | خريطتان محليتان داخل `MyStoreMembersList` | `STORE_MEMBER_STATUS_*` في `lib/storeStatus.ts` |
| تنسيق الوقت (ويب) | `Intl` مباشر بلغة `ar` أو `ar-PS` بدون `latn` وبمنطقة زمنية الجهاز | `formatHourMinute` و`formatDayMonthTime` و`formatTimestamp` و`formatDateTimeMedium` (غزة + أرقام لاتينية) |
| النسخ للحافظة (ويب) | `navigator.clipboard` مباشر في `AdminMonitoringCenter` | `copyToClipboard` |

## أُضيف في الدفعة الثانية

- `shareText` في `features/sharing/deep-links.ts` بدل `Share.share` المباشر في شاشتي المبيعات والفاتورة.
- `lib/contact-links.ts` (`telUrl`/`whatsappUrl`) بدل بناء `tel:` و`wa.me` يدويًا في `service-providers/[id]`.
- حذف `REVIEWED` من تسميات بلاغات الموبايل (غير موجودة في enum الـ backend).

## لم يُغيَّر عمدًا (يحتاج قرارك)

1. صياغة SOLD: «مباع» (AdCard والموبايل، واختبار AdCard يثبّتها) مقابل «تم البيع» في `STATUS_LABELS`.
2. `AdminRecentActivity` يحتفظ بخريطته المحلية: `AdminAdsTable` يبني خيارات الفلتر من `Object.entries(STATUS_LABELS)`، فإضافة PENDING/REJECTED هناك تغيّر الفلتر.
3. `DownloadStoreCatalogButton` و`AdminNetworkRequestsPanel` و`messageUtils`: تنسيقات خاصة بحالات استخدامها.
4. `FlatList` في `app/index` و`stories` و`messages/[id]`: مقصودة على الأرجح (رأس مخصص، أفقي، مقلوب).
5. نقل رموز الأخطاء والحالات إلى `@marketplat/contracts`: مرحلة منفصلة (الموبايل والويب لا يعتمدان على الحزمة حاليًا).

---

# الدفعة الثالثة — فحص شامل لكل الأنظمة (14 نوفمبر 2026)

طريقة العمل: فحص آلي بأنماط مخالفة لكل سطح (الويب، الموبايل، الـ API، CI) ثم قراءة كل موضع قبل تغييره.
القاعدة: لا أغيّر ما وثّقتُه سابقًا على أنه مقصود، ولا أغيّر سلوكًا يحتاج اختبار جهاز.

## ما تم توحيده

| السطح | النظام | قبل | بعد |
|---|---|---|---|
| الويب | روابط الاتصال | `` `tel:${phone}` `` يدويًا في 4 مكوّنات و`mailto:` في صفحة التواصل | `buildTelUrl` / `buildMailtoUrl` في `lib/contactLinks.ts` (ينظّف المسافات والشرطات) |
| الويب | فتح رابط في نافذة جديدة | `window.open(..., '_blank', 'noopener,noreferrer')` مكرر في 6 مواضع | `openExternal` في `lib/openExternal.ts` |
| الويب | عرض المبالغ | `.toFixed(2) + ' ₪'` في `MixedPaymentForm` و`AddSaleDialog` | `formatMoney` |
| الويب | الأرقام والأوقات في الأدمن | `toLocaleString()` بلا لغة (`AdminUserSimulatorPanel`) و`Intl` بلا منطقة غزة (`AdminNetworkRequestsPanel`) | `formatNumber` و`formatClockTimeMs` (جديدة) |
| الموبايل | سحب-للتحديث | `RefreshControl` يدوي في 43 شاشة؛ بعضها يمرّر `colors` لأندرويد وبعضها لا (لون مؤشر مختلف بين الشاشات) | `BrandRefreshControl` يأخذ اللون من الثيم على iOS وأندرويد |
| الموبايل | يوم السوق (غزة) | `Intl.DateTimeFormat` مكرر في `appointment-create` | `marketDateKey` من `appointment-slots.ts` |
| الـ API | عميل Prisma في السكربتات | 14 سكربت يعمل `new PrismaClient()` منفصلًا بينما 10 سكربتات تستخدم `config/prisma` | الكل يستورد `prisma` من `config/prisma` |
| CI | إصدار Node | 3 workflows (`cron` و`promotion-lifecycle` و`sales-notifications`) تشغّل الـ API على Node 20 بينما `apps/api/Dockerfile` على 22 | 22 |
| CI | تثبيت الأكشنز | `checkout` و`setup-node` و`upload-artifact` و`pnpm/action-setup` عائمة (`@v4`) في 29 ملفًا ومثبتة بـ SHA في workflows الموبايل | الكل مثبّت بنفس الـ SHA المستخدم أصلًا في workflows الموبايل |
| CI | Dependabot | `directory: /backend` (المجلد غير موجود؛ الـ API في `apps/api`) فلا تصل تحديثات الـ API | `/apps/api` |

حواجز جديدة: `apps/mobile/scripts/verify-mobile-unification-round5.mjs` (يفشل إن عاد `RefreshControl` مباشر)،
واختبارات `contactLinks` و`openExternal` في الويب، وصفّان جدد في `frontend/docs/UNIFIED_HELPERS.md`.

## لم يُغيَّر عمدًا (يحتاج قرارك أو اختبار جهاز)

1. **كل بنود القائمة السابقة** (صياغة SOLD، `AdminRecentActivity`، `FlatList` المقصودة، نقل الأكواد إلى `@marketplat/contracts`).
2. `DownloadStoreCatalogButton` (`ar-EG`) و`messageUtils` (مفتاح اليوم لتجميع الرسائل): تنسيقات خاصة بحالة استخدامها.
3. `window.prompt` في `AdminNetworkRequestsPanel` و`AdminDeviceErrorsPanel`: ملاذ أخير للنسخ اليدوي بعد فشل `copyToClipboard`.
4. استدعاءات `fetch('/api/admin/...')` في 3 مكوّنات أدمن (`AdminInfrastructureGateway`, `AdminFeatureFlags`, `AdminConsolePanel`): مسارات Next المحلية، و`sameOriginApi` مخصص لـ `/api/v1`. المرشّح التالي: مساعد صغير لها.
5. الموبايل: 27 ملفًا ما زالت تدير التحميل بـ `setLoading` محليًا بدل `useAsyncResource`/`usePaginatedList`، و17 شاشة تستخدم `TextInput` مباشرة بدل `Field`/`SearchBar`. تغييرها يغيّر السلوك والمسافات ويحتاج اختبارًا على جهاز.
6. الـ API: `process.env` المباشر (أعلام go-worker وSentry وNODE_ENV) تُقرأ وقت التشغيل عمدًا، و`throw new Error` (104 موضعًا) يحتاج مراجعة كل حالة على حدة قبل تحويله إلى `AppError`، و`seedE2E.ts` يحتفظ بعميله المستقل.
7. CI: 14 workflow بلا `permissions` صريحة (`audit`, `cron`, `db-backup`, `db-migrate`, `gitleaks`, `knip`, `linkinator`, `load-test-5k`, `promotion-lifecycle`, `sales-notifications`, `semgrep`, `smoke-e2e`, `sqlfluff`, `trufflehog`) و10 بلا `timeout-minutes`. لم أضفها لأن كل workflow يحتاج فحص صلاحياته الفعلية حتى لا ينكسر. كذلك `setup-java@v4` عائم بينما workflows الموبايل تثبّت v6.1.0 (قفزة major)، وهناك 3 workflows لبناء APK (`build-apk` و`build-mobile-apk` و`android-test-apk`) و5 لاختبارات الحمل تحتاج قرار دمج.
8. Dependabot لا يغطي جذر pnpm ولا `apps/mobile`.

## نتائج التحقق

- فحص صياغة TypeScript لـ78 ملفًا معدّلًا/جديدًا: 0 أخطاء. لا يوجد `node_modules` ولا شبكة، فلم يُشغَّل `tsc` الدلالي ولا Vitest ولا Jest ولا ESLint.
- فاحصات الموبايل الساكنة: 77 فاحصًا نشطًا، 73 ناجحًا. الإخفاقات الأربعة (`feature-orders`, `phase65`, `phase67`, `sale-create-single-multiple`) موجودة في النسخة الأصلية قبل أي تعديل. عُدّل سطر واحد في `verify-appointment-booking-ux.mjs` ليتوافق مع `marketDateKey`.
- `lint-mobile.mjs` ناجح، و`node --test packages/contracts/test` 5/5، و`verify-workspace.mjs` ناجح، وكل ملفات YAML تُقرأ بلا أخطاء.
- يُنصح بتشغيل `pnpm install && pnpm type-check:all && pnpm test:all` قبل الدمج.

---

## تكملة الدفعة الثالثة (المتبقي)

| السطح | ما تم |
|---|---|
| CI | `permissions: contents: read` في 14 workflow كانت بلا صلاحيات صريحة (كلها `workflow_dispatch` أو cron ولا تكتب في المستودع)، و`timeout-minutes` لكل مهمة بلا مهلة. لم يبق workflow بلا `permissions` ولا مهمة تنفيذ بلا مهلة. |
| CI | `dependabot.yml` صار يغطي جذر pnpm (الموبايل وcontracts وworkers) بجانب `/apps/api` و`/frontend`، مع إبقاء ترقيات Expo وReact Native الكبرى يدوية. |
| الويب | `adminRouteFetch` (`lib/adminRouteFetch.ts`) لكل استدعاءات `/api/admin/*` في `AdminInfrastructureGateway` و`AdminFeatureFlags` و`AdminConsolePanel` (5 مواضع) بدل `fetch` مباشر، مع اختبار. |
| الموبايل | `saved-offline.tsx` نُقلت إلى `useAsyncResource`. |

### ما بقي فعلًا ولماذا
- **شاشات الموبايل الأخرى ذات `setLoading` المحلي** (مثل `store-collections` و`store-promotions` و`order-checkout` و`messages/[id]`): التحميل فيها متشابك مع ترقيم المنتجات واختيار المتجر ومسودات النماذج، فنقلها تغيير سلوك يلزمه اختبار على جهاز. نُقلت الشاشة البسيطة فقط.
- **`TextInput` المباشر في 17 شاشة** بدل `Field`/`SearchBar`: يغيّر المسافات والمحاذاة (RTL اليدوي) ويحتاج مراجعة بصرية.
- **`setup-java@v4` العائم** (workflowان): الـSHA المثبّت في workflows الموبايل هو v6.1.0 (قفزة major)، فلم أوحّده دون اختبار البناء.
- **دمج workflows** (3 لبناء APK و5 لاختبارات الحمل): قرار منتج.
- **`throw new Error` في الـ API** و`process.env` المباشر: مقصودان أو يحتاجان مراجعة كل حالة، كما في الدفعة السابقة.
