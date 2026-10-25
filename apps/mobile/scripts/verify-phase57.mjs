import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const home = readFileSync(new URL('../app/index.tsx', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.match(home, /import NetInfo from '@react-native-community\/netinfo'/, 'NetInfo must be used for native connectivity changes');
assert.match(home, /state\.isConnected === true && state\.isInternetReachable !== false/, 'Treat confirmed connected state as online, unless reachability says otherwise');
assert.match(home, /previous === false && online/, 'Sync must trigger only on offline-to-online transition');
assert.match(home, /void loadAds\(true\)/, 'Reconnect should refresh ads while retaining the existing list');
assert.match(home, /fetchPublicCategories\(\)\.then\(\(tree\) =>/, 'Reconnect should refresh and render public categories');
assert.match(home, /adsRequestSequence = useRef\(0\)/, 'Use a monotonically increasing request sequence');
assert.match(home, /if \(!isCurrentRequest\(\)\) return;/, 'Stale search/filter responses must not overwrite newer state');
assert.match(home, /return \(\) => \{ active = false; unsubscribe\(\); \};/, 'Remove connectivity listener on unmount');
assert.match(packageJson.scripts.test, /verify-phase57\.mjs/, 'Phase 57 verifier must be part of npm test');
console.log('Phase 57 checks passed: reconnect sync, listener cleanup, and stale-response protection.');
