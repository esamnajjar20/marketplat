'use client';

import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { CreateSheet } from '@/components/layout/CreateSheet';
import { useAuthStore, selectIsAuthenticated, selectIsHydrated } from '@/store/auth.store';
import { cn } from '@/lib/utils';

const DISMISS_KEY = 'home:guestPublishBarDismissed';

/**
 * Phase C: desktop guest conversion bar after scroll.
 * Mobile already has BottomNav “+” — this bar is md+ only to avoid stacking.
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
      setVisible(window.scrollY > 420);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isHydrated, isAuthenticated, dismissed]);

  if (!isHydrated || isAuthenticated || dismissed || !visible) return null;

  return (
    <>
      <div
        className={cn(
          'pointer-events-none fixed inset-x-0 bottom-0 z-40 hidden justify-center p-4 md:flex',
        )}
        role="region"
        aria-label="نشر إعلان"
      >
        <div className="pointer-events-auto flex max-w-lg items-center gap-3 rounded-2xl border border-border/80 bg-background/95 px-4 py-3 shadow-lg backdrop-blur-md">
          <p className="min-w-0 flex-1 text-sm text-foreground">
            <span className="font-semibold">اعرض إعلانك مجاناً</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              وصل لجيرانك في غزة خلال دقائق
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
            onClick={() => {
              try {
                sessionStorage.setItem(DISMISS_KEY, '1');
              } catch {
                /* ignore */
              }
              setDismissed(true);
              setVisible(false);
            }}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      <CreateSheet open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
