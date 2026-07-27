/**
 * Root layout — applies to every route.
 *
 * FIX SEO-01: lang="ar" dir="rtl" (was lang="en" dir="ltr").
 * FIX SEO-03: openGraph locale set to ar_PS.
 *
 * Fonts:
 *   Cairo         — headings + UI chrome
 *   IBM Plex Sans Arabic — body text
 *   IBM Plex Mono — prices (monospace for consistent digit widths)
 */
import type { Metadata, Viewport }    from 'next';
import { Cairo, IBM_Plex_Mono, IBM_Plex_Sans_Arabic } from 'next/font/google';
import { AppProviders }               from '@/providers/AppProviders';
import { APP_NAME, APP_URL }          from '@/lib/constants';
import '@/app/globals.css';

// ── Fonts ─────────────────────────────────────────────────────────
// PERF-03: Cairo handles Arabic headings + UI chrome.
//          IBM_Plex_Sans_Arabic handles Arabic body text (was documented
//          in the comment but never imported — falling back to system font).
//          IBM_Plex_Mono handles prices for consistent digit widths.

const cairo = Cairo({
  subsets:  ['arabic', 'latin'],
  variable: '--font-cairo',
  display:  'swap',
  // PERF-03: Only preload the subsets actually used above the fold.
  preload:  true,
});

// PERF-03 FIX: Was missing — the layout comment listed this font but it was
// never imported. Arabic body text was falling back to the system font,
// causing a FOUT (flash of unstyled text) on first load.
const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  subsets:  ['arabic'],
  weight:   ['400', '500'],
  variable: '--font-ibm-plex-sans-arabic',
  display:  'swap',
  // PERF-03: Body font doesn't need to block initial render — swap is fine.
  preload:  false,
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets:  ['latin'],
  weight:   ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
  display:  'swap',
  preload:  false,  // PERF-03: Prices are below the fold — no need to preload.
});

// ── Metadata ──────────────────────────────────────────────────────

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default:  APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description: 'منصة الإعلانات المبوّبة الأولى في غزة — بيع، شراء، واستئجار',
  keywords:    ['إعلانات', 'غزة', 'بيع', 'شراء', 'عقارات', 'سيارات', 'إلكترونيات'],
  authors:     [{ name: APP_NAME }],
  robots:      { index: true, follow: true },

  // FIX SEO-03: locale is ar_PS
  // FIX SEO-04: `/og-default.jpg` referenced a file that never existed —
  // public/ was completely empty, so every shared link showed a broken
  // image. Omitted until a real 1200×630 default OG image is added to
  // public/og-default.jpg, at which point restore the `images` field below.
  openGraph: {
    type:      'website',
    locale:    'ar_PS',
    url:       APP_URL,
    siteName:  APP_NAME,
    title:     APP_NAME,
    description: 'منصة الإعلانات المبوّبة الأولى في غزة',
  },

  twitter: {
    card:  'summary_large_image',
    title: APP_NAME,
  },

  // FIX PWA-04: manifest.ts ينتج /manifest.webmanifest تلقائيًا، لكن
  // Next.js لا يضيف وسم <link rel="manifest"> إلا إذا صرّحنا عنه هنا —
  // بدونه Chrome/Android لا يكتشف قابلية التثبيت إطلاقًا.
  manifest: '/manifest.webmanifest',

  // FIX PWA-05: iOS Safari يتجاهل <link rel="manifest"> تمامًا لأغراض
  // "الإضافة للشاشة الرئيسية" ويعتمد فقط على وسوم apple-* التالية —
  // بدونها يفتح كتبويب متصفح عادي حتى لو أضافه المستخدم للشاشة الرئيسية.
  appleWebApp: {
    capable: true,
    // FIX PWA-06: 'default' يعرض شريط الحالة بخلفية بيضاء (يتناقض مع
    // theme_color الداكن)؛ 'black-translucent' يمدّ المحتوى تحت شريط
    // الحالة فعليًا (نفس تأثير edge-to-edge على Android) — التطبيق
    // يتعامل مع safe-area عبر globals.css (env(safe-area-inset-*))
    // بدلاً من الاعتماد على شريط حالة يحجز مساحته الخاصة.
    statusBarStyle: 'black-translucent',
    title: APP_NAME,
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width:        'device-width',
  initialScale: 1,
  // FIX PWA-07: maximumScale/userScalable الافتراضي (بدون تحديد) يسمح
  // بالتكبير — لا نمنعه صراحة (يضر بإمكانية الوصول)، لكن viewportFit
  // ضروري لتفعيل env(safe-area-inset-*) في CSS على iOS (الإشعار/الحواف
  // المستديرة).
  viewportFit: 'cover',
  // FIX PWA-12: كانت هذه القيمة #0D4F8C (أزرق) بينما --primary الفعلي في
  // globals.css هو أخضر زيتوني (hsl(148.7 32.9% 27.5%) ≈ #2F5D45)، وهو
  // نفس theme_color المستخدم في app/manifest.ts. التناقض كان يعني أن
  // شريط حالة/شريط عنوان المتصفح يظهر بلون مختلف تمامًا عن هوية التطبيق
  // (الأيقونة، شاشة البداية) عند التثبيت كـ PWA — عيب هوية بصرية ملحوظ.
  themeColor:   '#2F5D45',
};

// ── Layout ────────────────────────────────────────────────────────

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // FIX SEO-01: Arabic language + RTL direction
    <html lang="ar" dir="rtl" className={`${cairo.variable} ${ibmPlexSansArabic.variable} ${ibmPlexMono.variable}`}>
      <body>
        <AppProviders>
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
