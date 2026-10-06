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
  ChevronLeft,
  User,
  ExternalLink,
  Store,
} from 'lucide-react';
import { cn }         from '@/lib/utils';
import { ROUTES }     from '@/lib/constants';
import { useUnreadConversationCount } from '@/hooks/queries/useConversations';
import { useNavigationUsage } from '@/hooks/useNavigationUsage';
import { ACTIVITY_GROUP, SERVICES_GROUP, STORE_GROUP, SALES_GROUP, settingsGroupFor, requestsGroupFor, navChildIsActive, type NavDisclosureGroup } from '@/lib/navigation';
import { useAuthStore, selectIsAdminTier, selectUser } from '@/store/auth.store';
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
  label, href, icon: Icon, isActive, indent = false, badge, onNavigate,
}: {
  label: string; href: string; icon?: React.ComponentType<{ className?: string }>;
  isActive: boolean; indent?: boolean; badge?: number; onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
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
        'flex min-h-10 items-center gap-3 rounded-lg py-2 text-sm font-medium transition-colors',
        indent ? 'px-3 ms-7' : 'px-3',
        isActive
          ? 'bg-primary-soft text-primary shadow-xs'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden={true} />}
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-2xs-tight font-semibold text-primary-foreground">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </Link>
  );
}

function DisclosureGroup({
  group, pathname, search = '', onNavigate,
}: {
  group: typeof ACTIVITY_GROUP | typeof SERVICES_GROUP | typeof STORE_GROUP | typeof SALES_GROUP | NavDisclosureGroup;
  pathname: string;
  search?: string;
  onNavigate?: (href: string) => void;
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
          'flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isAnyChildActive && !isOpen
            ? 'bg-primary-soft text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden={true} />
        <span className="flex-1 text-start">{group.label}</span>
        {isOpen
          ? <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden={true} />
          : <ChevronLeft className="h-3.5 w-3.5 shrink-0" aria-hidden={true} />}
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
              onNavigate={() => onNavigate?.(child.href)}
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
  const isAdminTier = useAuthStore(selectIsAdminTier);
  const { isSeller, showRoleSkeleton } = useIsSeller();
  const { isProvider } = useIsProvider();
  const needsStorePublicLink = pathname.startsWith('/stores/');
  const { data: myStore } = useMyStore({ enabled: isSeller && needsStorePublicLink });
  const { recordNavigation, isUsed, sortSmart } = useNavigationUsage();
  const current = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const hasCurrentInGroup = (group: NavDisclosureGroup) => group.children.some((child) => navChildIsActive(pathname, child));
  const activityVisible = hasCurrentInGroup(ACTIVITY_GROUP) || isUsed(ROUTES.activity) || isUsed(ROUTES.favorites) || isUsed(ROUTES.savedSearches);
  const requestsVisible = hasCurrentInGroup(requestsGroupFor(true)) || isUsed(ROUTES.myOpenRequests) || isUsed(ROUTES.myOpenRequestOffers);

  const navigate = (href: string) => recordNavigation(href);

  // Dashboard/messages are intentionally fixed. Everything below is ranked
  // locally by role importance + recent/frequent usage. The importance map
  // prevents a low-value page from permanently displacing a role-critical hub.
  const secondaryItems = sortSmart([
    ...(isSeller ? [{ key: 'ads', href: ROUTES.myAds, label: 'إعلاناتي', icon: ListOrdered, active: current(ROUTES.myAds) }] : [{ key: 'seller', href: ROUTES.settings.seller, label: 'أنشئ حساب بائع', icon: Store, active: current(ROUTES.settings.root) }]),
    ...(isSeller ? [{ key: 'store', href: STORE_GROUP.href, label: STORE_GROUP.label, icon: STORE_GROUP.icon, active: hasCurrentInGroup(STORE_GROUP) }] : []),
    ...(isSeller && myStore?.status === 'ACTIVE' ? [{ key: 'store-public', href: ROUTES.storeDetail(myStore.id), label: 'عرض متجري', icon: ExternalLink, active: current(ROUTES.storeDetail(myStore.id)) }] : []),
    ...(isProvider ? [{ key: 'services', href: SERVICES_GROUP.href, label: SERVICES_GROUP.label, icon: SERVICES_GROUP.icon, active: hasCurrentInGroup(SERVICES_GROUP) }] : []),
    ...((isSeller || isProvider) ? [{ key: 'sales', href: SALES_GROUP.href, label: SALES_GROUP.label, icon: SALES_GROUP.icon, active: pathname === ROUTES.sales || pathname.startsWith(`${ROUTES.sales}/`) }] : []),
    { key: 'requests', href: requestsGroupFor(true).href, label: requestsGroupFor(true).label, icon: requestsGroupFor(true).icon, active: requestsVisible },
    ...(user ? [{ key: 'profile', href: ROUTES.userProfile(user.id), label: 'عرض ملفي', icon: User, active: current(ROUTES.userProfile(user.id)) }] : []),
    ...(activityVisible ? [{ key: 'activity', href: ACTIVITY_GROUP.href, label: ACTIVITY_GROUP.label, icon: ACTIVITY_GROUP.icon, active: hasCurrentInGroup(ACTIVITY_GROUP) }] : []),
  ] as const, {
    [ROUTES.myAds]: isSeller ? 72 : 15,
    [STORE_GROUP.href]: 90,
    ...(isSeller && myStore ? { [ROUTES.storeDetail(myStore.id)]: 55 } : {}),
    [SERVICES_GROUP.href]: isProvider ? 90 : 20,
    [SALES_GROUP.href]: (isSeller || isProvider) ? 78 : 10,
    [requestsGroupFor(true).href]: 62,
    ...(user ? { [ROUTES.userProfile(user.id)]: 35 } : {}),
    [ACTIVITY_GROUP.href]: 25,
  });

  return (
    <aside className="sticky top-0 z-20 hidden h-[calc(100vh-4rem)] w-56 shrink-0 overflow-y-auto border-e border-border/80 bg-surface-1 lg:block lg:w-60">
      <nav aria-label="القائمة الشخصية" className="flex flex-col gap-1.5 p-3 lg:p-4">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.href}
            label={item.label}
            href={item.href}
            icon={item.icon}
            isActive={current(item.href)}
            badge={item.href === ROUTES.messages ? unreadMessages : undefined}
            onNavigate={() => navigate(item.href)}
          />
        ))}

        <div className="my-1.5 border-t border-border/70" aria-hidden="true" />

        {showRoleSkeleton && <RoleNavSkeleton />}
        {!showRoleSkeleton && secondaryItems.map((item) => {
          if (item.key === 'store' || item.key === 'services' || item.key === 'requests') {
            const group = item.key === 'store' ? STORE_GROUP
              : item.key === 'services' ? SERVICES_GROUP
              : requestsGroupFor(true);
            return (
              <Suspense key={item.key} fallback={<DisclosureGroup group={group} pathname={pathname} />}>
                <WithSearch>{(search) => <DisclosureGroup group={group} pathname={pathname} search={search} onNavigate={navigate} />}</WithSearch>
              </Suspense>
            );
          }
          return <NavLink key={item.key} label={item.label} href={item.href} icon={item.icon} isActive={item.active} onNavigate={() => navigate(item.href)} />;
        })}

        <div className="mt-1 flex flex-col gap-1 rounded-lg border border-border/70 bg-background/60 p-1">
            {!activityVisible && (
              <Suspense fallback={<DisclosureGroup group={ACTIVITY_GROUP} pathname={pathname} />}>
                <WithSearch>{(search) => <DisclosureGroup group={ACTIVITY_GROUP} pathname={pathname} search={search} onNavigate={navigate} />}</WithSearch>
              </Suspense>
            )}
            <Suspense fallback={<DisclosureGroup group={settingsGroupFor(isSeller)} pathname={pathname} />}>
              <WithSearch>{(search) => <DisclosureGroup group={settingsGroupFor(isSeller)} pathname={pathname} search={search} onNavigate={navigate} />}</WithSearch>
            </Suspense>
            {isAdminTier && (
              <NavLink label="لوحة الإدارة" href={ROUTES.admin.dashboard} icon={LayoutDashboard} isActive={pathname === ROUTES.admin.root} onNavigate={() => navigate(ROUTES.admin.dashboard)} />
            )}
        </div>
      </nav>
    </aside>
  );
}
