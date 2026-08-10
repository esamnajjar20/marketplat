/**
 * UserMenu — dropdown for authenticated users.
 * Shows avatar, name, quick links, and logout button.
 *
 * FIX FEAT-04: previously this rendered only the avatar button with a
 * `// TODO: replace with shadcn/ui DropdownMenu component` comment —
 * clicking it did nothing; the dropdown items were never implemented,
 * not just unstyled. This is the first working version: a real Radix
 * DropdownMenu (the same primitive family already used by Dialog/Select
 * elsewhere in this project) with actual navigation links and a working
 * logout action.
 *
 * ROLE-SEP 5: small text badges ("بائع" / "مقدّم خدمة") next to the
 * username, driven by the same useMySellerProfile()/useMyServiceProvider()
 * queries ProtectedSidebar/ProtectedMobileNav already call. React Query
 * dedupes by queryKey, so this doesn't add a network request — it's the
 * same cached entry, just read here too. Same gating as those two:
 * isSuccess && data is the only positive signal, no isError branch —
 * no badge while loading and no badge on a genuine fetch error, not
 * because either is treated as "confirmed not a seller" but because
 * both are simply absence of the one positive signal.
 */
'use client';

import Link from 'next/link';
import { LayoutDashboard, Heart, BellPlus, History, ListOrdered, Settings, Shield, LogOut } from 'lucide-react';
import { useLogout }   from '@/hooks/mutations/useAuthMutations';
import { useAuthStore, selectUser, selectIsAdmin } from '@/store/auth.store';
import { useMySellerProfile } from '@/hooks/queries/useSellers';
import { useMyServiceProvider } from '@/hooks/queries/useServiceProviders';
import { ROUTES } from '@/lib/constants';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/shared/ui/DropdownMenu';

export function UserMenu() {
  const user      = useAuthStore(selectUser);
  const isAdmin   = useAuthStore(selectIsAdmin);
  const { mutate: logout, isPending } = useLogout();
  const { data: sellerProfile, isSuccess: sellerLoaded } = useMySellerProfile();
  const { data: serviceProvider, isSuccess: providerLoaded } = useMyServiceProvider();
  const isSeller = sellerLoaded && Boolean(sellerProfile);
  const isProvider = providerLoaded && Boolean(serviceProvider);

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground outline-none ring-offset-background transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="قائمة المستخدم"
        >
          {user.name.charAt(0).toUpperCase()}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium leading-none">{user.name}</p>
          <p className="text-xs leading-none text-muted-foreground mt-1 truncate" dir="ltr">
            {user.email}
          </p>
          {(isSeller || isProvider) && (
            <div className="mt-2 flex gap-1.5">
              {isSeller && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  بائع
                </span>
              )}
              {isProvider && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  مقدّم خدمة
                </span>
              )}
            </div>
          )}
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href={ROUTES.dashboard} className="flex items-center gap-2 cursor-pointer">
            <LayoutDashboard className="h-4 w-4" />
            لوحة التحكم
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href={ROUTES.myAds} className="flex items-center gap-2 cursor-pointer">
            <ListOrdered className="h-4 w-4" />
            إعلاناتي
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href={ROUTES.favorites} className="flex items-center gap-2 cursor-pointer">
            <Heart className="h-4 w-4" />
            المفضلة
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href={ROUTES.savedSearches} className="flex items-center gap-2 cursor-pointer">
            <BellPlus className="h-4 w-4" />
            البحثات المحفوظة
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href={ROUTES.activity} className="flex items-center gap-2 cursor-pointer">
            <History className="h-4 w-4" />
            نشاطي
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href={ROUTES.settings.profile} className="flex items-center gap-2 cursor-pointer">
            <Settings className="h-4 w-4" />
            الإعدادات
          </Link>
        </DropdownMenuItem>

        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link href={ROUTES.admin.dashboard} className="flex items-center gap-2 cursor-pointer">
              <Shield className="h-4 w-4" />
              لوحة الإدارة
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          disabled={isPending}
          onClick={() => logout()}
          className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          {isPending ? 'جارٍ تسجيل الخروج…' : 'تسجيل الخروج'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
