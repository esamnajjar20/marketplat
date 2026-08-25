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
    <div className="flex min-h-screen min-w-0 flex-col">
      <PublicHeader />
      <main className="min-w-0 flex-1 pb-16 md:pb-0">
        <PageTransition>{children}</PageTransition>
      </main>
      <PublicFooter />
      <BottomNav />
      <ScrollToTop />
    </div>
  );
}
