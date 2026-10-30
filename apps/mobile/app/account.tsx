import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { useAuth } from '@/features/auth/AuthContext';
import {
  ListRow,
  Notice,
  PageShell,
  PrimaryButton,
  SectionCard,
  SectionHeader,
} from '@/components/MobileUI';
import { colors, spacing, typography } from '@/theme/tokens';

type Destination = { title: string; description: string; path: string; requiresAuth?: boolean };
type DestinationGroup = { title: string; subtitle: string; items: Destination[] };

const groups: DestinationGroup[] = [
  {
    title: 'المهم الآن',
    subtitle: 'أقصر طريق إلى المحادثات والطلبات والبيع',
    items: [
      { title: 'الرسائل', description: 'تابع محادثات المشترين والبائعين', path: '/messages', requiresAuth: true },
      { title: 'الإشعارات', description: 'راجع التحديثات والتنبيهات الجديدة', path: '/notifications', requiresAuth: true },
      { title: 'إعلاناتي', description: 'إدارة الإعلانات المنشورة والمسودات', path: '/my-ads', requiresAuth: true },
    ],
  },
  {
    title: 'المبيعات والعملاء',
    subtitle: 'البيع والتحصيل ومتابعة الطلبات',
    items: [
      { title: 'مبيعاتي', description: 'تابع المبيعات وحالاتها والإجراءات المطلوبة', path: '/my-sales', requiresAuth: true },
      { title: 'الطلبات والشراء', description: 'تابع طلباتك والعمليات الشرائية', path: '/orders', requiresAuth: true },
      { title: 'العملاء', description: 'إدارة بيانات العملاء وسجل تعاملاتهم', path: '/customers', requiresAuth: true },
      { title: 'الديون والمبالغ المستحقة', description: 'متابعة المبالغ المفتوحة والتحصيل', path: '/debts', requiresAuth: true },
      { title: 'الأقساط', description: 'متابعة جداول الأقساط والتحصيلات', path: '/installments', requiresAuth: true },
    ],
  },
  {
    title: 'ملفي ونشاطي',
    subtitle: 'بياناتك والمحتوى الذي تتابعه',
    items: [
      { title: 'الملف الشخصي', description: 'تعديل بيانات الملف والصورة ورقم الهاتف', path: '/profile', requiresAuth: true },
      { title: 'مفضلتي', description: 'الرجوع إلى الإعلانات التي حفظتها', path: '/favorites' },
      { title: 'المحفوظات المحلية للدفع', description: 'جهات الدفع وبطاقات الإنترنت على هذا الجهاز', path: '/saved-payments' },
      { title: 'الأشخاص الذين أتابعهم', description: 'إدارة الحسابات التي تتابعها', path: '/following', requiresAuth: true },
      { title: 'عمليات البحث المحفوظة', description: 'الوصول إلى عمليات البحث التي احتفظت بها', path: '/saved-searches', requiresAuth: true },
      { title: 'المتاجر التي أتابعها', description: 'اكتشف آخر تحديثات المتاجر التي تتابعها', path: '/followed-stores', requiresAuth: true },
      { title: 'النشاط', description: 'مراجعة نشاط الحساب', path: '/activity', requiresAuth: true },
    ],
  },
  {
    title: 'إدارة المتجر والخدمات',
    subtitle: 'الأدوات التجارية التي تحتاجها عند البيع',
    items: [
      { title: 'ملف البائع', description: 'إعداد ملفك كبائع — شرط أساسي لإنشاء متجر أو خدمة', path: '/seller-profile', requiresAuth: true },
      { title: 'متجري', description: 'إدارة بيانات المتجر والهوية التجارية', path: '/my-store', requiresAuth: true },
      { title: 'منتجاتي', description: 'إدارة المنتجات والأسعار والمخزون', path: '/my-products', requiresAuth: true },
      { title: 'خدماتي', description: 'إدارة الخدمات التي تعرضها', path: '/my-services', requiresAuth: true },
      { title: 'طلباتي وعروضي', description: 'متابعة الطلبات والعروض التي قدمتها', path: '/my-requests', requiresAuth: true },
      { title: 'عروضي', description: 'العروض التي قدّمتها على الطلبات المفتوحة', path: '/my-offers', requiresAuth: true },
      { title: 'المواعيد', description: 'متابعة مواعيد الخدمات والحجوزات', path: '/appointments', requiresAuth: true },
      { title: 'ملف مقدم الخدمة', description: 'إدارة بيانات نشاط الخدمات', path: '/service-provider-profile', requiresAuth: true },
      { title: 'إحصاءات المتجر', description: 'مراجعة الزيارات والمتابعين وأداء المنتجات', path: '/my-store-analytics', requiresAuth: true },
      { title: 'لوحة البائع', description: 'ملخص حالة المتجر والمهام والإحصاءات', path: '/seller-dashboard', requiresAuth: true },
    ],
  },
  {
    title: 'الإعدادات والخصوصية',
    subtitle: 'إدارة الجهاز والأمان والتفضيلات',
    items: [
      { title: 'الإعدادات', description: 'إدارة تفضيلات الحساب والإشعارات', path: '/settings', requiresAuth: true },
      { title: 'العمليات دون اتصال', description: 'مراجعة العمليات التي تنتظر المزامنة', path: '/offline-queue', requiresAuth: true },
      { title: 'التخزين والبيانات المحلية', description: 'إدارة البيانات المحفوظة على الجهاز', path: '/storage', requiresAuth: true },
      { title: 'المستخدمون المحظورون', description: 'مراجعة قائمة الحظر', path: '/blocked-users', requiresAuth: true },
      { title: 'بلاغاتي', description: 'متابعة البلاغات التي أرسلتها', path: '/my-reports', requiresAuth: true },
    ],
  },
];

export default function AccountHubScreen() {
  const { user } = useAuth();

  const open = (item: Destination) => {
    if (item.requiresAuth && !user) {
      router.push('/login');
      return;
    }
    router.push(item.path as never);
  };

  return (
    <PageShell title="حسابي">
      <SectionCard>
        <Text
          style={{
            textAlign: 'right',
            ...typography.display,
            fontSize: 22,
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

      {groups.map((group) => (
        <View key={group.title} style={{ gap: spacing.md }}>
          <SectionHeader title={group.title} subtitle={group.subtitle} />
          {group.items.filter((item) => item.path !== '/complete-profile').map((item) => (
            <ListRow
              key={item.path}
              title={item.title}
              description={item.description}
              onPress={() => open(item)}
            />
          ))}
        </View>
      ))}

      {!user ? (
        <Notice tone="muted">الصفحات الخاصة بالحساب تطلب تسجيل الدخول قبل فتحها.</Notice>
      ) : null}
    </PageShell>
  );
}
