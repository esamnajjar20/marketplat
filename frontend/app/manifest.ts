import type { MetadataRoute } from 'next';
import { APP_NAME } from '@/lib/constants';

/**
 * Web App Manifest — /manifest.webmanifest
 *
 * FIX MISSING-ASSETS-01: the app had no manifest at all — a user on
 * mobile choosing "Add to Home Screen" would get a generic browser
 * shortcut with no name/theme instead of an installable-feeling PWA
 * entry.
 *
 * FIX PROD-02: the 192x192/512x512 icons below are generated the same
 * way as the 32x32 browser-tab icon (app/icon.tsx) — a solid-color
 * background with the "س" glyph, rendered at each size via
 * app/icon-192/route.tsx and app/icon-512/route.tsx. This closes the
 * gap where the manifest referenced sizes that didn't exist as actual
 * files. It is still not a substitute for real designed app icons: a
 * flat glyph-on-color square scales acceptably but isn't optimized
 * for maskable/adaptive icon safe zones the way a properly designed
 * icon set would be (Android in particular crops maskable icons to a
 * circle/squircle and expects the important content within a smaller
 * safe area than the full canvas). Swap these for real design assets
 * when available, ideally including a `"purpose": "maskable"` variant.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: 'سوق إلكتروني محلي لبيع وشراء السيارات والعقارات والإلكترونيات وأكثر في غزة',
    start_url: '/?source=pwa',
    id: '/',
    display: 'standalone',
    // FIX PWA-02: orientation مقيّد بـ any عمدًا (لا portrait فقط) — التطبيق
    // يحتوي صفحات جداول/لوحات تحكم (admin, dashboard) تستفيد من العرض
    // الأفقي على الأجهزة اللوحية؛ تقييدها بالعمودي فقط كان سيكسر تلك الصفحات.
    orientation: 'any',
    background_color: '#FDFBF7',
    theme_color: '#2F5D45',
    lang: 'ar',
    dir: 'rtl',
    categories: ['shopping', 'business'],
    icons: [
      {
        src: '/icon',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        src: '/icon-192',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        // FIX PWA-03: أيقونة maskable منفصلة — Android يقصّ الأيقونة العادية
        // إلى دائرة/مربع مدوّر ويتوقع أن يكون المحتوى المهم داخل "منطقة آمنة"
        // أصغر من الحجم الكامل. app/icon-512-maskable/route.tsx يعيد نفس
        // الرمز لكن بحشوة (padding) كافية بدل تعبئة الحافة بالكامل.
        src: '/icon-512-maskable',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    // اختصارات تظهر عند الضغط المطوّل على أيقونة التطبيق (Android/Desktop) —
    // أسرع طريق للأفعال الأكثر استخدامًا دون المرور بالصفحة الرئيسية.
    shortcuts: [
      {
        name: 'إضافة إعلان جديد',
        short_name: 'إعلان جديد',
        url: '/ads/create?source=pwa-shortcut',
        icons: [{ src: '/icon-192', sizes: '192x192' }],
      },
      {
        name: 'إعلاناتي',
        short_name: 'إعلاناتي',
        url: '/my-ads?source=pwa-shortcut',
        icons: [{ src: '/icon-192', sizes: '192x192' }],
      },
      {
        name: 'الرسائل',
        short_name: 'الرسائل',
        url: '/messages?source=pwa-shortcut',
        icons: [{ src: '/icon-192', sizes: '192x192' }],
      },
    ],
  };
}
