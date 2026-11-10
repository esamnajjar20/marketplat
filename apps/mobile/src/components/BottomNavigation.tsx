import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { usePathname } from 'expo-router';
import { goTab } from '@/lib/navigation';
import { MAIN_TABS, getActiveMainTab, shouldHideBottomNavigation } from '@/lib/navigation-policy';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fontSizes, colors, radius, sizes, spacing, typography, ux, elevation } from '@/theme/tokens';
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
          const isAdd = tab.path === '/add';
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
              hitSlop={6}
              style={({ pressed }) => [
                styles.tab,
                active && !isAdd && styles.activeTab,
                pressed && styles.pressed,
              ]}
            >
              <View
                style={[
                  styles.glyphWrap,
                  active && !isAdd && styles.activeGlyphWrap,
                  isAdd && styles.addWrap,
                ]}
              >
                <AppIcon
                  name={tab.glyph}
                  size={isAdd ? 26 : 22}
                  color={isAdd ? colors.white : active ? colors.brand : colors.muted}
                />
              </View>
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.25}
                style={[styles.label, active && styles.activeLabel, isAdd && styles.addLabel]}
              >
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
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    ...elevation.sm,
  },
  bar: {
    minHeight: sizes.bottomNavHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  tab: {
    minWidth: 0,
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: radius.md,
    marginHorizontal: 1,
    paddingVertical: spacing.xs,
  },
  activeTab: {
    backgroundColor: colors.brandSoft,
  },
  pressed: { opacity: ux.pressedOpacity },
  glyphWrap: {
    minWidth: 36,
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  activeGlyphWrap: {
    backgroundColor: colors.brandSoftActive,
  },
  addWrap: {
    backgroundColor: colors.brand,
    minWidth: 48,
    minHeight: 40,
    borderRadius: radius.md,
    ...elevation.sm,
  },
  label: {
    color: colors.muted,
    ...typography.overline,
  },
  activeLabel: {
    color: colors.brandDark,
    fontWeight: '700',
  },
  addLabel: {
    color: colors.brand,
    fontWeight: '600',
  },
});
