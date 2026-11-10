import type React from 'react';
import { type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, type RefreshControlProps } from 'react-native';
import { usePathname } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isBottomNavigationHidden } from '@/components/BottomNavigation';
import { AppHeader } from './AppHeader';
import { useUIStyles } from './styles';

function ShellBody({
  hidden,
  title,
  right,
  children,
  scroll = true,
  refreshControl,
}: {
  hidden: boolean;
  title: string;
  right?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}) {
  const s = useUIStyles();
  const edges: ('top' | 'bottom')[] = hidden ? ['top', 'bottom'] : ['top'];
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[s.content, { flex: 1 }]}>{children}</View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={s.safe} edges={edges}>
        <AppHeader title={title} right={right} />
        {body}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

export function PageShell({
  title,
  children,
  right,
  scroll = true,
  refreshControl,
}: {
  title: string;
  children: ReactNode;
  right?: ReactNode;
  /** سحب للتحديث (يعمل فقط مع scroll=true) */
  refreshControl?: React.ReactElement<RefreshControlProps>;
  /** عند false يُعرض المحتوى بدون ScrollView (قوائم افتراضية مثلاً) */
  scroll?: boolean;
}) {
  const pathname = usePathname();
  const hidden = isBottomNavigationHidden(pathname);
  return (
    <ShellBody hidden={hidden} title={title} right={right} scroll={scroll} refreshControl={refreshControl}>
      {children}
    </ShellBody>
  );
}
