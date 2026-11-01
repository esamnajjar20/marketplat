import { AppText as Text } from '@/components/ui/AppText';
import { router, type Href } from 'expo-router';
import { View } from 'react-native';
import { useEffect, useState } from 'react';
import { fetchMyStore } from '@/features/commerce/commerce.api';
import { fetchMyServiceProvider } from '@/features/services/providers.api';
import { useAuth } from '@/features/auth/AuthContext';
import { getRouteAccess } from '@/lib/navigation-policy';
import {
  ListRow,
  Notice,
  PageShell,
  PrimaryButton,
  SectionCard,
  SectionHeader,
} from '@/components/MobileUI';
import { fontSizes, colors, spacing, typography } from '@/theme/tokens';

type Destination = { title: string; description: string; path: Href };
type DestinationGroup = { title: string; subtitle: string; items: Destination[] };
const PRIORITY_PATHS = new Set(['/messages', '/notifications', '/my-ads', '/for-you', '/my-sales', '/orders']);

const groups: DestinationGroup[] = [
  {
    title: 'المهم الآن',
    subtitle: 'أقصر طريق إلى المحادثات والطلبات والبيع',
    items: [
      { title: 'الرسائل', description: 'تابع محادثات المشترين والبائعين', path: '/messages' },
      { title: 'الإشعارات', description: 'راجع التحديثات والتنبيهات الجديدة', path: '/notifications' },
      { title: 'إعلاناتي', description: 'إدارة الإعلانات المنشورة والمسودات', path: '/my-ads' },
      { title: 'مخصّص لك', description: 'اكتشف محتوى مقترحًا وفق اهتماماتك', path: '/for-you' },
    ],
  },
  {
    title: 'المبيعات والعملاء',
    subtitle: 'البيع والتحصيل ومتابعة الطلبات',
    items: [
      { title: 'مبيعاتي', description: 'تابع المبيعات وحالاتها والإجراءات المطلوبة', path: '/my-sales' },
      { title: 'الطلبات والشراء', description: 'تابع طلباتك والعمليات الشرائية', path: '/orders' },
      { title: 'العملاء', description: 'إدارة بيانات العملاء وسجل تعاملاتهم', path: '/customers' },
      { title: 'الديون والمبالغ المستحقة', description: 'متابعة المبالغ المفتوحة والتحصيل', path: '/debts' },
      { title: 'الأقساط', description: 'متابعة جداول الأقساط والتحصيلات', path: '/installments' },
    ],
  },
  {
    title: 'ملفي ونشاطي',
    subtitle: 'بياناتك والمحتوى الذي تتابعه',
    items: [
      { title: 'الملف الشخصي', description: 'تعديل بيانات الملف والصورة ورقم الهاتف', path: '/profile' },
      { title: 'مفضلتي', description: 'الرجوع إلى الإعلانات التي حفظتها', path: '/favorites' },
      { title: 'المحفوظات المحلية للدفع', description: 'جهات الدفع وبطاقات الإنترنت على هذا الجهاز', path: '/saved-payments' },
      { title: 'الأشخاص الذين أتابعهم', description: 'إدارة الحسابات التي تتابعها', path: '/following' },
      { title: 'عمليات البحث المحفوظة', description: 'الوصول إلى عمليات البحث التي احتفظت بها', path: '/saved-searches' },
      { title: 'المتاجر التي أتابعها', description: 'اكتشف آخر تحديثات المتاجر التي تتابعها', path: '/followed-stores' },
      { title: 'النشاط', description: 'مراجعة نشاط الحساب', path: '/activity' },
    ],
  },
  {
    title: 'إدارة المتجر والخدمات',
    subtitle: 'الأدوات التجارية التي تحتاجها عند البيع',
    items: [
      { title: 'ملف البائع', description: 'إعداد ملفك كبائع — شرط أساسي لإنشاء متجر أو خدمة', path: '/seller-profile' },
      { title: 'متجري', description: 'إدارة بيانات المتجر والهوية التجارية', path: '/my-store' },
      { title: 'منتجاتي', description: 'إدارة المنتجات والأسعار والمخزون', path: '/my-products' },
      { title: 'خدماتي', description: 'إدارة الخدمات التي تعرضها', path: '/my-services' },
      { title: 'الطلبات التي نشرتها', description: 'متابعة طلباتك وعدد العروض الواردة عليها', path: '/my-requests' },
      { title: 'العروض التي قدمتها', description: 'متابعة عروضك على طلبات الآخرين', path: '/my-offers' },
      { title: 'المواعيد', description: 'متابعة مواعيد الخدمات والحجوزات', path: '/appointments' },
      { title: 'ملف مقدم الخدمة', description: 'إدارة بيانات نشاط الخدمات', path: '/service-provider-profile' },
      { title: 'إحصاءات المتجر', description: 'مراجعة الزيارات والمتابعين وأداء المنتجات', path: '/my-store-analytics' },
      { title: 'لوحة البائع', description: 'ملخص حالة المتجر والمهام والإحصاءات', path: '/seller-dashboard' },
    ],
  },
  {
    title: 'الإعدادات والخصوصية',
    subtitle: 'إدارة الجهاز والأمان والتفضيلات',
    items: [
      { title: 'الإعدادات', description: 'إدارة تفضيلات الحساب والإشعارات', path: '/settings' },
      { title: 'المستخدمون المحظورون', description: 'مراجعة قائمة الحظر', path: '/blocked-users' },
      { title: 'بلاغاتي', description: 'متابعة البلاغات التي أرسلتها', path: '/my-reports' },
      { title: 'التخزين والبيانات المحلية', description: 'إدارة المساحة والملفات المحفوظة على الجهاز', path: '/storage' },
    ],
  },
];

export default function AccountHubScreen() {
  const { user, accessToken } = useAuth();
  const [hasStore, setHasStore] = useState(false);
  const [hasProvider, setHasProvider] = useState(false);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [showAllDestinations, setShowAllDestinations] = useState(false);
  useEffect(() => {
    let active = true;
    if (!accessToken) { setHasStore(false); setHasProvider(false); return () => { active = false; }; }
    setProfilesLoading(true);
    void Promise.allSettled([fetchMyStore(accessToken), fetchMyServiceProvider(accessToken)]).then(([store, provider]) => {
      if (!active) return;
      setHasStore(store.status === 'fulfilled' && !!store.value);
      setHasProvider(provider.status === 'fulfilled' && !!provider.value);
    }).finally(() => { if (active) setProfilesLoading(false); });
    return () => { active = false; };
  }, [accessToken]);

  const open = (item: Destination) => {
    if (getRouteAccess(item.path) === 'authenticated' && !user) {
      router.push(`/login?redirect=${encodeURIComponent(item.path)}`);
      return;
    }
    router.push(item.path);
  };

  return (
    <PageShell title="حسابي">
      <SectionCard>
        <Text
          style={{
            textAlign: 'right',
            ...typography.display,
            fontSize: fontSizes[22],
            lineHeight: 30,
            color: colors.ink,
          }}
        >
          {user ? `أهلًا ${user.name || 'بك'}` : 'مرحبًا بك في MarketPlat'}
        </Text>
        <Text style={{ textAlign: 'right', ...typography.body, color: colors.muted }}>
          {user
            ? 'ابدأ بالرسائل والطلبات والمبيعات، وستجد أدوات الإدارة والإعدادات في مجموعات واضحة أدناه.'
            : 'يمكنك استكشاف السوق دون تسجيل الدخول. سجّل الدخول للوصول إلى صفحات الحساب الخاصة.'}
        </Text>
        {!user ? (
          <PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')} />
        ) : null}
        {user?.needsProfileCompletion ? (
          <PrimaryButton label="أكمل ملفك الشخصي" variant="secondary" onPress={() => router.push('/complete-profile')} />
        ) : null}
      </SectionCard>

      <View style={{ gap: spacing.md }}>
        <SectionHeader title="الوصول السريع" subtitle="أهم وجهات الحساب التي تحتاجها يوميًا" />
        {groups.flatMap((group) => group.items).filter((item) => PRIORITY_PATHS.has(item.path)).map((item) => (
          <ListRow key={item.path} title={item.title} description={item.description} onPress={() => open(item)} />
        ))}
      </View>

      {showAllDestinations ? groups.map((group) => {
        const remainingItems = group.items.filter((item) => {
          if (PRIORITY_PATHS.has(item.path)) return false;
          if (group.title !== 'إدارة المتجر والخدمات') return true;
          if (!user) return false;
          if (item.path === '/seller-profile') return !hasStore;
          if (item.path === '/my-store' || item.path === '/my-products' || item.path === '/my-store-analytics' || item.path === '/seller-dashboard') return hasStore;
          if (item.path === '/service-provider-profile') return true;
          if (item.path === '/appointments') return hasProvider;
          if (item.path === '/my-services') return hasProvider || hasStore;
          return true;
        });
        if (!remainingItems.length) return null;
        return (
          <View key={group.title} style={{ gap: spacing.md }}>
            <SectionHeader title={group.title} subtitle={group.subtitle} />
            {remainingItems.map((item) => (
              <ListRow key={item.path} title={item.title} description={item.description} onPress={() => open(item)} />
            ))}
          </View>
        );
      }) : null}

      <PrimaryButton
        label={showAllDestinations ? 'إخفاء بقية الوجهات' : 'عرض بقية وجهات الحساب'}
        variant="secondary"
        onPress={() => setShowAllDestinations((value) => !value)}
      />

      {user && profilesLoading ? <Notice tone="muted">جارٍ التحقق من صلاحيات إدارة المتجر والخدمات…</Notice> : null}
      {!user ? (
        <Notice tone="muted">الصفحات الخاصة بالحساب تطلب تسجيل الدخول قبل فتحها.</Notice>
      ) : null}
    </PageShell>
  );
}
