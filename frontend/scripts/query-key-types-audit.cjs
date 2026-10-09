#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const keys = fs.readFileSync(path.join(root, 'lib/queryKeys.ts'), 'utf8');
const findings = [];

// Assert the parameter type is attached to the expected factory member, not
// merely imported elsewhere in the file. API method signatures are the source
// of truth for inline request parameter contracts.
const contracts = [
  ['sales.report', /report:\s*\(params\?: Parameters<typeof salesApi\.report>\[0\]\)/],
  ['follows.my', /follows:\s*\{[\s\S]*?my:\s*\(params\?: Parameters<typeof followsApi\.myFollowing>\[0\]\)/],
  ['follows.followers', /followers:\s*\(type: string, id: string, params\?: Parameters<typeof followsApi\.userFollowers>\[1\]\)/],
  ['follows.following', /following:\s*\(type: string, id: string, params\?: Parameters<typeof followsApi\.userFollowing>\[1\]\)/],
  ['follows.feed', /feed:\s*\(params\?: Parameters<typeof followsApi\.feed>\[0\]\)/],
  ['sellers.ratings', /ratings:\s*\(sellerProfileId: string, params\?: Parameters<typeof sellersApi\.getRatings>\[1\]\)/],
  ['serviceProviders.list', /serviceProviders:\s*\{[\s\S]*?list:\s*\(params\?: Parameters<typeof serviceProvidersApi\.getAll>\[0\]\)/],
  ['serviceProviders.nearby', /nearby:\s*\(params\?: Parameters<typeof serviceProvidersApi\.getNearby>\[0\]\)/],
  ['stores.followed', /followed:\s*\(params\?: Parameters<typeof storesApi\.getMyFollowedStores>\[0\]\)/],
  ['stores.members', /members:\s*\(storeId: string, params\?: Parameters<typeof storeMembersApi\.list>\[1\]\)/],
  ['storeReviews.forStore', /storeReviews:\s*\{[\s\S]*?forStore:\s*\(storeId: string, params\?: Parameters<typeof storesApi\.getReviews>\[1\]\)/],
  ['requests.open', /requests:\s*\{[\s\S]*?open:\s*\(params\?: Parameters<typeof requestsApi\.getOpenFeed>\[0\]\)/],
  ['requests.mine', /mine:\s*\(params\?: Parameters<typeof requestsApi\.getMyRequests>\[0\]\)/],
  ['requests.myOffers', /myOffers:\s*\(params\?: Parameters<typeof requestsApi\.getMyOffers>\[0\]\)/],
  ['serviceRequests.mine', /serviceRequests:\s*\{[\s\S]*?mine:\s*\(params\?: Parameters<typeof serviceRequestsApi\.getMineAsCustomer>\[0\]\)/],
  ['serviceRequests.incoming', /incoming:\s*\(params\?: Parameters<typeof serviceRequestsApi\.getIncomingAsProvider>\[0\]\)/],
  ['serviceReviews.forSeller', /forSeller:\s*\(sellerProfileId: string, params\?: Parameters<typeof serviceReviewsApi\.getForSeller>\[1\]\)/],
  ['appointments.mine', /appointments:\s*\{[\s\S]*?mine:\s*\(params\?: Parameters<typeof appointmentsApi\.getMine>\[0\]\)/],
  ['blockedUsers.all', /blockedUsers:\s*\{[\s\S]*?all:\s*\(params\?: Parameters<typeof blockedUsersApi\.getMine>\[0\]\)/],
  ['favorites.all', /favorites:\s*\{[\s\S]*?all:\s*\(params\?: Parameters<typeof favoritesApi\.getAll>\[0\]\)/],
  ['favorites.entityList', /entityList:\s*\(type: FavoriteEntityKind, params\?: Parameters<typeof favoritesApi\.getAllByType>\[1\]\)/],
  ['activity.mine', /activity:\s*\{[\s\S]*?mine:\s*\(params\?: Parameters<typeof activityApi\.getMine>\[0\]\)/],
  ['myReports.all', /myReports:\s*\{[\s\S]*?all:\s*\(params\?: Parameters<typeof reportsApi\.getMyReports>\[0\]\)/],
  ['search.unified', /search:\s*\{[\s\S]*?unified:\s*\(params\?: Parameters<typeof searchApi\.search>\[0\]\)/],
  ['admin.reports', /admin:\s*\{[\s\S]*?reports:\s*\(params\?: Parameters<typeof adminApi\.getReports>\[0\]\)/],
  ['admin.products', /products:\s*\(params\?: Parameters<typeof adminApi\.getAdminProducts>\[0\]\)/],
  ['admin.serviceListings', /serviceListings:\s*\(params\?: Parameters<typeof adminApi\.getAdminServiceListings>\[0\]\)/],
  ['admin.openRequests', /openRequests:\s*\(params\?: Parameters<typeof adminApi\.getAdminOpenRequests>\[0\]\)/],
];
for (const [name, pattern] of contracts) if (!pattern.test(keys)) findings.push(`${name} is not bound to its API parameter type`);
if (/params\??:\s*object\b/.test(keys)) findings.push('queryKeys.ts still declares params?: object');
if (/<TParams extends object>/.test(keys)) findings.push('queryKeys.ts still has unconstrained generic object params');

const recs = keys.slice(keys.indexOf('recommendations: {'), keys.indexOf('// ── Sales log'));
for (const name of ['GetRecommendationsParams', 'GetProductRecommendationsParams', 'GetServiceRecommendationsParams', 'GetStoreRecommendationsParams', 'GetProviderRecommendationsParams', 'GetMixedRecommendationsParams']) {
  if (!recs.includes(name)) findings.push(`recommendations.${name} API contract missing`);
}
if (!/stores:[\s\S]*?scope\?: 'guest' \| 'user'[\s\S]*?\.\.\.\(scope \? \[scope\] : \[\]\)/.test(recs)) findings.push('recommendations.stores does not isolate guest/user scope');
if (!/providers:[\s\S]*?params \?\? \{\}[\s\S]*?\.\.\.\(scope \? \[scope\] : \[\]\)/.test(recs)) findings.push('recommendations.providers does not normalize params/scope');

const hookContracts = [
  ['hooks/queries/useSales.ts', ['Parameters<typeof salesApi.report>[0]']],
  ['hooks/queries/useFollows.ts', ['Parameters<typeof followsApi.myFollowing>[0]', 'Parameters<typeof followsApi.userFollowers>[1]', 'Parameters<typeof followsApi.userFollowing>[1]', 'Parameters<typeof followsApi.feed>[0]']],
  ['hooks/queries/useRequests.ts', ['Parameters<typeof requestsApi.getOpenFeed>[0]', 'Parameters<typeof requestsApi.getMyRequests>[0]', 'Parameters<typeof requestsApi.getMyOffers>[0]']],
  ['hooks/queries/useAdmin.ts', ['Parameters<typeof adminApi.getReports>[0]', 'Parameters<typeof adminApi.getAdminProducts>[0]', 'Parameters<typeof adminApi.getAdminServiceListings>[0]', 'Parameters<typeof adminApi.getAdminOpenRequests>[0]']],
];
for (const [relativePath, patterns] of hookContracts) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  for (const pattern of patterns) if (!source.includes(pattern)) findings.push(`${relativePath} is not bound to ${pattern}`);
}

if (findings.length) {
  console.error(`[query-key-types-audit] FAIL: ${findings.length} contract violation(s)`);
  findings.forEach((finding) => console.error(` - ${finding}`));
  process.exit(1);
}
console.log(`[query-key-types-audit] PASS: ${contracts.length} API-bound query-key contracts, hook/API parameter coupling, and recommendation scope/default invariants verified`);
