'use client';

/**
 * UX: sticky mobile contact bar on ad detail.
 * Keeps the primary buyer action (message seller) one thumb-tap away
 * while scrolling the gallery/description — without replacing SellerCard
 * on desktop (lg+ hides this bar).
 */

import { MessageSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/shared/ui/Button';
import { ROUTES } from '@/lib/constants';
import { formatPrice } from '@/lib/formatters';
import { useStartConversation } from '@/hooks/mutations/useConversationMutations';
import { useAuthStore, selectUser, selectIsAuthenticated } from '@/store/auth.store';
import { track } from '@/lib/analytics';
import { toast } from 'sonner';
import type { AdAuthor } from '@/types/ad.types';
import { cn } from '@/lib/utils';

interface Props {
  adId: string;
  price: string | null;
  isNegotiable?: boolean;
  seller: AdAuthor;
  className?: string;
}

export function StickyContactBar({
  adId,
  price,
  isNegotiable,
  seller,
  className,
}: Props) {
  const router = useRouter();
  const isAuth = useAuthStore(selectIsAuthenticated);
  const currentUser = useAuthStore(selectUser);
  const startConversation = useStartConversation();

  const isOwnAd = currentUser?.id === seller.id;
  if (isOwnAd) return null;

  function handleMessage() {
    if (!isAuth) {
      toast.error('يرجى تسجيل الدخول أولاً');
      return;
    }
    track('CONTACT_CLICK', { adId, sellerId: seller.id, source: 'sticky_bar' });
    startConversation.mutate(
      { adId },
      {
        onSuccess: (conversation) =>
          router.push(ROUTES.conversationDetail(conversation!.id)),
      },
    );
  }

  return (
    <div
      role="region"
      aria-label="تواصل سريع مع البائع"
      className={cn(
        // Sits just above BottomNav (fixed bottom-0, ~56–64px + safe area).
        // z-40 < BottomNav's z-50 so the tab bar stays tappable on top of page chrome.
        'fixed inset-x-0 z-40 border-t bg-background/95 backdrop-blur',
        'bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))]',
        'supports-[backdrop-filter]:bg-background/90 lg:hidden',
        className,
      )}
    >
      <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold text-primary tabular-nums">
            {formatPrice(price)}
          </p>
          {isNegotiable && (
            <p className="text-xs text-muted-foreground">قابل للتفاوض</p>
          )}
        </div>
        <Button
          type="button"
          size="lg"
          className="h-12 min-w-[9.5rem] shrink-0 gap-2 rounded-xl px-5 text-base"
          disabled={startConversation.isPending}
          onClick={handleMessage}
          aria-label={`مراسلة ${seller.name}`}
        >
          <MessageSquare className="h-5 w-5" aria-hidden />
          {startConversation.isPending ? 'جاري...' : 'راسل البائع'}
        </Button>
      </div>
    </div>
  );
}
