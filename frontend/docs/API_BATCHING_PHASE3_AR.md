# تقرير المرحلة الثالثة — تجميع طلبات الملف الشخصي

## النطاق

استهدفت هذه المرحلة ترويسة الملف الشخصي العام `/profile/:id`، حيث كانت حالة متابعة المستخدم وحالة اتصاله تُجلبان بطلبين مستقلين:

- `GET /follows/status/USER/:id`
- `GET /users/presence?ids=:id`

كلتا القيمتين تظهران في الترويسة نفسها، وتُطلبان عند عرض الملف الشخصي لمستخدم آخر. لم يكن هناك داعٍ لاتصالين منفصلين.

## التغيير

أُضيف endpoint محمي:

```http
GET /api/v1/users/:id/profile-state
```

ويعيد:

```json
{
  "following": true,
  "online": true,
  "lastSeenAt": null
}
```

ينفذ الباك إند فحص المتابعة وقراءة الحضور بالتوازي باستخدام `Promise.all`.

## تغييرات الواجهة

- أضيف `usersApi.getProfileInteractionState`.
- أضيف hook مشترك `useProfileInteractionState`.
- يستخدم كل من مؤشر الاتصال وزر المتابعة الـ hook نفسه؛ React Query يشارك الطلب الواحد بدل إرسال طلبين.
- مفتاح الكاش يتضمن معرّف صاحب الملف ومعرّف المشاهد، لمنع مشاركة حالة متابعة/حضور مستخدم بين جلسات مختلفة.
- استجابة endpoint تحمل `Cache-Control: private, no-store`.
- بعد متابعة أو إلغاء متابعة مستخدم، تُحدّث قيمة `following` في كاش الملف الشخصي للمشاهد الحالي مباشرة.
- عند عرض المستخدم ملفه الشخصي، لا ينفذ endpoint ولا استعلام Redis أو قاعدة البيانات لهاتين القيمتين.
- القصص، الإعلانات، المتجر، الخدمات والتقييمات بقيت منفصلة/مؤجلة؛ لم تُجمع بيانات لا يحتاجها العرض الحالي.

## الأثر المتوقع

عند فتح ملف شخصي لمستخدم آخر مع وجود جلسة مصادق عليها، يستبدل طلبان خفيفان بطلب واحد. لا يتغير عدد طلبات محتوى الملف أو التبويبات؛ لأنها مستقلة ولا تُطلب جميعها في اللحظة نفسها.

## الملفات

- `apps/api/src/modules/users/users.routes.ts`
- `apps/api/src/modules/users/users.controller.ts`
- `apps/api/src/modules/users/users.service.ts`
- `apps/api/tests/helpers/httpMocks.helper.ts`
- `apps/api/tests/unit/users.controller.test.ts`
- `apps/api/tests/unit/users.service.test.ts`
- `frontend/api/users.api.ts`
- `frontend/lib/queryKeys.ts`
- `frontend/hooks/queries/useUsers.ts`
- `frontend/components/profile/PublicProfileInteractive.tsx`
- `frontend/hooks/mutations/useFollowMutations.ts`
- `frontend/__tests__/components/PublicProfileHeader.test.tsx`
- `frontend/scripts/api-batching-phase3-audit.mjs`

## التحقق

- تدقيق عقد التجميع ومفاتيح الكاش وترتيب المسار وخصوصية الاستجابة: 10/10 (`node scripts/api-batching-phase3-audit.mjs` من مجلد `frontend`).
- تدقيقا المرحلتين السابقتين: المرحلة الأولى 13/13، والمرحلة الثانية PASSED.
- تحويل صياغة TypeScript/TSX للملفات المعدلة: 12/12.
- أضيفت اختبارات وحدات للـ controller والخدمة، لكنها لم تُشغّل في هذه البيئة.
- لم يُشغّل `tsc --noEmit` أو Jest/Vitest أو بناء Next.js/Express؛ dependencies غير موجودة في الأرشيف. فحص transpile يتحقق من الصياغة فقط ولا يثبت صحة الأنواع أو نجاح البناء.

## اختبار ما بعد النشر

1. افتح ملف مستخدم آخر بحساب مسجل الدخول.
2. تحقق من ظهور طلب واحد إلى `/users/:id/profile-state` بدل طلبي presence وfollow-status.
3. تأكد من أن استجابة الطلب `private, no-store`.
4. اضغط متابعة ثم إلغاء متابعة وتأكد من تحديث الزر مباشرة دون طلب status منفصل.
5. افتح ملفك الشخصي وتأكد من عدم إرسال طلب `profile-state`.
6. سجّل الخروج ثم الدخول بحساب آخر وتأكد من عدم ظهور حالة المتابعة السابقة من الكاش.

## الحدود

هذا التجميع يخص الملف الشخصي العام فقط. لم تُدمج طلبات المحادثات أو القصص أو الإعلانات أو التقييمات لأنها ليست جميعًا مطلوبة عند أول عرض للترويسة، أو لأنها تُحمّل عند فتح القسم المعني.
