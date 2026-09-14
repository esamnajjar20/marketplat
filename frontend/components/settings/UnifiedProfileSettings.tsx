'use client';

/**
 * دمج إعدادات الملف الثلاثة (شخصي / بائع / مقدم خدمة) في سطح واحد
 * مع تبويبات — الروابط القديمة /settings/seller و /settings/service-provider
 * تبقى شغّالة وتفتح التبويب المناسب.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { User, Store, Wrench } from 'lucide-react';
import { ProfileSettingsForm } from '@/components/profile/ProfileSettingsForm';
import { DataSaverToggle } from '@/components/shared/DataSaverToggle';
import { SellerSettingsSection } from '@/components/sellers/SellerSettingsSection';
import { ServiceProviderSettingsSection } from '@/components/services/ServiceProviderSettingsSection';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';

type ProfileTab = 'personal' | 'seller' | 'service';

const TABS: {
  id: ProfileTab;
  label: string;
  href: string;
  icon: typeof User;
}[] = [
  { id: 'personal', label: 'الشخصي', href: ROUTES.settings.profile, icon: User },
  { id: 'seller', label: 'البائع', href: ROUTES.settings.seller, icon: Store },
  { id: 'service', label: 'مقدم الخدمة', href: ROUTES.settings.serviceProvider, icon: Wrench },
];

function tabFromPath(pathname: string): ProfileTab {
  if (pathname.startsWith(ROUTES.settings.seller)) return 'seller';
  if (pathname.startsWith(ROUTES.settings.serviceProvider)) return 'service';
  return 'personal';
}

export function UnifiedProfileSettings() {
  const pathname = usePathname();
  const active = tabFromPath(pathname);

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="أقسام الملف"
        className="flex gap-1 rounded-xl border border-border/60 bg-muted/60 p-1"
      >
        {TABS.map(({ id, label, href, icon: Icon }) => {
          const isActive = active === id;
          return (
            <Link
              key={id}
              href={href}
              role="tab"
              aria-selected={isActive}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors sm:text-sm',
                isActive
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>

      <div role="tabpanel" key={active}>
        {active === 'personal' && (
          <div className="space-y-6">
            <ProfileSettingsForm />
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">تفضيلات الجهاز</h2>
              <DataSaverToggle />
            </section>
          </div>
        )}

        {active === 'seller' && (
          <Suspense
            fallback={
              <div className="flex justify-center py-10 text-sm text-muted-foreground">
                جاري التحميل…
              </div>
            }
          >
            <SellerSettingsSection />
          </Suspense>
        )}

        {active === 'service' && (
          <Suspense
            fallback={
              <div className="flex justify-center py-10 text-sm text-muted-foreground">
                جاري التحميل…
              </div>
            }
          >
            <ServiceProviderSettingsSection />
          </Suspense>
        )}
      </div>
    </div>
  );
}
