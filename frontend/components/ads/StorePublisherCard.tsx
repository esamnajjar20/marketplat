'use client';

/**
 * بطاقة ناشر المتجر في تفاصيل الإعلان — شعار المتجر + اسم + مراسلة
 * (بدون إظهار هوية البائع الشخصية)
 */

import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/shared/ui/Button';
import { ROUTES } from '@/lib/constants';
import { useStartConversation } from '@/hooks/mutations/useConversationMutations';
import { useAuthStore, selectUser, selectIsAuthenticated } from '@/store/auth.store';
import { toast } from 'sonner';
import { track } from '@/lib/analytics';

interface Props {
  adId: string;
  store: {
    id: string;
    name: string;
    slug?: string | null;
    logoUrl?: string | null;
  };
  /** userId المالك — للمراسلة (نفس منطق المحادثة على الإعلان) */
  ownerUserId: string;
}

export function StorePublisherCard({ adId, store, ownerUserId }: Props) {
  const router = useRouter();
  const isAuth = useAuthStore(selectIsAuthenticated);
  const currentUser = useAuthStore(selectUser);
  const startConversation = useStartConversation();
  const isOwn = currentUser?.id === ownerUserId;
  const href = `/stores/${store.slug || store.id}`;

  function handleMessage() {
    if (!isAuth) {
      toast.error('سجّل الدخول للمراسلة');
      // SW-FIX-LOGIN-PARAM: see StickyContactBar's identical fix —
      // LoginForm reads `?from=`, not `?next=`.
      router.push(`${ROUTES.login}?from=${encodeURIComponent(ROUTES.adDetail(adId))}`);
      return;
    }
    track('CONTACT_CLICK', { adId, sellerId: ownerUserId, source: 'store_publisher_card' });
    startConversation.mutate(
      { adId },
      {
        onSuccess: (conversation) => {
          toast.success('تم فتح المحادثة');
          router.push(ROUTES.conversationDetail(conversation!.id));
        },
        onError: () => toast.error('تعذّر بدء المحادثة'),
      }
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <Link href={href} className="flex items-center gap-3 hover:opacity-90">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
          {store.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-lg font-semibold text-muted-foreground">
              {store.name.slice(0, 1)}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold">{store.name}</p>
        </div>
      </Link>
      {!isOwn && (
        <Button
          type="button"
          className="w-full gap-2 rounded-xl"
          size="lg"
          disabled={startConversation.isPending}
          onClick={handleMessage}
        >
          <MessageSquare className="h-4 w-4" />
          {startConversation.isPending ? 'جارٍ التحضير…' : 'مراسلة'}
        </Button>
      )}
    </div>
  );
}
