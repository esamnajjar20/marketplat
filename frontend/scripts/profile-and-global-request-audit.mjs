#!/usr/bin/env node
/** Guardrails for self-profile and root-mounted request lifecycles. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const profile = read('components/profile/PublicProfileInteractive.tsx');
const follows = read('hooks/queries/useFollows.ts');
const presence = read('hooks/queries/usePresence.ts');
const stories = read('hooks/queries/useStories.ts');
const blockGate = read('components/profile/BlockUserButtonGate.tsx');
const heartbeatGate = read('components/shared/AuthenticatedPresence.tsx');
const heartbeat = read('components/shared/PresenceHeartbeat.tsx');
const optionalTools = read('components/debug/RootOptionalClientTools.tsx');
const adminConsole = read('components/debug/AdminScriptConsole.tsx');
const adminSetting = read('lib/adminDeveloperToolsSetting.ts');
const profilePage = read('app/(public)/profile/[id]/page.tsx');

check(/useProfileInteractionState\(user\.id,\s*!isOwnProfile\)/.test(profile), 'self profile avatar interaction query is not disabled');
check(/useProfileInteractionState\(user\.id,\s*currentUserId\s*!==\s*user\.id\)/.test(profile), 'self profile follow/presence aggregate query is not disabled');
check(/enabled:\s*enabled\s*&&\s*authenticated\s*&&\s*hasToken\s*&&\s*online\s*&&\s*Boolean\(userId\)/.test(stories), 'user stories are not gated by explicit user intent and a live session');
check(/useUserStories\(user\.id,\s*storiesRequested\)/.test(profile), 'profile story query is not disabled until avatar interaction');
check(/enabled:\s*Boolean\(currentUser\s*&&\s*currentUser\.id\s*!==\s*targetUserId\)/.test(blockGate), 'self profile still queries block status');
check(/state\.isHydrated\s*&&\s*!state\.isAuthResolving/.test(heartbeatGate), 'presence heartbeat can start before auth restore finishes');
check(/!state\.isAuthResolving/.test(optionalTools), 'root admin tools are not gated by auth restore');
check(/!authResolving/.test(adminConsole), 'admin console can query settings while auth restore is in progress');
check(/5\s*\*\s*60_000/.test(adminSetting), 'admin developer-tools setting cache TTL is not five minutes');
check(/fetchServerApi<PublicUser>/.test(profilePage) && /const getCachedUser = cache\(async/.test(profilePage), 'profile page does not use the shared request-scoped Server API reader');
check(/getCsrfToken\(\)/.test(heartbeat), 'presence heartbeat lost its CSRF readiness guard');

// The previous public-page pass disabled speculation. Keep the existing rule
// visible here so profile-specific work cannot regress it silently.
const link = read('components/navigation/IntentPrefetchLink.tsx');
check(/prefetchOnIntent\s*=\s*false/.test(link), 'intent prefetch must remain opt-in');

console.log(`Profile/global request audit: ${failures.length ? 'FAILED' : 'PASSED'}`);
console.log('Scope: self-profile queries, on-demand stories, auth bootstrap, global admin setting, and SSR profile fetch.');
if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
}
