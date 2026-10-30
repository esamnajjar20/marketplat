import { ScrollView, Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius, spacing } from '@/theme/tokens';
export type StorefrontTabKey = 'products' | 'offers' | 'collections' | 'ads' | 'reviews' | 'about';
const TABS: { key: StorefrontTabKey; label: string }[] = [{ key: 'products', label: 'المنتجات' }, { key: 'offers', label: 'العروض' }, { key: 'collections', label: 'المجموعات' }, { key: 'ads', label: 'الإعلانات' }, { key: 'reviews', label: 'التقييمات' }, { key: 'about', label: 'عن المتجر' }];
export function StorefrontTabs({ value, onChange }: { value: StorefrontTabKey; onChange: (value: StorefrontTabKey) => void }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.list}>{TABS.map((tab) => <Pressable key={tab.key} accessibilityRole="tab" accessibilityState={{ selected: value === tab.key }} onPress={() => onChange(tab.key)} style={[styles.tab, value === tab.key && styles.active]}><Text style={[styles.label, value === tab.key && styles.activeLabel]}>{tab.label}</Text></Pressable>)}</ScrollView>;
}
const styles = StyleSheet.create({ list: { flexDirection: 'row-reverse', gap: spacing.xs, paddingVertical: 2 }, tab: { minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, active: { backgroundColor: colors.brandSoft, borderColor: colors.brand }, label: { color: colors.muted, fontSize: 13, fontWeight: '700' }, activeLabel: { color: colors.brand } });
