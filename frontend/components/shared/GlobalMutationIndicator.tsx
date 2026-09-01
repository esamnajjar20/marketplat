'use client';

/**
 * GlobalMutationIndicator — شريط سفلي خفيف عند وجود mutations قيد التنفيذ
 * (حفظ، حذف، إرسال بلاغ…) حتى لو الزر خارج الشاشة.
 *
 * يعتمد على React Query useIsMutating — بدون store إضافي.
 */

import { useIsMutating } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

export function GlobalMutationIndicator() {
  const mutating = useIsMutating();
  const active = mutating > 0;

  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-0 z-[150] flex justify-center p-3 transition-all duration-200',
        // فوق BottomNav على الموبايل
        'pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-4',
        active ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
      )}
      aria-live="polite"
      aria-busy={active}
      role="status"
    >
      {active && (
        <div className="flex items-center gap-2 rounded-full border border-border/80 bg-card/95 px-4 py-2 text-xs font-medium text-foreground shadow-lg backdrop-blur-sm">
          <span
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent"
            aria-hidden
          />
          جارٍ حفظ التغييرات…
        </div>
      )}
    </div>
  );
}
