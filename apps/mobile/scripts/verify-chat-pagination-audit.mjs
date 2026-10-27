import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const api = readFileSync(new URL('../src/features/messaging/messaging.api.ts', import.meta.url), 'utf8');
const screen = readFileSync(new URL('../app/messages/[id].tsx', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(api, /export async function fetchMessagesPage/, 'message API should expose cursor-based message pagination');
assert.match(api, /nextCursor|before/, 'message page API should support a continuation cursor');
assert.match(screen, /const \[nextCursor, setNextCursor\] = useState<string \| null>\(null\)/, 'chat screen should retain the server cursor');
assert.match(screen, /const loadOlder = useCallback/, 'chat screen should provide an older-message loader');
assert.match(screen, /if \(!accessToken \|\| !id \|\| !nextCursor \|\| olderRequest\.current \|\| loading \|\| loadingOlder\) return/, 'older-message loads must be guarded against duplicate/ineligible requests');
assert.match(screen, /fetchMessagesPage\(id, accessToken, nextCursor\)/, 'older-message loader must request the next cursor');
assert.match(screen, /mergeFetchedMessages\(\[\.\.\.page\.items, \.\.\.current\], \[\]\)/, 'older messages should be merged without discarding already visible messages');
assert.match(screen, /maintainVisibleContentPosition/, 'loading older messages should preserve the visible scroll position');
assert.match(screen, /onScroll=\{\(event\) => \{ if \(event\.nativeEvent\.contentOffset\.y <= 40\) void loadOlder\(\); \}\}/, 'reaching the top should trigger cursor pagination');
assert.match(pkg.scripts.test, /verify-chat-pagination-audit\.mjs/, 'chat pagination audit must be included in npm test');

console.log('Chat message pagination audit passed (static source checks only; no live API or device scrolling test performed).');
