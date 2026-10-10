import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const conversationsApi = read('api/conversations.api.ts');
const serviceRequestsApi = read('api/service-requests.api.ts');
const requestsApi = read('api/requests.api.ts');
const conversations = read('hooks/queries/useConversations.ts');
const serviceRequests = read('hooks/queries/useServiceRequests.ts');
const requests = read('hooks/queries/useRequests.ts');
const checks = [
  ['conversation read APIs accept Axios config', /getMine: \(params\?: ConversationsQuery, config\?: AxiosRequestConfig\)/.test(conversationsApi) && /getMessages: \(id: string, params\?: MessagesQuery, config\?: AxiosRequestConfig\)/.test(conversationsApi)],
  ['service request read APIs accept Axios config', /getById: \(id: string, config\?: AxiosRequestConfig\)/.test(serviceRequestsApi) && /getMineAsCustomer: \(params\?: ServiceRequestsQuery, config\?: AxiosRequestConfig\)/.test(serviceRequestsApi) && /getIncomingAsProvider: \(params\?: ServiceRequestsQuery, config\?: AxiosRequestConfig\)/.test(serviceRequestsApi)],
  ['request feed/detail APIs accept Axios config', /getOpenFeed:[\s\S]*?config\?: AxiosRequestConfig/.test(requestsApi) && /getMyRequests:[\s\S]*?config\?: AxiosRequestConfig/.test(requestsApi) && /getMyOffers:[\s\S]*?config\?: AxiosRequestConfig/.test(requestsApi) && /getById: \(id: string, config\?: AxiosRequestConfig\)/.test(requestsApi)],
  ['conversation queryFns pass TanStack signals', (conversations.match(/queryFn: async \(\{ signal \}\)/g) ?? []).length === 5 && (conversations.match(/\{ signal \}/g) ?? []).length >= 5],
  ['aborted conversation queries do not fall back to cached success', (conversations.match(/if \(signal\.aborted\) throw/g) ?? []).length === 5],
  ['service request queryFns pass signals', (serviceRequests.match(/queryFn: \(\{ signal \}\)/g) ?? []).length === 3 && (serviceRequests.match(/\{ signal \}/g) ?? []).length >= 3],
  ['request queryFns pass signals', (requests.match(/queryFn: async \(\{ signal \}\)/g) ?? []).length === 4 && /getOpenFeed\(params, \{ signal \}\)/.test(requests) && /getMyRequests\(params, \{ signal \}\)/.test(requests) && /getMyOffers\(params, \{ signal \}\)/.test(requests) && /getById\(id, \{ signal \}\)/.test(requests)],
];
let failed = 0;
for (const [name, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  if (!pass) failed++;
}
console.log(`Query abort signal audit: ${checks.length - failed}/${checks.length} passed`);
assert.equal(failed, 0, `${failed} query abort signal audit checks failed`);
