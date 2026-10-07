'use client';

/**
 * زر العودة للأعلى — يظهر بعد التمرير، فوق شريط التنقّل السفلي.
 */

import { useEffect, useState } from 'react';
import { ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ScrollToTop({ className }: { className?: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        setVisible(window.scrollY > 420);
        ticking = false;
      });
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
      aria-label="العودة إلى أعلى الصفحة"
      className={cn(
        'fixed start-4 z-40 flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full',
        'border border-border/80 bg-card/95 text-foreground shadow-md backdrop-blur-sm',
        'transition-[border-color,color,box-shadow,transform] duration-200 hover:border-primary/40 hover:text-primary hover:shadow-lg',
        'active:scale-95',
        'bottom-[calc(8.25rem+env(safe-area-inset-bottom,0px))] md:bottom-6',
        className,
      )}
    >
      <ChevronUp className="h-5 w-5" aria-hidden />
    </button>
  );
}
