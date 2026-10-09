import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
let passed = 0;
function check(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`PASS ${message}`);
  } else {
    failures.push(message);
    console.error(`FAIL ${message}`);
  }
}
function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const layout = read('app/layout.tsx');
const browseCity = read('hooks/useBrowseCity.ts');
const networkPolicyHook = read('hooks/useNetworkPolicy.ts');
const headerSearchBar = read('components/layout/SearchBar.tsx');
const deviceMonitor = read('lib/deviceErrorMonitor.ts');
const themeToggle = read('components/layout/ThemeToggle.tsx');
const relativeTime = read('components/shared/HydrationSafeRelativeTime.tsx');
const chatRow = read('components/messages/ChatMessageRow.tsx');
const messageUtils = read('lib/messageUtils.ts');
const installmentForm = read('components/sales/payments/InstallmentForm.tsx');
const clock = read('components/shared/cards/cardParts.tsx');
const renderAudit = read('scripts/render-regression-audit.mjs');

check(/google:\s*'notranslate'/.test(layout), 'Root metadata opts out of Google auto-translation');
check(/<html[^>]*translate="no"/.test(layout), 'Root HTML explicitly disables translation mutation');
check(/<body[^>]*className="notranslate"[^>]*translate="no"/.test(layout), 'Body is protected from translation wrappers/rewrites');
check(/suppressHydrationWarning/.test(layout), 'Root accounts for next-themes HTML attributes changing before hydration');
check(/const \[guestPreference, setGuestPreference\] = useState<[^>]+>\(undefined\)/.test(browseCity) && /const \[guestReady, setGuestReady\] = useState\(false\)/.test(browseCity), 'Browse-city localStorage preference does not change the initial SSR/hydration render');
check(/useEffect\(\(\) => \{\s*setSuggestions\(suggestRecentSearches\(query\.trim\(\), 5\)\);/.test(headerSearchBar) && !/useMemo\([\s\S]*suggestRecentSearches/.test(headerSearchBar), 'Header search history is read after mount, not during the render used for hydration');
check(/const INITIAL_NETWORK_POLICY: NetworkPolicy =/.test(networkPolicyHook) && /useState<NetworkPolicy>\(INITIAL_NETWORK_POLICY\)/.test(networkPolicyHook) && /useEffect\(\(\) => \{\s*const refresh = \(\) => setPolicy\(getNetworkPolicy\(\)\)/.test(networkPolicyHook), 'Network policy uses a deterministic first render and reads device-specific connection state after mount');
check(/function hydrationDomDetails\(\)/.test(deviceMonitor) && /htmlAttributes/.test(deviceMonitor) && /bodyChildElements/.test(deviceMonitor), 'Hydration reports include a privacy-safe HTML/body structure snapshot');
check(/const \[mounted, setMounted\] = useState\(false\)/.test(themeToggle) && /useEffect\(\(\) => setMounted\(true\), \[\]\)/.test(themeToggle), 'ThemeToggle does not render browser-resolved theme before mount');
check(/useNowAfterMount\(true, dateStr\)/.test(relativeTime) && /now === null/.test(relativeTime), 'Relative-time UI uses stable initial output and post-mount clock');
check(/useNowAfterMount\(true, message\.createdAt\)/.test(chatRow), 'Chat day separator avoids implicit server/client current-time calculations');
check(/messageDayLabel\(iso: string, now: Date\)/.test(messageUtils), 'Message day formatter requires an explicit reference clock');
check(/useState<number\|null>\(null\)/.test(installmentForm) && /useEffect\(\(\)\s*=>\s*\{\s*setBaseTime\(Date\.now\(\)\);\s*\},\s*\[\]\)/.test(installmentForm), 'Installment dates are not generated during initial SSR/hydration render');
check(/messageDayLabel/.test(renderAudit) && /ChatMessageRow/.test(renderAudit), 'Render regression audit covers the message date boundary');

console.log(`\nHydration regression audit: ${passed}/${passed + failures.length} checks passed`);
if (failures.length) process.exitCode = 1;
