/**
 * PublicFooter — site-wide footer rendered in the (public) layout.
 *
 * FIX I18N-01 / FIX AUDIT-V6-06: two issues fixed together since they're
 * on the same lines —
 *  1) Arabic copy, matching the rest of the app (this was the one file
 *     that FIX UX-01 / FIX AUDIT-V5-02 missed).
 *  2) All nine Company/Support/Legal links pointed at pages that don't
 *     exist anywhere in app/ (confirmed against ROUTES in lib/constants.ts,
 *     which has no about/careers/blog/help/contact/safety/terms/privacy/
 *     cookies entries) — every one was a guaranteed 404. Rendered as plain
 *     disabled text for now instead of dead <Link>s; swap a given item back
 *     to <Link href="..."> as soon as its page ships.
 */
import Link from 'next/link';
import { Logo }   from './Logo';
import { ROUTES, APP_NAME } from '@/lib/constants';

const FOOTER_LINKS = {
  الشركة: [
    { label: 'من نحن' },
    { label: 'وظائف' },
    { label: 'المدونة' },
  ],
  الدعم: [
    { label: 'مركز المساعدة' },
    { label: 'تواصل معنا' },
    { label: 'نصائح الأمان' },
  ],
  قانوني: [
    { label: 'شروط الاستخدام' },
    { label: 'سياسة الخصوصية' },
    { label: 'سياسة ملفات تعريف الارتباط' },
  ],
} as const;

export function PublicFooter() {
  return (
    <footer className="border-t bg-muted/40">
      <div className="container mx-auto max-w-7xl px-4 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <Link href={ROUTES.home}>
              <Logo />
            </Link>
            <p className="mt-4 text-sm text-muted-foreground">
              المكان الموثوق للبيع والشراء — كل ما تحتاجه، في حيّك مباشرة.
            </p>
          </div>
          {Object.entries(FOOTER_LINKS).map(([section, links]) => (
            <div key={section}>
              <h3 className="mb-4 text-sm font-semibold">{section}</h3>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.label}>
                    <span className="text-sm text-muted-foreground/60 cursor-not-allowed">
                      {link.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 border-t pt-8 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} {APP_NAME}. جميع الحقوق محفوظة.</p>
        </div>
      </div>
    </footer>
  );
}
