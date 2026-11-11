import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { usePathname, useGlobalSearchParams } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { useEffect, useRef, type ComponentRef } from 'react';
import { ScrollView, View } from 'react-native';
import { spacing, radius, sizes, typography } from '@/theme/tokens';

type Workspace = 'services' | 'activity' | 'settings' | 'store' | 'sales';
/**
 * `view` يميّز تبويبات تشترك في نفس المسار وتختلف بمعامل `view` (مثل المخزون والتقارير).
 * بدونه كانت أكثر من تبويب تظهر «نشطة» معًا لأن المطابقة كانت على المسار فقط.
 */
type Tab = { label: string; path: string; view?: string; match?: string[] };

/** العرض الافتراضي للشاشات التي تفتح على view معيّن عند غياب المعامل. */
const DEFAULT_VIEW: Record<string, string> = { '/sales-insights': 'analytics' };

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
    { label: 'المنتجات', path: '/my-products' },
    { label: 'المجموعات', path: '/store-collections' },
    { label: 'المخزون', path: '/my-products', view: 'inventory' },
    { label: 'العروض', path: '/store-promotions' },
    { label: 'الفريق', path: '/store-team' },
    { label: 'الإحصائيات', path: '/my-store-analytics' },
    { label: 'بيانات المتجر', path: '/my-store' },
  ],
  sales: [
    { label: 'نظرة عامة', path: '/sales-insights', view: 'overview' },
    { label: 'المبيعات', path: '/my-sales' },
    { label: 'العملاء', path: '/customers' },
    { label: 'الديون', path: '/debts' },
    { label: 'الأقساط', path: '/installments' },
    { label: 'الإحصائيات', path: '/sales-insights', view: 'analytics' },
    { label: 'التقارير', path: '/sales-insights', view: 'reports' },
    { label: 'التكلفة الحقيقية', path: '/sales-costs' },
    { label: 'التحليلات الذكية', path: '/sales-insights', view: 'smart' },
  ],
};

const normalize = (path: string) => path.replace(/\/+$/, '') || '/';

function pathMatches(pathname: string, target: string): boolean {
  const current = normalize(pathname);
  const root = normalize(target);
  return current === root || current.startsWith(`${root}/`);
}

function isTabActive(pathname: string, tabs: Tab[], tab: Tab, view: string | undefined): boolean {
  const matchesPath = pathMatches(pathname, tab.path) || (tab.match?.some((path) => pathMatches(pathname, path)) ?? false);
  if (!matchesPath) return false;
  const currentView = view ?? DEFAULT_VIEW[normalize(pathname)];
  // تبويب بعرض محدد: يطابق فقط عند تساوي العرض.
  if (tab.view !== undefined) return currentView === tab.view;
  // تبويب بدون عرض يشاركه مسار مع تبويبات ذات عروض: لا يكون نشطًا إذا كان العرض الحالي يخص أحدها.
  const siblingViews = tabs.filter((t) => t.view !== undefined && normalize(t.path) === normalize(tab.path)).map((t) => t.view);
  return !(currentView !== undefined && siblingViews.includes(currentView));
}

export function WorkspaceTabs({ workspace }: { workspace: Workspace }) {
  const { colors } = useAppTheme();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ view?: string }>();
  const view = typeof params.view === 'string' ? params.view : undefined;
  const tabs = TABS[workspace];
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const offsets = useRef<Record<string, { x: number; width: number }>>({});
  const activeKey = tabs.map((tab) => (isTabActive(pathname, tabs, tab, view) ? tabKey(workspace, tab) : null)).find(Boolean) ?? null;

  // مع 9 تبويبات قد يكون النشط خارج الشاشة: نمرّره إلى منتصف الشريط.
  useEffect(() => {
    if (!activeKey) return;
    const frame = offsets.current[activeKey];
    if (frame) scrollRef.current?.scrollTo({ x: Math.max(0, frame.x - spacing.xl), animated: true });
  }, [activeKey]);

  return (
    <View style={{ marginTop: spacing.xs, marginBottom: 0 }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.xs, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs }}
      >
        {tabs.map((tab) => {
          const key = tabKey(workspace, tab);
          const active = key === activeKey;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onLayout={(event) => { offsets.current[key] = { x: event.nativeEvent.layout.x, width: event.nativeEvent.layout.width }; }}
              onPress={() => {
                if (active) return;
                pushOnce((tab.view ? { pathname: tab.path, params: { view: tab.view } } : tab.path) as never);
              }}
              style={{
                minHeight: sizes.touchTarget,
                justifyContent: 'center',
                paddingHorizontal: spacing.md,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: active ? colors.brand : colors.border,
                backgroundColor: active ? colors.brandSoft : colors.surface,
              }}
            >
              <Text style={[typography.captionStrong, { color: active ? colors.brandOnSoft : colors.muted }]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function tabKey(workspace: Workspace, tab: Tab): string {
  return `${workspace}:${tab.path}${tab.view ? `?view=${tab.view}` : ''}`;
}
