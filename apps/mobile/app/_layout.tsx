import '@/lib/network-config';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import BottomNavigation from '@/components/BottomNavigation';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/theme/tokens';
import { AuthProvider } from '@/features/auth/AuthContext';
import { OutboxSyncLifecycleBridge } from '@/storage/OutboxSyncLifecycleBridge';
import { FavoritesSyncLifecycleBridge } from '@/features/ads/FavoritesSyncLifecycleBridge';
import { ChatMessageOutboxLifecycleBridge } from '@/storage/ChatMessageOutboxLifecycleBridge';

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.canvas }}>
      <Text style={{ fontSize: 19, fontWeight: '900', color: colors.ink, textAlign: 'center' }}>حدث خطأ غير متوقع</Text>
      <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 10, lineHeight: 22, fontSize: 13 }}>{error.message}</Text>
      <Pressable onPress={retry} style={{ marginTop: 20, backgroundColor: colors.brand, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 16 }}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>إعادة المحاولة</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <OutboxSyncLifecycleBridge />
      <FavoritesSyncLifecycleBridge />
      <ChatMessageOutboxLifecycleBridge />
      <StatusBar style="dark" />
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.canvas },
            animation: 'fade_from_bottom',
          }}
        />
        <BottomNavigation />
      </View>
    </AuthProvider>
  );
}
