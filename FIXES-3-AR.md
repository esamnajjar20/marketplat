# الجلسة 3 — تراكمي (يشمل الجلستين 1 و2)
- الجلسة 1: serverApiFetch (تشخيص)، urlWithParams/useOwnedListPage/Pagination/MyServiceRequestsList (روابط ?tab المتداخلة)، Timeline (prefetch)، سقف sales/reports.
- الجلسة 2: worker.ts (single-flight للـ registry/health، TTL 60s، إيقاف تسجيل health عند فتح الدائرة).
- الجلسة 3: (أ) إضافة prefetch={false} لكل <Link> بلا تحديد (262 رابطاً في 133 ملفاً) — 63% من طلبات السجل كانت RSC prefetch.
  (ب) lib/pwa.ts: حد أدنى 4 دقائق بين فحوص تحديث الـ SW (كان يتكرر مع كل visibilitychange/online، ومعه cache-policy.js وcache-contract.js).
- غير مختبر: لا node_modules هنا. فُحص بناء الجملة لـ 661 ملف tsx فقط.
