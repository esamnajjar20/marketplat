import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const stream = read('src/features/messaging/chat-live-stream.ts');
const client = read('src/api/client.ts');
const vitest = read('vitest.config.ts');
const mobilePackage = JSON.parse(read('package.json'));
const rootPackage = JSON.parse(read('../../package.json'));
const connectivity = read('src/lib/connectivity.tsx');
const story = read('app/stories/[id].tsx');
const proguard = read('android/app/proguard-rules.pro');
const favorites = read('src/features/ads/favorites.store.ts');
const runner = read('scripts/run-all-verifications.mjs');

assert.match(stream, /response\.status === 401[\s\S]*refreshAccessTokenForStream/);
assert.match(stream, /response\.status === 403[\s\S]*authorization decision/);
assert.match(stream, /Last-Event-ID/);
assert.match(client, /refreshInFlight: Promise<string> \| null/);
assert.match(client, /export async function refreshAccessTokenForStream/);
assert.match(vitest, /src\/features\/\*\*\/__tests__\/\*\*\/\*\.test\.ts/);
{
  const workspaceYaml = readFileSync(resolve(root, '../../pnpm-workspace.yaml'), 'utf8');
  const override = /overrides:[\s\S]*?'zod':\s*'([^']+)'/.exec(workspaceYaml)?.[1];
  assert.equal(mobilePackage.dependencies.zod, override);
}
assert.match(connectivity, /createContext<ConnectivityValue>\(\{ isOnline: true \}\)/);
assert.match(connectivity, /state\.isConnected === false \|\| state\.isInternetReachable === false/);
const mobileSourceFiles = ['app', 'src'].flatMap((folder) =>
  readdirSync(resolve(root, folder), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map((entry) => resolve(entry.parentPath, entry.name)),
);
const netInfoListenerCount = mobileSourceFiles.reduce((count, file) =>
  count + [...readFileSync(file, 'utf8').matchAll(/NetInfo\.addEventListener/g)].length, 0,
);
assert.equal(netInfoListenerCount, 1, 'NetInfo listener must be centralized in ConnectivityProvider');
assert.match(story, /\}, 250\)/, 'Story progress must not update React state every 100ms');
assert.doesNotMatch(proguard, /-keep class (expo\.modules|com\.facebook\.react|com\.facebook\.hermes|com\.swmansion)\.\*\*/);
assert.match(favorites, /CREATE TABLE IF NOT EXISTS favorite_ad_ids/);
assert.match(favorites, /INSERT OR IGNORE INTO favorite_ad_ids/);
assert.match(favorites, /SecureStore is retained only as a one-time migration source/);
assert.match(runner, /quarantined-active\.json/);
assert.match(runner, /Quarantined active checks/);
console.log('Mobile audit remediation contracts passed.');
