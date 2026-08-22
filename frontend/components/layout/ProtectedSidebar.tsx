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

import { useState } from 'react';
import Link           from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, ListOrdered, Heart, BellPlus,
  MessageSquare, Flag, History,
  ChevronDown, ChevronRight, User, ExternalLink, Store,
} from 'lucide-react';
import { cn }         from '@/lib/utils';
import { ROUTES }     from '@/lib/constants';
import { SETTINGS_GROUP, SERVICES_GROUP, STORE_GROUP } from '@/lib/navigation';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { useIsSeller } from '@/hooks/queries/useSellers';
import { useIsProvider } from '@/hooks/queries/useServiceProviders';
import { useMyStore } from '@/hooks/queries/useStores';

const NAV_ITEMS = [
  { label: 'لوحة التحكم', href: ROUTES.dashboard,        icon: LayoutDashboard },
  { label: 'المفضلة',     href: ROUTES.favorites,         icon: Heart },
  { label: 'عمليات البحث المحفوظة', href: ROUTES.savedSearches, icon: BellPlus },
  { label: 'نشاطي',       href: ROUTES.activity,          icon: History },
  { label: 'الرسائل',     href: ROUTES.messages,          icon: MessageSquare },
] as const;

const TRAILING_NAV_ITEMS = [
  // FEAT-REPORT-USER-STORE: without a link here, /my-reports would be
  // reachable only by direct URL — same discoverability gap as the
  // "AUDIT-FIX (protected #2, #4)" note above already fixed once for
  // /my-services and /saved-searches.
  { label: 'بلاغاتي',     href: ROUTES.myReports,         icon: Flag },
] as const;

// NAV-DEDUP: SETTINGS_GROUP / SERVICES_GROUP / STORE_GROUP moved to
// lib/navigation.ts — they were byte-identical to ProtectedMobileNav's
// (and, for SETTINGS_GROUP, MobileNav's) copies. See that file's doc
// comment for the full reasoning.

function NavLink({
  label, href, icon: Icon, isActive, indent = false,
}: {
  label: string; href: string; icon?: React.ComponentType<{ className?: string }>;
  isActive: boolean; indent?: boolean;
}) {
  return (
    <Link
      href={href}
      // UX-08 FIX: aria-current="page" on the active item
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-md py-2 text-sm font-medium transition-colors',
        indent ? 'px-3 ms-7' : 'px-3',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {/* UX-15 FIX: aria-hidden so screen readers skip the decorative icon */}
      {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden={true} />}
      {label}
    </Link>
  );
}

function DisclosureGroup({
  group, pathname,
}: {
  group: typeof SERVICES_GROUP | typeof STORE_GROUP | typeof SETTINGS_GROUP;
  pathname: string;
}) {
  const isAnyChildActive = group.children.some((c) => pathname.startsWith(c.href));
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
            ? 'bg-primary text-primary-foreground'
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
              isActive={pathname.startsWith(child.href)}
              indent
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ProtectedSidebar() {
  const pathname = usePathname();
  const user = useAuthStore(selectUser);
  // ROLE-SEP 3.2: isSuccess && data is the only positive signal —
  // everything else (loading, 404, network error) reads as "no
  // profile yet" and renders the CTA. No isError branch.
  const { isSeller, isLoaded: sellerLoaded } = useIsSeller();
  const { isProvider } = useIsProvider();
  const { data: myStore } = useMyStore();

  return (
    // UX-09 FIX: border-e is the logical equivalent of border-r, correct in RTL
    <aside className="hidden w-56 shrink-0 border-e bg-muted/20 lg:block">
      <nav aria-label="القائمة الشخصية" className="flex flex-col gap-1 p-4">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith((item as { activeMatch?: string }).activeMatch ?? item.href);
          return (
            <NavLink key={item.href} label={item.label} href={item.href} icon={item.icon} isActive={isActive} />
          );
        })}

        {/* عرض الملف الشخصي — standalone entry, distinct from the
            "الإعدادات" disclosure group below whose children are all
            edit/manage destinations. This one is a view-only link to
            the public profile page, so it sits with the other
            top-level view destinations (favorites, activity) rather
            than inside SETTINGS_GROUP. */}
        {user && (
          <NavLink
            label="عرض ملفي"
            href={ROUTES.userProfile(user.id)}
            icon={User}
            isActive={pathname.startsWith(ROUTES.userProfile(user.id))}
          />
        )}

        {/* AUDIT-FIX (dynamic sidebar): sections for roles the user
            doesn't hold are now fully absent rather than replaced by a
            CTA row. "أصبح مقدّم خدمة"/"أصبح بائعاً"/"افتح متجرك" CTAs
            removed from here — /settings/seller and
            /settings/service-provider are unchanged and still reachable
            through SETTINGS_GROUP below, just no longer surfaced as a
            top-level sidebar row for users who haven't taken either
            role yet. */}
        {isProvider && <DisclosureGroup group={SERVICES_GROUP} pathname={pathname} />}

        {/* SELLER-GATE (myAds): ads.service.ts's createAd requires a
            SellerProfile (ensureSellerProfileForAdCreation throws
            BadRequestError otherwise) — moved out of the always-visible
            NAV_ITEMS above since it's a seller feature, not a general
            account feature. Same isSeller gate as STORE_GROUP below. */}
        {isSeller && (
          <NavLink
            label="إعلاناتي"
            href={ROUTES.myAds}
            icon={ListOrdered}
            isActive={pathname.startsWith(ROUTES.myAds)}
          />
        )}

        {/* SELLER-CTA: shown only while the user has no SellerProfile
            yet (sellerLoaded && !sellerProfile — mirrors isSeller's own
            gating logic: loading/error states stay silent, no flash of
            the CTA before the query resolves). Links to
            /settings/seller, the existing seller-signup surface
            (SellerSettingsSection). Disappears the moment isSeller
            flips true; إعلاناتي + STORE_GROUP take its place. */}
        {sellerLoaded && !isSeller && (
          <NavLink
            label="أنشئ حساب بائع"
            href={ROUTES.settings.seller}
            icon={Store}
            isActive={pathname.startsWith(ROUTES.settings.seller)}
          />
        )}
        {isSeller && <DisclosureGroup group={STORE_GROUP} pathname={pathname} />}

        {/* عرض متجري — same pattern as "عرض ملفي" above: a view-only
            link to the public storefront, mirroring MyStoreCard's
            existing "عرض صفحتي العامة" button (only shown once the
            store is ACTIVE, since PENDING/BLOCKED stores have no
            public page to view yet). Placed right after STORE_GROUP so
            it reads as "متجري"'s view-mode counterpart, same as
            ViewMyProfileLink sits apart from SETTINGS_GROUP above. */}
        {isSeller && myStore?.status === 'ACTIVE' && (
          <NavLink
            label="عرض متجري"
            href={ROUTES.storeDetail(myStore.id)}
            icon={ExternalLink}
            isActive={pathname.startsWith(ROUTES.storeDetail(myStore.id))}
          />
        )}

        {TRAILING_NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith((item as { activeMatch?: string }).activeMatch ?? item.href);
          return (
            <NavLink key={item.href} label={item.label} href={item.href} icon={item.icon} isActive={isActive} />
          );
        })}

        <DisclosureGroup group={SETTINGS_GROUP} pathname={pathname} />
      </nav>
    </aside>
  );
}
