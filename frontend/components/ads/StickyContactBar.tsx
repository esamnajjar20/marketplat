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
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { OfflineNotice } from '@/components/shared/OfflineActionGate';

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
      // SW-FIX-LOGIN-PARAM: LoginForm/RegisterForm read `?from=`, not
      // `?next=` — this used to send the user to /login and then, on
      // success, to /dashboard instead of back to the ad they wanted
      // to message about.
      router.push(`${ROUTES.login}?from=${encodeURIComponent(ROUTES.adDetail(adId))}`);
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
  const online = useOnlineStatus();

  return (
    <div
      role="region"
      aria-label="تواصل سريع مع البائع"
      className={cn(
        'sticky-contact-bar border-t border-border/80 bg-background/95 shadow-[0_-4px_16px_-8px_hsl(var(--shadow-color)/0.14)] backdrop-blur-md',
        'supports-[backdrop-filter]:bg-background/90 md:hidden',
        className,
      )}
    >
      <div className="mx-auto max-w-lg px-3 py-2.5 sm:px-4">
        <OfflineNotice className="mb-1.5" message="التواصل يحتاج اتصالاً — حاول عند عودة الشبكة" />
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-base font-bold tabular-nums leading-tight text-primary sm:text-lg">
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
            className="h-12 min-w-0 shrink-0 gap-1.5 rounded-xl px-3.5 text-sm font-semibold shadow-md xs:px-5 sm:min-w-[10rem] sm:gap-2 sm:text-base active:scale-[0.98]"
            disabled={pending || !online}
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
