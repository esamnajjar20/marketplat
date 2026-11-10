import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useMemo } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import { fontSizes, radius, spacing, type ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
export function FilterChip({ label, selected, onPress, disabled, style }: { label: string; selected: boolean; onPress: () => void; disabled?: boolean; style?: ViewStyle }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} style={[styles.chip, selected && styles.selected, disabled && styles.disabled, style]}><Text style={[styles.text, selected && styles.selectedText]}>{label}</Text></Pressable>;
}
function createStyles(palette: ColorPalette) {
  return StyleSheet.create({ chip: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface }, selected: { borderColor: palette.brand, backgroundColor: palette.brandSoft }, text: { color: palette.ink, fontSize: fontSizes[13], fontWeight: '700' }, selectedText: { color: palette.brandOnSoft }, disabled: { opacity: 0.5 } });
}
