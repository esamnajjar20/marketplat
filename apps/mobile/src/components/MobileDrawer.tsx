import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { router, usePathname } from 'expo-router';
import { Animated, BackHandler, Image, PanResponder, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { AppIcon } from '@/components/Icons';
import { useAuth } from '@/features/auth/AuthContext';
import { fetchMySellerProfile } from '@/features/account/seller.api';
import { fetchMyActiveStoreMemberships } from '@/features/commerce/store-management.api';
import { fetchMyServiceProvider } from '@/features/services/providers.api';
import { radius, spacing, typography, type ColorPalette, fontWeights, sizes, fontSizes } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { DRAWER_ITEMS, getVisibleDrawerItems, getRouteAccess, getNavigationCapabilitiesRevision, subscribeNavigationCapabilities, resolveNavigationCapabilities, type DrawerSection, type NavigationCapabilities } from '@/lib/navigation-policy';
import { toAppHref } from '@/lib/typed-navigation';

type MobileDrawerContextValue = {
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
};

const MobileDrawerContext = createContext<MobileDrawerContextValue | null>(null);

/**
 * Drawer خفيف متوافق مع Expo Router؛ لا يحتاج إضافة مكتبة تنقل جديدة.
 * يُركّب مرة واحدة داخل RootChrome ليبقى فوق جميع الشاشات.
 */
export function MobileDrawerProvider({ children }: { children: ReactNode }) {
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setDrawerOpen((current) => !current), []);
  const value = useMemo(
    () => ({ isDrawerOpen, openDrawer, closeDrawer, toggleDrawer }),
    [isDrawerOpen, openDrawer, closeDrawer, toggleDrawer],
  );

  return (
    <MobileDrawerContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
        <MobileDrawerOverlay open={isDrawerOpen} onClose={closeDrawer} openDrawer={openDrawer} />
      </View>
    </MobileDrawerContext.Provider>
  );
}

export function useMobileDrawer(): MobileDrawerContextValue {
  const context = useContext(MobileDrawerContext);
  if (!context) {
    throw new Error('useMobileDrawer must be used inside MobileDrawerProvider');
  }
  return context;
}

/** زر موحّد بحجم لمس لا يقل عن 44×44 نقطـة. */
export function DrawerMenuButton() {
  const { toggleDrawer, isDrawerOpen } = useMobileDrawer();
  const { colors: palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isDrawerOpen ? 'إغلاق القائمة الجانبية' : 'فتح القائمة الجانبية'}
      accessibilityState={{ expanded: isDrawerOpen }}
      onPress={toggleDrawer}
      hitSlop={4}
      style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}
    >
      <AppIcon name={isDrawerOpen ? 'close' : 'menu'} size={22} color={palette.brandDark} />
    </Pressable>
  );
}

type DrawerItem = (typeof DRAWER_ITEMS)[number];

function isItemActive(pathname: string, path: string): boolean {
  if (path === '/') return pathname === '/';
  return pathname === path || pathname.startsWith(`${path}/`);
}

function MobileDrawerOverlay({
  open,
  onClose,
  openDrawer,
}: {
  open: boolean;
  onClose: () => void;
  openDrawer: () => void;
}) {
  const { user, accessToken, logout, isBusy, isRestoring } = useAuth();
  const { colors: palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const pathname = usePathname();
  const { width: screenWidth } = useWindowDimensions();
  const [capabilityState, setCapabilityState] = useState<{
    userId: string | null;
    status: 'idle' | 'loading' | 'ready' | 'partial' | 'unavailable';
    capabilities: NavigationCapabilities;
    fetchedAt: number;
  }>({
    userId: null,
    status: 'idle',
    capabilities: { sellerWorkspace: false, storeMembership: false, serviceProvider: false },
    fetchedAt: 0,
  });
  const [capabilityReloadKey, setCapabilityReloadKey] = useState(0);
  const capabilityRevision = useSyncExternalStore(
    subscribeNavigationCapabilities,
    getNavigationCapabilitiesRevision,
    getNavigationCapabilitiesRevision,
  );
  const lastCapabilityRevisionRef = useRef(capabilityRevision);
  const capabilityCacheRef = useRef<typeof capabilityState | null>(null);
  const lastReloadKeyRef = useRef(0);

  useEffect(() => {
    if (!user) {
      capabilityCacheRef.current = null;
      setCapabilityState({
        userId: null,
        status: 'idle',
        capabilities: { sellerWorkspace: false, storeMembership: false, serviceProvider: false },
        fetchedAt: 0,
      });
      return;
    }
    if (!open || isRestoring || !accessToken) return;

    const revisionChanged = capabilityRevision !== lastCapabilityRevisionRef.current;
    if (revisionChanged) {
      lastCapabilityRevisionRef.current = capabilityRevision;
      capabilityCacheRef.current = null;
    }
    const force = revisionChanged || capabilityReloadKey !== lastReloadKeyRef.current;
    const cached = capabilityCacheRef.current;
    if (!force && cached?.userId === user.id && Date.now() - cached.fetchedAt < 60_000) {
      setCapabilityState(cached);
      return;
    }
    lastReloadKeyRef.current = capabilityReloadKey;
    let active = true;
    setCapabilityState((current) => ({
      userId: user.id,
      status: 'loading',
      capabilities: current.userId === user.id ? current.capabilities : { sellerWorkspace: false, storeMembership: false, serviceProvider: false },
      fetchedAt: current.fetchedAt,
    }));

    void Promise.allSettled([
      fetchMySellerProfile(accessToken, user.id),
      fetchMyActiveStoreMemberships(accessToken),
      fetchMyServiceProvider(accessToken),
    ]).then(([sellerResult, membershipsResult, providerResult]) => {
      if (!active) return;
      const sellerProfile = sellerResult.status === 'fulfilled' ? sellerResult.value : null;
      const memberships = membershipsResult.status === 'fulfilled' ? membershipsResult.value : [];
      const providerProfile = providerResult.status === 'fulfilled' ? providerResult.value : null;
      const failedCount = [sellerResult, membershipsResult, providerResult].filter((result) => result.status === 'rejected').length;
      const nextState = {
        userId: user.id,
        status: failedCount === 3 ? 'unavailable' as const : failedCount > 0 ? 'partial' as const : 'ready' as const,
        capabilities: resolveNavigationCapabilities({
          hasSellerProfile: Boolean(sellerProfile),
          activeStoreMembershipCount: memberships.length,
          hasServiceProviderProfile: Boolean(providerProfile),
        }),
        fetchedAt: Date.now(),
      };
      capabilityCacheRef.current = nextState;
      setCapabilityState(nextState);
    }).catch(() => {
      if (!active) return;
      const nextState = {
        userId: user.id,
        status: 'unavailable' as const,
        capabilities: { sellerWorkspace: false, storeMembership: false, serviceProvider: false },
        fetchedAt: Date.now(),
      };
      capabilityCacheRef.current = nextState;
      setCapabilityState(nextState);
    });

    return () => { active = false; };
  }, [accessToken, capabilityReloadKey, capabilityRevision, isRestoring, open, user]);
  const drawerWidth = Math.min(screenWidth * 0.86, 360);
  // Anchor to the logical start edge: right in RTL, left in LTR.
  const isRTL = true;
  const progress = useRef(new Animated.Value(0)).current;
  // +24px عند الإغلاق حتى لا يظهر ظل أو حدّ أو بكسل من اللوحة على حافة الشاشة
  const closedOffset = drawerWidth + 24;
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [isRTL ? closedOffset : -closedOffset, 0],
  });
  const drawerOpacity = progress.interpolate({
    inputRange: [0, 0.05, 1],
    outputRange: [0, 1, 1],
  });
  const shadeOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.46] });

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: open ? 230 : 180,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [open, progress]);

  useEffect(() => {
    if (!open) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose, open]);

  const edgePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          !open &&
          Math.abs(gesture.dx) > 10 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) &&
          (isRTL ? gesture.dx < 0 : gesture.dx > 0),
        onPanResponderRelease: (_event, gesture) => {
          if (Math.abs(gesture.dx) >= 44) openDrawer();
        },
        onPanResponderTerminationRequest: () => true,
      }),
    [isRTL, open, openDrawer],
  );

  const drawerPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          open &&
          Math.abs(gesture.dx) > 10 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) &&
          (isRTL ? gesture.dx > 0 : gesture.dx < 0),
        onPanResponderMove: (_event, gesture) => {
          const nextProgress = Math.max(0, Math.min(1, 1 - Math.abs(gesture.dx) / drawerWidth));
          progress.setValue(nextProgress);
        },
        onPanResponderRelease: (_event, gesture) => {
          const shouldClose =
            Math.abs(gesture.dx) > drawerWidth * 0.28 ||
            (isRTL ? gesture.vx > 0.75 : gesture.vx < -0.75);
          if (shouldClose) onClose();
          else Animated.spring(progress, { toValue: 1, useNativeDriver: true, damping: 24, stiffness: 260 }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(progress, { toValue: open ? 1 : 0, useNativeDriver: true, damping: 24, stiffness: 260 }).start();
        },
        onPanResponderTerminationRequest: () => true,
      }),
    [drawerWidth, isRTL, onClose, open, progress],
  );

  const navigateTo = useCallback(
    (item: DrawerItem) => {
      onClose();
      const requiresAuth = getRouteAccess(item.path) === 'authenticated';
      const target = requiresAuth && !user
        ? toAppHref(`/login?redirect=${encodeURIComponent(item.path)}`)
        : toAppHref(item.path);
      router.navigate(target);
    },
    [onClose, user],
  );

  const handleAuthAction = useCallback(() => {
    onClose();
    if (user) {
      void logout();
      return;
    }
    router.navigate('/login');
  }, [logout, onClose, user]);

  const sections: DrawerSection[] = ['السوق', 'حسابك', 'المبيعات', 'متجري', 'خدماتي', 'نشاطي', 'الإعدادات', 'المساعدة'];

  return (
    <>
      <View
        pointerEvents={open ? 'none' : 'auto'}
        style={[
          styles.edgeGesture,
          isRTL ? { start: 0 } : { end: 0 },
          open && styles.edgeGestureDisabled,
        ]}
        {...edgePanResponder.panHandlers}
      />
      <View
        pointerEvents={open ? 'auto' : 'none'}
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? 'yes' : 'no-hide-descendants'}
        style={StyleSheet.absoluteFill}
      >
        <Animated.View style={[styles.scrim, { opacity: shadeOpacity }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="إغلاق القائمة الجانبية"
            onPress={onClose}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal={open}
          style={[
            styles.drawer,
            {
              width: drawerWidth,
              transform: [{ translateX }],
              opacity: drawerOpacity,
            },
            isRTL ? { start: 0 } : { end: 0 },
            // عند الإغلاق: بدون ظل/حد حتى لا يظهر طرف مزعج على الحافة
            !open && styles.drawerClosed,
          ]}
          {...drawerPanResponder.panHandlers}
        >
          <SafeAreaView edges={['top', 'bottom']} style={styles.drawerSafeArea}>
            <View style={[styles.drawerHeader, isRTL ? styles.rowRTL : styles.rowLTR]}>
              <Image
                accessibilityLabel="شعار سوق غزة"
                source={require('../../assets/icon.png')}
                resizeMode="contain"
                style={styles.brandImage}
              />
              <View style={styles.identityText}>
                <Text style={[styles.brandTitle, { textAlign: isRTL ? 'right' : 'left' }]}>سوق غزة</Text>
                <Text style={[styles.identityName, { textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
                  {user?.name || 'سوقك، أقرب وأسهل'}
                </Text>
                {user?.email ? (
                  <Text style={[styles.identityEmail, { textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
                    {user.email}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.drawerDivider} />
            <ScrollView
              style={styles.menuScroll}
              contentContainerStyle={styles.menuContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {capabilityState.status === 'loading' ? (
                <Text style={[styles.capabilityHint, { textAlign: 'right' }]}>جارٍ التحقق من أدوات الحساب…</Text>
              ) : null}
              {(capabilityState.status === 'partial' || capabilityState.status === 'unavailable') ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setCapabilityReloadKey((value) => value + 1)}
                  style={[styles.capabilityRetry, isRTL ? styles.rowRTL : styles.rowLTR]}
                >
                  <AppIcon name="refresh" size={16} color={palette.brand} />
                  <Text style={styles.capabilityHint}>تعذر التحقق من بعض الصلاحيات — إعادة المحاولة</Text>
                </Pressable>
              ) : null}
              {sections.map((section) => {
                const activeCapabilities = capabilityState.status === 'ready' || capabilityState.status === 'partial'
                  ? capabilityState.capabilities
                  : undefined;
                const items = getVisibleDrawerItems(Boolean(user), activeCapabilities)
                  .filter((item) => item.section === section)
                  .map((item) => item.path === '/seller-profile' && !activeCapabilities?.sellerWorkspace
                    ? { ...item, label: 'ابدأ البيع' }
                    : item)
                  .map((item) => item.path === '/service-provider-profile' && !activeCapabilities?.serviceProvider
                    ? { ...item, label: 'تفعيل ملف مقدم الخدمة' }
                    : item);
                if (!items.length) return null;
                return (
                  <View key={section} style={styles.menuSection}>
                    <Text accessibilityRole="header" style={[styles.sectionLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{section}</Text>
                    {items.map((item) => {
                      const active = isItemActive(pathname, item.path);
                      return (
                        <Pressable
                          key={item.path}
                          accessibilityRole="link"
                          accessibilityLabel={item.label}
                          accessibilityHint={getRouteAccess(item.path) === 'authenticated' && !user ? 'يتطلب تسجيل الدخول؛ سيتم فتح صفحة تسجيل الدخول أولًا.' : undefined}
                          accessibilityState={{ selected: active }}
                          onPress={() => navigateTo(item)}
                          hitSlop={2}
                          style={({ pressed }) => [
                            styles.menuItem,
                            isRTL ? styles.rowRTL : styles.rowLTR,
                            active && (isRTL ? styles.menuItemActiveRTL : styles.menuItemActiveLTR),
                            pressed && styles.pressed,
                          ]}
                        >
                          <View style={[styles.menuIconWrap, active && styles.menuIconWrapActive]}>
                            <AppIcon name={item.icon} size={18} color={active ? palette.brandDark : palette.muted} />
                          </View>
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.menuItemLabel,
                              { textAlign: isRTL ? 'right' : 'left' },
                              active && styles.menuItemLabelActive,
                            ]}
                          >
                            {item.label}
                          </Text>
                          {active ? <View style={styles.activeDot} /> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.drawerFooter}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={user ? 'تسجيل الخروج' : 'تسجيل الدخول'}
                disabled={isBusy || isRestoring}
                onPress={handleAuthAction}
                style={({ pressed }) => [
                  styles.authButton,
                  user ? styles.logoutButton : styles.loginButton,
                  pressed && styles.pressed,
                  (isBusy || isRestoring) && styles.disabled,
                  isRTL ? styles.rowRTL : styles.rowLTR,
                ]}
              >
                <AppIcon name={user ? 'logout' : 'login'} size={20} color={user ? palette.danger : palette.onBrand} />
                <Text style={[styles.authButtonLabel, user && styles.logoutLabel]}>
                  {isRestoring ? 'جارٍ استعادة الجلسة…' : isBusy ? 'جارٍ التنفيذ…' : user ? 'تسجيل الخروج' : 'تسجيل الدخول'}
                </Text>
              </Pressable>
              <Text style={styles.versionLabel}>سوق غزة · تطبيق السوق المحلي</Text>
            </View>
          </SafeAreaView>
        </Animated.View>
      </View>
    </>
  );
}

function createStyles(palette: ColorPalette) {
  return StyleSheet.create({
  providerRoot: { flex: 1 },
  menuButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: palette.brandSoft,
  },
  edgeGesture: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 26,
    zIndex: 90,
  },
  edgeGestureDisabled: { display: 'none' },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: palette.black,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 28,
    shadowColor: palette.black,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    // قص أي محتوى يخرج عن حدود اللوحة
    overflow: 'hidden',
  },
  drawerClosed: {
    borderWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  drawerSafeArea: { flex: 1, backgroundColor: palette.surface },
  drawerHeader: {
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  rowRTL: { flexDirection: 'row' },
  rowLTR: { flexDirection: 'row' },
  brandImage: {
    width: 58,
    height: 58,
    borderRadius: radius.md,
    backgroundColor: palette.canvas,
    borderWidth: 1,
    borderColor: palette.border,
  },
  identityText: { flex: 1, minWidth: 0, gap: spacing.xs },
  brandTitle: { color: palette.ink, ...typography.subtitle },
  identityName: { color: palette.brandDark, ...typography.bodyStrong },
  identityEmail: { color: palette.muted, ...typography.caption },
  drawerDivider: { height: 1, backgroundColor: palette.border, marginHorizontal: spacing.lg },
  menuScroll: { flex: 1 },
  menuContent: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xl, gap: spacing.md },
  menuSection: { gap: spacing.xs, marginBottom: spacing.sm },
  sectionLabel: {
    color: palette.muted,
    ...typography.overline,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    letterSpacing: 0.4,
  },
  menuItem: {
    minHeight: 50,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    gap: spacing.md,
    borderRightWidth: 0,
    borderLeftWidth: 0,
    borderColor: palette.brand,
  },
  menuItemActiveRTL: { backgroundColor: palette.brandSoft, borderStartWidth: 3 },
  menuItemActiveLTR: { backgroundColor: palette.brandSoft, borderEndWidth: 3 },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.canvas,
  },
  menuIconWrapActive: { backgroundColor: palette.brandSoftActive },
  menuItemLabel: { flex: 1, color: palette.ink, ...typography.bodyStrong },
  menuItemLabelActive: { color: palette.brandDark, fontWeight: fontWeights.bold },
  activeDot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: palette.brand },
  drawerFooter: {
    borderTopWidth: 1,
    borderTopColor: palette.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    backgroundColor: palette.surface,
  },
  authButton: {
    minHeight: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  loginButton: { backgroundColor: palette.brand },
  logoutButton: { backgroundColor: palette.dangerSoft, borderWidth: 1, borderColor: palette.dangerBorder },
  authButtonLabel: { color: palette.onBrand, ...typography.bodyStrong },
  logoutLabel: { color: palette.danger },
  capabilityHint: { flexShrink: 1, color: palette.muted, fontSize: fontSizes[12], lineHeight: 18, textAlign: 'right' },
  capabilityRetry: { minHeight: sizes.touchTarget, alignItems: 'center', justifyContent: 'flex-start', gap: spacing.xs, paddingHorizontal: spacing.md },
  versionLabel: { color: palette.muted, ...typography.overline, textAlign: 'center' },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.5 },
});
}
