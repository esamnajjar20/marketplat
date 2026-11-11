#!/usr/bin/env node
/**
 * Regression guard for Phase 2's theme system and permission-aware navigation.
 * Validates source-level contracts plus WCAG contrast for both palettes.
 */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const read = (path) => readFile(join(root, path), 'utf8');

const [tokens, provider, appJsonRaw, layout, settings, uiStyles, pageShell, button,
  field, feedback, drawer, bottomNavigation, navigationPolicy, navigationTests,
  screenStyles, conversationRow, conversationList, accountNavigation, myStores] = await Promise.all([
  read('apps/mobile/src/theme/tokens.ts'),
  read('apps/mobile/src/theme/ThemeProvider.tsx'),
  read('apps/mobile/app.json'),
  read('apps/mobile/app/_layout.tsx'),
  read('apps/mobile/src/features/settings/ThemeSection.tsx'),
  read('apps/mobile/src/components/ui/styles.ts'),
  read('apps/mobile/src/components/ui/PageShell.tsx'),
  read('apps/mobile/src/components/ui/Button.tsx'),
  read('apps/mobile/src/components/ui/Field.tsx'),
  read('apps/mobile/src/components/ui/Feedback.tsx'),
  read('apps/mobile/src/components/MobileDrawer.tsx'),
  read('apps/mobile/src/components/BottomNavigation.tsx'),
  read('apps/mobile/src/lib/navigation-policy.ts'),
  read('apps/mobile/src/lib/__tests__/navigation-policy.test.ts'),
  read('apps/mobile/src/theme/screenStyles.ts'),
  read('apps/mobile/src/features/messaging/ConversationMessageRow.tsx'),
  read('apps/mobile/src/features/messaging/ConversationListItem.tsx'),
  read('apps/mobile/app/account.tsx'),
  read('apps/mobile/app/my-stores.tsx'),
]);

const appJson = JSON.parse(appJsonRaw);
const checks = [];
function check(label, fn) {
  fn();
  checks.push(label);
  console.log(`✅ ${label}`);
}

function extractPalette(source, declaration) {
  const match = source.match(declaration);
  assert.ok(match, 'Could not locate color palette declaration');
  const entries = new Map();
  const pattern = /^\s*([A-Za-z]\w*):\s*['"](#[0-9a-fA-F]{6})['"]\s*,?\s*$/gm;
  for (const item of match[1].matchAll(pattern)) entries.set(item[1], item[2]);
  return entries;
}

const light = extractPalette(tokens, /export const colors = \{([\s\S]*?)\} as const;/);
const dark = extractPalette(tokens, /export const darkColors: ColorPalette = \{([\s\S]*?)\n\};/);

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255);
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}
function contrast(palette, a, b) {
  assert.ok(palette.has(a), `Missing token ${a}`);
  assert.ok(palette.has(b), `Missing token ${b}`);
  const la = luminance(palette.get(a));
  const lb = luminance(palette.get(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

check('light and dark palettes expose exactly the same color token keys', () => {
  assert.ok(light.size > 40, `Unexpectedly small light palette (${light.size})`);
  assert.deepEqual([...dark.keys()].sort(), [...light.keys()].sort());
});

check('semantic color aliases and Arabic typography roles exist centrally', () => {
  for (const key of ['brand', 'ink', 'muted', 'surface', 'border', 'danger', 'dangerText', 'success', 'successText', 'controlBorder', 'brandOnSoft']) {
    assert.ok(light.has(key), `Missing semantic color ${key}`);
  }
  for (const role of ['display', 'screenTitle', 'sectionTitle', 'cardTitle', 'body', 'supporting', 'caption', 'price', 'buttonLabel']) {
    assert.match(tokens, new RegExp(`\\b${role}:\\s*\\{`), `Missing typography role ${role}`);
  }
});

check(`light palette contrast: ${contrast(light, 'ink', 'surface').toFixed(2)}:1 text and ${contrast(light, 'controlBorder', 'surface').toFixed(2)}:1 controls`, () => {
  assert.ok(contrast(light, 'ink', 'surface') >= 7);
  assert.ok(contrast(light, 'muted', 'surface') >= 4.5);
  assert.ok(contrast(light, 'brand', 'white') >= 4.5);
  assert.ok(contrast(light, 'controlBorder', 'surface') >= 3);
  assert.ok(contrast(light, 'onBrand', 'brand') >= 4.5);
  assert.ok(contrast(light, 'onDanger', 'danger') >= 4.5);
});

check(`dark palette contrast: ${contrast(dark, 'ink', 'surface').toFixed(2)}:1 text and ${contrast(dark, 'controlBorder', 'surface').toFixed(2)}:1 controls`, () => {
  assert.ok(contrast(dark, 'ink', 'surface') >= 7);
  assert.ok(contrast(dark, 'muted', 'surface') >= 4.5);
  assert.ok(contrast(dark, 'brandOnSoft', 'brandSoft') >= 4.5);
  assert.ok(contrast(dark, 'controlBorder', 'surface') >= 3);
  assert.ok(contrast(dark, 'onBrand', 'brand') >= 4.5);
  assert.ok(contrast(dark, 'onDanger', 'danger') >= 4.5);
});

check('theme preference follows system by default, restores locally, and protects a newer user selection', () => {
  assert.match(provider, /useColorScheme\(\)/);
  assert.match(provider, /SecureStore\.getItemAsync\(THEME_MODE_KEY\)/);
  assert.match(provider, /const \[persistedMode, setPersistedMode\] = useState<ThemeMode \| null>\(null\)/);
  assert.match(provider, /SecureStore\.setItemAsync\(THEME_MODE_KEY, nextMode\)/);
  assert.match(provider, /!selectionMade\.current/);
  assert.match(provider, /selectionMade\.current = true/);
  assert.match(provider, /mode: ThemeMode/);
  assert.match(provider, /persistedMode && persistedMode !== 'system'/);
});

check('Expo native appearance is automatic and root status/navigation surfaces consume the active palette', () => {
  assert.equal(appJson.expo?.userInterfaceStyle, 'automatic');
  assert.match(layout, /<AppThemeProvider>/);
  assert.match(layout, /StatusBar style=\{isDark \? "light" : "dark"\}/);
  assert.match(layout, /contentStyle: \{ backgroundColor: palette\.canvas \}/);
  assert.match(layout, /backgroundColor: colors\.canvas/);
});

check('settings expose accessible system, light, and dark choices', () => {
  for (const mode of ['system', 'light', 'dark']) assert.match(settings, new RegExp(`mode: '${mode}'`));
  assert.match(settings, /accessibilityRole="radio"/);
  assert.match(settings, /accessibilityState=\{\{ selected: active \}\}/);
  assert.match(settings, /setMode\(next\)/);
});

check('shared UI style hooks and core reusable controls consume the active palette', () => {
  assert.match(uiStyles, /export function useUIStyles\(\)/);
  assert.doesNotMatch(uiStyles, /export const uiStyles =/);
  assert.match(uiStyles, /createUIStyles\(palette\)/);
  for (const [name, source] of [['PageShell', pageShell], ['PrimaryButton', button], ['Field', field], ['Feedback', feedback]]) {
    assert.match(source, /useUIStyles\(\)/, `${name} does not consume useUIStyles`);
  }
  assert.match(screenStyles, /export function useScreenStyles\(\)/);
});

check('chat list and message bubbles use the active palette, including readable on-brand text', () => {
  assert.match(conversationRow, /useAppTheme\(\)/);
  assert.match(conversationRow, /createStyles\(colors\)/);
  assert.match(conversationRow, /color: colors\.onBrand/);
  assert.match(conversationList, /useAppTheme\(\)/);
  assert.match(conversationList, /createStyles\(colors\)/);
  assert.match(conversationList, /color: colors\.onBrand/);
  assert.match(button, /colors\.onBrand/);
});

check('bottom navigation and drawer consume active theme tokens and fetch capabilities only when the drawer is opened', () => {
  assert.match(bottomNavigation, /const \{ colors \} = useAppTheme\(\)/);
  assert.match(bottomNavigation, /createStyles\(colors\)/);
  assert.doesNotMatch(bottomNavigation.slice(bottomNavigation.indexOf('function createStyles')), /\bcolors\./);
  assert.match(drawer, /getVisibleDrawerItems\(Boolean\(user\), activeCapabilities\)/);
  assert.match(drawer, /useAppTheme\(\)/);
  assert.match(drawer, /fetchMySellerProfile/);
  assert.match(drawer, /fetchMyActiveStoreMemberships/);
  assert.match(drawer, /fetchMyServiceProvider/);
  assert.match(drawer, /Promise\.allSettled/);
  assert.match(drawer, /if \(!open \|\| isRestoring \|\| !accessToken\) return/);
  assert.match(drawer, /Date\.now\(\) - cached\.fetchedAt < 60_000/);
  assert.match(drawer, /useSyncExternalStore/);
});

check('seller, store-member, and service-provider navigation is gated by explicit capabilities and invalidated after profile setup', () => {
  assert.match(navigationPolicy, /getVisibleDrawerItems\(\s*isAuthenticated: boolean,\s*capabilities\?: NavigationCapabilities/);
  assert.match(navigationPolicy, /capabilities\?\.\[item\.capability\] === true/);
  assert.match(navigationPolicy, /invalidateNavigationCapabilities/);
  assert.match(navigationTests, /hides authenticated destinations from guest drawer navigation/);
  assert.match(navigationTests, /shows seller and provider workspaces only when the account capabilities are confirmed/);
  assert.match(navigationTests, /invalidates cached navigation capabilities/);
  assert.match(navigationPolicy, /export function resolveNavigationCapabilities/);
  assert.match(drawer, /resolveNavigationCapabilities\(/);
  assert.match(drawer, /activeStoreMembershipCount: memberships\.length/);
  assert.match(navigationTests, /derives drawer capabilities from the shared seller, membership, and provider facts/);
});

check('root and inline error states use the active theme, including readable text on dark-mode brand buttons', () => {
  assert.match(layout, /useAppThemeColors/);
  assert.match(layout, /const colors = useAppThemeColors\(\)/);
  assert.match(layout, /backgroundColor: colors\.canvas/);
  assert.match(layout, /color: colors\.onBrand/);
  assert.match(feedback, /export function ErrorState/);
  assert.match(feedback, /useUIStyles\(\)/);
  assert.match(feedback, /const \{ colors \} = useAppTheme\(\)/);
});

check('account navigation shares canonical seller/provider capabilities and rechecks after capability invalidation', () => {
  assert.match(accountNavigation, /resolveNavigationCapabilities\(/);
  assert.match(accountNavigation, /useSyncExternalStore/);
  assert.match(accountNavigation, /fetchMyActiveStoreMemberships/);
  assert.match(accountNavigation, /case '\/seller-dashboard':\s*return capabilities\.sellerWorkspace/);
  assert.match(accountNavigation, /case '\/my-stores':\s*return capabilities\.storeMembership/);
  assert.match(accountNavigation, /case '\/appointments':\s*case '\/my-services':\s*return capabilities\.serviceProvider/);
  assert.match(accountNavigation, /membership\.role === 'MANAGER' \|\| membership\.role === 'EDITOR'/);
  assert.match(myStores, /label="إعداد ملف البائع"/);
});

check('all Expo route files avoid static light-palette imports and color-using routes consume the dynamic theme hook', async () => {
  const walk = async (directory) => {
    const entries = await readdir(directory, { withFileTypes: true });
    const result = [];
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) result.push(...await walk(path));
      else if (entry.isFile() && /\.tsx?$/.test(entry.name)) result.push(path);
    }
    return result;
  };
  const routes = await walk(join(root, 'apps/mobile/app'));
  assert.ok(routes.length >= 100, `Only scanned ${routes.length} route files`);
  const offenders = [];
  for (const file of routes) {
    const source = await readFile(file, 'utf8');
    if (/import\s*\{[^}]*\bcolors\b[^}]*\}\s*from\s*['"]@\/theme\/tokens['"]/.test(source)) offenders.push(`${file}: static colors import`);
    if (/\bcolors\.[A-Za-z]/.test(source) && !/useAppTheme(?:Colors)?/.test(source)) offenders.push(`${file}: colors referenced without theme hook`);
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

console.log(`\nTheme system regression checks: ${checks.length}/${checks.length} passed.`);
