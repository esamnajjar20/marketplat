import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { usePathname } from 'expo-router';
import { goTab } from '@/lib/navigation';
import { MAIN_TABS, getActiveMainTab, shouldHideBottomNavigation } from '@/lib/navigation-policy';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fontSizes, colors, radius, sizes, spacing, typography, ux } from '@/theme/tokens';
import { AppIcon } from '@/components/Icons';

export function isBottomNavigationHidden(pathname: string): boolean {
  return shouldHideBottomNavigation(pathname);
}

export default function BottomNavigation() {
  const pathname = usePathname();
  if (isBottomNavigationHidden(pathname)) return null;

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <View accessibilityRole="tablist" accessibilityLabel="التنقل الرئيسي" style={styles.bar}>
        {MAIN_TABS.map((tab) => {
          const active = getActiveMainTab(pathname) === tab.id;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: active }}
              onPress={() => {
                if (active) return;
                goTab(tab.path);
              }}
              hitSlop={4}
              style={({ pressed }) => [styles.tab, active && styles.activeTab, pressed && styles.pressed]}
            >
              <View style={[styles.glyphWrap, active && styles.activeGlyphWrap, tab.path === '/add' && styles.addWrap]}>
                <AppIcon
                  name={tab.glyph}
                  size={tab.path === '/add' ? 24 : 22}
                  color={tab.path === '/add' ? colors.white : active ? colors.brandDark : colors.muted}
                />
              </View>
              <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.label, active && styles.activeLabel]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bar: {
    minHeight: sizes.bottomNavHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.sm,
  },
  tab: {
    minWidth: 0,
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: 14,
    marginHorizontal: 2,
  },
  activeTab: { backgroundColor: colors.brandSoft },
  pressed: { opacity: ux.pressedOpacity },
  glyphWrap: {
    minWidth: 32,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  activeGlyphWrap: { backgroundColor: colors.brandSoftActive },
  addWrap: {
    backgroundColor: colors.brand,
    minWidth: 44,
    minHeight: 36,
    borderRadius: 14,
  },
  glyph: { color: colors.muted, fontSize: fontSizes[22], lineHeight: 26, fontWeight: '600' },
  activeGlyph: { color: colors.brandDark },
  addGlyph: { fontSize: fontSizes[28], lineHeight: 30, color: colors.white, fontWeight: '500' },
  label: { color: colors.muted, ...typography.overline },
  activeLabel: { color: colors.brandDark, fontWeight: '700' },
});
