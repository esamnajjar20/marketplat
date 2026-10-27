import { router, usePathname, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme/tokens';

type NavigationTab = { label: string; path: string; glyph: string; match: (path: string) => boolean };

const exploreRoots = [
  '/categories', '/products', '/stores', '/services', '/requests', '/search', '/stories',
  '/trending', '/suggestions', '/sellers-ranking', '/service-providers', '/promoted',
  '/product-categories', '/store-collections-public',
];
const accountRoots = [
  '/account', '/profile', '/my-', '/favorites', '/orders', '/settings', '/notifications',
  '/activity', '/saved-searches', '/followed-stores', '/offline-queue', '/blocked-users',
  '/storage', '/seller-orders', '/customers', '/debts', '/installments', '/appointments',
  '/service-requests', '/service-provider-profile', '/service-provider-analytics',
  '/seller-profile',
  '/service-provider-hours', '/service-reviews', '/store-collections', '/store-hours',
  '/store-invites', '/store-promotions', '/store-team',
];

const tabs: NavigationTab[] = [
  { label: 'الرئيسية', path: '/', glyph: '⌂', match: (path) => path === '/' },
  { label: 'استكشف', path: '/explore', glyph: '⌕', match: (path) => exploreRoots.some((root) => path === root || path.startsWith(`${root}/`)) || path === '/explore' },
  { label: 'إضافة', path: '/add', glyph: '+', match: (path) => path === '/add' },
  { label: 'الرسائل', path: '/messages', glyph: '▤', match: (path) => path === '/messages' },
  { label: 'حسابي', path: '/account', glyph: '♙', match: (path) => accountRoots.some((root) => root === '/my-' ? path.startsWith(root) : path === root || path.startsWith(`${root}/`)) },
];

const hiddenPrefixes = [
  '/login', '/register', '/forgot-password', '/reset-password', '/verify-email',
  '/messages/', '/ads/', '/products/', '/stores/', '/services/', '/requests/', '/stories/',
  '/orders/', '/sales/', '/profile/', '/service-providers/', '/report/', '/collections/',
  '/categories/', '/ad-editor', '/product-editor', '/service-editor', '/sale-create',
  '/request-create', '/story-create', '/appointment-create', '/order-checkout',
  '/service-images',
];

export function isBottomNavigationHidden(pathname: string): boolean {
  return hiddenPrefixes.some((prefix) => pathname.startsWith(prefix));
}

export default function BottomNavigation() {
  const pathname = usePathname();
  if (isBottomNavigationHidden(pathname)) return null;

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <View accessibilityRole="tablist" accessibilityLabel="التنقل الرئيسي" style={styles.bar}>
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          return (
            <Pressable
              key={tab.path}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: active }}
              onPress={() => router.navigate(tab.path as Href)}
              style={({ pressed }) => [styles.tab, active && styles.activeTab, pressed && styles.pressed]}
            >
              <View style={[styles.glyphWrap, active && styles.activeGlyphWrap]}>
                <Text style={[styles.glyph, active && styles.activeGlyph, tab.path === '/add' && styles.addGlyph]}>{tab.glyph}</Text>
              </View>
              <Text numberOfLines={1} style={[styles.label, active && styles.activeLabel]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  bar: { minHeight: 64, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 5, paddingTop: 4 },
  tab: { minWidth: 0, flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 14, marginHorizontal: 2 },
  activeTab: { backgroundColor: colors.brandSoft },
  pressed: { opacity: 0.72 },
  glyphWrap: { minWidth: 30, minHeight: 27, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  activeGlyphWrap: { backgroundColor: '#D4EDE5' },
  glyph: { color: colors.muted, fontSize: 22, lineHeight: 26, fontWeight: '700' },
  activeGlyph: { color: colors.brandDark },
  addGlyph: { fontSize: 30, lineHeight: 32, color: colors.brand, fontWeight: '500' },
  label: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  activeLabel: { color: colors.brandDark, fontWeight: '900' },
});
