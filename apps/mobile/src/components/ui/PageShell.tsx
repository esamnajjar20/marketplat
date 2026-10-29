import { type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { usePathname } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isBottomNavigationHidden } from '@/components/BottomNavigation';
import { AppHeader } from './AppHeader';
import { uiStyles as s } from './styles';

function ShellBody({
  hidden,
  title,
  right,
  children,
  scroll = true,
}: {
  hidden: boolean;
  title: string;
  right?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
}) {
  const edges: ('top' | 'bottom')[] = hidden ? ['top', 'bottom'] : ['top'];
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[s.content, { flex: 1 }]}>{children}</View>
  );

  return (
    <SafeAreaView style={s.safe} edges={edges}>
      <AppHeader title={title} right={right} />
      {body}
    </SafeAreaView>
  );
}

export function PageShell({
  title,
  children,
  right,
  scroll = true,
}: {
  title: string;
  children: ReactNode;
  right?: ReactNode;
  /** عند false يُعرض المحتوى بدون ScrollView (قوائم افتراضية مثلاً) */
  scroll?: boolean;
}) {
  const pathname = usePathname();
  const hidden = isBottomNavigationHidden(pathname);
  return (
    <ShellBody hidden={hidden} title={title} right={right} scroll={scroll}>
      {children}
    </ShellBody>
  );
}
