import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const tokens = read('../components/shared/cards/cardTokens.ts');
const service = read('../components/services/ServiceListingCard.tsx');
const provider = read('../components/services/ServiceProviderCard.tsx');
const checks = [
  ['shared soft shell token exists', tokens.includes('CARD_SHELL_SOFT')],
  ['shared avatar fallback token exists', tokens.includes('CARD_AVATAR_FALLBACK')],
  ['shared semantic badge tokens exist', tokens.includes('CARD_BADGE_SUCCESS') && tokens.includes('CARD_BADGE_MUTED')],
  ['service listing uses shared shell', service.includes('CARD_SHELL_SOFT')],
  ['service listing uses shared title', service.includes('CARD_TITLE')],
  ['service listing uses shared semantic badges', service.includes('CARD_BADGE_SUCCESS') && service.includes('CARD_BADGE_MUTED')],
  ['service listing mobile thumbnail is compact', service.includes('h-16 w-16') && service.includes('sm:h-[72px]')],
  ['provider card uses shared shell', provider.includes('CARD_SHELL_SOFT')],
  ['provider card uses shared avatar fallback', provider.includes('CARD_AVATAR_FALLBACK')],
  ['provider card uses shared verified badge', provider.includes('CARD_BADGE_SUCCESS')],
  ['legacy hard-coded service shell removed', !service.includes('border-[#EAE3D6] bg-white p-3 shadow-')],
  ['legacy hard-coded provider shell removed', !provider.includes('border-[#EAE3D6] bg-white p-3.5 shadow-')],
];
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
assert.ok(checks.every(([, ok]) => ok), 'Card unification audit failed');
console.log(`\n${checks.length}/${checks.length} checks passed`);
