import { ScrollRestore } from '@/components/shared/ScrollRestore';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { PublicFooter } from '@/components/layout/PublicFooter';
import { BottomNav } from '@/components/layout/BottomNav';
import { PageTransition } from '@/components/shared/PageTransition';
import { ScrollToTop } from '@/components/shared/ui/ScrollToTop';

/**
 * (public) route group layout.
 * UX phase-5: ScrollToTop for long search/list pages on mobile.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen min-h-dvh min-w-0 flex-col">
      <PublicHeader />
      {/* DESKTOP-AUDIT-02: id targeted by the root layout's SkipLink. */}
      <main id="main-content" className="min-w-0 flex-1 pb-16 md:pb-0">
        <PageTransition><ScrollRestore />
        {children}</PageTransition>
      </main>
      <div className="pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <PublicFooter />
      </div>
      <BottomNav />
      <ScrollToTop />
    </div>
  );
}
