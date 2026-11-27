'use client';

/**
 * دمج إعدادات الملف الثلاثة (شخصي / بائع / مقدم خدمة) في سطح واحد
 * مع تبويبات — يعمل داخل SETTINGS-HUB-01 عبر ?section=…
 * والروابط القديمة /settings/seller و /settings/service-provider تبقى
 * شغّالة عبر redirects → /settings?tab=profile&section=…
 */

import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { User, Store, Wrench, ChevronLeft } from 'lucide-react';
import { ProfileSettingsForm } from '@/components/profile/ProfileSettingsForm';
import { DataSaverToggle } from '@/components/shared/DataSaverToggle';
import { SellerSettingsSection } from '@/components/sellers/SellerSettingsSection';
import { ServiceProviderSettingsSection } from '@/components/services/ServiceProviderSettingsSection';
import { ROUTES } from '@/lib/constants';
import { TabsBar } from '@/components/shared/ui/TabsBar';
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
      <TabsBar
        value={active}
        onChange={selectSection}
        options={TABS.map(({ id, label, icon: Icon }) => ({
          value: id,
          label,
          icon: <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden="true" />,
          panelId: `settings-profile-panel-${id}`,
        }))}
        ariaLabel="أقسام الملف"
        variant="pills"
        idPrefix="settings-profile"
        itemClassName="min-w-fit px-3.5 text-xs font-bold sm:text-sm"
      />

      <div role="tabpanel" id={`settings-profile-panel-${active}`} aria-labelledby={`settings-profile-tab-${active}`} key={active}>
        {active === 'personal' && (
          <div className="mx-auto max-w-lg space-y-3 md:max-w-xl">
            <ProfileSettingsForm />
            <section className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-xs">
              <div className="min-w-0">
                <h2 className="text-sm font-bold">تفضيلات الجهاز</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">توفير البيانات على الشبكات الضعيفة.</p>
              </div>
              <DataSaverToggle />
            </section>
            <section className="space-y-1 rounded-2xl border border-border/70 bg-card p-2 shadow-xs">
              <div className="px-2 pt-2 pb-1">
                <h2 className="text-sm font-bold">الإشعارات والأمان</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">إدارة التنبيهات وكلمة المرور من الإعدادات الفرعية.</p>
              </div>
              <div className="divide-y divide-border/60">
                <IntentPrefetchLink
                  href={ROUTES.settings.notifications}
                  className="flex min-h-12 items-center justify-between gap-2 px-2 text-sm font-medium transition-colors hover:bg-muted/40" prefetch={false}
                >
                  <span className="inline-flex items-center gap-2">
                    <span className="text-muted-foreground" aria-hidden>🔔</span>
                    إعدادات الإشعارات
                  </span>
                  <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </IntentPrefetchLink>
                <IntentPrefetchLink
                  href={ROUTES.settings.security}
                  className="flex min-h-12 items-center justify-between gap-2 px-2 text-sm font-medium transition-colors hover:bg-muted/40" prefetch={false}
                >
                  <span className="inline-flex items-center gap-2">
                    <span className="text-muted-foreground" aria-hidden>🔒</span>
                    الأمان
                  </span>
                  <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </IntentPrefetchLink>
                <IntentPrefetchLink
                  href={ROUTES.offline.drafts}
                  className="flex min-h-12 items-center justify-between gap-2 px-2 text-sm font-medium transition-colors hover:bg-muted/40" prefetch={false}
                >
                  <span className="inline-flex items-center gap-2">
                    <span className="text-muted-foreground" aria-hidden>📄</span>
                    مركز المسودات
                  </span>
                  <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </IntentPrefetchLink>
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
