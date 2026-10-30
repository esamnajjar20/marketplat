import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const home = await readFile(new URL('../app/index.tsx', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(home, /const \[refreshNotice, setRefreshNotice\] = useState<string \| null>\(null\)/, 'A non-blocking notice should communicate stale-cache refresh failures');
assert.ok(home.includes("else setRefreshNotice('أنت غير متصل حاليًا؛ نعرض آخر نسخة محفوظة من الإعلانات.')"), 'Known offline state should preserve cached content and explain its status');
assert.match(home, /تعذر تحديث الإعلانات الآن؛ ما زلنا نعرض النسخة المحفوظة على الجهاز/, 'Network failures with cached data should not replace the current content with an error screen');
assert.match(home, /const additions: AdListItem\[\] = \[\];[\s\S]*seen\.add\(item\.id\);[\s\S]*return \[\.\.\.current, \.\.\.additions\]/, 'Pagination should deduplicate IDs both against existing ads and within the incoming page');
assert.match(home, /\{refreshNotice \? \([\s\S]*styles\.refreshNotice[\s\S]*\) : null\}/, 'Refresh status should be shown without replacing the ad list');
assert.match(packageJson.scripts.test, /verify-homepage-ux-phase7\.mjs/, 'Phase 7 verifier should be included in the mobile test script');

console.log('Homepage UX phase 7 verification passed.');
