import Link from 'next/link';
import { Plus, List, Heart, Settings } from 'lucide-react';
import { ROUTES } from '@/lib/constants';

const actions = [
  { href: ROUTES.adCreate,           label: 'نشر إعلان جديد', icon: Plus,     variant: 'primary' },
  { href: ROUTES.myAds,              label: 'إعلاناتي',        icon: List,     variant: 'secondary' },
  { href: '/favorites',              label: 'المفضلة',         icon: Heart,    variant: 'secondary' },
  { href: ROUTES.settings.profile,   label: 'الإعدادات',       icon: Settings, variant: 'secondary' },
] as const;

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {actions.map(({ href, label, icon: Icon, variant }) => (
        <Link key={href} href={href}
          className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-center text-sm font-medium transition-colors
            ${variant === 'primary'
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 border-primary'
              : 'bg-card hover:bg-muted border-border'}`}>
          <Icon className="h-5 w-5" />
          {label}
        </Link>
      ))}
    </div>
  );
}
