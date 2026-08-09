import { PublicHeader } from '@/components/layout/PublicHeader';
import { PublicFooter } from '@/components/layout/PublicFooter';
import { BottomNav } from '@/components/layout/BottomNav';

/**
 * (public) route group layout.
 * Wraps all publicly accessible pages (home, listings, ad detail,
 * category browse, search, public profiles).
 * No auth required.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      {/* FIX P1-3: pb-16 reserves space for BottomNav (fixed, md:hidden)
          so it never overlaps the last bit of page content on mobile —
          same footprint the bar itself occupies (py-2 + icon + label). */}
      <main className="flex-1 pb-16 md:pb-0">{children}</main>
      <PublicFooter />
      <BottomNav />
    </div>
  );
}
