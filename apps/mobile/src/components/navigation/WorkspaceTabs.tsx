import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useLocalSearchParams, usePathname, router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { spacing, fontSizes, radius } from '@/theme/tokens';

type Workspace = 'services' | 'activity' | 'settings' | 'store' | 'sales';
type Tab = { label: string; path: string; match?: string[]; query?: Readonly<Record<string, string>>; excludeQuery?: Readonly<Record<string, string>> };

/**
 * Mobile workspace navigation follows the same tab order and intent as the
 * web hubs. A tab is included only when the mobile app has a real destination
 * for it; unsupported web-only sections are intentionally not linked here.
 */
const TABS: Record<Workspace, Tab[]> = {
  services: [
    { label: 'نظرة عامة', path: '/my-services', match: ['/my-services', '/service-editor'] },
    { label: 'الطلبات الواردة', path: '/service-requests' },
    { label: 'المواعيد', path: '/appointments', match: ['/appointment-create'] },
    { label: 'الإحصائيات', path: '/service-provider-analytics' },
  ],
  activity: [
    { label: 'النشاط', path: '/activity' },
    { label: 'إعلاناتي', path: '/my-ads' },
    { label: 'طلباتي', path: '/my-requests' },
    { label: 'بلاغاتي', path: '/my-reports' },
  ],
  settings: [
    { label: 'الملف الشخصي', path: '/settings' },
    { label: 'الأمان', path: '/security' },
    { label: 'الجلسات', path: '/sessions' },
    { label: 'الإشعارات', path: '/notifications' },
    { label: 'المحظورون', path: '/blocked-users' },
  ],
  store: [
    { label: 'نظرة عامة', path: '/seller-dashboard' },
    { label: 'المنتجات', path: '/my-products', excludeQuery: { view: 'inventory' } },
    { label: 'المجموعات', path: '/store-collections' },
    { label: 'المخزون', path: '/my-products', query: { view: 'inventory' } },
    { label: 'العروض', path: '/store-promotions' },
    { label: 'الفريق', path: '/store-team' },
    { label: 'الإحصائيات', path: '/my-store-analytics' },
    { label: 'بيانات المتجر', path: '/my-store' },
  ],
  sales: [
    { label: 'نظرة عامة', path: '/sales-insights', query: { view: 'overview' } },
    { label: 'المبيعات', path: '/my-sales' },
    { label: 'العملاء', path: '/customers' },
    { label: 'الديون', path: '/debts' },
    { label: 'الأقساط', path: '/installments' },
    { label: 'الإحصائيات', path: '/sales-insights', query: { view: 'analytics' } },
    { label: 'التقارير', path: '/sales-insights', query: { view: 'reports' } },
    { label: 'التكلفة الحقيقية', path: '/sales-costs' },
    { label: 'التحليلات الذكية', path: '/sales-insights', query: { view: 'smart' } },
  ],
};

function isTabActive(pathname: string, tab: Tab, params: Readonly<Record<string, string | string[] | undefined>>): boolean {
  const current = pathname.replace(/\/+$/, '') || '/';
  const target = tab.path.replace(/\/+$/, '') || '/';
  if (current === target || current.startsWith(`${target}/`)) {
    if (tab.excludeQuery && Object.entries(tab.excludeQuery).some(([key, value]) => params[key] === value)) return false;
    if (!tab.query) return true;
    return Object.entries(tab.query).every(([key, value]) => params[key] === value);
  }
  return tab.match?.some((path) => {
    const normalized = path.replace(/\/+$/, '') || '/';
    return current === normalized || current.startsWith(`${normalized}/`);
  }) ?? false;
}

export function WorkspaceTabs({ workspace }: { workspace: Workspace }) {
  const { colors } = useAppTheme();
  const pathname = usePathname();
  const params = useLocalSearchParams<Record<string, string | string[] | undefined>>();
  const tabs = TABS[workspace];

  return (
    <View style={{ marginBottom: spacing.md }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexDirection: 'row-reverse', gap: spacing.xs, paddingVertical: 3 }}
      >
        {tabs.map((tab) => {
          const active = isTabActive(pathname, tab, params);
          return (
            <Pressable
              key={`${workspace}:${tab.path}:${JSON.stringify(tab.query ?? {})}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                if (active) return;
                if (tab.query) router.push({ pathname: tab.path as never, params: tab.query });
                else router.push(tab.path as never);
              }}
              style={{
                minHeight: 40,
                justifyContent: 'center',
                paddingHorizontal: spacing.md,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: active ? colors.brand : colors.border,
                backgroundColor: active ? colors.brandSoft : colors.surface,
              }}
            >
              <Text style={{ color: active ? colors.brand : colors.muted, fontSize: fontSizes[12], fontWeight: '800' }}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
