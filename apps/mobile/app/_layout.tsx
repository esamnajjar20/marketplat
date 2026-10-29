import '@/lib/network-config';
import { useEffect, type ReactNode } from 'react';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { I18nManager, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomNavigation from '@/components/BottomNavigation';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, typography } from '@/theme/tokens';
import { AuthProvider } from '@/features/auth/AuthContext';
import { ConnectivityProvider, useIsOnline } from '@/lib/connectivity';
import { OutboxSyncLifecycleBridge } from '@/storage/OutboxSyncLifecycleBridge';
import { FavoritesSyncLifecycleBridge } from '@/features/ads/FavoritesSyncLifecycleBridge';
import { ChatMessageOutboxLifecycleBridge } from '@/storage/ChatMessageOutboxLifecycleBridge';
import { OfflineBanner } from '@/components/MobileUI';
import { captureException, initErrorReporting } from '@/lib/error-reporting';

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
      <Text style={{ fontSize: 19, fontWeight: '900', color: colors.ink, textAlign: 'center' }}>
        حدث خطأ غير متوقع
      </Text>
      <Text
        style={{
          color: colors.muted,
          textAlign: 'center',
          marginTop: 10,
          lineHeight: 22,
          fontSize: 13,
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
        <Text style={{ color: colors.white, fontWeight: '800', fontSize: 15 }}>إعادة المحاولة</Text>
      </Pressable>
    </View>
  );
}

function RootChrome({ children }: { children: ReactNode }) {
  // BottomNavigation self-manages visibility via isBottomNavigationHidden.
  const isOnline = useIsOnline();
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      {!isOnline ? (
        <SafeAreaView edges={['top']} style={{ backgroundColor: colors.warningSoft }}>
          <OfflineBanner visible />
        </SafeAreaView>
      ) : null}
      {children}
      <BottomNavigation />
    </View>
  );
}

export default function RootLayout() {
  // Allow native RTL for Arabic system locales; don't force a global flip because
  // this app intentionally uses row-reverse in many manually mirrored components.
  useEffect(() => {
    I18nManager.allowRTL(true);
  }, []);

  // Crash reporting: no-op without DSN / package; see docs/mobile/checklists/SENTRY-SETUP.md
  useEffect(() => {
    initErrorReporting({ dsn: process.env.EXPO_PUBLIC_SENTRY_DSN });
  }, []);

  return (
    <ConnectivityProvider>
      <AuthProvider>
        <OutboxSyncLifecycleBridge />
        <FavoritesSyncLifecycleBridge />
        <ChatMessageOutboxLifecycleBridge />
        <StatusBar style="dark" />
        <RootChrome>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.canvas },
              // انتقالات أكثر طبيعية للتفاصيل
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
