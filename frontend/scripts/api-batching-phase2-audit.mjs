#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const router = read('../apps/api/src/modules/service-providers/service-providers.routes.ts');
const controller = read('../apps/api/src/modules/service-providers/service-providers.controller.ts');
const validation = read('../apps/api/src/modules/service-providers/service-providers.validation.ts');
const service = read('../apps/api/src/modules/service-providers/service-providers.service.ts');
const api = read('api/service-providers.api.ts');
const query = read('hooks/queries/useServiceProviders.ts');
const hub = read('components/services/MyServicesHub.tsx');
const list = read('components/services/MyServiceListingsList.tsx');
const params = read('lib/myServicesWorkspace.ts');
const bootstrap = read('providers/AuthHydrationProvider.tsx');
const mutations = read('hooks/mutations/useServiceRequestMutations.ts');
const appointments = read('hooks/mutations/useAppointmentMutations.ts');
const listingsMutations = read('hooks/mutations/useServiceListingMutations.ts');

check(router.indexOf("'/me/dashboard'") < router.indexOf("'/:id'"), 'dashboard route must be registered before the public :id route');
check(/'\/me\/dashboard',[\s\S]*?authenticate,[\s\S]*?CACHE\.NONE/.test(router), 'dashboard route must require authentication and disable shared caching');
check(/serviceProviderDashboardQuerySchema/.test(controller) && /serviceProviderDashboardQuerySchema/.test(validation), 'controller must validate period and listing filters with the dashboard schema');
check(/findManyByProviderId/.test(service) && /Promise\.all\(\[\s*getServiceProviderAnalyticsFor[\s\S]*?findManyByProviderId/.test(service), 'dashboard service must combine analytics and the requested own-listings page concurrently');
check(/listings:\s*\{\s*items: listingResult\.listings/.test(service), 'dashboard response must include the paginated own-listings payload');
check(/getMyDashboard/.test(api) && /params,/.test(api) && /\/service-providers\/me\/dashboard/.test(api), 'frontend API client must pass filters to the combined dashboard endpoint');
check(/workspaceDashboard\([\s\S]*?normalizedParams/.test(query), 'dashboard query key must include canonical listing filters');
check(/workspaceDashboard\([\s\S]*?userId \?\? 'anonymous'/.test(query), 'dashboard cache key must be isolated per authenticated user');
check(/analyticsForPeriod\(userId \?\? 'anonymous', period\)/.test(query), 'analytics cache key must be isolated per authenticated user');
check(/setQueryData\([\s\S]*analyticsForPeriod/.test(query), 'overview response must seed the lazy analytics tab cache');
check(/analyticsIsFresh/.test(query) && /serviceListingsApi\.getMine/.test(query), 'URL-only list changes must reuse fresh analytics instead of recomputing the dashboard');
check(/myServicesWorkspaceParamsFromSearchParams/.test(hub) && /useMyServiceProvider\(\)/.test(hub), 'hub must reuse bootstrap-seeded provider identity and canonical filters');
check(/bootstrap\.serviceProvider != null/.test(bootstrap) && /queryKeys\.serviceProviders\.me\(\)/.test(bootstrap), 'provider identity must continue to come from auth bootstrap without duplication in dashboard response');
check(/useMyServiceProviderDashboard/.test(list) && /dashboard\?\.listings/.test(list) && !/useMyServiceListings/.test(list), 'list component must consume the same combined query rather than a separate list request');
check(/myServicesWorkspaceParamsFromSearchParams/.test(params) && /normalizeMyServicesWorkspaceParams/.test(params), 'both components must normalize URL filters consistently');
check(/workspaceDashboardRoot/.test(mutations), 'service request changes must invalidate workspace dashboard data');
check(/workspaceDashboardRoot/.test(appointments), 'appointment changes must invalidate workspace dashboard data');
check(/workspaceDashboardRoot/.test(listingsMutations), 'service listing changes must invalidate workspace dashboard data');
check(/useMyServiceProviderAnalytics\(period\)/.test(read('components/services/MyServiceProviderAnalytics.tsx')), 'analytics tab must retain its period-specific lazy query');

console.log(`API batching phase 2 audit: ${failures.length ? 'FAILED' : 'PASSED'}`);
if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
}
