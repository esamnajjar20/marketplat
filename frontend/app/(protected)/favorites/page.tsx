import type { Metadata } from 'next';
import { FavoritesPageLayout } from '@/components/favorites/FavoritesPageLayout';
import { AccountPageShell } from '@/components/shared/account/AccountPageShell';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'المفضلة', noIndex: true });

export default function FavoritesPage() {
  return (
    <AccountPageShell
      title="المفضلة"
      description="احتفظ بالإعلانات والمنتجات والمتاجر والخدمات التي تريد الرجوع إليها أو مقارنتها لاحقًا."
    >
      <FavoritesPageLayout />
    </AccountPageShell>
  );
}
