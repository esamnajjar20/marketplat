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
        // Above sticky contact (z-40) and below bottom nav (z-50) is fine;
        // keep z-45-ish via z-40 and offset above the tab bar.
        'fixed end-4 z-40 flex h-12 w-12 items-center justify-center rounded-full',
        'border bg-card text-foreground shadow-lg transition-opacity',
        'hover:bg-muted active:scale-95',
        'bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:bottom-6',
        className,
      )}
    >
      <ChevronUp className="h-5 w-5" aria-hidden />
    </button>
  );
}
