import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { router } from 'expo-router';
import { toAppHref } from '@/lib/typed-navigation';
import { StyleSheet, View } from 'react-native';
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
import { AppIcon } from '@/components/Icons';
import { fontSizes, colors, elevation, radius, sizes, spacing, typography, ux } from '@/theme/tokens';

type Destination = { title: string; description: string; path: string };
type DestinationGroup = { title: string; subtitle: string; items: Destination[] };

/** اختصارات سريعة — شبكة أيقونات في أعلى الحساب */
const QUICK_ACTIONS: { title: string; path: string; icon: string }[] = [
  { title: 'الرسائل', path: '/messages', icon: 'messages' },
  { title: 'الإشعارات', path: '/notifications', icon: 'notification' },
  { title: 'إعلاناتي', path: '/my-ads', icon: 'ads' },
  { title: 'مفضلتي', path: '/favorites', icon: 'favorite' },
  { title: 'مبيعاتي', path: '/my-sales', icon: 'orders' },
  { title: 'طلباتي', path: '/orders', icon: 'orders' },
];

const groups: DestinationGroup[] = [
  {
    title: 'المبيعات والعملاء',
    subtitle: 'البيع والتحصيل ومتابعة الطلبات',
    items: [
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
      { title: 'مخصّص لك', description: 'اكتشف محتوى مقترحًا وفق اهتماماتك', path: '/for-you' },
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
    if (!accessToken) {
      setHasStore(false);
      setHasProvider(false);
      return () => {
        active = false;
      };
    }
    setProfilesLoading(true);
    void Promise.allSettled([fetchMyStore(accessToken), fetchMyServiceProvider(accessToken)])
      .then(([store, provider]) => {
        if (!active) return;
        setHasStore(store.status === 'fulfilled' && !!store.value);
        setHasProvider(provider.status === 'fulfilled' && !!provider.value);
      })
      .finally(() => {
        if (active) setProfilesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken]);

  const open = (path: string) => {
    if (getRouteAccess(path) === 'authenticated' && !user) {
      router.push(toAppHref(`/login?redirect=${encodeURIComponent(path)}`));
      return;
    }
    router.push(toAppHref(path));
  };

  const displayName =
    (user as any)?.displayName || (user as any)?.name || user?.email?.split('@')[0] || 'زائر';

  return (
    <PageShell title="حسابي">
      {/* بطاقة الملف الشخصي */}
      <SectionCard
        onPress={user ? () => open('/profile') : undefined}
        style={styles.profileCard}
      >
        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName} numberOfLines={1}>
              {user ? displayName : 'مرحباً بك في سوق غزة'}
            </Text>
            <Text style={styles.profileSub} numberOfLines={1}>
              {user
                ? user.email || 'اضغط لتعديل ملفك الشخصي'
                : 'سجّل الدخول للوصول إلى حسابك'}
            </Text>
          </View>
        </View>
        {!user ? (
          <PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')} />
        ) : null}
        {(user as any)?.needsProfileCompletion ? (
          <PrimaryButton
            label="أكمل ملفك الشخصي"
            variant="secondary"
            onPress={() => router.push('/complete-profile')}
          />
        ) : null}
      </SectionCard>

      {/* شبكة الاختصارات السريعة */}
      {user ? (
        <View style={styles.quickSection}>
          <SectionHeader title="الوصول السريع" />
          <View style={styles.quickGrid}>
            {QUICK_ACTIONS.map((action) => (
              <Pressable
                key={action.path}
                accessibilityRole="button"
                accessibilityLabel={action.title}
                onPress={() => open(action.path)}
                style={({ pressed }) => [styles.quickItem, pressed && styles.pressed]}
              >
                <View style={styles.quickIcon}>
                  <AppIcon name={action.icon as any} size={22} color={colors.brandOnSoft} />
                </View>
                <Text style={styles.quickLabel} numberOfLines={1}>
                  {action.title}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {/* المجموعات التفصيلية */}
      {showAllDestinations
        ? groups.map((group) => {
            const remainingItems = group.items.filter((item) => {
              if (group.title !== 'إدارة المتجر والخدمات') return true;
              if (!user) return false;
              if (item.path === '/seller-profile') return !hasStore;
              if (
                item.path === '/my-store' ||
                item.path === '/my-products' ||
                item.path === '/my-store-analytics' ||
                item.path === '/seller-dashboard'
              )
                return hasStore;
              if (item.path === '/service-provider-profile') return true;
              if (item.path === '/appointments') return hasProvider;
              if (item.path === '/my-services') return hasProvider || hasStore;
              return true;
            });
            if (!remainingItems.length) return null;
            return (
              <View key={group.title} style={styles.group}>
                <SectionHeader title={group.title} subtitle={group.subtitle} />
                {remainingItems.map((item) => (
                  <ListRow
                    key={item.path}
                    title={item.title}
                    description={item.description}
                    onPress={() => open(item.path)}
                  />
                ))}
              </View>
            );
          })
        : null}

      <PrimaryButton
        label={showAllDestinations ? 'إخفاء بقية الوجهات' : 'عرض كل وجهات الحساب'}
        variant="secondary"
        onPress={() => setShowAllDestinations((value) => !value)}
      />

      {user && profilesLoading ? (
        <Notice tone="muted">جارٍ التحقق من صلاحيات إدارة المتجر والخدمات…</Notice>
      ) : null}
      {!user ? (
        <Notice tone="muted">الصفحات الخاصة بالحساب تطلب تسجيل الدخول قبل فتحها.</Notice>
      ) : null}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    gap: spacing.md,
  },
  profileRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: sizes.avatarLg,
    height: sizes.avatarLg,
    borderRadius: sizes.avatarLg / 2,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.title,
    color: colors.brandOnSoft,
    fontSize: fontSizes[22],
  },
  profileInfo: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 2,
  },
  profileName: {
    ...typography.subtitle,
    color: colors.ink,
    textAlign: 'right',
    width: '100%',
  },
  profileSub: {
    ...typography.caption,
    color: colors.muted,
    textAlign: 'right',
    width: '100%',
  },
  quickSection: {
    gap: spacing.md,
  },
  quickGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickItem: {
    width: '31%',
    minWidth: 96,
    flexGrow: 1,
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...elevation.sm,
  },
  quickIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    ...typography.captionStrong,
    color: colors.ink,
    textAlign: 'center',
  },
  group: {
    gap: spacing.md,
  },
  pressed: {
    opacity: ux.pressedOpacity,
  },
});
