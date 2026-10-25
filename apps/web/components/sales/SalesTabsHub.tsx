'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import Link from 'next/link';
import { BarChart3, Brain, ClipboardList, LayoutDashboard, ReceiptText, Users, WalletCards, FileSpreadsheet } from 'lucide-react';
import { TabsHub } from '@/components/shared/hub/TabsHub';
import { Button } from '@/components/shared/ui/Button';
import { useSalesCostSettings } from '@/hooks/queries/useSales';
import {
  DEFAULT_SALES_HUB_TAB,
  SALES_HUB_PATH,
  SALES_HUB_TABS,
  resolveSalesHubTab,
  searchForSalesHubTabSwitch,
  type SalesHubTab,
} from '@/lib/salesHubTabs';
import { SuspenseFallback } from '@/components/shared/feedback/SuspenseFallback';

const SalesPageClient = dynamic(() =>
  import('./SalesPageClient').then((module) => module.SalesPageClient),
);
const SalesListClient = dynamic(() =>
  import('./SalesListClient').then((module) => module.SalesListClient),
);
const SalesCustomersSection = dynamic(() =>
  import('./SalesCustomersSection').then((module) => module.SalesCustomersSection),
);
const SalesDebtsSection = dynamic(() =>
  import('./SalesDebtsSection').then((module) => module.SalesDebtsSection),
);
const SalesInstallmentsSection = dynamic(() =>
  import('./SalesInstallmentsSection').then((module) => module.SalesInstallmentsSection),
);
const SalesChart = dynamic(() =>
  import('./SalesChart').then((module) => module.SalesChart),
);
const SalesDashboard = dynamic(() =>
  import('./SalesDashboard').then((module) => module.SalesDashboard),
);
const SalesReports = dynamic(() =>
  import('./SalesReports').then((module) => module.SalesReports),
);
const SalesCompareCard = dynamic(() =>
  import('./SalesCompareCard').then((module) => module.SalesCompareCard),
);
const SalesCostSection = dynamic(() =>
  import('./SalesCostSection').then((module) => module.SalesCostSection),
);
const SalesSmartInsights = dynamic(() =>
  import('./SalesSmartInsights').then((module) => module.SalesSmartInsights),
);
const SalesAutomationPanel = dynamic(() =>
  import('./SalesAutomationPanel').then((module) => module.SalesAutomationPanel),
);

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
      return <Suspense fallback={<SuspenseFallback />}><SalesListClient /></Suspense>;
    case 'customers':
      return <Suspense fallback={<SuspenseFallback />}><SalesCustomersSection /></Suspense>;
    case 'debts':
      return <Suspense fallback={<SuspenseFallback />}><SalesDebtsSection /></Suspense>;
    case 'installments':
      return <Suspense fallback={<SuspenseFallback />}><SalesInstallmentsSection /></Suspense>;
    case 'reports':
      return <Suspense fallback={<SuspenseFallback />}><SalesReports /></Suspense>;
    case 'costs':
      return <Suspense fallback={<SuspenseFallback />}><SalesCostSection /></Suspense>;
    case 'smart':
      return <div className="space-y-4"><SalesAutomationPanel /><SalesSmartInsights /></div>;
    case 'analytics':
      return (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h2 className="text-xl font-extrabold">إحصائيات المبيعات</h2><p className="text-sm text-muted-foreground">تابع الأداء والمقارنة بين الفترات.</p></div>
            <Button size="sm" asChild><Link href={`${SALES_HUB_PATH}?tab=sales`}>سجل المبيعات</Link></Button>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]"><SalesChart /><SalesCompareCard /></div>
        </div>
      );
    case 'overview':
    default:
      return <Suspense fallback={<SuspenseFallback />}><SalesPageClient /><SalesDashboard /></Suspense>;
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
