import '@/lib/network-config';
import { Stack } from 'expo-router';
import { View } from 'react-native';
import BottomNavigation from '@/components/BottomNavigation';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/theme/tokens';
import { AuthProvider } from '@/features/auth/AuthContext';
import { OutboxSyncLifecycleBridge } from '@/storage/OutboxSyncLifecycleBridge';
import { FavoritesSyncLifecycleBridge } from '@/features/ads/FavoritesSyncLifecycleBridge';
import { ChatMessageOutboxLifecycleBridge } from '@/storage/ChatMessageOutboxLifecycleBridge';

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
