import { router, usePathname, type Href } from 'expo-router';
import {
  Animated,
  BackHandler,
  Image,
  I18nManager,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ReactNode,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppIcon, type GlyphName } from '@/components/Icons';
import { useAuth } from '@/features/auth/AuthContext';
import { colors, radius, spacing, typography } from '@/theme/tokens';

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
      <View style={styles.providerRoot}>
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isDrawerOpen ? 'إغلاق القائمة الجانبية' : 'فتح القائمة الجانبية'}
      accessibilityState={{ expanded: isDrawerOpen }}
      onPress={toggleDrawer}
      hitSlop={4}
      style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}
    >
      <AppIcon name={isDrawerOpen ? 'close' : 'menu'} size={22} color={colors.brandDark} />
    </Pressable>
  );
}

type DrawerItem = {
  label: string;
  path: string;
  icon: GlyphName;
  section: 'السوق' | 'حسابك' | 'المساعدة';
  requiresAuth?: boolean;
};

const DRAWER_ITEMS: DrawerItem[] = [
  { label: 'الرئيسية', path: '/', icon: 'home', section: 'السوق' },
  { label: 'استكشف السوق', path: '/explore', icon: 'search', section: 'السوق' },
  { label: 'إضافة إعلان أو منتج', path: '/add', icon: 'add', section: 'السوق', requiresAuth: true },
  { label: 'المحادثات', path: '/messages', icon: 'messages', section: 'السوق', requiresAuth: true },
  { label: 'المفضلة', path: '/favorites', icon: 'favorite', section: 'السوق' },
  { label: 'الإشعارات', path: '/notifications', icon: 'notification', section: 'حسابك', requiresAuth: true },
  { label: 'حسابي', path: '/account', icon: 'account', section: 'حسابك' },
  { label: 'ملفي الشخصي', path: '/profile', icon: 'account', section: 'حسابك', requiresAuth: true },
  { label: 'إعلاناتي', path: '/my-ads', icon: 'ads', section: 'حسابك', requiresAuth: true },
  { label: 'طلباتي', path: '/orders', icon: 'orders', section: 'حسابك', requiresAuth: true },
  { label: 'الإعدادات', path: '/settings', icon: 'settings', section: 'حسابك', requiresAuth: true },
  { label: 'المساعدة والاقتراحات', path: '/suggestions', icon: 'help', section: 'المساعدة' },
];

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
  const { user, logout, isBusy, isRestoring } = useAuth();
  const pathname = usePathname();
  const { width: screenWidth } = useWindowDimensions();
  const drawerWidth = Math.min(screenWidth * 0.86, 360);
  const isRTL = I18nManager.isRTL;
  const progress = useRef(new Animated.Value(0)).current;
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [isRTL ? drawerWidth : -drawerWidth, 0],
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
      const target = item.requiresAuth && !user ? '/login' : item.path;
      router.navigate(target as Href);
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

  const sections: Array<DrawerItem['section']> = ['السوق', 'حسابك', 'المساعدة'];

  return (
    <>
      <View
        pointerEvents={open ? 'none' : 'auto'}
        style={[
          styles.edgeGesture,
          isRTL ? { right: 0 } : { left: 0 },
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
            { width: drawerWidth, transform: [{ translateX }] },
            isRTL ? { right: 0 } : { left: 0 },
          ]}
          {...drawerPanResponder.panHandlers}
        >
          <SafeAreaView edges={['top', 'bottom']} style={styles.drawerSafeArea}>
            <View style={[styles.drawerHeader, isRTL ? styles.rowRTL : styles.rowLTR]}>
              <Image
                accessibilityLabel="شعار MarketPlat"
                source={require('../../assets/icon.png')}
                resizeMode="contain"
                style={styles.brandImage}
              />
              <View style={styles.identityText}>
                <Text style={[styles.brandTitle, { textAlign: isRTL ? 'right' : 'left' }]}>MarketPlat</Text>
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
              {sections.map((section) => {
                const items = DRAWER_ITEMS.filter((item) => item.section === section);
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
                          accessibilityHint={item.requiresAuth && !user ? 'يتطلب تسجيل الدخول؛ سيتم فتح صفحة تسجيل الدخول أولاً.' : undefined}
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
                            <AppIcon name={item.icon} size={19} color={active ? colors.brandDark : colors.muted} />
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
                <AppIcon name={user ? 'logout' : 'login'} size={20} color={user ? colors.danger : colors.white} />
                <Text style={[styles.authButtonLabel, user && styles.logoutLabel]}>
                  {isRestoring ? 'جارٍ استعادة الجلسة…' : isBusy ? 'جارٍ التنفيذ…' : user ? 'تسجيل الخروج' : 'تسجيل الدخول'}
                </Text>
              </Pressable>
              <Text style={styles.versionLabel}>MarketPlat · تطبيق السوق المحلي</Text>
            </View>
          </SafeAreaView>
        </Animated.View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  providerRoot: { flex: 1 },
  menuButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.black,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 28,
    shadowColor: colors.black,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  drawerSafeArea: { flex: 1, backgroundColor: colors.surface },
  drawerHeader: {
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  rowRTL: { flexDirection: 'row-reverse' },
  rowLTR: { flexDirection: 'row' },
  brandImage: {
    width: 58,
    height: 58,
    borderRadius: 17,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.border,
  },
  identityText: { flex: 1, minWidth: 0, gap: 3 },
  brandTitle: { color: colors.ink, ...typography.subtitle },
  identityName: { color: colors.brandDark, ...typography.bodyStrong },
  identityEmail: { color: colors.muted, ...typography.caption },
  drawerDivider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.lg },
  menuScroll: { flex: 1 },
  menuContent: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.lg },
  menuSection: { gap: spacing.xs },
  sectionLabel: {
    color: colors.muted,
    ...typography.overline,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  menuItem: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    gap: spacing.md,
    borderRightWidth: 0,
    borderLeftWidth: 0,
    borderColor: colors.brand,
  },
  menuItemActiveRTL: { backgroundColor: colors.brandSoft, borderRightWidth: 3 },
  menuItemActiveLTR: { backgroundColor: colors.brandSoft, borderLeftWidth: 3 },
  menuIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvas,
  },
  menuIconWrapActive: { backgroundColor: colors.brandSoftActive },
  menuItemLabel: { flex: 1, color: colors.ink, ...typography.bodyStrong },
  menuItemLabelActive: { color: colors.brandDark, fontWeight: '900' },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand },
  drawerFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  authButton: {
    minHeight: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  loginButton: { backgroundColor: colors.brand },
  logoutButton: { backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.dangerBorder },
  authButtonLabel: { color: colors.white, ...typography.bodyStrong },
  logoutLabel: { color: colors.danger },
  versionLabel: { color: colors.muted, ...typography.overline, textAlign: 'center' },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.5 },
});
