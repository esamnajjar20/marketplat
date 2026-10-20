/** Guardrails ensuring route fallbacks share one maintained loading system. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = path.join(root, 'app');
const checks = [];
const check = (label, pass) => checks.push([label, Boolean(pass)]);
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const loadingState = read('components/shared/feedback/LoadingState.tsx');
const routeState = read('components/shared/RouteLoadingState.tsx');
const pageState = read('components/shared/feedback/PageLoadingState.tsx');
const spinnerFacade = read('components/shared/feedback/LoadingSpinner.tsx');
const rootLoading = read('app/loading.tsx');

check('LoadingState owns all supported loading presentation variants', ['page', 'section', 'inline', 'overlay'].every((v) => loadingState.includes(`'${v}'`)));
check('LoadingState has a single accessible status wrapper', loadingState.includes("role: 'status'") && loadingState.includes("'aria-live': 'polite'") && loadingState.includes("'aria-busy': true"));
check('RouteLoadingState delegates to LoadingState', routeState.includes("from '@/components/shared/feedback/LoadingState'") && routeState.includes('<LoadingState'));
check('legacy LoadingSpinner delegates to LoadingState', spinnerFacade.includes("from '@/components/shared/feedback/LoadingState'") && spinnerFacade.includes('<LoadingState'));
check('specialized skeleton layouts retain the shared spinner primitive and accessible status', pageState.includes("from '@/components/shared/feedback/LoadingState'") && pageState.includes('role="status"') && pageState.includes('aria-busy="true"') && pageState.includes('announce={false}'));
check('root fallback shares the route-group fallback component', rootLoading.includes('RouteLoadingState'));

const routeFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name === 'loading.tsx') routeFiles.push(full);
  }
}
walk(app);
let unified = 0;
for (const file of routeFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const relative = path.relative(root, file).replaceAll(path.sep, '/');
  const approved = /RouteLoadingState|PageLoadingState/.test(source);
  check(`${relative} uses an approved shared loading component`, approved);
  if (approved) unified++;
  check(`${relative} does not define a route-local spinner`, !/import\s*\{\s*(?:Spinner|Skeleton)\s*\}\s*from/.test(source));
}

const failures = checks.filter(([, ok]) => !ok);
console.log(`Loading unification audit: ${checks.length - failures.length}/${checks.length} checks passed; ${unified}/${routeFiles.length} route fallbacks use shared components.`);
for (const [label] of failures) console.error(`FAIL: ${label}`);
if (failures.length) process.exitCode = 1;
