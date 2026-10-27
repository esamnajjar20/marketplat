import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme/tokens';

const tabs = [
  { label: 'الرئيسية', path: '/', glyph: '⌂', match: (path: string) => path === '/' },
  { label: 'استكشف', path: '/explore', glyph: '⌕', match: (path: string) => path === '/explore' || path.startsWith('/categories') || path.startsWith('/products') || path.startsWith('/stores') || path.startsWith('/services') || path.startsWith('/requests') || path === '/search' || path === '/product-categories' || path === '/service-types' || path === '/stories' || path === '/trending' || path === '/suggestions' || path === '/sellers-ranking' || path === '/service-providers' || path === '/promoted' || path === '/collections' || path.startsWith('/collections/') },
  { label: 'إضافة', path: '/add', glyph: '+', match: (path: string) => path === '/add' },
  { label: 'الرسائل', path: '/messages', glyph: '▤', match: (path: string) => path === '/messages' },
  { label: 'حسابي', path: '/account', glyph: '♙', match: (path: string) => path === '/account' || path === '/profile' || path.startsWith('/my-') || path === '/favorites' || path === '/orders' || path === '/settings' || path === '/notifications' || path === '/activity' || path === '/saved-searches' || path === '/followed-stores' || path === '/offline-queue' || path === '/appointments' || path === '/service-requests' || path === '/installments' || path === '/debts' || path === '/customers' || path === '/my-offers' || path === '/my-reports' },
] as const;

const hiddenPrefixes = [
  '/login', '/register', '/forgot-password', '/reset-password', '/verify-email',
  '/messages/', '/ads/', '/products/', '/stores/', '/services/', '/requests/',
  '/stories/', '/orders/', '/sales/', '/profile/', '/service-providers/',
  '/report/', '/ad-editor', '/product-editor', '/service-editor', '/sale-create',
  '/request-create', '/story-create', '/appointment-create', '/order-checkout',
];

export default function BottomNavigation() {
  const pathname = usePathname();
  if (hiddenPrefixes.some((prefix) => pathname.startsWith(prefix))) return null;

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <View accessibilityRole="tablist" style={styles.bar}>
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          return (
            <Pressable
              key={tab.path}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: active }}
              onPress={() => { if (!active) router.navigate(tab.path as never); }}
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
  bar: { minHeight: 66, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 5, paddingTop: 5 },
  tab: { minWidth: 56, flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 14 },
  activeTab: { backgroundColor: colors.brandSoft },
  pressed: { opacity: 0.72 },
  glyphWrap: { minWidth: 30, minHeight: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  activeGlyphWrap: { backgroundColor: '#D4EDE5' },
  glyph: { color: colors.muted, fontSize: 23, lineHeight: 27, fontWeight: '700' },
  activeGlyph: { color: colors.brandDark },
  addGlyph: { fontSize: 30, lineHeight: 32, color: colors.brand, fontWeight: '500' },
  label: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  activeLabel: { color: colors.brandDark, fontWeight: '900' },
});
