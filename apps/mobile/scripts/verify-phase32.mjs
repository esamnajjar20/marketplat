import assert from 'node:assert/strict';
import fs from 'node:fs';
const app = new URL('../app/_layout.tsx', import.meta.url);
const bridge = new URL('../src/storage/OutboxSyncLifecycleBridge.tsx', import.meta.url);
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const layoutText = fs.readFileSync(app, 'utf8');
const bridgeText = fs.readFileSync(bridge, 'utf8');
assert.ok(pkg.dependencies['@react-native-community/netinfo'], 'NetInfo dependency must be declared');
assert.ok(layoutText.includes('<OutboxSyncLifecycleBridge />'), 'Bridge must mount at app root');
assert.ok(layoutText.indexOf('<AuthProvider>') < layoutText.indexOf('<OutboxSyncLifecycleBridge />'), 'Bridge must be under AuthProvider');
for (const token of ['NetInfo.addEventListener', 'isConnected === true', 'isInternetReachable !== false', 'startOutboxSyncLifecycle', 'getSnapshot: () => ({ ...latest.current })', 'if (isRestoring) return;']) {
  assert.ok(bridgeText.includes(token), `Phase 32 application wiring missing: ${token}`);
}
assert.ok(pkg.scripts.test.includes('verify-phase32.mjs'), 'Phase 32 verifier must be wired into npm test');
console.log('Phase 32 app-level auth/connectivity wiring checks passed (static checks only).');
