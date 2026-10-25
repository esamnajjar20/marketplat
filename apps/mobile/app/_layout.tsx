import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/theme/tokens';
import { AuthProvider } from '@/features/auth/AuthContext';
import { OutboxSyncLifecycleBridge } from '@/storage/OutboxSyncLifecycleBridge';

export default function RootLayout() {
  return (
    <AuthProvider>
      <OutboxSyncLifecycleBridge />
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.canvas },
          animation: 'fade_from_bottom',
        }}
      />
    </AuthProvider>
  );
}
