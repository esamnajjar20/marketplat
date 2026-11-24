import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const stories = read('src/modules/engagement/stories/stories.service.ts');
const storyRepository = read('src/modules/engagement/stories/stories.repository.ts');
const follows = read('src/modules/engagement/follows/follows.service.ts');
const reports = read('src/modules/trust/reports/reports.service.ts');
const users = read('src/modules/identity/users/users.service.ts');
const webProfile = read('../../frontend/components/profile/PublicProfileInteractive.tsx');
const mobileProfile = read('../../apps/mobile/app/profile/[id].tsx');
const blockedUsersScreen = read('../../apps/mobile/app/blocked-users.tsx');
const tests = [
  ['canView checks blocks in either direction for restricted stories', /async function canView[\s\S]*?isBlockedEitherDirection\(viewerId, story\.userId\)/.test(stories)],
  ['userStories hides follower-only stories after a block', /interactionBlocked[\s\S]*?isBlockedEitherDirection\(viewerId, userId\)[\s\S]*?const followsAuthor/.test(stories)],
  ['stories feed filters blocked authors', /blockedRelationships[\s\S]*?blockedAuthorIds[\s\S]*?!blockedAuthorIds\.has/.test(stories)],
  ['public story visibility remains unchanged', /story\.visibility === StoryVisibility\.PUBLIC/.test(stories)],
  ['story limit count and insert execute in a serializable transaction', /prisma\.\$transaction\([\s\S]*?tx\.story\.count[\s\S]*?tx\.story\.create[\s\S]*?TransactionIsolationLevel\.Serializable/.test(stories)],
  ['failed story persistence cleans the uploaded Cloudinary image', /if \(uploaded\?\.publicId && !storyPersisted\)[\s\S]*?deleteCloudinaryAsset/.test(stories)],
  ['story feed selects latest 20 per author using row numbering', /ROW_NUMBER\(\) OVER[\s\S]*?PARTITION BY "userId"[\s\S]*?ORDER BY "createdAt" DESC[\s\S]*?author_rank <=/.test(storyRepository)],
  ['story repository has no silent global 500-row limit', !/take:\s*500/.test(storyRepository)],
  ['store Follow and StoreFollower writes share a transaction', /targetType === FollowTargetType\.STORE[\s\S]*?prisma\.\$transaction\([\s\S]*?tx\.follow\.create[\s\S]*?tx\.storeFollower\.upsert/.test(follows)],
  ['following feed applies active store, seller and provider filters', follows.includes("status: 'ACTIVE'") && follows.includes('suspended: false') && follows.includes('user: { isActive: true }')],
  ['bulk moderation sends decisions for updated reports only', /result\.updated\.forEach\(report => notifyModerationDecision\(report, input\.status\)\)/.test(reports)],
  ['moderation notifications do not include private notes', !/notes:\s*report\.notes/.test(reports)],
  ['profile state exposes a direction-neutral interaction restriction', /interactionRestricted,/.test(users) && /isBlockedEitherDirection/.test(users)],
  ['web follow button waits for a loaded interaction state', webProfile.includes('profileState?.following === true') && webProfile.includes('authenticated && currentUserId !== user.id && !profileState') && webProfile.includes('disabled={isFetching}')],
  ['web profile actions are suppressed when interaction is restricted', webProfile.includes('profileState?.interactionRestricted')],
  ['mobile follow and message actions fail closed until interaction state is known', mobileProfile.includes('interactionRestricted !== false') && mobileProfile.includes('interactionRestricted === true')],
  ['mobile blocked-user list loads further pages', blockedUsersScreen.includes('usePaginatedList') && blockedUsersScreen.includes('onEndReached') && blockedUsersScreen.includes('list.loadMore()')],
  ['block-aware story unit tests are present', fs.existsSync(path.join(root, 'tests/unit/stories.block-visibility.test.ts'))],
  ['atomic store-follow unit tests are present', fs.existsSync(path.join(root, 'tests/unit/follows.store-toggle.test.ts'))],
];

let failed = 0;
for (const [name, passed] of tests) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
  if (!passed) failed += 1;
}
if (failed) {
  console.error(`${failed} community/trust verification checks failed.`);
  process.exitCode = 1;
} else {
  console.log(`Community/trust Phase 10 verification passed (${tests.length} checks).`);
}
