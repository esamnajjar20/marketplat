/**
 * PublicFooter — only links that resolve to real pages.
 * Disabled placeholders (404) were removed; add links back when pages ship.
 */
import Link from 'next/link';
import { Logo } from './Logo';
import { ROUTES, APP_NAME } from '@/lib/constants';

const FOOTER_LINKS = {
  اكتشف: [
    { label: 'البحث', href: ROUTES.search },
    { label: 'المتاجر', href: ROUTES.stores },
    { label: 'الخدمات', href: ROUTES.services },
    { label: 'المنتجات', href: ROUTES.products },
  ],
  الشركة: [
    { label: 'من نحن', href: ROUTES.about },
    { label: 'تواصل معنا', href: ROUTES.contact },
  ],
  الدعم: [
    { label: 'تسجيل الدخول', href: ROUTES.login },
    { label: 'إنشاء حساب', href: ROUTES.register },
    { label: 'لوحة التحكم', href: ROUTES.dashboard },
  ],
  قانوني: [
    { label: 'سياسة الخصوصية', href: ROUTES.privacy },
    { label: 'شروط الاستخدام', href: ROUTES.terms },
  ],
} as const;

export function PublicFooter() {
  return (
    <footer className="border-t border-border/80 bg-surface-1">
      <div className="container mx-auto max-w-7xl px-4 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          <div className="col-span-2 space-y-4 md:col-span-1">
            <Link href={ROUTES.home} prefetch={false} className="inline-block">
              <Logo />
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              المكان الموثوق للبيع والشراء والخدمات — من جيرانك، إلى جيرانك.
            </p>
          </div>
          {Object.entries(FOOTER_LINKS).map(([section, links]) => (
            <div key={section}>
              <h3 className="mb-4 text-sm font-semibold text-foreground">{section}</h3>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      // FIX RSC-PREFETCH-STORM-01: multi-section footer
                      // link list — see ExploreSheet.tsx for the full
                      // rationale.
                      prefetch={false}
                      className="text-sm text-muted-foreground transition-colors hover:text-primary"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border/70 pt-8 text-center text-sm text-muted-foreground sm:flex-row sm:text-start">
          <p>
            © {new Date().getFullYear()} {APP_NAME}. جميع الحقوق محفوظة.
          </p>
          <div className="flex flex-wrap justify-center gap-3 text-xs">
            {/* FIX RSC-PREFETCH-STORM-02: privacy/terms are the largest RSC
                payloads (tens of KB) and were prefetched on every page load. */}
            <Link href={ROUTES.privacy} prefetch={false} className="hover:text-primary">
              الخصوصية
            </Link>
            <span aria-hidden className="text-border">
              ·
            </span>
            <Link href={ROUTES.terms} prefetch={false} className="hover:text-primary">
              الشروط
            </Link>
            <span aria-hidden className="text-border">
              ·
            </span>
            <Link href={ROUTES.contact} prefetch={false} className="hover:text-primary">
              تواصل
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
