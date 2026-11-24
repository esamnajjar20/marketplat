import type { Metadata } from 'next';
import { AccountPageShell } from '@/components/shared/account/AccountPageShell';
import { MarketplaceOrderDetailPage } from '@/components/orders/MarketplaceOrderDetailPage';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'تفاصيل طلب الشراء', noIndex: true });

export default function MarketplaceOrderDetailRoutePage() {
  return <AccountPageShell title="تفاصيل طلب الشراء" description="راجع المنتجات وحالة الطلب ومعلومات الاستلام."><MarketplaceOrderDetailPage /></AccountPageShell>;
}
