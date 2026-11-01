import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import '@/lib/network-config';
import { useEffect, type ReactNode } from 'react';
import { router, Stack, usePathname, type ErrorBoundaryProps } from 'expo-router';
import { ActivityIndicator, I18nManager, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomNavigation from '@/components/BottomNavigation';
import { MobileDrawerProvider } from '@/components/MobileDrawer';
import { StatusBar } from 'expo-status-bar';
import { fontSizes, colors, spacing, typography } from '@/theme/tokens';
import { AuthProvider, useAuth } from '@/features/auth/AuthContext';
import { ConnectivityProvider, useIsOnline } from '@/lib/connectivity';
import { requiresAuthenticatedUser } from '@/lib/navigation-policy';
import { OutboxSyncLifecycleBridge } from '@/storage/OutboxSyncLifecycleBridge';
import { FavoritesSyncLifecycleBridge } from '@/features/ads/FavoritesSyncLifecycleBridge';
import { ChatMessageOutboxLifecycleBridge } from '@/storage/ChatMessageOutboxLifecycleBridge';
import { NativePushLifecycleBridge } from '@/features/notifications/NativePushLifecycleBridge';
import { OfflineBanner } from '@/components/MobileUI';
import { OfflineCacheNotice } from '@/components/OfflineCacheNotice';
import { ToastHost } from '@/components/ToastHost';
import { captureException, initErrorReporting } from '@/lib/error-reporting';

// Initialize before the first React render so early native/JS failures are captured.
initErrorReporting({ dsn: process.env.EXPO_PUBLIC_SENTRY_DSN });

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  if (__DEV__) console.error('[ErrorBoundary]', error);
  useEffect(() => {
    captureException(error, { boundary: 'root' });
  }, [error]);
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        backgroundColor: colors.canvas,
      }}
    >
      <Text style={{ fontSize: fontSizes[19], fontWeight: '900', color: colors.ink, textAlign: 'center' }}>
        حدث خطأ غير متوقع
      </Text>
      <Text
        style={{
          color: colors.muted,
          textAlign: 'center',
          marginTop: 10,
          lineHeight: 22,
          fontSize: fontSizes[13],
        }}
      >
        يرجى إعادة المحاولة. إذا استمرت المشكلة فأعد فتح التطبيق.
      </Text>
      <Pressable
        onPress={retry}
        accessibilityRole="button"
        style={{
          marginTop: 20,
          backgroundColor: colors.brand,
          paddingHorizontal: 28,
          paddingVertical: 14,
          borderRadius: 16,
          minHeight: 48,
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: colors.white, fontWeight: '800', fontSize: fontSizes[15] }}>إعادة المحاولة</Text>
      </Pressable>
    </View>
  );
}

function RootChrome({ children }: { children: ReactNode }) {
  // BottomNavigation self-manages visibility via isBottomNavigationHidden.
  const isOnline = useIsOnline();
  const { user, isRestoring } = useAuth();
  const pathname = usePathname();
  const isPrivateRoute = requiresAuthenticatedUser(pathname);

  useEffect(() => {
    if (!isPrivateRoute || isRestoring || user) return;
    router.replace({ pathname: '/login', params: { redirect: pathname } });
  }, [isPrivateRoute, isRestoring, pathname, user]);

  // Do not mount private screens while the stored session is being restored or
  // after it has been found missing. This prevents a brief private-data flash.
  const blockPrivateScreen = isPrivateRoute && (isRestoring || !user);

  return (
    <MobileDrawerProvider>
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>
        {!isOnline ? (
          <SafeAreaView edges={['top']} style={{ backgroundColor: colors.warningSoft }}>
            <OfflineBanner visible />
          </SafeAreaView>
        ) : null}
        <OfflineCacheNotice />
        {children}
        <BottomNavigation />
        <ToastHost />
        {blockPrivateScreen ? (
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="جارٍ التحقق من جلسة الدخول"
            pointerEvents="auto"
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas }}
          >
            <ActivityIndicator color={colors.brand} size="large" />
          </View>
        ) : null}
      </View>
    </MobileDrawerProvider>
  );
}

export default function RootLayout() {
  // Native RTL is the source of truth. Horizontal row layouts in app/src were
  // migrated from manual reversed rows to normal rows so Yoga mirrors them exactly once.
  // React Native persists this setting; a native restart is required to apply it.
  useEffect(() => {
    if (Platform.OS !== 'web') {
      I18nManager.allowRTL(true);
      I18nManager.forceRTL(true);
    }
  }, []);

  return (
    <ConnectivityProvider>
      <AuthProvider>
        <OutboxSyncLifecycleBridge />
        <FavoritesSyncLifecycleBridge />
        <ChatMessageOutboxLifecycleBridge />
        <NativePushLifecycleBridge />
        <StatusBar style="dark" />
        <RootChrome>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.canvas },
              // Native RTL mirrors the navigation transition; push screens enter from the right.
              animation: 'slide_from_right',
              animationDuration: 260,
              gestureEnabled: true,
              fullScreenGestureEnabled: true,
              // يقلل عمل الشاشات غير المرئية
              freezeOnBlur: true,
            }}
          >
            {/* التبويبات الرئيسية: انتقال ألطف بدون إحساس «دفع» ثقيل */}
            <Stack.Screen name="index" options={{ animation: 'fade', animationDuration: 180 }} />
            <Stack.Screen name="explore" options={{ animation: 'fade', animationDuration: 180 }} />
            <Stack.Screen name="add" options={{ animation: 'fade', animationDuration: 180 }} />
            <Stack.Screen name="messages" options={{ animation: 'fade', animationDuration: 180 }} />
            <Stack.Screen name="account" options={{ animation: 'fade', animationDuration: 180 }} />
            {/* نماذج / محررات: من الأسفل */}
            <Stack.Screen name="login" options={{ animation: 'slide_from_bottom', animationDuration: 280 }} />
            <Stack.Screen name="register" options={{ animation: 'slide_from_bottom', animationDuration: 280 }} />
            <Stack.Screen name="ad-editor" options={{ animation: 'slide_from_bottom', animationDuration: 280 }} />
            <Stack.Screen name="product-editor" options={{ animation: 'slide_from_bottom', animationDuration: 280 }} />
            <Stack.Screen name="service-editor" options={{ animation: 'slide_from_bottom', animationDuration: 280 }} />
          </Stack>
        </RootChrome>
      </AuthProvider>
    </ConnectivityProvider>
  );
}
