# الجلسة 4 — تراكمي فوق marketplat-main.zip (يشمل الجلسات 1–3)
تقليل الطلبات المتكررة:
- Frontend: prefetch={false} لكل <Link> (262 رابطاً).
- lib/pwa.ts: حد أدنى 4 دقائق بين فحوص تحديث الـ SW.
- lib/imageLoader.ts + next.config.ts (loaderFile): صور Cloudinary تُحمَّل مباشرة من CDN بدل /_next/image.
- lib/analytics.ts: تفريغ الدُفعات كل 30ث بدل 5ث. WebVitals: LCP/INP/CLS فقط وبعينة 25%.
- Presence: نبضة 120ث بدل 60ث، وTTL في الخادم 200ث بدل 90ث (apps/api/.../presence.ts).
- staleTime: sales(dashboard/debt/report) 180ث، follows/feed 120ث، activity 90ث، myAds 120ث.
- worker.ts: كاش health 45ث بدل 15ث، عينة نجاح Go 1/25، وحد 30ث بين كتابات النجاح لكل هدف. الاختبار cache-policy.test.mjs نجح محلياً (تعديل حلقة العينة إلى 25).
غير مختبر: اختبارات frontend (لا node_modules). فُحص بناء الجملة فقط.
