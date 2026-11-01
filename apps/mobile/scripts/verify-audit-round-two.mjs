import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));
const checks = [];
function check(name, condition) {
  checks.push(name);
  assert.ok(condition, name);
  console.log(`PASS ${name}`);
}

const deepLinks = read('src/features/sharing/deep-links.ts');
const webLinks = read('src/lib/web-links.ts');
const appConfig = read('app.config.js');
check('External share links use the configured HTTPS web origin', deepLinks.includes('getConfiguredHttpsUrl') && !deepLinks.includes('Linking.createURL') && webLinks.includes("parsed.protocol === 'https:'"));
check('Android and iOS native link association is configured', appConfig.includes('autoVerify: true') && appConfig.includes('associatedDomains') && appConfig.includes('applinks:'));
check('Android association route requires real signing fingerprints', exists('../../frontend/app/.well-known/assetlinks.json/route.ts') && read('../../frontend/app/.well-known/assetlinks.json/route.ts').includes('ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS'));
check('Apple association route requires a real Apple Team ID', exists('../../frontend/app/.well-known/apple-app-site-association/route.ts') && read('../../frontend/app/.well-known/apple-app-site-association/route.ts').includes('APPLE_TEAM_ID'));

const nativeShared = read('app/shared.tsx');
const webShared = fs.readFileSync(path.resolve(root, '../../frontend/components/shared/SharedPayloadView.tsx'), 'utf8');
check('Native and web share cards are explicitly marked unverified', nativeShared.includes('غير موثّق') && webShared.includes('بطاقة غير موثّقة') && webShared.includes('aria-label="بطاقة غير موثّقة"'));
check('Unverified share cards do not expose direct contact or payment actions', !/(tel:|mailto:|whatsapp|payment|checkout|openConversation|startConversation)/i.test(nativeShared + webShared) && nativeShared.includes("router.replace('/explore')"));

const conversation = read('app/messages/[id].tsx');
const messageRow = read('src/features/messaging/ConversationMessageRow.tsx');
check('Conversation uses the shared connectivity provider and extracted lifecycle hooks', conversation.includes('useIsOnline') && conversation.includes('useChatLiveStream') && conversation.includes('useChatMediaOutboxLifecycle') && !conversation.includes('NetInfo'));
check('Voice messages play in-app and attachments use the in-app browser', conversation.includes('useAudioPlayer') && conversation.includes('audioPlayer.replace(url)') && messageRow.includes('WebBrowser.openBrowserAsync') && !messageRow.includes('Linking.openURL'));
check('Remote conversation images use AppImage and validate their URL', messageRow.includes('<AppImage') && messageRow.includes('isAllowedMediaUrl(message.imageUrl)'));

check('Search and list screens use the shared pagination hook', read('app/search.tsx').includes('usePaginatedList') && exists('src/hooks/usePaginatedList.ts'));
check('Unused Query wrappers are removed rather than pretending TanStack Query is active', !exists('src/providers/QueryProvider.tsx') && !exists('src/features/discovery/useHomeAdsQuery.ts') && !exists('app/_layout.QUERY-SNIPPET.tsx') && !JSON.parse(read('package.json')).dependencies?.['@tanstack/react-query']);

const formatters = read('src/lib/formatters.ts');
check('Money, dates, and numbers share an explicit Latin-digit locale', formatters.includes("'ar-u-nu-latn'") && formatters.includes('formatMoney') && formatters.includes('formatDate') && formatters.includes('formatNumber'));
check('The currency sign and Intl formatting are centralized', !/₪/.test(fs.readdirSync(path.join(root, 'app'), { recursive: true }).filter((file) => typeof file === 'string' && file.endsWith('.tsx')).map((file) => fs.readFileSync(path.join(root, 'app', file), 'utf8')).join('\n')) && !/Intl\.(Number|Date)Format|toLocale(Date|String)/.test(read('app/search.tsx')));

check('Toast host is mounted at the application root with accessible, actionable feedback', read('app/_layout.tsx').includes('<ToastHost />') && exists('src/components/ToastHost.tsx') && read('src/lib/toast.ts').includes('action?: ToastAction') && read('src/components/ToastHost.tsx').includes('action?.onPress()'));
check('App icons are centralized and legacy standalone chevron glyphs are absent', exists('src/components/Icons.tsx') && !/['"]‹['"]|['"]›['"]/.test(read('app/stores/[id].tsx')));
check('Non-destructive story and message choice menus use an accessible in-app ActionSheet', exists('src/components/ActionSheet.tsx') && read('src/components/ActionSheet.tsx').includes('accessibilityViewIsModal') && read('app/stories.tsx').includes('<ActionSheet') && !read('app/stories.tsx').includes("Alert.alert('إضافة قصة'") && read('app/messages/[id].tsx').includes('<ActionSheet') && !read('app/messages/[id].tsx').includes("Alert.alert('خيارات الرسالة'"));

const projectConfig = JSON.parse(read('app.json')).expo;
const gradle = read('android/app/build.gradle');
check('iOS remains an explicit Expo-managed target and its push limitation is disclosed', projectConfig.ios.bundleIdentifier === 'com.marketplat.mobile' && read('README.md').includes('iOS APNs is intentionally not wired'));
check('Android version fields derive from app.json instead of being duplicated literals', gradle.includes('mobileExpoConfig.expo.android.versionCode') && gradle.includes('mobileExpoConfig.expo.version as String') && !/versionName\s+['"]0\.1\.1['"]/.test(gradle));
check('Native dependencies flagged by the audit remain pinned in the lockfile', read('../..' + '/pnpm-lock.yaml').includes("'@expo/dom-webview'") && read('../..' + '/pnpm-lock.yaml').includes('react-native-gesture-handler@3.3.0'));

console.log(`Verified ${checks.length} second-round audit checks.`);
