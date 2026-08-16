import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { Sparkles } from 'lucide-react';
import { Badge } from '@/components/shared/ui/Badge';
import { getAvatarUrl, getDetailImageUrl } from '@/lib/cloudinary';
import { ROUTES } from '@/lib/constants';
import type { PublicProfileStore } from '@/types/user.types';

interface Props {
  store: PublicProfileStore;
}

/**
 * UNIFIED-PROFILE: summary card for the profile's "المتجر" tab — not a
 * replacement for StoreHeader.tsx. Per the profile/store separation this
 * page follows (Profile = "who is this person", Store = "what is this
 * store"), the full follow button, phone/call action, and cover photo
 * stay on the dedicated /stores/[id] page; this card only has the
 * public-profile-safe fields (see users.repository.ts's publicUserSelect)
 * and a link through to the real thing.
 */
export function ProfileStoreSummary({ store }: Props) {
  const logo = getAvatarUrl(store.logoUrl ?? '', 96);
  const cover = store.coverImageUrl ? getDetailImageUrl(store.coverImageUrl, 800) : null;

  return (
    <Link
      href={ROUTES.storeDetail(store.id)}
      className="block rounded-xl border bg-card overflow-hidden shadow-sm transition-shadow hover:shadow-md"
    >
      {cover && (
        <div className="relative h-28 w-full bg-muted">
          <SafeImage src={cover} alt="" fill className="object-cover" sizes="100vw" />
        </div>
      )}
      <div className="p-4 flex items-center gap-3">
        <div className="relative w-14 h-14 rounded-full overflow-hidden bg-muted shrink-0 border">
          <SafeImage variant="avatar" src={logo} alt={store.name} fill className="object-cover" sizes="56px" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-foreground truncate">{store.name}</h3>
            {store.plan === 'FEATURED' && (
              <Badge className="gap-1 bg-accent hover:bg-accent text-accent-foreground shrink-0">
                <Sparkles className="h-3 w-3" /> مميز
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {store._count.products} منتج · {store._count.followers} متابع · {store.city}
          </p>
        </div>
      </div>
    </Link>
  );
}
