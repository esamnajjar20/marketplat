#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const repo = resolve(root, '..', '..');
const read = (path) => readFile(resolve(repo, path), 'utf8');
const mobilePackage = JSON.parse(await read('apps/mobile/package.json'));
const checks = [];
function check(label, fn) {
  fn();
  checks.push(label);
}

const [appConfig, pushService, pushBridge, oauthNative, oauthApi, authContext, oauthRoutes,
  oauthController, errorReporting, layout, search, conversationRow, pendingLogout, sessionStorage, debugWorkflow, releaseWorkflow] = await Promise.all([
  read('apps/mobile/app.config.js'),
  read('apps/mobile/src/features/notifications/native-push.ts'),
  read('apps/mobile/src/features/notifications/NativePushLifecycleBridge.tsx'),
  read('apps/mobile/src/features/auth/google-oauth.native.ts'),
  read('apps/mobile/src/features/auth/auth.api.ts'),
  read('apps/mobile/src/features/auth/AuthContext.tsx'),
  read('apps/api/src/modules/auth/auth.routes.ts'),
  read('apps/api/src/modules/auth/auth.controller.ts'),
  read('apps/mobile/src/lib/error-reporting.ts'),
  read('apps/mobile/app/_layout.tsx'),
  read('apps/mobile/app/search.tsx'),
  read('apps/mobile/src/features/messaging/ConversationListItem.tsx'),
  read('apps/mobile/src/features/auth/pending-logout.ts'),
  read('apps/mobile/src/features/auth/session-storage.ts'),
  read('.github/workflows/build-mobile-apk.yml'),
  read('.github/workflows/release-mobile-production.yml'),
]);

check('Expo SDK-matched native packages are declared', () => {
  for (const dependency of ['@sentry/react-native', 'expo-device', 'expo-notifications', 'expo-web-browser']) {
    assert.ok(mobilePackage.dependencies?.[dependency], `Missing dependency ${dependency}`);
  }
});
check('app config wires notifications and avoids committing Firebase config', () => {
  assert.match(appConfig, /expo-notifications/);
  assert.match(appConfig, /google-services\.json/);
  assert.match(appConfig, /fs\.existsSync\(androidGoogleServices\)/);
});
check('FCM registration is Android-only and opt-in', () => {
  assert.match(pushService, /Platform\.OS !== 'android'/);
  assert.match(pushService, /requestPermissionsAsync\(\)/);
  assert.match(pushService, /ANDROID_PUSH_OPT_IN_KEY/);
  assert.match(pushService, /ANDROID_PUSH_TOKEN_KEY/);
  assert.match(pushService, /platform: 'android'/);
  assert.match(pushService, /method: 'POST'/);
  assert.match(pushService, /method: 'DELETE'/);
});
check('push bridge never prompts and respects saved opt-in', () => {
  assert.match(pushBridge, /syncGrantedAndroidPush/);
  assert.match(pushBridge, /isAndroidPushEnabled/);
  assert.doesNotMatch(pushBridge, /requestPermissionsAsync/);
  assert.match(pushBridge, /safeNotificationPath/);
  assert.match(pushBridge, /NetInfo\.addEventListener/);
  assert.match(pushBridge, /AppState\.addEventListener/);
});
check('Google OAuth uses system browser plus PKCE', () => {
  assert.match(oauthNative, /openAuthSessionAsync/);
  assert.match(oauthNative, /CryptoDigestAlgorithm\.SHA256/);
  assert.match(oauthNative, /marketplat:\/\/oauth\/callback/);
  assert.match(oauthNative, /43\}/);
  assert.match(oauthApi, /mobile\/google\/exchange/);
  assert.match(authContext, /beginNativeGoogleOAuth/);
});
check('backend native OAuth stores opaque flow and atomically consumes ticket', () => {
  assert.match(oauthRoutes, /mobileOAuthFlowKey/);
  assert.match(oauthRoutes, /setMobileOAuthFlowCookie/);
  assert.match(oauthRoutes, /mobileGoogleExchange/);
  assert.match(oauthController, /randomBytes\(32\)/);
  assert.match(oauthController, /redis\.eval\(consumeScript/);
  assert.match(oauthController, /marketplat:\/\/oauth\/callback\?ticket=/);
  assert.doesNotMatch(oauthController, /marketplat:\/\/oauth\/callback\?accessToken=/);
});
check('Sentry is initialized and PII/request payloads are scrubbed', () => {
  assert.match(errorReporting, /Sentry\.init/);
  assert.match(errorReporting, /sendDefaultPii: false/);
  assert.match(errorReporting, /beforeSend/);
  assert.match(errorReporting, /delete event\.request\.headers/);
  assert.match(layout, /initErrorReporting\(\{ dsn:/);
});
check('search includes condition and conversation row uses safe avatar image', () => {
  assert.match(search, /condition: submittedFilters\.type === 'ads'/);
  assert.match(search, /REFURBISHED/);
  assert.match(conversationRow, /isAllowedMediaUrl/);
  assert.match(conversationRow, /<AppImage/);
});
check('GitHub mobile builds use the configured API Worker origin', () => {
  assert.match(debugWorkflow, /EXPO_PUBLIC_API_URL: https:\/\/marketplat-api\.esamnajjar6\.workers\.dev/);
  assert.match(releaseWorkflow, /EXPO_PUBLIC_API_URL: https:\/\/marketplat-api\.esamnajjar6\.workers\.dev/);
});
check('GitHub workflows inject and validate Firebase config without committing it', () => {
  assert.match(debugWorkflow, /MARKETPLAT_FIREBASE_ANDROID_JSON_BASE64/);
  assert.match(debugWorkflow, /com\.marketplat\.mobile/);
  assert.match(releaseWorkflow, /Missing MARKETPLAT_FIREBASE_ANDROID_JSON_BASE64 production secret/);
  assert.match(releaseWorkflow, /MARKETPLAT_FIREBASE_PROJECT_ID/);
  assert.match(releaseWorkflow, /Remove injected Firebase configuration/);
});
check('offline logout durably carries FCM token for retry', () => {
  assert.match(sessionStorage, /fcmToken\?: string \| null/);
  assert.match(authContext, /fcmToken: pendingFcmToken/);
  assert.match(pendingLogout, /pending\.fcmToken/);
  assert.match(pendingLogout, /clearRegisteredAndroidPushState/);
});

console.log(`✅ Phase 3 native integration contracts: ${checks.length}/${checks.length}`);
for (const label of checks) console.log(`  - ${label}`);
