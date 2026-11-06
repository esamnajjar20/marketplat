#!/usr/bin/env node
/**
 * perf:bundle-report — تقرير First Load JS لكل route (gzip) من مخرجات `next build`.
 *
 * الاستخدام:
 *   npm run build && npm run perf:bundle-report
 *   npm run perf:bundle-report -- --top=25            # عدد الصفوف
 *   npm run perf:bundle-report -- --fail=1            # يفشل (exit 1) عند تجاوز الميزانية (للـ CI)
 *   npm run perf:bundle-report -- --budget=/products/[id]=260   # ميزانية route واحد (KB gzip)
 *
 * المصدر: .next/app-build-manifest.json (ملفات كل route) + gzip فعلي لكل chunk.
 * الأرقام gzip (تقريب لما يُنقل على الشبكة)، وليست أرقام جدول `next build` (تلك مضغوطة بطريقة مختلفة).
 * الميزانية الافتراضية للـ route العام 300 KB وللطبقة المشتركة 140 KB؛ تُعدَّل أدناه.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = process.cwd();
const NEXT_DIR = path.join(ROOT, '.next');
const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=') || '1'];
  }),
);
const budgetArgs = process.argv.slice(2).filter((a) => a.startsWith('--budget=')).map((a) => a.slice(9));

const DEFAULT_ROUTE_BUDGET_KB = 300;
const SHARED_BUDGET_KB = 140;
const ROUTE_BUDGETS_KB = {
  // route → KB gzip. أضف هنا قيود صفحات محددة بعد القياس الأول.
};
for (const b of budgetArgs) {
  const i = b.lastIndexOf('=');
  if (i > 0) ROUTE_BUDGETS_KB[b.slice(0, i)] = Number(b.slice(i + 1));
}

function fail(msg) {
  console.error(`[bundle-report] ${msg}`);
  process.exit(2);
}

const manifestPath = path.join(NEXT_DIR, 'app-build-manifest.json');
if (!fs.existsSync(manifestPath)) fail('لا يوجد .next/app-build-manifest.json — شغّل `npm run build` أولًا.');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const pages = manifest.pages ?? {};

const gzCache = new Map();
function gzipKB(file) {
  if (gzCache.has(file)) return gzCache.get(file);
  const abs = path.join(NEXT_DIR, file);
  let size = 0;
  try {
    size = zlib.gzipSync(fs.readFileSync(abs), { level: 9 }).length / 1024;
  } catch {
    size = 0;
  }
  gzCache.set(file, size);
  return size;
}

const jsOnly = (files) => [...new Set(files)].filter((f) => f.endsWith('.js'));

// الطبقة المشتركة = ملفات تظهر في كل route (تقاطع كل الصفحات).
const routes = Object.entries(pages).filter(([r]) => /\/page$/.test(r));
if (!routes.length) fail('لم أجد routes من نوع page في app-build-manifest.json.');
let shared = null;
for (const [, files] of routes) {
  const set = new Set(jsOnly(files));
  shared = shared ? new Set([...shared].filter((f) => set.has(f))) : set;
}
const sharedKB = [...(shared ?? [])].reduce((n, f) => n + gzipKB(f), 0);

const rows = routes
  .map(([route, files]) => {
    const js = jsOnly(files);
    const total = js.reduce((n, f) => n + gzipKB(f), 0);
    const own = js.filter((f) => !shared.has(f)).reduce((n, f) => n + gzipKB(f), 0);
    const clean = route.replace(/\/page$/, '').replace(/\/\([^/]+\)/g, '') || '/';
    return { route: clean, total, own };
  })
  .sort((a, b) => b.total - a.total);

const top = Number(args.top ?? 30);
const pad = (s, n) => String(s).padEnd(n);
console.log(`\nShared JS (gzip): ${sharedKB.toFixed(1)} KB  (budget ${SHARED_BUDGET_KB} KB)`);
console.log(`\n${pad('Route', 46)}${pad('First Load', 14)}${pad('Route-own', 12)}Budget`);
let violations = 0;
for (const r of rows.slice(0, top)) {
  const budget = ROUTE_BUDGETS_KB[r.route] ?? DEFAULT_ROUTE_BUDGET_KB;
  const over = r.total > budget;
  if (over) violations += 1;
  console.log(`${pad(r.route, 46)}${pad(r.total.toFixed(1) + ' KB', 14)}${pad(r.own.toFixed(1) + ' KB', 12)}${budget} KB${over ? '  ⚠ OVER' : ''}`);
}
const overAll = rows.filter((r) => r.total > (ROUTE_BUDGETS_KB[r.route] ?? DEFAULT_ROUTE_BUDGET_KB)).length;
const sharedOver = sharedKB > SHARED_BUDGET_KB;
console.log(`\nroutes: ${rows.length} · over budget: ${overAll}${sharedOver ? ' · shared layer over budget' : ''}`);

if (args.fail === '1' && (overAll > 0 || sharedOver)) {
  console.error('[bundle-report] تجاوز الميزانية — فشل البناء (--fail=1).');
  process.exit(1);
}
