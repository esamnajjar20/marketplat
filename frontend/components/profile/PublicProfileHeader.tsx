import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { MapPin, Star, ChevronLeft, BadgeCheck } from 'lucide-react';
import { getAvatarUrl } from '@/lib/cloudinary';
import { ROUTES } from '@/lib/constants';
import { ReportUserButtonGate } from '@/components/profile/ReportUserButtonGate';
import { BlockUserButtonGate } from '@/components/profile/BlockUserButtonGate';
import { ProfileBadges } from '@/components/profile/ProfileBadges';
import {
  PublicProfileAvatar,
  PublicProfileFollowAction,
  PublicProfileHeaderTopActions,
  PublicProfileMessageActions,
} from '@/components/profile/PublicProfileInteractive';
import type { PublicUser } from '@/types/user.types';

interface Props { user: PublicUser; }

/**
 * REDESIGN v2 — matches the approved "الملف الشخصي" mockup 1:1 on mobile:
 * soft band with back/share circles, gradient-ringed 92px avatar, name,
 * verified + member-since tags (plus the existing role badges), rating,
 * city, bio, 3-tile stats card (followers/following tiles link to their
 * lists), [follow | message] row, and a "متجره" row card. Desktop (lg+)
 * splits into identity (start) and stats/actions (end). Behavior and data
 * are unchanged (stories, presence, follow, block, report, edit).
 */
export function PublicProfileHeader({ user }: Props) {
  const seller = user.sellerProfile;
  const store = seller?.storeDetails ?? null;
  const rating = seller ? parseFloat(seller.averageRating) : 0;
  const memberYear = new Date(user.createdAt).getFullYear();

  const stats = [
    { value: user._count.ads, label: 'إعلان', href: null as string | null },
    { value: user.followStats.followers, label: 'متابع', href: `/profile/${user.id}/followers` },
    { value: user.followStats.following, label: 'أتابعهم', href: `/profile/${user.id}/following` },
  ];
  const tileCls = 'flex flex-1 flex-col items-center gap-0.5 rounded-[14px] bg-surface-2 px-1 py-3';

  return (
    <div className="mx-auto w-full max-w-5xl">
      <section className="relative isolate overflow-hidden rounded-3xl border border-border/70 bg-background shadow-sm">
        {/* الشريط العلوي */}
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[120px] rounded-b-[28px] bg-gradient-to-br from-primary-soft to-accent-soft" />
        <PublicProfileHeaderTopActions user={user} />

        <div className="relative z-10 pb-6 pt-[72px] lg:pb-8">
          <div className="flex flex-col items-center px-4 text-center lg:flex-row lg:items-start lg:gap-10 lg:px-10 lg:text-start">
            {/* الهوية */}
            <div className="flex w-full flex-col items-center lg:w-72 lg:shrink-0 lg:items-start">
              <PublicProfileAvatar user={user} />

              <h1 className="mt-2.5 text-[23px] font-extrabold leading-snug text-foreground">{user.name}</h1>

              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
                {seller?.verified && (
                  <span className="inline-flex h-[26px] items-center gap-1 rounded-full bg-primary-soft px-2.5 text-xs font-bold text-primary-strong">
                    <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> بائع موثّق
                  </span>
                )}
                <span className="inline-flex h-[26px] items-center rounded-full bg-surface-2 px-2.5 text-xs font-bold text-foreground/80">عضو منذ {memberYear}</span>
              </div>

              <ProfileBadges sellerProfile={seller} className="mt-2 lg:justify-start" />

              {seller && seller.totalRatings > 0 && (
                <span className="mt-2.5 inline-flex items-center gap-1 text-sm font-bold text-foreground">
                  <Star className="h-[15px] w-[15px] fill-rating text-rating" />
                  {rating.toFixed(1)}
                  <span className="font-normal text-muted-foreground">({seller.totalRatings} تقييم)</span>
                </span>
              )}

              {user.city && (
                <span className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <MapPin className="h-4 w-4" aria-hidden />{user.city}
                </span>
              )}

              {user.bio && (
                <p className="mx-2 mt-2.5 max-w-sm text-sm leading-[1.8] text-foreground/75 lg:mx-0">{user.bio}</p>
              )}
            </div>

            {/* الإحصائيات والأزرار */}
            <div className="flex w-full min-w-0 flex-1 flex-col items-stretch lg:pt-14">
              <div className="mt-4 flex gap-2 rounded-[20px] border border-border bg-card p-2.5 shadow-sm lg:mt-0">
                {stats.map((t) => {
                  const inner = (
                    <>
                      <span className="text-[19px] font-extrabold leading-tight tabular-nums text-foreground">{t.value}</span>
                      <span className="text-xs text-muted-foreground">{t.label}</span>
                    </>
                  );
                  return t.href ? (
                    <Link key={t.label} href={t.href} className={`${tileCls} transition hover:bg-primary-soft`}>{inner}</Link>
                  ) : (
                    <div key={t.label} className={tileCls}>{inner}</div>
                  );
                })}
              </div>

              <div className="mt-3.5 flex flex-wrap gap-2">
                <PublicProfileFollowAction user={user} />
                <PublicProfileMessageActions user={user} />
              </div>

              {store && (
                <Link
                  href={ROUTES.storeDetail(store.id)}
                  className="mt-4 flex items-center gap-3 rounded-[20px] border border-border bg-card p-3 text-start shadow-sm transition hover:border-primary/30"
                >
                  <span className="relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-[14px] bg-primary-soft">
                    <SafeImage variant="avatar" src={getAvatarUrl(store.logoUrl ?? '', 96)} alt={store.name} fill className="object-cover" sizes="52px" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-primary">متجره</span>
                    <span className="block truncate text-[15px] font-extrabold text-foreground">{store.name}</span>
                    <span className="block text-xs text-muted-foreground">{store._count.products} منتج · {store._count.followers} متابع</span>
                  </span>
                  <ChevronLeft className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              )}

              <div className="mt-3 flex items-center justify-center gap-1 text-xs text-muted-foreground lg:justify-start">
                <BlockUserButtonGate targetUserId={user.id} targetUserName={user.name} />
                <ReportUserButtonGate targetUserId={user.id} />
              </div>
            </div>
          </div>

        </div>
      </section>
    </div>
  );
}
