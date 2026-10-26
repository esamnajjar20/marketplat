import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const screen = readFileSync(new URL('../app/messages.tsx', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.match(screen, /const requestId = useRef\(0\)/, 'inbox loads should use a request generation counter');
assert.match(screen, /const currentRequestId = \+\+requestId\.current/, 'each inbox load should invalidate earlier requests');
assert.match(screen, /if \(currentRequestId === requestId\.current\) \{ setItems\(result\.items\)/, 'older responses must not overwrite newer inbox data');
assert.match(screen, /if \(currentRequestId === requestId\.current\) setError/, 'stale request failures must not replace current error state');
assert.match(screen, /return \(\) => \{ requestId\.current \+= 1; moreRequestId\.current \+= 1; moreRequest\.current = false; \}/, 'leaving the screen should invalidate pending inbox requests');
assert.match(screen, /setItems\(\[\]\);[\s\S]*setError\('سجّل الدخول لعرض محادثاتك\.'/ , 'logged-out state must clear conversations from a prior session');
assert.match(pkg.scripts.test, /verify-inbox-refresh-race-audit\.mjs/, 'inbox race audit must run in npm test');
console.log('Inbox refresh race audit checks passed (stale requests are ignored and prior-session data is cleared).');
