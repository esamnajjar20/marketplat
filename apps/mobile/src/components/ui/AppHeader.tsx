import { AppText as Text } from './AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { type ReactNode } from 'react';
import { View } from 'react-native';
import { goBack } from '@/lib/navigation';
import { useUIStyles } from './styles';
import { useAppTheme } from '@/theme/ThemeProvider';
import { DrawerMenuButton } from '@/components/MobileDrawer';
import { AppIcon } from '@/components/Icons';

export function AppHeader({
  title,
  right,
  onBack,
  showBack = true,
}: {
  title: string;
  right?: ReactNode;
  onBack?: () => void;
  showBack?: boolean;
}) {
  const s = useUIStyles();
  const { colors } = useAppTheme();
  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    goBack('/');
  };

  return (
    <View style={s.header}>
      {showBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="رجوع"
          onPress={handleBack}
          hitSlop={12}
          style={({ pressed }) => [s.back, pressed && s.pressed]}
        >
          <AppIcon name="back" size={22} color={colors.brandOnSoft} />
        </Pressable>
      ) : (
        <View style={s.headerSpacer} />
      )}
      <Text maxFontSizeMultiplier={1.3} style={s.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={[s.headerRight, styles.headerActions]}>{right ?? null}<DrawerMenuButton /></View>
    </View>
  );
}

const styles = {
  headerActions: { flexDirection: 'row' as const, gap: 8, minWidth: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
};
