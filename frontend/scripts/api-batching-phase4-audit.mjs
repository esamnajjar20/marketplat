import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [
  ['authenticated dashboard aggregate route', /activityRouter\.get\('\/dashboard',\s*authenticate,\s*CACHE\.NONE,\s*activityController\.getDashboardOverview\)/.test(read('../apps/api/src/modules/activity/activity.routes.ts'))],
  ['activity and attention fetched concurrently', /Promise\.allSettled\([\s\S]*activityService\.getMyActivity[\s\S]*sellersService\.getMyAttention/.test(read('../apps/api/src/modules/activity/activity.controller.ts'))],
  ['partial failures remain isolated', /activityResult\.status === 'fulfilled'[\s\S]*attentionResult\.status === 'fulfilled'[\s\S]*activityResult\.status === 'rejected'[\s\S]*attentionResult\.status === 'rejected'/.test(read('../apps/api/src/modules/activity/activity.controller.ts'))],
  ['dashboard endpoint uses private no-store middleware', /activityRouter\.get\('\/dashboard',\s*authenticate,\s*CACHE\.NONE/.test(read('../apps/api/src/modules/activity/activity.routes.ts'))],
  ['shared dashboard query key is user scoped', /dashboard:\s*\(userId: string \| null\) => \['activity', 'dashboard', userId\]/.test(read('lib/queryKeys.ts'))],
  ['dashboard hook uses one aggregate API call', /activityApi\.getDashboardOverview\(\{ signal \}\)/.test(read('hooks/queries/useActivity.ts'))],
  ['activity preview consumes shared result', /useDashboardOverview/.test(read('components/profile/RecentActivityFeed.tsx'))],
  ['seller tasks consume shared result', /useDashboardOverview/.test(read('components/profile/SellerTodayTasks.tsx'))],
  ['full activity timeline remains independent', /activityApi\.getMine\(params, \{ signal \}\)/.test(read('hooks/queries/useActivity.ts'))],
  ['store hub attention query remains available', /export function useMyAttention\(/.test(read('hooks/queries/useSellers.ts'))],
];
let failed = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
  if (!passed) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exitCode = failed ? 1 : 0;
