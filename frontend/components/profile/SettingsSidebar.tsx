'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { User, Shield, Monitor, Bell, Store, ShoppingBag, Wrench } from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';

const links = [
  { href: ROUTES.settings.profile,       label: 'الملف الشخصي',  icon: User    },
  { href: ROUTES.settings.seller,        label: 'ملف البائع',    icon: Store   },
  // AUDIT-FIX (issue #2): was entirely orphaned — the page and
  // ServiceProviderSettingsSection component were both fully built,
  // but no link anywhere in the app pointed to /settings/service-provider.
  { href: ROUTES.settings.serviceProvider, label: 'ملف مقدم الخدمة', icon: Wrench },
  { href: ROUTES.myStore,                label: 'متجري',          icon: ShoppingBag },
  { href: ROUTES.settings.security,      label: 'الأمان',         icon: Shield  },
  { href: ROUTES.settings.sessions,      label: 'الجلسات',        icon: Monitor },
  { href: ROUTES.settings.notifications, label: 'الإشعارات',      icon: Bell    },
];

export function SettingsSidebar() {
  const pathname = usePathname();
  return (
    <nav className="space-y-1">
      {links.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href}
          className={cn('flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
            pathname === href ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50')}>
          <Icon className="h-4 w-4" />{label}
        </Link>
      ))}
    </nav>
  );
}
