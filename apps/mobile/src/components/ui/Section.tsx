import { type ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { uiStyles as s } from './styles';

export function SectionHeader({
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={s.sectionHeader}>
      <View style={s.sectionHeaderText}>
        <Text style={s.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={s.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={({ pressed }) => [pressed && s.pressed]}>
          <Text style={s.sectionAction}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SectionCard({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [s.card, style, pressed && s.pressed]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[s.card, style]}>{children}</View>;
}

export function ListRow({
  title,
  description,
  onPress,
  glyph = '›',
  right,
}: {
  title: string;
  description?: string;
  onPress?: () => void;
  glyph?: string;
  right?: ReactNode;
}) {
  const content = (
    <View style={s.listRowInner}>
      <View style={s.listRowGlyph}>
        <Text style={s.listRowGlyphText}>{glyph}</Text>
      </View>
      <View style={s.listRowText}>
        <Text style={s.listRowTitle}>{title}</Text>
        {description ? <Text style={s.listRowDescription}>{description}</Text> : null}
      </View>
      {right}
    </View>
  );

  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.card, pressed && s.pressed]}>
        {content}
      </Pressable>
    );
  }
  return <View style={s.card}>{content}</View>;
}
