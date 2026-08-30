'use client';

/**
 * Floating "back to top" control — appears after the user scrolls down
 * on long list/search pages. Positioned above BottomNav on mobile.
 */

import { useEffect, useState } from 'react';
import { ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ScrollToTop({ className }: { className?: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 480);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="العودة إلى الأعلى"
      className={cn(
        // RTL: `start` = right side — keeps clear of StickyContactBar's
        // primary CTA ("راسل البائع") which sits on the inline-start of
        // the bar (left in RTL). Bottom offset clears BottomNav (~3.5rem)
        // + sticky contact bar (~5.5rem) so the FAB never covers the tip
        // line or the message button.
        'fixed start-4 z-40 flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full',
        'border bg-card text-foreground shadow-lg transition-all duration-200',
        'hover:bg-muted hover:border-primary/40 hover:shadow-xl hover:-translate-y-0.5 active:scale-95',
        'bottom-[calc(8.25rem+env(safe-area-inset-bottom,0px))] md:bottom-6',
        className,
      )}
    >
      <ChevronUp className="h-5 w-5" aria-hidden />
    </button>
  );
}
