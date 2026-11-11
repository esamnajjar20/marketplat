import type React from 'react';
import { type ReactNode } from 'react';
import { ScrollView, View, type RefreshControlProps } from 'react-native';
import { AppHeader } from './AppHeader';
import { ScreenFrame } from './ScreenFrame';
import { useUIStyles } from './styles';

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
  const s = useUIStyles();
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
    <ScreenFrame keyboardAvoiding>
      <AppHeader title={title} right={right} />
      {body}
    </ScreenFrame>
  );
}
