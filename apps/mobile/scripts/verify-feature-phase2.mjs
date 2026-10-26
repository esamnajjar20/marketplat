import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const checks = [
  ['conversation list route exists', existsSync(resolve(root, 'app/messages.tsx'))],
  ['conversation detail route exists', existsSync(resolve(root, 'app/messages/[id].tsx'))],
  ['notification center route exists', existsSync(resolve(root, 'app/notifications.tsx'))],
  ['API calls use existing conversations and notifications endpoints', /\/api\/v1\/conversations/.test(read('src/features/messaging/messaging.api.ts')) && /\/api\/v1\/notifications/.test(read('src/features/messaging/messaging.api.ts'))],
  ['message send trims input and has a length limit in the UI', /draft\.trim\(\)/.test(read('app/messages/[id].tsx')) && /maxLength=\{2000\}/.test(read('app/messages/[id].tsx'))],
  ['notification read actions are wired', /markNotificationRead/.test(read('app/notifications.tsx')) && /markAllNotificationsRead/.test(read('app/notifications.tsx'))],
  ['ad detail starts a server-backed conversation', /startConversationFromAd/.test(read('app/ads/[id].tsx'))],
  ['home exposes messages and notifications', /router\.push\('\/messages'\)/.test(read('app/index.tsx')) && /router\.push\('\/notifications'\)/.test(read('app/index.tsx'))],
];
let failed = 0;
for (const [name, passed] of checks) { console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`); if (!passed) failed++; }
if (failed) process.exitCode = 1;
else console.log(`Feature Phase 2 static checks passed (${checks.length} checks).`);
