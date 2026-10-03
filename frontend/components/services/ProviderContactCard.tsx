'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BadgeCheck, MessageSquare, Star, Phone } from 'lucide-react';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { ROUTES } from '@/lib/constants';
import { getAvatarUrl } from '@/lib/cloudinary';
import { formatPhone } from '@/lib/formatters';
import { useStartConversation } from '@/hooks/mutations/useConversationMutations';
import { useAuthStore, selectUser, selectIsAuthenticated } from '@/store/auth.store';
import { toast } from 'sonner';
import type { ServiceListingWithProvider } from '@/types/service.types';

interface Props {
  listing: ServiceListingWithProvider;
  /** Show phone/WhatsApp under the card */
  showPhone?: boolean;
}

function toWaPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('970')) return digits;
  if (digits.startsWith('0')) return `970${digits.slice(1)}`;
  return digits;
}

/**
 * بطاقة مقدم الخدمة — بنفس روح SellerCard في الإعلان:
 * صورة، اسم، رابط الملف، تقييم، زر مراسلة يفتح محادثة مع حساب الشخص.
 */
export function ProviderContactCard({ listing, showPhone = true }: Props) {
  const router = useRouter();
  const isAuth = useAuthStore(selectIsAuthenticated);
  const currentUser = useAuthStore(selectUser);
  const startConversation = useStartConversation();

  const provider = listing.provider;
  const userId = provider.sellerProfile?.userId;
  const displayName =
    provider.sellerProfile?.displayName || provider.businessName;
  const avatar = getAvatarUrl(provider.logoUrl ?? '', 64);
  const profileHref = userId
    ? ROUTES.userProfile(userId)
    : ROUTES.serviceProvider(provider.id);
  const isOwn = Boolean(userId && currentUser?.id === userId);
  const rating = provider.sellerProfile?.averageRating;
  const phone = provider.contactPhone;

  function handleMessage() {
    if (!userId) {
      toast.error('لا يمكن بدء المحادثة حاليًا');
      return;
    }
    if (!isAuth) {
      toast.error('يرجى تسجيل الدخول أولاً');
      router.push(`${ROUTES.login}?from=${encodeURIComponent(ROUTES.serviceDetail(listing.id))}`);
      return;
    }
    startConversation.mutate(
      { userId },
      {
        onSuccess: (conversation) => {
          if (conversation?.id) {
            router.push(ROUTES.conversationDetail(conversation.id));
          }
        },
      },
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
      <Link
        href={profileHref}
        className="flex items-center gap-3 transition-opacity hover:opacity-90"
      >
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border bg-muted">
          <SafeImage
            src={avatar}
            alt={displayName}
            fill
            className="object-cover"
            sizes="48px"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-semibold text-foreground">{displayName}</span>
            {provider.sellerProfile?.verified && (
              <Badge variant="secondary" className="gap-0.5 text-2xs">
                <BadgeCheck className="h-3 w-3" aria-hidden />
                موثّق
              </Badge>
            )}
          </div>
          {provider.businessName &&
            provider.businessName !== displayName && (
              <p className="truncate text-xs text-muted-foreground">
                {provider.businessName}
              </p>
            )}
          {typeof rating === 'number' && rating > 0 && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Star className="h-3 w-3 fill-amber-400 text-warning" aria-hidden />
              {Number(rating).toFixed(1)}
            </p>
          )}
          <p className="mt-0.5 text-2xs-tight text-primary">عرض الملف الشخصي</p>
        </div>
      </Link>

      {!isOwn && userId && (
        <Button
          type="button"
          className="w-full min-h-11 gap-2"
          disabled={startConversation.isPending}
          onClick={handleMessage}
        >
          <MessageSquare className="h-4 w-4" aria-hidden />
          {startConversation.isPending ? 'جاري الفتح…' : 'مراسلة'}
        </Button>
      )}

      {showPhone && phone && (
        <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
          <a
            href={`tel:${phone}`}
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-medium hover:bg-muted/50"
          >
            <Phone className="h-3.5 w-3.5" aria-hidden />
            {formatPhone(phone)}
          </a>
          {toWaPhone(phone).length >= 9 && (
            <a
              href={`https://wa.me/${toWaPhone(phone)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl border border-[#25D366]/40 bg-[#25D366]/10 px-3 text-sm font-medium text-[#128C7E] dark:text-[#25D366]"
            >
              واتساب
            </a>
          )}
        </div>
      )}
    </div>
  );
}
