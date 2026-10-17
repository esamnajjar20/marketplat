'use client';

/**
 * FEAT: PublicProfileHeader's "مراسلة" button. Previously the only way
 * to contact a user was via SellerCard on one of their ad detail pages
 * (adId-scoped startFromAd) — a visitor landing on the plain profile
 * had no direct path to start a conversation and had to first find one
 * of the user's listings. This calls the new userId-based branch of
 * POST /conversations (conversations.service.ts's startFromUser) added
 * alongside this button.
 *
 * Same client-boundary shape as ReportUserButtonGate right next to it:
 * PublicProfileHeader itself has no 'use client', so the
 * "is this my own profile" check (and the mutation) lives here instead.
 */
import { useRouter } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/shared/ui/Button';
import { ROUTES } from '@/lib/constants';
import { useStartConversation } from '@/hooks/mutations/useConversationMutations';
import { useAuthStore, selectUser, selectIsAuthenticated } from '@/store/auth.store';
import { track } from '@/lib/analytics';

interface Props {
  targetUserId: string;
  className?: string;
  size?: 'default' | 'sm' | 'lg' | 'icon';
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link';
  label?: string;
  /** accessible name for icon-only usage (label=""). */
  ariaLabel?: string;
  context?: { type: 'product' | 'service'; id: string };
}

export function MessageUserButtonGate({ targetUserId, className, size = 'sm', variant = 'outline', label = 'مراسلة', ariaLabel, context }: Props) {
  const router = useRouter();
  const isAuth = useAuthStore(selectIsAuthenticated);
  const currentUser = useAuthStore(selectUser);
  const startConversation = useStartConversation();

  // Same self-message guard as SellerCard's isOwnAd check — the backend
  // rejects this as CANNOT_MESSAGE_SELF anyway, but hiding the button
  // avoids the round trip for the one case that can never succeed.
  if (currentUser && currentUser.id === targetUserId) return null;

  function handleMessage() {
    if (!isAuth) {
      toast.error('يرجى تسجيل الدخول أولاً');
      const returnTo = typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}`
        : ROUTES.userProfile(targetUserId);
      router.push(`${ROUTES.login}?from=${encodeURIComponent(returnTo)}`);
      return;
    }
    track('CONTACT_CLICK', { sellerId: targetUserId, source: 'product_or_profile' });
    startConversation.mutate(
      { userId: targetUserId, ...(context ? { context } : {}) },
      { onSuccess: (conversation) => router.push(ROUTES.conversationDetail(conversation!.id)) }
    );
  }

  return (
    <Button
      variant={variant}
      size={size}
      className={className ?? 'gap-2 min-h-11'}
      disabled={startConversation.isPending}
      aria-busy={startConversation.isPending}
      aria-label={ariaLabel ?? (label || 'مراسلة')}
      onClick={handleMessage}
    >
      <MessageSquare className={label ? 'h-4 w-4' : 'h-5 w-5'} />
      {label ? (startConversation.isPending ? 'جارٍ التحضير…' : label) : null}
    </Button>
  );
}
