'use client';

/**
 * دمج إعدادات الملف الثلاثة (شخصي / بائع / مقدم خدمة) في سطح واحد
 * مع تبويبات — يعمل داخل SETTINGS-HUB-01 عبر ?section=…
 * والروابط القديمة /settings/seller و /settings/service-provider تبقى
 * شغّالة عبر redirects → /settings?tab=profile&section=…
 */

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { User, Store, Wrench } from 'lucide-react';
import { ProfileSettingsForm } from '@/components/profile/ProfileSettingsForm';
import { DataSaverToggle } from '@/components/shared/DataSaverToggle';
import { SellerSettingsSection } from '@/components/sellers/SellerSettingsSection';
import { ServiceProviderSettingsSection } from '@/components/services/ServiceProviderSettingsSection';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import {
  resolveProfileSection,
  settingsProfileSectionHref,
  type ProfileSection,
} from '@/lib/settingsHubTabs';

const TABS: {
  id: ProfileSection;
  label: string;
  icon: typeof User;
}[] = [
  { id: 'personal', label: 'الشخصي', icon: User },
  { id: 'seller', label: 'البائع', icon: Store },
  { id: 'service', label: 'مقدم الخدمة', icon: Wrench },
];

export function UnifiedProfileSettings() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const search = sp.toString() ? `?${sp.toString()}` : '';
  const urlSection = resolveProfileSection(search, pathname);

  const [active, setActive] = useState<ProfileSection>(urlSection);

  useEffect(() => {
    setActive(urlSection);
  }, [urlSection]);

  const selectSection = useCallback((section: ProfileSection) => {
    const href = settingsProfileSectionHref(section);
    try {
      window.history.replaceState(window.history.state, '', href);
    } catch {
      /* non-fatal */
    }
    setActive(section);
  }, []);

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="أقسام الملف"
        className="flex gap-1 rounded-xl border border-border/60 bg-muted/60 p-1"
      >
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => selectSection(id)}
              className={cn(
                'flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-xs font-medium transition-colors sm:text-sm',
                isActive
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" key={active}>
        {active === 'personal' && (
          <div className="space-y-6">
            <ProfileSettingsForm />
            <section className="space-y-3 rounded-2xl border border-border/70 bg-card/60 p-4 shadow-xs">
              <h2 className="text-sm font-semibold">تفضيلات الجهاز</h2>
              <p className="text-xs text-muted-foreground">توفير البيانات على الشبكات الضعيفة.</p>
              <DataSaverToggle />
            </section>
            <section className="space-y-2 rounded-2xl border border-border/70 bg-card/60 p-4 shadow-xs">
              <h2 className="text-sm font-semibold">الإشعارات والأمان</h2>
              <p className="text-xs text-muted-foreground">إدارة التنبيهات وكلمة المرور من الإعدادات الفرعية.</p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={ROUTES.settings.notifications}
                  className="inline-flex min-h-10 items-center rounded-xl border border-border/80 bg-background px-3 text-sm font-medium hover:border-primary/40"
                >
                  إعدادات الإشعارات
                </Link>
                <Link
                  href={ROUTES.settings.security}
                  className="inline-flex min-h-10 items-center rounded-xl border border-border/80 bg-background px-3 text-sm font-medium hover:border-primary/40"
                >
                  الأمان
                </Link>
              </div>
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
