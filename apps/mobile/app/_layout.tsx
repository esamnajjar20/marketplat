import '@/lib/network-config';
import type { ReactNode } from 'react';
import { Stack, useSegments, type ErrorBoundaryProps } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import BottomNavigation from '@/components/BottomNavigation';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, typography } from '@/theme/tokens';
import { AuthProvider } from '@/features/auth/AuthContext';
import { ConnectivityProvider, useIsOnline } from '@/lib/connectivity';
import { OutboxSyncLifecycleBridge } from '@/storage/OutboxSyncLifecycleBridge';
import { FavoritesSyncLifecycleBridge } from '@/features/ads/FavoritesSyncLifecycleBridge';
import { ChatMessageOutboxLifecycleBridge } from '@/storage/ChatMessageOutboxLifecycleBridge';
import { OfflineBanner } from '@/components/MobileUI';

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  if (__DEV__) console.error('[ErrorBoundary]', error);
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

const MODAL_SCREENS = new Set([
  'login', 'register', 'complete-profile', 'verify-email',
  'forgot-password', 'reset-password',
  'ad-editor', 'product-editor', 'service-editor',
  'story-create', 'order-checkout',
]);

function RootChrome({ children }: { children: ReactNode }) {
  const isOnline = useIsOnline();
  const segments = useSegments();
  const currentScreen = segments[0] ?? '';
  const hideNav = MODAL_SCREENS.has(currentScreen);
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <OfflineBanner visible={!isOnline} />
      {children}
      {!hideNav && <BottomNavigation />}
    </View>
  );
}

export default function RootLayout() {
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
