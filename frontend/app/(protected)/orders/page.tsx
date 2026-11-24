import type { Metadata } from 'next';
import { AccountPageShell } from '@/components/shared/account/AccountPageShell';
import { MarketplaceOrdersPage } from '@/components/orders/MarketplaceOrdersPage';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'طلبات المنتجات', noIndex: true });

export default function MarketplaceOrdersRoutePage() {
  return <AccountPageShell title="طلبات المنتجات" description="إدارة طلبات الشراء الواردة والصادرة، مستقلة عن سجل المبيعات اليدوية."><MarketplaceOrdersPage /></AccountPageShell>;
}
