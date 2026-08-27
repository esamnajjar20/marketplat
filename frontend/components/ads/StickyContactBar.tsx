'use client';

import { MessageSquare, LogIn, Loader2 } from 'lucide-react';
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

export function StickyContactBar({ adId, price, isNegotiable, seller, className }: Props) {
  const router = useRouter();
  const isAuth = useAuthStore(selectIsAuthenticated);
  const currentUser = useAuthStore(selectUser);
  const startConversation = useStartConversation();
  if (currentUser?.id === seller.id) return null;

  function handleMessage() {
    if (!isAuth) {
      toast.error('سجّل الدخول لتراسل البائع');
      router.push(`${ROUTES.login}?next=${encodeURIComponent(ROUTES.adDetail(adId))}`);
      return;
    }
    track('CONTACT_CLICK', { adId, sellerId: seller.id, source: 'sticky_bar' });
    startConversation.mutate(
      { adId },
      {
        onSuccess: (conversation) => {
          toast.success('تم فتح المحادثة');
          router.push(ROUTES.conversationDetail(conversation!.id));
        },
        onError: () => toast.error('تعذّر بدء المحادثة، حاول مرة أخرى'),
      },
    );
  }

  const pending = startConversation.isPending;

  return (
    <div
      role="region"
      aria-label="تواصل سريع مع البائع"
      className={cn(
        'sticky-contact-bar border-t border-border/80 bg-background/95 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur',
        'supports-[backdrop-filter]:bg-background/90 lg:hidden',
        className,
      )}
    >
      <div className="mx-auto max-w-lg px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-lg font-bold tabular-nums text-primary leading-tight">
              {formatPrice(price)}
            </p>
            {isNegotiable ? (
              <p className="text-[11px] font-medium text-primary/80">قابل للتفاوض</p>
            ) : (
              <p className="truncate text-[11px] text-muted-foreground">مع {seller.name}</p>
            )}
          </div>
          <Button
            type="button"
            size="lg"
            className="h-12 min-w-[9.5rem] shrink-0 gap-2 rounded-xl px-5 text-sm font-semibold shadow-md sm:min-w-[11rem] sm:text-base active:scale-[0.98]"
            disabled={pending}
            onClick={handleMessage}
            aria-label={isAuth ? `مراسلة ${seller.name}` : 'سجّل الدخول لمراسلة البائع'}
            aria-busy={pending}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : isAuth ? <MessageSquare className="h-4 w-4" aria-hidden /> : <LogIn className="h-4 w-4" aria-hidden />}
            {pending ? 'جاري الفتح…' : isAuth ? 'راسل البائع' : 'سجّل للتواصل'}
          </Button>
        </div>
      </div>
    </div>
  );
}
