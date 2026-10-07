'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { BarChart3, Brain, ClipboardList, LayoutDashboard, ReceiptText, Users, WalletCards, FileSpreadsheet } from 'lucide-react';
import { TabsHub } from '@/components/shared/hub/TabsHub';
import { Button } from '@/components/shared/ui/Button';
import { SalesPageClient } from './SalesPageClient';
import { SalesListClient } from './SalesListClient';
import { SalesCustomersSection } from './SalesCustomersSection';
import { SalesDebtsSection } from './SalesDebtsSection';
import { SalesInstallmentsSection } from './SalesInstallmentsSection';
import { SalesChart } from './SalesChart';
import { SalesDashboard } from './SalesDashboard';
import { SalesReports } from './SalesReports';
import { SalesCompareCard } from './SalesCompareCard';
import { SalesCostSection } from './SalesCostSection';
import { SalesSmartInsights } from './SalesSmartInsights';
import { SalesAutomationPanel } from './SalesAutomationPanel';
import { useSalesCostSettings } from '@/hooks/queries/useSales';
import {
  DEFAULT_SALES_HUB_TAB,
  SALES_HUB_PATH,
  SALES_HUB_TABS,
  resolveSalesHubTab,
  searchForSalesHubTabSwitch,
  type SalesHubTab,
} from '@/lib/salesHubTabs';

const TAB_META: Record<SalesHubTab, { label: string; Icon: typeof WalletCards }> = {
  overview: { label: 'نظرة عامة', Icon: LayoutDashboard },
  sales: { label: 'المبيعات', Icon: ReceiptText },
  customers: { label: 'العملاء', Icon: Users },
  debts: { label: 'الديون', Icon: WalletCards },
  installments: { label: 'الأقساط', Icon: ClipboardList },
  analytics: { label: 'الإحصائيات', Icon: BarChart3 },
  reports: { label: 'التقارير', Icon: FileSpreadsheet },
  costs: { label: 'التكلفة الحقيقية', Icon: WalletCards },
  smart: { label: 'التحليلات الذكية', Icon: Brain },
};

function TabBody({ tab }: { tab: SalesHubTab }) {
  switch (tab) {
    case 'sales':
      return <Suspense><SalesListClient /></Suspense>;
    case 'customers':
      return <Suspense><SalesCustomersSection /></Suspense>;
    case 'debts':
      return <Suspense><SalesDebtsSection /></Suspense>;
    case 'installments':
      return <Suspense><SalesInstallmentsSection /></Suspense>;
    case 'reports':
      return <Suspense><SalesReports /></Suspense>;
    case 'costs':
      return <Suspense><SalesCostSection /></Suspense>;
    case 'smart':
      return <div className="space-y-4"><SalesAutomationPanel /><SalesSmartInsights /></div>;
    case 'analytics':
      return (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h2 className="text-xl font-bold">إحصائيات المبيعات</h2><p className="text-sm text-muted-foreground">تابع الأداء والمقارنة بين الفترات.</p></div>
            <Button size="sm" asChild><Link href={`${SALES_HUB_PATH}?tab=sales`}>سجل المبيعات</Link></Button>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]"><SalesChart /><SalesCompareCard /></div>
        </div>
      );
    case 'overview':
    default:
      return <Suspense><SalesPageClient /><SalesDashboard /></Suspense>;
  }
}

export function SalesTabsHub() {
  const costSettings = useSalesCostSettings();
  const visibleTabs = costSettings.data?.enabled === false ? SALES_HUB_TABS.filter((tab) => tab !== 'costs') : SALES_HUB_TABS;
  const resolveTab = (value: string | null | undefined): SalesHubTab => {
    const tab = resolveSalesHubTab(value ?? '') ?? DEFAULT_SALES_HUB_TAB;
    return tab === 'costs' && costSettings.data?.enabled === false ? DEFAULT_SALES_HUB_TAB : tab;
  };
  return (
    <TabsHub<SalesHubTab>
      idPrefix="sales"
      sectionLabel="لوحة المبيعات"
      tabListLabel="أقسام لوحة المبيعات"
      hubPath={SALES_HUB_PATH}
      tabs={visibleTabs}
      defaultTab={DEFAULT_SALES_HUB_TAB}
      meta={TAB_META}
      resolveTab={resolveTab}
      searchForTabSwitch={searchForSalesHubTabSwitch}
      renderTab={(tab) => <TabBody tab={tab} />}
    />
  );
}
