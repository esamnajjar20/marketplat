import { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { goBack } from '@/lib/navigation';
import { uiStyles as s } from './styles';

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
          <Text style={s.backText}>‹</Text>
        </Pressable>
      ) : (
        <View style={s.headerSpacer} />
      )}
      <Text style={s.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={s.headerRight}>{right ?? <View style={s.headerSpacer} />}</View>
    </View>
  );
}
