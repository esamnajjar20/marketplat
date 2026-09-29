'use client';

import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { CreateSheet } from '@/components/layout/CreateSheet';
import { useAuthStore, selectIsAuthenticated, selectIsHydrated } from '@/store/auth.store';
import { cn } from '@/lib/utils';

const DISMISS_KEY = 'home:guestPublishBarDismissed';

/**
 * Guest conversion bar after scroll.
 * Phase 2: visible on mobile too, anchored above BottomNav (md: centered floating).
 * Mobile already has “+” in the bar — this reinforces “free publish” messaging.
 */
export function HomeGuestPublishBar() {
  const isHydrated = useAuthStore(selectIsHydrated);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated || isAuthenticated || dismissed) {
      setVisible(false);
      return;
    }

    const onScroll = () => {
      setVisible(window.scrollY > 320);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isHydrated, isAuthenticated, dismissed]);

  if (!isHydrated || isAuthenticated || dismissed || !visible) return null;

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
    setVisible(false);
  }

  return (
    <>
      <div
        className={cn(
          'pointer-events-none fixed inset-x-0 z-40 flex justify-center px-3',
          /* Mobile: sit above BottomNav (~64px + safe area) */
          'bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))]',
          /* Desktop: classic floating center bar */
          'md:bottom-6 md:px-4',
        )}
        role="region"
        aria-label="نشر إعلان"
      >
        <div
          className={cn(
            'pointer-events-auto flex w-full max-w-lg items-center gap-2.5 rounded-2xl border border-border/80',
            'bg-background/95 px-3 py-2.5 shadow-lg backdrop-blur-md sm:gap-3 sm:px-4 sm:py-3',
            'animate-in fade-in-0 slide-in-from-bottom-2 duration-300',
          )}
        >
          <p className="min-w-0 flex-1 text-sm text-foreground">
            <span className="font-semibold">اعرض إعلانك مجاناً</span>
            <span className="mt-0.5 block text-2xs text-muted-foreground sm:text-xs">
              وصل لجيرانك خلال دقائق
            </span>
          </p>
          <Button
            type="button"
            size="sm"
            className="h-9 shrink-0 gap-1.5 rounded-xl font-semibold"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" aria-hidden />
            نشر
          </Button>
          <button
            type="button"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="إخفاء"
            onClick={dismiss}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      <CreateSheet open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
