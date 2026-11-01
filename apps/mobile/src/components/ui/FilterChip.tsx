import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { StyleSheet, type ViewStyle } from 'react-native';
import { fontSizes, colors, radius, spacing } from '@/theme/tokens';
export function FilterChip({ label, selected, onPress, disabled, style }: { label: string; selected: boolean; onPress: () => void; disabled?: boolean; style?: ViewStyle }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} style={[styles.chip, selected && styles.selected, disabled && styles.disabled, style]}><Text style={[styles.text, selected && styles.selectedText]}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({ chip: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, selected: { borderColor: colors.brand, backgroundColor: colors.brandSoft }, text: { color: colors.ink, fontSize: fontSizes[13], fontWeight: '700' }, selectedText: { color: colors.brandOnSoft }, disabled: { opacity: 0.5 } });
