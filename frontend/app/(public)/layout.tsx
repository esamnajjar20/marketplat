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
    // FIX OVERFLOW-01: min-w-0 on the column and <main> — see the
    // identical fix + full rationale in (protected)/layout.tsx. Same
    // flex-1-without-min-w-0 mechanism: any wide-content child inside
    // <main> (a tab row, a table, an unbroken long string) can push
    // this column past viewport width instead of scrolling internally.
    <div className="flex min-h-screen min-w-0 flex-col">
      <PublicHeader />
      {/* FIX P1-3: pb-16 reserves space for BottomNav (fixed, md:hidden)
          so it never overlaps the last bit of page content on mobile —
          same footprint the bar itself occupies (py-2 + icon + label). */}
      <main className="min-w-0 flex-1 pb-16 md:pb-0">{children}</main>
      <PublicFooter />
      <BottomNav />
    </div>
  );
}
