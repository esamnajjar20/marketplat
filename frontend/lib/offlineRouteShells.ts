/**
 * PHASE-3 (خطة "بدون نت"): تنقّل حقيقي على مسارات غير مُزارة — الجزء (أ).
 *
 * ⚠️ نطاق هذا الملف محدود عمدًا لما تحققت منه فعليًا بقراءة الكود، وليس كل
 * "تنقّل بدون نت" ممكن — انظر القسم الأخير بالأسفل لما هو غير مُغطّى وليش.
 *
 * ما يحله هذا الملف: تنقّل "قاسٍ" (hard navigation) — فتح التطبيق من الصفر
 * بدون نت (PWA مثبّتة)، كتابة رابط مباشرة بالمتصفح، أو Pull-to-refresh —
 * لمسار زاره المستخدم شخصيًا من قبل وهو أونلاين، `sw.js`'s navigate
 * handler (`cache.match(request)` على STATIC_CACHE) يرجع /offline بدل
 * الصفحة الفعلية.
 *
 * لماذا الحل آمن لهذي الصفحات بالذات (`/products`, `/stores`, `/search`,
 * `/categories`): لا واحدة فيها `export const dynamic` ولا بيانات مخصّصة
 * تُجلب من السيرفر — كلها shells رفيعة (تحقق من نفس الملفات: `metadata`
 * ثابت عبر `buildMetadata`، والبيانات الفعلية تُجلب client-side عبر hooks
 * React Query). يعني HTML الموثّق مطابق لأي زائر بأي وقت — تخزينه استباقيًا
 * لا يخاطر بعرض محتوى قديم خاص بمستخدم آخر (بعكس صفحة محمية مثلًا).
 *
 * الآلية: نجلب مستند HTML الخام لكل مسار (fetch عادي، مو navigate) ونضعه
 * بـ STATIC_CACHE مفتاحًا بنفس الـ URL. لاحقًا لما يصير navigate حقيقي
 * (mode:'navigate') لنفس المسار بدون نت، `cache.match(request)` بـ sw.js
 * يطابقه بنفس URL — Cache API's match() يقارن على أساس URL (+method)،
 * مو mode الطلب، فمطابقة تخزين "fetch عادي" مع بحث "navigate" لاحق أمر
 * موثّق وسليم بالمواصفة. لم يُختبَر هذا فعليًا بمتصفح — انظر القيد بالأسفل.
 */

const STATIC_CACHE = 'market-static-v3'; // يجب مطابقة CACHE_VERSION بـ public/sw.js
const CORE_ROUTES = ['/products', '/stores', '/search', '/categories'];

export async function warmRouteShells(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!navigator.onLine) return;
  if (typeof caches === 'undefined') return;

  try {
    const cache = await caches.open(STATIC_CACHE);
    await Promise.allSettled(
      CORE_ROUTES.map(async (path) => {
        try {
          const response = await fetch(path, { credentials: 'same-origin' });
          if (response.ok) await cache.put(path, response.clone());
        } catch {
          // مسار واحد فاشل (مثلًا انقطع النت أثناء الجلب) لا يوقف الباقي.
        }
      }),
    );
  } catch {
    // فشل كامل — لا مشكلة، warmCoreBundle يُعاد استدعاؤها بأول فتح تالٍ.
  }
}

/**
 * ما هو غير مُغطّى، وليش — بصراحة بدل الادعاء بحل شامل:
 *
 * التنقّل "الناعم" (soft navigation) — المستخدم فاتح التطبيق فعليًا (SPA
 * تحمّلت)، يضغط رابط لمسار لم يُفتح بهذي الجلسة، وينقطع النت. Next.js App
 * Router بهذي الحالة لا يعمل full page navigate — يجلب RSC payload عبر
 * fetch عادي (Accept/Next-Router-State-Tree headers خاصة، وغالبًا query
 * param مختلف زي `?_rsc=<hash>`). هذا يعني URL الطلب يختلف عن مستند HTML
 * العادي اللي خزّناه هنا (query مختلف = مفتاح Cache API مختلف = miss).
 *
 * ليش ما حاولت "أصلحها": شكل طلب الـ RSC الفعلي (headers/query الدقيقة)
 * يحتاج فحص Network tab بمتصفح حقيقي وأنا ما قدرت أشغّل التطبيق فعليًا
 * بهذي البيئة (لا build/dev server متاح). كتابة كود يعترض شكل طلب لم
 * أتحقق منه = تخمين قد يكسر التنقّل الطبيعي بدل ما يصلحه. اللي يحتاجه
 * هذا فعليًا: افتح DevTools → Network بمتصفح حقيقي، افتح `/products`،
 * راقب شكل طلب أي تنقّل SPA تالٍ لمسار جديد (method/headers/query)، وبعدها
 * نقدر نضيف معالجة صحيحة له بـ sw.js's catch-all SWR branch. هذا الجزء
 * (ب) من المرحلة ٣ — بانتظار تلك المعلومة، مو منفَّذ هنا.
 */
