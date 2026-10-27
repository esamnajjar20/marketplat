import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '@/features/auth/AuthContext';
import { Notice, PageShell, SectionCard } from '@/components/MobileUI';
import { colors } from '@/theme/tokens';

type Destination = { title: string; description: string; path: string; requiresAuth?: boolean };
type DestinationGroup = { title: string; items: Destination[] };

const groups: DestinationGroup[] = [
  { title: 'ملفي ونشاطي', items: [
    { title: 'الملف الشخصي', description: 'تعديل الاسم والصورة ورقم الهاتف وكلمة المرور', path: '/profile', requiresAuth: true },
    { title: 'إعلاناتي', description: 'إدارة الإعلانات المنشورة والمسودات', path: '/my-ads', requiresAuth: true },
    { title: 'مبيعاتي', description: 'متابعة عمليات البيع وحالاتها', path: '/my-sales', requiresAuth: true },
    { title: 'مفضلتي', description: 'الإعلانات التي حفظتها للرجوع إليها', path: '/favorites' },
    { title: 'المحفوظات والبحث', description: 'عمليات البحث المحفوظة والمتابعة', path: '/saved-searches', requiresAuth: true },
  ] },
  { title: 'إدارة المتجر والخدمات', items: [
    { title: 'متجري', description: 'إدارة بيانات المتجر والمنتجات', path: '/my-store', requiresAuth: true },
    { title: 'منتجاتي', description: 'إدارة المنتجات التي أضفتها', path: '/my-products', requiresAuth: true },
    { title: 'خدماتي', description: 'إدارة الخدمات المعروضة', path: '/my-services', requiresAuth: true },
    { title: 'طلباتي وعروضي', description: 'متابعة الطلبات والعروض المقدمة', path: '/my-requests', requiresAuth: true },
    { title: 'الطلبات والشراء', description: 'عرض الطلبات والعمليات الشرائية', path: '/orders', requiresAuth: true },
  ] },
  { title: 'التواصل والإعدادات', items: [
    { title: 'الرسائل', description: 'فتح المحادثات مع البائعين والمشترين', path: '/messages', requiresAuth: true },
    { title: 'الإشعارات', description: 'آخر التنبيهات والتحديثات', path: '/notifications', requiresAuth: true },
    { title: 'المتاجر التي أتابعها', description: 'الوصول إلى المتاجر التي تتابعها', path: '/followed-stores', requiresAuth: true },
    { title: 'النشاط', description: 'مراجعة نشاط الحساب', path: '/activity', requiresAuth: true },
    { title: 'الإعدادات', description: 'تفضيلات التطبيق والحساب', path: '/settings', requiresAuth: true },
    { title: 'العمليات غير المتصلة', description: 'مراجعة العمليات التي تنتظر المزامنة', path: '/offline-queue', requiresAuth: true },
  ] },
];

export default function AccountHubScreen() {
  const { user } = useAuth();
  const open = (item: Destination) => {
    if (item.requiresAuth && !user) { router.push('/login'); return; }
    router.push(item.path as never);
  };

  return (
    <PageShell title="حسابي">
      <SectionCard>
        <Text style={{ textAlign: 'right', fontSize: 21, fontWeight: '900', color: colors.ink }}>{user ? 'إدارة حسابك' : 'مرحبًا بك في MarketPlat'}</Text>
        <Text style={{ textAlign: 'right', color: colors.muted, lineHeight: 22 }}>{user ? 'وصل إلى ملفك ومبيعاتك ومتجرك ورسائلك من مكان واحد.' : 'يمكنك استكشاف السوق دون تسجيل الدخول. سجّل الدخول لاستخدام صفحات الحساب الخاصة.'}</Text>
        {!user ? <Pressable accessibilityRole="button" onPress={() => router.push('/login')} style={{ minHeight: 46, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '900' }}>تسجيل الدخول</Text></Pressable> : null}
      </SectionCard>
      {groups.map((group) => (
        <View key={group.title} style={{ gap: 10 }}>
          <Text style={{ textAlign: 'right', fontSize: 17, fontWeight: '900', color: colors.ink }}>{group.title}</Text>
          {group.items.map((item) => (
            <Pressable key={item.path} accessibilityRole="button" onPress={() => open(item)}>
              <SectionCard>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.brand, fontSize: 19, fontWeight: '900' }}>›</Text></View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ textAlign: 'right', color: colors.ink, fontSize: 15, fontWeight: '900' }}>{item.title}</Text>
                    <Text style={{ textAlign: 'right', color: colors.muted, lineHeight: 20, fontSize: 12 }}>{item.description}</Text>
                  </View>
                </View>
              </SectionCard>
            </Pressable>
          ))}
        </View>
      ))}
      {!user ? <Notice tone="muted">الصفحات الخاصة بالحساب تطلب تسجيل الدخول قبل فتحها.</Notice> : null}
    </PageShell>
  );
}
