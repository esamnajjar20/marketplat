import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
function check(name, condition, detail = '') {
  checks.push({ name, pass: Boolean(condition), detail });
}
function hasClientDirective(source) {
  const sf = ts.createSourceFile('check.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return sf.statements.some((statement) =>
    ts.isExpressionStatement(statement) &&
    ts.isStringLiteral(statement.expression) &&
    statement.expression.text === 'use client'
  );
}

const rootLayout = read('app/layout.tsx');
const appProviders = read('providers/AppProviders.tsx');
const authenticatedPresence = read('components/shared/AuthenticatedPresence.tsx');
const optionalTools = read('components/debug/RootOptionalClientTools.tsx');
const productCard = read('components/stores/ProductCard.tsx');
const promotedPage = read('app/(public)/promoted/page.tsx');
const serviceDetailPage = read('app/(public)/services/[id]/page.tsx');
const storeCard = read('components/stores/StoreCard.tsx');
const serviceCard = read('components/services/ServiceListingCard.tsx');
const displayParts = read('components/shared/cards/cardDisplayParts.tsx');
const offlineBadge = read('components/shared/cards/CardOfflineBadge.tsx');
const relativeTime = read('components/shared/cards/CardRelativeTime.tsx');
const scheduler = read('components/shared/cards/useNowAfterMount.ts');
const cardBarrel = read('components/shared/cards/cardParts.tsx');

check('Root layout imports only the small optional-tools gate',
  rootLayout.includes("from '@/components/debug/RootOptionalClientTools'") &&
  !rootLayout.includes("from '@/components/debug/AdminScriptConsole'") &&
  !rootLayout.includes("from '@/components/debug/ErudaDebug'") &&
  !rootLayout.includes("from '@/components/shared/FloatingDebugConsole'"));
check('Presence heartbeat is loaded only after verified authentication',
  appProviders.includes("import { AuthenticatedPresence } from '@/components/shared/AuthenticatedPresence'") &&
  !appProviders.includes("import { PresenceHeartbeat } from '@/components/shared/PresenceHeartbeat'") &&
  authenticatedPresence.includes("import('./PresenceHeartbeat')") &&
  authenticatedPresence.includes('state.isHydrated &&') &&
  authenticatedPresence.includes('!state.isAuthResolving') &&
  authenticatedPresence.includes('state.isAuthenticated &&') &&
  authenticatedPresence.includes('Boolean(state.accessToken)'));
check('Admin developer console is dynamically loaded',
  optionalTools.includes("import('./AdminScriptConsole')") && optionalTools.includes('isAdmin ? <AdminScriptConsole />'));
check('Floating debug console is conditionally dynamically loaded',
  optionalTools.includes("import('@/components/shared/FloatingDebugConsole')") && optionalTools.includes('floatingConsoleEnabled ? <FloatingDebugConsole />'));
check('Eruda is excluded from production module graph',
  optionalTools.includes("process.env.NODE_ENV === 'development'") && optionalTools.includes("import('./ErudaDebug')"));
check('Admin console gate waits for auth hydration and role',
  optionalTools.includes('state.isHydrated') && optionalTools.includes('state.isAuthenticated') &&
  optionalTools.includes('!state.isAuthResolving') &&
  optionalTools.includes("state.user?.role === 'ADMIN'") && optionalTools.includes("state.user?.role === 'SUPER_ADMIN'"));
check('ProductCard is server-capable', !hasClientDirective(productCard) &&
  !/\buseNowAfterMount\s*\(/.test(productCard) && productCard.includes('<CardRelativeTime date={product.createdAt} />'));
check('ProductCard is rendered from a Server Component route',
  !hasClientDirective(promotedPage) && promotedPage.includes("from '@/components/stores/ProductCard'"));
check('Service breadcrumb is rendered from a Server Component route',
  !hasClientDirective(serviceDetailPage) && serviceDetailPage.includes('<ServiceBreadcrumb '));
check('StoreCard consumes the server-safe card barrel',
  !hasClientDirective(storeCard) && storeCard.includes("from '@/components/shared/cards/cardParts'"));
check('ServiceListingCard is server-capable', !hasClientDirective(serviceCard) &&
  !/\buse(State|Effect|Memo|Callback|Ref|SyncExternalStore|Query|Mutation|InfiniteQuery)\s*\(/.test(serviceCard));
check('Static card badges have no client boundary', !hasClientDirective(displayParts));
check('Offline status remains an isolated client leaf', hasClientDirective(offlineBadge) && offlineBadge.includes('useOnlineStatus()'));
check('Relative-time scheduler is an isolated client leaf', hasClientDirective(relativeTime) &&
  relativeTime.includes('useNowAfterMount(true, date)') && hasClientDirective(scheduler));
check('Legacy card barrel is a server-safe re-export module', !hasClientDirective(cardBarrel) &&
  cardBarrel.includes("export { CardOfflineBadge } from './CardOfflineBadge'") &&
  !cardBarrel.includes('useNowAfterMount'));
check('Relative-time hook consumers import its explicit client module directly',
  ['components/ads/AdCard.tsx', 'components/requests/RequestCard.tsx',
   'components/shared/HydrationSafeRelativeTime.tsx', 'components/messages/ChatMessageRow.tsx',
   'components/messages/ConversationRow.tsx'].every((file) => {
    const source = read(file);
    return source.includes("from '@/components/shared/cards/useNowAfterMount'") ||
      source.includes("from './useNowAfterMount'");
  }));

for (const file of [
  'components/services/ServiceBreadcrumb.tsx',
  'components/search/UnifiedResultCard.tsx',
  'components/shared/UserAvatar.tsx',
  'components/shared/feedback/SuccessCard.tsx',
]) {
  check(`${file} is not a forced client boundary`, !hasClientDirective(read(file)));
}

// Syntax-parse every TS/TSX file touched by this phase. This is deliberately
// reported as syntax validation, not a substitute for tsc type-check/build.
const changedFiles = [
  'app/layout.tsx',
  'providers/AppProviders.tsx',
  'components/shared/AuthenticatedPresence.tsx',
  'components/ads/AdCard.tsx',
  'components/requests/RequestCard.tsx',
  'components/shared/HydrationSafeRelativeTime.tsx',
  'components/messages/ChatMessageRow.tsx',
  'components/messages/ConversationRow.tsx',
  'components/debug/RootOptionalClientTools.tsx',
  'components/stores/ProductCard.tsx',
  'components/services/ServiceListingCard.tsx',
  'components/services/ServiceBreadcrumb.tsx',
  'components/search/UnifiedResultCard.tsx',
  'components/shared/UserAvatar.tsx',
  'components/shared/feedback/SuccessCard.tsx',
  'components/shared/cards/cardTypes.ts',
  'components/shared/cards/cardDisplayParts.tsx',
  'components/shared/cards/CardOfflineBadge.tsx',
  'components/shared/cards/CardRelativeTime.tsx',
  'components/shared/cards/useNowAfterMount.ts',
  'components/shared/cards/cardParts.tsx',
  '__tests__/components/CardRelativeTime.test.tsx',
];
let syntaxOk = true;
let diagnosticsCount = 0;
for (const file of changedFiles) {
  const source = read(file);
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const diagnostics = parsed.parseDiagnostics ?? [];
  diagnosticsCount += diagnostics.length;
  if (diagnostics.length) {
    syntaxOk = false;
    for (const diagnostic of diagnostics) {
      const pos = diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
      console.error(`  ${file}:${(pos?.line ?? 0) + 1}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
    }
  }
}
check('All phase-4 TS/TSX files parse', syntaxOk, `${changedFiles.length} files; ${diagnosticsCount} parser diagnostics`);

const passed = checks.filter((entry) => entry.pass).length;
console.log(`RSC boundary phase 4 audit: ${passed}/${checks.length} passed`);
for (const entry of checks) {
  console.log(`${entry.pass ? 'PASS' : 'FAIL'} ${entry.name}${entry.detail ? ` — ${entry.detail}` : ''}`);
}
if (passed !== checks.length) process.exitCode = 1;
