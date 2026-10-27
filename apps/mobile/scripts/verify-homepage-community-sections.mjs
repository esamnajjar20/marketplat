import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const home = readFileSync(join(root, 'app/index.tsx'), 'utf8');
const component = readFileSync(join(root, 'src/features/discovery/HomeCommunitySections.tsx'), 'utf8');
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

assert.match(home, /import HomeCommunitySections from '@\/features\/discovery\/HomeCommunitySections'/);
assert.match(home, /<HomeCommunitySections\s*\/>/);
assert.match(component, /fetchStores\(\{ page: 1, limit: 6 \}\)/);
assert.match(component, /fetchStoryFeed\(accessToken\)/);
assert.match(component, /if \(accessToken\)/, 'story feed must only be requested for authenticated users');
assert.match(component, /router\.push\('\/stores'\)/);
assert.match(component, /router\.push\('\/stories'\)/);
assert.match(component, /return null/);
assert.match(packageJson.scripts.test, /verify-homepage-community-sections\.mjs/);

console.log('Homepage community sections verification passed.');
