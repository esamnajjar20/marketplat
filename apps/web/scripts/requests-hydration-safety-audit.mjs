import fs from 'node:fs';

const card = fs.readFileSync('components/requests/RequestCard.tsx', 'utf8');
const status = fs.readFileSync('lib/requestStatus.ts', 'utf8');
const test = fs.readFileSync('__tests__/unit/lib/requestStatus.test.ts', 'utf8');
let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) { passed += 1; console.log(`PASS ${name}`); }
  else { failed += 1; console.error(`FAIL ${name}`); }
}
check('RequestCard reads a hydration-safe shared clock', /useNowAfterMount\(true\)/.test(card));
check('Expiry badge is withheld until client clock is available', /hydrationNow !== null\s*&&\s*isRequestExpiringSoon/.test(card));
check('Expiry check receives an explicit clock value', /isRequestExpiringSoon\(r\.expiresAt, undefined, hydrationNow\)/.test(card));
check('Status helper supports deterministic injected time', /nowMs = Date\.now\(\)/.test(status) && /t - nowMs/.test(status));
check('Unit tests cover stable time, expiry, invalid date and invalid clock', /supplied clock/.test(test) && /expired or invalid dates/.test(test) && /invalid supplied clock/.test(test));
console.log(`\n${passed}/${passed + failed} checks passed`);
if (failed) process.exitCode = 1;
