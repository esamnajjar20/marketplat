import { ScrollRestore } from '@/components/shared/ScrollRestore';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { PublicFooter } from '@/components/layout/PublicFooter';
import { BottomNav } from '@/components/layout/BottomNav';
import { PageTransition } from '@/components/shared/PageTransition';
import { ScrollToTop } from '@/components/shared/ui/ScrollToTop';

/**
 * (public) route group layout.
 * Phase 1 native: footer marked site-web-footer (hidden in APK via native-app.css).
 * Bottom nav forced visible on native via CSS even above md.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen min-h-dvh min-w-0 flex-col">
      <PublicHeader />
      <main id="main-content" className="min-w-0 flex-1 pb-16 md:pb-0">
        <PageTransition>
          <ScrollRestore />
          {children}
        </PageTransition>
      </main>
      <div className="site-web-footer-spacer pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <PublicFooter />
      </div>
      <BottomNav />
      <ScrollToTop />
    </div>
  );
}
