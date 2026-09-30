/**
 * ProtectedSidebar — inline-start navigation for the authenticated section.
 *
 * UX-08 FIX: Added aria-current="page" on the active link so screen readers
 *   announce "current page" when the user focuses it.
 *
 * UX-09 FIX: border-r → border-e (CSS logical property). In RTL layouts
 *   border-r draws on the left side of the sidebar which is the wrong edge.
 *   border-e always draws on the inline-end edge regardless of direction.
 *
 * UX-15 FIX: Unicode icon spans now have aria-hidden={true} so screen
 *   readers don't read out "◈" or "♡" before each nav item label.
 *
 * FIX P2-1: replaced the Unicode glyphs themselves (▦ ◈ ♡ 🔖 ✉ 🛠 🚩 ⚙)
 *   with the same lucide-react icon set MobileNav.tsx already uses for
 *   its "حسابك"/"النظام" sections — the two navs were rendering the
 *   same destinations with two different icon systems. aria-hidden
 *   carries over unchanged since these are still decorative.
 *
 * AUDIT-FIX (protected #2, #4): "خدماتي" (/my-services) and "البحثات
 *   المحفوظة" (/saved-searches) had no link anywhere in this sidebar —
 *   /my-services was reachable only through a card that itself only
 *   renders for users who already have an active ServiceProviderDetails,
 *   and /saved-searches only through UserMenu. Both added here as
 *   always-visible links: /my-services already handles the "not a
 *   provider yet" case itself (renders BecomeServiceProviderCard's
 *   pattern via ServiceProviderSettingsSection), the same way
 *   /settings/service-provider does today.
 *
 * AUDIT-FIX (protected #5): "نشاطي" (/activity) had a fully-built page
 *   (page.tsx + loading.tsx) but no link anywhere in the app — same
 *   discoverability gap as #2/#4 above, just missed in that pass.
 *
 * REORG-04: PAGE_MAP documented four real routes with no direct Nav
 *   link at all — /my-store, /my-store/followed, /my-requests,
 *   /my-services/appointments, /my-services/requests. Rather than
 *   adding five more flat top-level items (which would just make the
 *   sidebar longer without addressing why those routes were missed in
 *   the first place — they're sub-destinations of "خدماتي"/"متجري",
 *   not peers of it), "خدماتي" and a new "متجري" are now disclosure
 *   groups: one visible top-level row each, expanding to their related
 *   destinations. Item count at the top level is unchanged from before;
 *   only two rows became expandable. "متجري" itself is new at this
 *   breakpoint — it never had a desktop entry point before.
 *
 * ROLE-SEP 3.2: "خدماتي"/"متجري" now read useMyServiceProvider()/
 *   useMySellerProfile() and collapse to a single CTA row (become a
 *   provider / open your store) until that profile exists. Before this,
 *   every user saw the full 4-item disclosure group regardless of
 *   whether they had a SellerProfile or ServiceProviderDetails —
 *   /my-store/products was one tap away for someone with no store.
 *   The full group is the exception, gated on the one unambiguous
 *   positive signal (isSuccess && data — the query resolved and a
 *   profile exists); every other state (loading, 404-as-"not yet",
 *   or a genuine network error) is left as "absence of data" and
 *   falls through to the same CTA row, with no branch that inspects
 *   isError or treats it as a concept the UI reasons about. First
 *   paint after login (query still in flight) is indistinguishable
 *   from "confirmed not a seller" — both show the CTA — and it
 *   flips to the full group the moment isSuccess lands, no separate
 *   skeleton — CACHE_TTL.sellerProfile means it's already in cache
 *   on every load after the first this session.
 */
'use client';

import { Suspense, useState } from 'react';
import Link           from 'next/link';
import { usePathname } from 'next/navigation';
import { WithSearch } from '@/components/layout/WithSearch';
import {
  LayoutDashboard,
  ListOrdered,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  User,
  ExternalLink,
  Store,
} from 'lucide-react';
import { cn }         from '@/lib/utils';
import { ROUTES }     from '@/lib/constants';
import { useUnreadConversationCount } from '@/hooks/queries/useConversations';
import { ACTIVITY_GROUP, SERVICES_GROUP, STORE_GROUP, settingsGroupFor, requestsGroupFor, navChildIsActive, type NavDisclosureGroup } from '@/lib/navigation';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { useIsSeller } from '@/hooks/queries/useSellers';
import { useIsProvider } from '@/hooks/queries/useServiceProviders';
import { useMyStore } from '@/hooks/queries/useStores';

// Primary destinations stay one-tap. Secondary activity items live in
// ACTIVITY_GROUP (المفضلة / بحث محفوظ / سجل / بلاغات).
const NAV_ITEMS = [
  { label: 'لوحة التحكم', href: ROUTES.dashboard, icon: LayoutDashboard },
  { label: 'الرسائل',     href: ROUTES.messages,  icon: MessageSquare },
] as const;

// NAV-DEDUP: SETTINGS_GROUP / SERVICES_GROUP / STORE_GROUP moved to
// lib/navigation.ts — they were byte-identical to ProtectedMobileNav's
// (and, for SETTINGS_GROUP, MobileNav's) copies. See that file's doc
// comment for the full reasoning.

function NavLink({
  label, href, icon: Icon, isActive, indent = false, badge,
}: {
  label: string; href: string; icon?: React.ComponentType<{ className?: string }>;
  isActive: boolean; indent?: boolean; badge?: number;
}) {
  return (
    <Link
      href={href}
      // FIX RSC-PREFETCH-STORM-02: every nav row this renders (top-level
      // items + all disclosure children) is a Link. Next.js auto-prefetches
      // every one of them on mount, so a signed-in page load fired RSC
      // fetches for /messages, /my-ads, /my-store, /favorites, /activity,
      // /settings/*, /admin/dashboard — the full sidebar — before the user
      // picked any destination. On a weak network each prefetch competes
      // with the current page's own data. Click still works: Next.js
      // fetches on navigation, just not ahead of time.
      prefetch={false}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-md py-2 text-sm font-medium transition-colors',
        indent ? 'px-3 ms-7' : 'px-3',
        isActive
          ? 'bg-primary-soft text-primary shadow-xs'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden={true} />}
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </Link>
  );
}

function DisclosureGroup({
  group, pathname, search = '',
}: {
  group: typeof ACTIVITY_GROUP | typeof SERVICES_GROUP | typeof STORE_GROUP | NavDisclosureGroup;
  pathname: string;
  search?: string;
}) {
  const isAnyChildActive = group.children.some((c) => navChildIsActive(pathname, c, search));
  // Starts open if the user is already somewhere inside the group, so
  // landing on e.g. /my-services/requests doesn't hide the very link
  // that got them there.
  const [isOpen, setIsOpen] = useState(isAnyChildActive);
  const Icon = group.icon;

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className={cn(
          'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isAnyChildActive && !isOpen
            ? 'bg-primary-soft text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden={true} />
        <span className="flex-1 text-start">{group.label}</span>
        {isOpen
          ? <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden={true} />
          : <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden={true} />}
      </button>
      {isOpen && (
        <div className="mt-1 flex flex-col gap-1">
          {group.children.map((child) => (
            <NavLink
              key={child.href}
              label={child.label}
              href={child.href}
              isActive={navChildIsActive(pathname, child, search)}
              indent
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RoleNavSkeleton() {
  return (
    <div className="space-y-1 px-1 py-0.5" aria-hidden>
      <div className="h-9 animate-pulse rounded-md bg-muted/70" />
      <div className="h-9 animate-pulse rounded-md bg-muted/50" />
    </div>
  );
}

export function ProtectedSidebar() {
  const pathname = usePathname();
  const { data: unreadMessages = 0 } = useUnreadConversationCount();
  const user = useAuthStore(selectUser);
  // ROLE-SEP 3.2: isSuccess && data is the only positive signal —
  // everything else (loading, 404, network error) reads as "no
  // profile yet" and renders the CTA. No isError branch.
  const { isSeller, isLoaded: sellerLoaded, showRoleSkeleton } = useIsSeller();
  const { isProvider, showRoleSkeleton: showProviderSkeleton } = useIsProvider();
  const { data: myStore } = useMyStore();

  return (
    // UX-09 FIX: border-e is the logical equivalent of border-r, correct in RTL
    <aside className="sticky top-0 z-20 hidden h-[calc(100vh-4rem)] w-52 shrink-0 overflow-y-auto border-e border-border/80 bg-surface-1 md:block lg:w-56">
      <nav aria-label="القائمة الشخصية" className="flex flex-col gap-1 p-4">
        {NAV_ITEMS.map((item) => {
          // SW-FIX-SIDEBAR-DEAD-CAST: NAV_ITEMS has no activeMatch field
          // — the cast and ?? fallback were always resolving to item.href.
          const isActive = pathname.startsWith(item.href);
          return (
            <NavLink
              key={item.href}
              label={item.label}
              href={item.href}
              icon={item.icon}
              isActive={isActive}
              badge={item.href === ROUTES.messages ? unreadMessages : undefined}
            />
          );
        })}

        {/* NAV-ORDER: align with BROWSE_LINKS priority — ads/store first
            for sellers, then provider tools, then open-requests hub,
            then secondary (profile view, activity), then settings. */}

        {/* 3. إعلاناتي (seller) — skeleton while roles unknown (slow net) */}
        {showRoleSkeleton && <RoleNavSkeleton />}
        {!showRoleSkeleton && isSeller && (
          <NavLink
            label="إعلاناتي"
            href={ROUTES.myAds}
            icon={ListOrdered}
            isActive={pathname.startsWith(ROUTES.myAds)}
          />
        )}
        {sellerLoaded && !isSeller && (
          <Suspense
            fallback={
              <NavLink
                label="أنشئ حساب بائع"
                href={ROUTES.settings.seller}
                icon={Store}
                isActive={false}
              />
            }
          >
            <WithSearch>
              {(search) => (
                <NavLink
                  label="أنشئ حساب بائع"
                  href={ROUTES.settings.seller}
                  icon={Store}
                  isActive={
                    pathname === ROUTES.settings.root && search.includes('section=seller')
                  }
                />
              )}
            </WithSearch>
          </Suspense>
        )}

        {/* 4. متجري + عرض متجري */}
        {isSeller && (
          <Suspense fallback={<DisclosureGroup group={STORE_GROUP} pathname={pathname} />}>
            <WithSearch>
              {(search) => <DisclosureGroup group={STORE_GROUP} pathname={pathname} search={search} />}
            </WithSearch>
          </Suspense>
        )}
        {isSeller && myStore?.status === 'ACTIVE' && (
          <NavLink
            label="عرض متجري"
            href={ROUTES.storeDetail(myStore.id)}
            icon={ExternalLink}
            isActive={pathname.startsWith(ROUTES.storeDetail(myStore.id))}
          />
        )}

        {/* 5. خدماتي (provider) */}
        {showProviderSkeleton && (
          <div className="h-9 animate-pulse rounded-md bg-muted/60" aria-hidden />
        )}
        {!showProviderSkeleton && isProvider && (
          <Suspense fallback={<DisclosureGroup group={SERVICES_GROUP} pathname={pathname} />}>
            <WithSearch>
              {(search) => <DisclosureGroup group={SERVICES_GROUP} pathname={pathname} search={search} />}
            </WithSearch>
          </Suspense>
        )}

        {/* 6. طلباتي (open marketplace hub) */}
        <DisclosureGroup group={requestsGroupFor(true)} pathname={pathname} />

        {/* 7. عرض ملفي */}
        {user && (
          <NavLink
            label="عرض ملفي"
            href={ROUTES.userProfile(user.id)}
            icon={User}
            isActive={pathname.startsWith(ROUTES.userProfile(user.id))}
          />
        )}

        {/* 8. نشاطي — secondary destinations (favorites, reports, …) */}
        <DisclosureGroup group={ACTIVITY_GROUP} pathname={pathname} />

        {/* 9. الإعدادات — settingsGroupFor drops متجري when STORE_GROUP is shown.
            SETTINGS-HUB-01: pass search so tab active state works. */}
        <Suspense fallback={<DisclosureGroup group={settingsGroupFor(isSeller)} pathname={pathname} />}>
          <WithSearch>
            {(search) => (
              <DisclosureGroup group={settingsGroupFor(isSeller)} pathname={pathname} search={search} />
            )}
          </WithSearch>
        </Suspense>
      </nav>
    </aside>
  );
}
