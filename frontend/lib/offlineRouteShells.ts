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

// FIX PWA-VER-01: كانت هذه القيمة عالقة على 'v4' بينما public/sw.js تجاوزها
// إلى 'v5' بجلسة سابقة — عدم تطابق حقيقي كان يعني أن warmRouteShells() تكتب
// بكاش لا يقرأ منه sw.js أبدًا، وأن 'activate' هناك يحذف هذا الكاش (v4) فورًا
// بعد كل تفعيل لأنه غير مدرَج بـ currentCaches. رُفعت هنا إلى 'v6' لتطابق
// public/sw.js's CACHE_VERSION الحالية — راجع تعليق CACHE_VERSION هناك.
const STATIC_CACHE = 'market-static-v17'; // يجب مطابقة CACHE_VERSION بـ public/sw.js (FIX SW-AUTH-PASSTHROUGH-01)
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
//
// FIX OFFLINE-SELF-LINKS-01: '/saved-ads', '/downloads', و'/saved-payments'
// أُضيفت هنا — وهذا هو التعارض الفعلي المكتشف بمراجعة هذه الميزة: صفحة
// /offline نفسها (app/offline/page.tsx) تعرض هذه الثلاثة تحديدًا كأزرار
// تحت عنوان "متاح على هذا الجهاز دون نت"، بلا أي شرط. لكن قبل هذا الإصلاح
// لم تكن أي منها ضمن CORE_ROUTES — أي أن أول زيارة (تنقّل قاسٍ، هو نفس
// السيناريو الذي أظهر أصلًا صفحة /offline: فتح التطبيق من الصفر بدون نت،
// PWA مثبّتة) لأي منها بدون أن تُزار أونلاين أولًا كانت تُقابَل بـ cache miss
// بـ STATIC_CACHE فتُعاد نفس /offline من جديد — المستخدم يضغط الزر المكتوب
// عليه "متاح دون نت" ويُعاد لنفس الصفحة التي كان فيها بالضبط، بلا أي تفسير.
// الثلاثة تطابق شروط الأمان الموثّقة أعلاه بالضبط (تحقّق فعلي من الكود):
// لا `export const dynamic`، metadata ثابت عبر buildMetadata، ومكوّن
// المحتوى الفعلي بكل واحدة ('SavedOfflineAdsPageClient'/'DownloadsPageClient'/
// 'SavedPaymentsPageClient') 'use client' بالكامل يقرأ من localStorage/Cache
// Storage المحلي فقط — لا بيانات مخصّصة بالسيرفر لأي زائر (بعكس صفحة محمية).
// FIX OFFLINE-DEAD-ROUTE-01: '/categories' أُزيلت — لا يوجد
// app/(public)/categories/page.tsx (فقط .../categories/[slug]/page.tsx
// الديناميكي)، فتخزين '/categories' هنا كان يفشل بـ404 في كل مرة
// (مؤكَّد عبر Network tab: طلبان فاشلان — html وRSC — بكل تحميل صفحة).
// مغلَّف بـtry/catch فلا يوقف شيء، لكنه هدر طلبين بطيئين بلا فائدة.
// صفحات عامة آمنة للـ shell (لا بيانات مستخدم في HTML).
const CORE_ROUTES = [
  '/', '/products', '/stores', '/search', '/services', '/ads',
  '/saved-ads', '/downloads', '/saved-payments',
  '/service-providers', '/sellers/ranking',
];

// صفحات محمية — 'use client' + بيانات عبر RQ بعد hydration.
// الشكل (HTML/RSC) قد يعكس حالة جلسة سابقة؛ يُمسَح PERSONAL_SHELL_CACHE
// كاملًا عند تسجيل الخروج (CLEAR_API_CACHE في sw.js) لنفس سبب API_CACHE.
// يجب أن تطابق isPersonalShellRoute في public/sw.js حرفيًا.
export const PERSONAL_SHELL_ROUTES = [
  // حساب / تنقّل
  '/messages',
  '/notifications',
  '/dashboard',
  '/favorites',
  '/my-ads',
  '/saved-searches',
  '/activity',
  // الملف والإعدادات (قوائم فقط — لا sessions حساسة كـ HTML بيانات)
  '/settings',
  '/settings/profile',
  '/settings/security',
  '/settings/sessions',
  '/settings/notifications',
  '/settings/seller',
  '/settings/service-provider',
  '/settings/blocked-users',
  '/settings/storage',
  // متجري
  '/my-store',
  '/my-store/inventory',
  '/my-store/members',
  '/my-store/products',
  '/my-store/promotions',
  '/my-store/collections',
  '/my-store/analytics',
  '/my-store/settings',
  // خدماتي + لوحة مقدّم الخدمة
  '/my-services',
  '/my-services/requests',
  '/my-services/appointments',
  '/my-services/analytics',
  '/service-broadcasts',
  '/service-broadcasts/quotes',
  '/my-requests',
];

const PERSONAL_SHELL_CACHE = 'market-personal-shell-v17';

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
    // FIX OFFLINE-CHUNK-01: كانت تُخزَّن HTML فقط — نفس الخلل بالضبط
    // الموثّق بـpublic/sw.js's install handler لـ/offline، لكنه هنا يطال
    // كل مسار بـCORE_ROUTES: أول تنقّل حقيقي بدون نت لمسار (مثلاً
    // /saved-ads) لم يُحمَّل chunk-ه أونلاين من قبل بهذا الجهاز تحديدًا
    // ينتج عنه "ChunkLoadError" (مؤكَّد فعليًا: طلب مستخدم ضغط زر
    // "التنزيلات" من صفحة /offline، فشل بـchunk 2708 لمسار
    // app/(public)/saved-ads، وعاد تلقائيًا لصفحة /offline خلال ثانية).
    // الحل: بعد جلب HTML كل مسار، نستخرج ونخزّن أصول _next/static
    // الخاصة فيه أيضًا — تمامًا نفس منطق sw.js's install handler.
    await Promise.allSettled(
      CORE_ROUTES.map(async (path) => {
        try {
          const response = await fetch(path, { credentials: 'same-origin' });
          if (!response.ok) return;
          await cache.put(path, response.clone());

          const html = await response.clone().text();
          const assetUrls = Array.from(
            html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+\.(?:js|css))"/g),
          )
            .map((match) => match[1])
            .filter((url): url is string => Boolean(url));

          await Promise.allSettled(
            assetUrls.map(async (assetUrl) => {
              try {
                const assetResponse = await fetch(assetUrl, { credentials: 'same-origin' });
                if (assetResponse.ok) await cache.put(assetUrl, assetResponse.clone());
              } catch {
                // أصل واحد فاشل لا يوقف تخزين الباقي.
              }
            }),
          );
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
 * تسخين أشكال الصفحات المحمية (رسائل، إشعارات، لوحة، مفضلة…) في
 * PERSONAL_SHELL_CACHE — يُستدعى فقط والمستخدم مسجّل دخول وأونلاين.
 * HTML + JS/CSS chunks + RSC shell بنفس منطق warmRouteShells.
 */
export async function warmPersonalShells(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!navigator.onLine) return;
  if (typeof caches === 'undefined') return;

  try {
    const cache = await caches.open(PERSONAL_SHELL_CACHE);

    await Promise.allSettled(
      PERSONAL_SHELL_ROUTES.map(async (path) => {
        try {
          const response = await fetch(path, { credentials: 'same-origin' });
          if (!response.ok) return;
          await cache.put(path, response.clone());

          const html = await response.clone().text();
          const assetUrls = Array.from(
            html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+\.(?:js|css))"/g),
          )
            .map((match) => match[1])
            .filter((url): url is string => Boolean(url));

          // الأصول تُخزَّن في STATIC_CACHE حتى يخدمها staleWhileRevalidate
          const staticCache = await caches.open(STATIC_CACHE);
          await Promise.allSettled(
            assetUrls.map(async (assetUrl) => {
              try {
                const assetResponse = await fetch(assetUrl, { credentials: 'same-origin' });
                if (assetResponse.ok) await staticCache.put(assetUrl, assetResponse.clone());
              } catch {
                /* ignore */
              }
            }),
          );
        } catch {
          /* ignore single path */
        }
      }),
    );

    await Promise.allSettled(
      PERSONAL_SHELL_ROUTES.map(async (path) => {
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
          /* ignore */
        }
      }),
    );
  } catch {
    /* ignore full failure */
  }
}

/**
 * ما هو غير مُغطّى: افتراض RSC بدون Next-Router-State-Tree — راجع تعليق
 * PHASE-3-B في public/sw.js. لم يُختبر كل مسار محمي بمتصفح حقيقي بعد.
 */
