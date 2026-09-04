/**
 * PHASE-3 (خطة "بدون نت"): تنقّل حقيقي على مسارات غير مُزارة — الجزءان (أ) و(ب).
 *
 * ⚠️ نطاق هذا الملف محدود عمدًا لما تحققت منه فعليًا بقراءة الكود، وليس كل
 * "تنقّل بدون نت" ممكن — انظر القسم الأخير بالأسفل لما هو غير مُغطّى وليش.
 *
 * (أ) تنقّل "قاسٍ" (hard navigation) — فتح التطبيق من الصفر بدون نت (PWA
 * مثبّتة)، كتابة رابط مباشرة بالمتصفح، أو Pull-to-refresh — لمسار زاره
 * المستخدم شخصيًا من قبل وهو أونلاين، `sw.js`'s navigate handler
 * (`cache.match(request)` على STATIC_CACHE) يرجع /offline بدل الصفحة
 * الفعلية.
 *
 * الآلية (أ): نجلب مستند HTML الخام لكل مسار (fetch عادي، مو navigate)
 * ونضعه بـ STATIC_CACHE مفتاحًا بنفس الـ URL. لاحقًا لما يصير navigate
 * حقيقي (mode:'navigate') لنفس المسار بدون نت، `cache.match(request)` بـ
 * sw.js يطابقه بنفس URL — Cache API's match() يقارن على أساس URL (+method)،
 * مو mode الطلب، فمطابقة تخزين "fetch عادي" مع بحث "navigate" لاحق أمر
 * موثّق وسليم بالمواصفة.
 *
 * (ب) تنقّل "ناعم" (soft navigation / SPA) — المستخدم فاتح التطبيق فعليًا
 * ويضغط رابط لمسار لم يُزَر بهذي الجلسة، وينقطع النت أثناءه. Next.js App
 * Router هنا لا يعمل full navigate — يرسل fetch عادي برأس RSC:'1' وquery
 * param متغيّر (`_rsc=<hash>`)، فمطابقة URL الحرفية لما خزّنته (أ) تفشل.
 * الآلية (ب): نرسل نفس طلب RSC استباقيًا (رأس RSC:'1' بدون
 * Next-Router-State-Tree) ونخزّن الرد بمفتاح ثابت منفصل (`rscShellKey`)
 * بعد حذف رأس Vary — يطابقه sw.js's isRscShellRequest() لاحقًا بنفس
 * المنطق. التفصيل الكامل (لماذا Vary يمنع المطابقة، لماذا مفتاح ثابت لا
 * URL حرفي) موثّق في تعليق PHASE-3-B بـ public/sw.js.
 *
 * لماذا الحل آمن لهذي الصفحات بالذات (`/products`, `/stores`, `/search`,
 * `/categories`) — لكلا الجزأين (أ) و(ب): لا واحدة فيها `export const
 * dynamic` ولا بيانات مخصّصة تُجلب من السيرفر — كلها shells رفيعة (تحقق من
 * نفس الملفات: `metadata` ثابت عبر `buildMetadata`، والبيانات الفعلية
 * تُجلب client-side عبر hooks React Query). يعني HTML/RSC الموثّق مطابق
 * لأي زائر بأي وقت — تخزينه استباقيًا لا يخاطر بعرض محتوى قديم خاص بمستخدم
 * آخر (بعكس صفحة محمية مثلًا). لم يُختبَر أي من الجزأين فعليًا بمتصفح —
 * انظر القيد بالأسفل.
 */

const STATIC_CACHE = 'market-static-v4'; // يجب مطابقة CACHE_VERSION بـ public/sw.js
// '/' أُضيفت لاحقًا (نفس شروط الأمان الموثّقة أعلاه تنطبق عليها: لا
// `export const dynamic`، `metadata` ثابت عبر buildMetadata، وكل أقسامها
// 'use client' تجلب بياناتها عبر React Query بعد الـ hydration — حتى
// RecentProductsSection.tsx's isAuth يُقرأ من Zustand store بعد الـ
// hydration، مو من HTML/RSC مُخصَّص بالسيرفر، فالـ shell المخزَّن نفسه
// لكل الزوار سواء بسواء تمامًا كباقي المسارات الأربعة).
// '/services' أُضيفت لاحقًا (نفس الفحص: لا `dynamic`، metadata ثابت،
// ServiceListingsGrid/ServiceCategoryFilter كلاهما 'use client').
// '/ads' أُضيفت لاحقًا (ADD-ADS-PAGE): app/(public)/ads/page.tsx يطابق
// نفس شروط الأمان الموثّقة أعلاه بالضبط — لا `export const dynamic`،
// metadata ثابت عبر buildMetadata، وكل مكوّناته (SearchFilters/
// SearchFiltersSheet/SearchSortBarWrapper/SearchResults من مجلد
// components/ads) 'use client' وتجلب بياناتها عبر React Query. المسار
// الآخر المسمّى "ads" بـ lib/constants.ts هو /admin/ads وهو محمي ولا
// يجوز تخزينه إطلاقًا (انظر isProtectedPage بـ public/sw.js) — لا علاقة
// له بهذا.
const CORE_ROUTES = ['/', '/products', '/stores', '/search', '/categories', '/services', '/ads'];

/** يجب مطابقة sw.js's rscShellKey() بالضبط — مفتاح كاش ثابت منفصل عن URL
 * الطلب الحرفي، لأن طلبات RSC الفعلية تحمل query param `_rsc=<hash>`
 * متغيّر ورأس Vary يمنعان مطابقة Cache API الحرفية (انظر تعليق PHASE-3-B
 * في public/sw.js لتفصيل كامل للمشكلة والحل). */
function rscShellKey(path: string): string {
  return `${path}?__offline_rsc_shell`;
}

export async function warmRouteShells(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!navigator.onLine) return;
  if (typeof caches === 'undefined') return;

  try {
    const cache = await caches.open(STATIC_CACHE);

    // (أ) تنقّل قاسٍ — مستند HTML عادي، مفتاحه URL المسار كما هو.
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

    // (ب) تنقّل SPA (soft navigation) — نفس المسارات، لكن بطلب RSC (رأس
    // RSC:'1') يحاكي ما يرسله Next.js Router الفعلي، فيُملأ مفتاح
    // sw.js's isRscShellRequest() استباقيًا بدل انتظار أول تنقّل SPA حقيقي
    // وقت انقطاع النت (اللي حينها يفشل مرة واحدة قبل أي كاش). الاستجابة
    // تُخزَّن بدون رأس Vary (نفس منطق sw.js's stripVaryAndClone) لأن
    // Cache API's مطابقة Vary الداخلية سترفض المطابقة لاحقًا وإن كان مفتاح
    // البحث مطابقًا تمامًا.
    await Promise.allSettled(
      CORE_ROUTES.map(async (path) => {
        try {
          const response = await fetch(path, {
            credentials: 'same-origin',
            headers: { RSC: '1' },
          });
          if (!response.ok) return;
          const headers = new Headers(response.headers);
          headers.delete('Vary');
          const stored = new Response(await response.clone().blob(), {
            status: response.status,
            statusText: response.statusText,
            headers,
          });
          await cache.put(rscShellKey(path), stored);
        } catch {
          // مسار واحد فاشل لا يوقف الباقي — نفس منطق (أ) أعلاه.
        }
      }),
    );
  } catch {
    // فشل كامل — لا مشكلة، warmRouteShells تُعاد استدعاؤها بأول فتح تالٍ.
  }
}

/**
 * ما هو غير مُغطّى، وليش — بصراحة بدل الادعاء بحل شامل:
 *
 * الافتراض الجوهري لكل هذا الملف (وفرع RSC المقابل بـ sw.js): طلب RSC:'1'
 * بدون Next-Router-State-Tree (وهو ما يرسله هذا الملف عمدًا — لا نمرر
 * الرأس الثاني) يُرجع حمولة كاملة مستقلة بذاتها حسب توثيق Next.js الرسمي
 * (nextjs.org/docs/app/guides/cdn-caching + مصدر fetch-server-response.ts
 * المنشور، Next 16.3.1). لم يُختبَر هذا فعليًا بمتصفح حقيقي — لا build/dev
 * server كان متاحًا وقت الكتابة. إن لاحظت تنقّل SPA بدون نت يفشل رغم هذا
 * الإصلاح، أول شيء تتحقق منه: افتح DevTools → Network بمتصفح حقيقي، افتح
 * `/products`، راقب شكل طلب أي تنقّل SPA تالٍ لمسار جديد (headers/query)،
 * وقارنه بما يفترضه هذا الملف وsw.js's isRscShellRequest().
 */
