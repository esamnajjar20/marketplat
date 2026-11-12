#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (file) => readFileSync(resolve(process.cwd(), file), 'utf8');
const routes = read('../apps/api/src/modules/identity/users/users.routes.ts');
const controller = read('../apps/api/src/modules/identity/users/users.controller.ts');
const service = read('../apps/api/src/modules/identity/users/users.service.ts');
const api = read('api/users.api.ts');
const hook = read('hooks/queries/useUsers.ts');
const header = read('components/profile/PublicProfileInteractive.tsx');
const keys = read('lib/queryKeys.ts');
const mutation = read('hooks/mutations/useFollowMutations.ts');
const controllerTest = read('../apps/api/tests/unit/users.controller.test.ts');
const serviceTest = read('../apps/api/tests/unit/users.service.test.ts');

const checks = [
  ['Private aggregate route is registered before the public user-id route', routes.indexOf("'/:id/profile-state'") < routes.indexOf("'/:id'")],
  ['Aggregate route requires authentication', /get\('\/:id\/profile-state',\s*authenticate,/.test(routes)],
  ['Controller sends a private no-store response', /Cache-Control',\s*'private, no-store'/.test(controller)],
  ['Service executes follow and presence lookups together', /Promise\.all\(\[[\s\S]*?followsService\.status[\s\S]*?presence\.getPresence/.test(service)],
  ['Self-profile returns defaults without calling downstream lookups', /if \(viewerId === profileUserId\)[\s\S]*?following: false[\s\S]*?online: false/.test(service)],
  ['Frontend exposes the aggregate endpoint', /getProfileInteractionState:[\s\S]*?profile-state/.test(api)],
  ['Query cache key includes profile owner and viewer identity', /profileState: \(profileId: string, viewerId: string\)/.test(keys) && /profileState\(profileUserId, viewerId \?\? 'anonymous'\)/.test(hook)],
  ['Presence indicator and follow action share one query hook', (header.match(/useProfileInteractionState\(user\.id/g) ?? []).length === 2 && !/useIsUserOnline|useFollowStatus/.test(header)],
  ['Follow mutation updates the combined viewer-specific cache', /queryKeys\.users\.profileState\(vars\.targetId, viewerId\)/.test(mutation)],
  ['Controller and service regression tests cover combined state and self-profile behavior', /getProfileInteractionState/.test(controllerTest) && /combines follow status and presence/.test(serviceTest) && /avoids both lookups for the viewer own profile/.test(serviceTest)],
];

for (const [name, passed] of checks) if (!passed) console.error(`FAIL ${name}`);
assert.equal(checks.filter(([, passed]) => passed).length, checks.length, 'API batching phase 3 audit failed');
console.log(`API batching phase 3 audit: ${checks.length}/${checks.length} checks passed`);
