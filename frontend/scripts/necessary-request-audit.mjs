#!/usr/bin/env node
/** Guardrails for avoiding reads that the current screen does not need. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const blockedHook = read('hooks/queries/useBlockedUsers.ts');
const chat = read('components/messages/ChatWindow.tsx');
const blockApi = read('api/blocked-users.api.ts');
const blockRoutes = read('../apps/api/src/modules/blocked-users/blocked-users.routes.ts');
const conversationsService = read('../apps/api/src/modules/conversations/conversations.service.ts');
const blockRepository = read('../apps/api/src/modules/blocked-users/blocked-users.repository.ts');
const messagesLayout = read('app/(protected)/messages/layout.tsx');
const mobileNav = read('components/layout/ProtectedMobileNav.tsx');

check(/queryKeys\.blockedUsers\.status\(userId\)/.test(blockedHook), 'per-user block-status query is missing');
check(/blockedUsersApi\.getStatus\(userId/.test(blockedHook), 'per-user status query does not call the narrow endpoint');
check(!/useMyBlockedUsers\(\{\s*limit:\s*100\s*\}\)/.test(blockedHook), 'per-user status hook fetches the full blocked-users list');
check(/\/\$\{encodeURIComponent\(userId\)\}\/status/.test(blockApi), 'frontend per-user status URL is missing or does not encode the id');
check(/blockedUsersRouter\.get\('\/:userId\/status'/.test(blockRoutes), 'authenticated single-user status route is missing');
check(/getBlockedIdsByBlocker\(userId, otherPartyIds\)/.test(conversationsService), 'conversation list does not batch the viewer block statuses');
check(/return\s+\{\s*\.\.\.conversation,\s*isBlockedByMe,\s*otherPartyPresence\s*\}/s.test(conversationsService), 'conversation detail response does not include viewer block status and presence');
check(/blockedId:\s*\{\s*in:\s*uniqueIds\s*\}/.test(blockRepository), 'conversation status batch query is not bounded to current page users');
check(/initialStatus:\s*typeof conversation\?\.isBlockedByMe/.test(chat), 'chat does not seed block status from its existing conversation response');
check(/enabled:\s*Boolean\(party\)\s*&&\s*typeof conversation\?\.isBlockedByMe !== 'boolean'/.test(chat), 'chat fallback status request is not limited to missing legacy/offline data');
check(/shouldRenderConversationList\s*=\s*isInboxRoute\s*\|\|\s*isDesktop/.test(messagesLayout), 'mobile conversation list is not gated by the current visible layout');
check(/\{shouldRenderConversationList\s*&&\s*\(/.test(messagesLayout), 'hidden conversation list still mounts and can issue requests');
check(/useMyStore\(\{\s*enabled:\s*isSeller\s*&&\s*isOpen\s*\}\)/.test(mobileNav), 'closed off-canvas mobile nav still loads store data');

console.log(`necessary request audit: ${failures.length ? 'FAILED' : 'PASSED'}`);
if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
}
