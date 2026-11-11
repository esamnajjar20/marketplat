import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { router } from 'expo-router';
import { toAppHref } from '@/lib/typed-navigation';
import { StyleSheet, View } from 'react-native';
import { useEffect, useState, useMemo, useSyncExternalStore } from 'react';
import { fetchMyStore } from '@/features/commerce/commerce.api';
import { fetchMyServiceProvider } from '@/features/services/providers.api';
import { fetchMySellerProfile } from '@/features/account/seller.api';
import { fetchMyActiveStoreMemberships } from '@/features/commerce/store-management.api';
import { useAuth } from '@/features/auth/AuthContext';
import { getRouteAccess, resolveNavigationCapabilities, getNavigationCapabilitiesRevision, subscribeNavigationCapabilities, type NavigationCapabilities } from '@/lib/navigation-policy';
import {
  ListRow,
  Notice,
  PageShell,
  PrimaryButton,
  SectionCard,
  SectionHeader,
} from '@/components/ui';
import { AppIcon } from '@/components/Icons';
import { fontSizes, elevation, radius, sizes, spacing, typography, ux } from '@/theme/tokens';

type Destination = { title: string; description: string; path: string };
type DestinationGroup = { title: string; subtitle: string; items: Destination[] };

/** اختصارات سريعة — شبكة في أعلى الحساب */
const QUICK_ACTIONS: { title: string; path: string; icon: string }[] = [
  { title: 'الرسائل', path: '/messages', icon: 'messages' },
  { title: 'الإشعارات', path: '/notifications', icon: 'notification' },
  { title: 'إعلاناتي', path: '/my-ads', icon: 'ads' },
  { title: 'مفضلتي', path: '/favorites', icon: 'favorite' },
  { title: 'مبيعاتي', path: '/my-sales', icon: 'orders' },
  { title: 'طلباتي', path: '/orders', icon: 'orders' },
];

/** وجهات أساسية تظهر دائمًا دون طي */
const ESSENTIALS: Destination[] = [
  { title: 'الملف الشخصي', description: 'بياناتك وصورتك ورقم الهاتف', path: '/profile' },
  { title: 'الإعدادات', description: 'التفضيلات والإشعارات والأمان', path: '/settings' },
  { title: 'النشاط', description: 'مراجعة نشاط حسابك', path: '/activity' },
  { title: 'المتابَعون', description: 'الحسابات والمتاجر التي تتابعها', path: '/following' },
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
      { title: 'مخصّص لك', description: 'اكتشف محتوى مقترحًا وفق اهتماماتك', path: '/for-you' },
      { title: 'المحفوظات المحلية للدفع', description: 'جهات الدفع على هذا الجهاز', path: '/saved-payments' },
      { title: 'عمليات البحث المحفوظة', description: 'عمليات البحث التي احتفظت بها', path: '/saved-searches' },
      { title: 'المتاجر التي أتابعها', description: 'آخر تحديثات المتاجر المتابَعة', path: '/followed-stores' },
    ],
  },
  {
    title: 'إدارة المتجر والخدمات',
    subtitle: 'الأدوات التجارية عند البيع',
    items: [
      { title: 'ملف البائع', description: 'إنشاء ملف البائع أو تحديث بياناته', path: '/seller-profile' },
      { title: 'لوحة البائع', description: 'ملخص حالة نشاط البيع والمهام', path: '/seller-dashboard' },
      { title: 'متاجري', description: 'المتاجر التي تملكها أو تعمل ضمن فريقها', path: '/my-stores' },
      { title: 'متجري', description: 'إدارة بيانات المتجر المملوك لك', path: '/my-store' },
      { title: 'منتجاتي', description: 'إدارة المنتجات والأسعار والمخزون', path: '/my-products' },
      { title: 'خدماتي', description: 'إدارة الخدمات التي تعرضها', path: '/my-services' },
      { title: 'الطلبات التي نشرتها', description: 'متابعة طلباتك والعروض الواردة', path: '/my-requests' },
      { title: 'العروض التي قدمتها', description: 'متابعة عروضك على طلبات الآخرين', path: '/my-offers' },
      { title: 'المواعيد', description: 'مواعيد الخدمات والحجوزات', path: '/appointments' },
      { title: 'ملف مقدم الخدمة', description: 'إدارة بيانات نشاط الخدمات', path: '/service-provider-profile' },
      { title: 'إحصاءات المتجر', description: 'الزيارات والمتابعون وأداء المنتجات', path: '/my-store-analytics' },
    ],
  },
  {
    title: 'الخصوصية والأمان',
    subtitle: 'إدارة الجهاز والحظر والبلاغات',
    items: [
      { title: 'المستخدمون المحظورون', description: 'مراجعة قائمة الحظر', path: '/blocked-users' },
      { title: 'بلاغاتي', description: 'متابعة البلاغات التي أرسلتها', path: '/my-reports' },
      { title: 'التخزين والبيانات المحلية', description: 'المساحة والملفات المحفوظة على الجهاز', path: '/storage' },
    ],
  },
];

function canShowStoreItem(
  item: Destination,
  user: unknown,
  capabilities: NavigationCapabilities,
  hasOwnedStore: boolean,
  canManageProducts: boolean,
): boolean {
  if (!user) return false;
  switch (item.path) {
    case '/seller-profile':
    case '/service-provider-profile':
      // Setup/edit routes remain available to authenticated users.
      return true;
    case '/seller-dashboard':
      return capabilities.sellerWorkspace;
    case '/my-stores':
      return capabilities.storeMembership;
    case '/my-store':
    case '/my-store-analytics':
      return hasOwnedStore;
    case '/my-products':
      return canManageProducts;
    case '/appointments':
    case '/my-services':
      return capabilities.serviceProvider;
    default:
      return true;
  }
}

export default function AccountScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);

  const { user, accessToken } = useAuth();
  const userId = user?.id ?? null;
  const capabilityRevision = useSyncExternalStore(
    subscribeNavigationCapabilities,
    getNavigationCapabilitiesRevision,
    getNavigationCapabilitiesRevision,
  );
  const [hasOwnedStore, setHasOwnedStore] = useState(false);
  const [canManageProducts, setCanManageProducts] = useState(false);
  const [capabilities, setCapabilities] = useState<NavigationCapabilities>({
    sellerWorkspace: false,
    storeMembership: false,
    serviceProvider: false,
  });
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesVerificationFailed, setProfilesVerificationFailed] = useState(false);
  const [verificationRetry, setVerificationRetry] = useState(0);
  const [showAllDestinations, setShowAllDestinations] = useState(false);

  useEffect(() => {
    let active = true;
    if (!accessToken || !userId || !showAllDestinations) {
      if (!accessToken || !userId) {
        setHasOwnedStore(false);
        setCanManageProducts(false);
        setCapabilities({ sellerWorkspace: false, storeMembership: false, serviceProvider: false });
      }
      setProfilesLoading(false);
      if (!accessToken || !userId) setProfilesVerificationFailed(false);
      return () => { active = false; };
    }

    setProfilesLoading(true);
    setProfilesVerificationFailed(false);
    void Promise.allSettled([
      fetchMyStore(accessToken),
      fetchMySellerProfile(accessToken, userId),
      fetchMyActiveStoreMemberships(accessToken),
      fetchMyServiceProvider(accessToken),
    ]).then(([storeResult, sellerResult, membershipsResult, providerResult]) => {
      if (!active) return;
      const ownedStore = storeResult.status === 'fulfilled' ? storeResult.value : null;
      const sellerProfile = sellerResult.status === 'fulfilled' ? sellerResult.value : null;
      const memberships = membershipsResult.status === 'fulfilled' ? membershipsResult.value : [];
      const providerProfile = providerResult.status === 'fulfilled' ? providerResult.value : null;
      setProfilesVerificationFailed([storeResult, sellerResult, membershipsResult, providerResult].some((result) => result.status === 'rejected'));
      setHasOwnedStore(Boolean(ownedStore));
      setCanManageProducts(Boolean(ownedStore) || memberships.some((membership) =>
        membership.role === 'MANAGER' || membership.role === 'EDITOR',
      ));
      setCapabilities(resolveNavigationCapabilities({
        hasSellerProfile: Boolean(sellerProfile),
        activeStoreMembershipCount: memberships.length,
        hasServiceProviderProfile: Boolean(providerProfile),
      }));
    }).finally(() => {
      if (active) setProfilesLoading(false);
    });
    return () => { active = false; };
  }, [accessToken, capabilityRevision, showAllDestinations, userId, verificationRetry]);

  const open = (path: string) => {
    if (getRouteAccess(path) === 'authenticated' && !user) {
      router.push(toAppHref(`/login?redirect=${encodeURIComponent(path)}`));
      return;
    }
    router.push(toAppHref(path));
  };

  const displayName =
    (user as { displayName?: string; name?: string } | null)?.displayName ||
    (user as { name?: string } | null)?.name ||
    user?.email?.split('@')[0] ||
    'زائر';

  const needsProfile = Boolean((user as { needsProfileCompletion?: boolean } | null)?.needsProfileCompletion);

  return (
    <PageShell title="حسابي">
      {/* بطاقة الملف */}
      <SectionCard
        onPress={user ? () => open('/profile') : undefined}
        style={styles.profileCard}
      >
        <View style={styles.profileAccent} />
        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName} numberOfLines={1}>
              {user ? displayName : 'مرحبًا بك في سوق غزة'}
            </Text>
            <Text style={styles.profileSub} numberOfLines={1}>
              {user
                ? user.email || 'اضغط لتعديل ملفك الشخصي'
                : 'سجّل الدخول للوصول إلى حسابك'}
            </Text>
            {user ? (
              <Text style={styles.profileHint}>عرض الملف ←</Text>
            ) : null}
          </View>
        </View>
        {!user ? (
          <PrimaryButton label="تسجيل الدخول" onPress={() => router.push('/login')} />
        ) : null}
        {needsProfile ? (
          <PrimaryButton
            label="أكمل ملفك الشخصي"
            variant="secondary"
            onPress={() => router.push('/complete-profile')}
          />
        ) : null}
      </SectionCard>

      {/* اختصارات سريعة */}
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
                  <AppIcon name={action.icon as never} size={22} color={colors.brandOnSoft} />
                </View>
                <Text style={styles.quickLabel} numberOfLines={1}>
                  {action.title}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {/* أساسيات دائمًا ظاهرة */}
      {user ? (
        <View style={styles.group}>
          <SectionHeader title="الأساسيات" subtitle="ملفك وإعداداتك" />
          <View style={styles.listCard}>
            {ESSENTIALS.map((item, index) => (
              <View key={item.path}>
                <ListRow
                  title={item.title}
                  description={item.description}
                  onPress={() => open(item.path)}
                />
                {index < ESSENTIALS.length - 1 ? <View style={styles.rowDivider} /> : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* بقية الوجهات — مطوية */}
      {showAllDestinations
        ? groups.map((group) => {
            const remainingItems = group.items.filter((item) =>
              canShowStoreItem(item, user, capabilities, hasOwnedStore, canManageProducts),
            );
            if (!remainingItems.length) return null;
            return (
              <View key={group.title} style={styles.group}>
                <SectionHeader title={group.title} subtitle={group.subtitle} />
                <View style={styles.listCard}>
                  {remainingItems.map((item, index) => (
                    <View key={item.path}>
                      <ListRow
                        title={item.title}
                        description={item.description}
                        onPress={() => open(item.path)}
                      />
                      {index < remainingItems.length - 1 ? (
                        <View style={styles.rowDivider} />
                      ) : null}
                    </View>
                  ))}
                </View>
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
        <Notice tone="muted">جارٍ التحقق من صلاحيات البائع ومقدم الخدمة…</Notice>
      ) : null}
      {user && showAllDestinations && profilesVerificationFailed && !profilesLoading ? (
        <View style={styles.group}>
          <Notice tone="warning">تعذر التحقق من بعض صلاحيات المتجر أو الخدمات. أُخفيت الوجهات غير المؤكدة لحماية الحساب.</Notice>
          <PrimaryButton label="إعادة التحقق من الصلاحيات" variant="secondary" onPress={() => setVerificationRetry((value) => value + 1)} />
        </View>
      ) : null}
      {!user ? (
        <Notice tone="muted">الصفحات الخاصة بالحساب تطلب تسجيل الدخول قبل فتحها.</Notice>
      ) : null}
    </PageShell>
  );
}

const createThemeStyles = (colors: ColorPalette) => StyleSheet.create({
  profileCard: {
    gap: spacing.md,
    overflow: 'hidden',
    paddingTop: spacing.lg + 4,
  },
  profileAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: colors.brand,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: sizes.avatarLg ?? 64,
    height: sizes.avatarLg ?? 64,
    borderRadius: (sizes.avatarLg ?? 64) / 2,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.brandSoftActive ?? colors.border,
  },
  avatarText: {
    ...typography.title,
    color: colors.brandOnSoft,
    fontSize: fontSizes[24],
  },
  profileInfo: {
    flex: 1,
    alignItems: 'flex-start',
    gap: spacing.xs,
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
  profileHint: {
    ...typography.captionStrong,
    color: colors.brand,
    textAlign: 'right',
    marginTop: spacing.xxs,
  },
  quickSection: {
    gap: spacing.md,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickItem: {
    width: '31%',
    minWidth: 100,
    flexGrow: 1,
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.card ?? radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...elevation.sm,
  },
  quickIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.button,
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
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card ?? radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    ...elevation.sm,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  pressed: {
    opacity: ux.pressedOpacity,
  },
});
