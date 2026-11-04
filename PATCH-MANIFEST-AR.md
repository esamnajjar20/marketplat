# بيان ملفات التعديلات المجمّعة – MarketPlat

تحتوي هذه الحزمة الملفات الجديدة والمعدّلة فقط مقارنةً بالأرشيف الأصلي للمشروع.
المسارات داخل ZIP **نسبية مباشرة إلى جذر المشروع**؛ فك الضغط من داخل مجلد المستودع لدمج الملفات في أماكنها الصحيحة.
المحتوى مأخوذ من آخر نسخة موحّدة، ويشمل تحسين Worker وService Worker وتجربة المستخدم وإصلاحات الشبكة والمصادقة.

- ملفات جديدة: **13**
- ملفات معدّلة: **50**
- إجمالي الملفات المضمّنة: **63**
- ملفات محذوفة عمدًا من المشروع: **1**

## الملفات الجديدة

- `UX-EXPERIENCE-AUDIT-REPORT-AR.md`
- `WORKER-UPGRADE-REPORT-AR.md`
- `apps/mobile/scripts/verify-appointment-booking-ux.mjs`
- `apps/mobile/src/features/appointments/__tests__/appointment-slots.test.ts`
- `apps/mobile/src/features/appointments/appointment-slots.ts`
- `apps/mobile/src/lib/__tests__/formatters.test.ts`
- `frontend/__tests__/unit/lib/adminDeveloperToolsSetting.test.ts`
- `frontend/__tests__/unit/lib/fetchClient.test.ts`
- `frontend/__tests__/unit/lib/fileArrayBuffer.test.ts`
- `frontend/app/(public)/services/[id]/error.tsx`
- `frontend/lib/adminDeveloperToolsSetting.ts`
- `frontend/lib/fileArrayBuffer.ts`
- `frontend/scripts/fetch-client-csrf-audit.mjs`

## الملفات المعدّلة

- `apps/api/.env.example`
- `apps/api/src/config/env.ts`
- `apps/api/src/shared/cache/edgePurge.ts`
- `apps/api/tests/unit/edgePurge.test.ts`
- `apps/mobile/app/appointment-create.tsx`
- `apps/mobile/app/appointments.tsx`
- `apps/mobile/app/my-services.tsx`
- `apps/mobile/app/products/[id].tsx`
- `apps/mobile/app/service-requests.tsx`
- `apps/mobile/scripts/verify-feature-phase1.mjs`
- `apps/mobile/scripts/verify-feature-phase2.mjs`
- `apps/mobile/scripts/verify-feature-remaining-account-pages.mjs`
- `apps/mobile/scripts/verify-mobile-unification-round4.mjs`
- `apps/mobile/scripts/verify-product-contact-flow.mjs`
- `apps/mobile/src/features/appointments/appointments.api.ts`
- `apps/mobile/src/features/services/services.api.ts`
- `apps/mobile/src/lib/formatters.ts`
- `frontend/__tests__/components/OfflineBootstrap.test.tsx`
- `frontend/__tests__/unit/lib/buildVersionCheck.test.ts`
- `frontend/__tests__/unit/lib/pwa.test.ts`
- `frontend/app/update/page.tsx`
- `frontend/components/admin/AdminDeveloperToolsControl.tsx`
- `frontend/components/admin/AdminInfrastructureGateway.tsx`
- `frontend/components/admin/AdminNetworkRequestsPanel.tsx`
- `frontend/components/debug/AdminScriptConsole.tsx`
- `frontend/components/pwa/OfflineBootstrap.tsx`
- `frontend/components/sales/SalesAutomationPanel.tsx`
- `frontend/hooks/mutations/useAuthMutations.ts`
- `frontend/hooks/useAuthRestoreRetry.ts`
- `frontend/hooks/useFormDraftAttachments.ts`
- `frontend/lib/buildVersionCheck.ts`
- `frontend/lib/fetchClient.ts`
- `frontend/lib/networkRequestMonitor.ts`
- `frontend/lib/offlineAdDrafts.ts`
- `frontend/lib/pwa.ts`
- `frontend/lib/swStaleActivation.ts`
- `frontend/lib/swTokenSync.ts`
- `frontend/package.json`
- `frontend/scripts/loading-system-audit.mjs`
- `frontend/scripts/network-request-monitor-audit.mjs`
- `frontend/scripts/offline-final-audit.mjs`
- `frontend/scripts/sw-lifecycle-resilience-audit.mjs`
- `frontend/scripts/sw-update-safety-audit.mjs`
- `workers/cf-api-proxy/SMART-GATEWAY-IMPLEMENTATION-AR.md`
- `workers/cf-api-proxy/cache-policy.test.mjs`
- `workers/cf-api-proxy/cache-probe.mjs`
- `workers/cf-api-proxy/src/types.ts`
- `workers/cf-api-proxy/worker.ts`
- `workers/cf-api-proxy/wrangler.example.jsonc`
- `workers/cf-api-proxy/wrangler.toml`

## الملفات المحذوفة عمدًا

- `workers/cf-api-proxy/worker.js` — حُذف لأنه مصدر قديم/متعارض؛ النشر يعتمد ملف TypeScript المقابل.

## طريقة الدمج

1. خذ نسخة احتياطية من المشروع الحالي أو أنشئ فرع Git جديدًا.
2. فك ضغط ZIP من داخل جذر المشروع؛ ستظهر المسارات مثل `frontend/...` و`apps/...` مباشرة دون مجلد وسيط.
3. راجع حذف `workers/cf-api-proxy/worker.js` يدويًا إن كانت لديك تعديلات محلية عليه؛ لا تستعده فوق `worker.ts`.
4. راجع ملفات البيئة والأسرار يدويًا؛ الحزمة لا تحتوي أسرار حسابك أو إعدادات Cloudflare الفعلية.
5. شغّل فحوص المشروع الكاملة قبل النشر.

لم أضمّن الملفات التي لم تتغير عن الأصل، ولا ملفات JSON المستخدمة كمدخلات تشخيص، ولا تقارير خارج شجرة المشروع.
