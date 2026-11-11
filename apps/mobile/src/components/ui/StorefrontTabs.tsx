import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { fontSizes, radius, spacing, type ColorPalette, fontWeights } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
export type StorefrontTabKey = 'products' | 'offers' | 'collections' | 'ads' | 'reviews' | 'about';
const TABS: {
  key: StorefrontTabKey;
  label: string;
}[] = [{
    key: 'products', label: 'المنتجات'
  }, {
    key: 'offers', label: 'العروض'
  }, {
    key: 'collections', label: 'المجموعات'
  }, {
    key: 'ads', label: 'الإعلانات'
  }, {
    key: 'reviews', label: 'التقييمات'
  }, {
    key: 'about', label: 'عن المتجر'
  }];
export function StorefrontTabs({ value, onChange }: {
  value: StorefrontTabKey;
  onChange: (value: StorefrontTabKey) => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.list}>{TABS.map((tab) => <Pressable key={tab.key} accessibilityRole="tab" accessibilityState={{ selected: value === tab.key }} onPress={() => onChange(tab.key)} style={[styles.tab, value === tab.key && styles.active]}><Text style={[styles.label, value === tab.key && styles.activeLabel]}>{tab.label}</Text></Pressable>)}</ScrollView>;
}
function createStyles(palette: ColorPalette) {
  return StyleSheet.create({
    list: {
      flexDirection: 'row', gap: spacing.xs, paddingVertical: spacing.xxs
    }, tab: {
      minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface
    }, active: {
      backgroundColor: palette.brandSoft, borderColor: palette.brand
    }, label: {
      color: palette.muted, fontSize: fontSizes[13], fontWeight: fontWeights.bold
    }, activeLabel: { color: palette.brandOnSoft }
  });
}
