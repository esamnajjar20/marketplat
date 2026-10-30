#!/usr/bin/env node
/**
 * Regression guard for the high-priority UI/UX audit findings.
 * Computes actual relative-luminance contrast from the app's source tokens,
 * then checks that key reusable controls and screens use the approved tokens.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, '..');
const repoRoot = join(appRoot, '..', '..');
const read = (p) => readFile(join(repoRoot, p), 'utf8');
const tokens = await read('apps/mobile/src/theme/tokens.ts');
const uiStyles = await read('apps/mobile/src/components/ui/styles.ts');
const feedback = await read('apps/mobile/src/components/ui/Feedback.tsx');
const field = await read('apps/mobile/src/components/ui/Field.tsx');
const bottomNav = await read('apps/mobile/src/components/BottomNavigation.tsx');
const search = await read('apps/mobile/app/search.tsx');
const editor = await read('apps/mobile/app/ad-editor.tsx');
const productEditor = await read('apps/mobile/app/product-editor.tsx');
const checkout = await read('apps/mobile/app/order-checkout.tsx');
const sales = await read('apps/mobile/app/my-sales.tsx');
const storeDetail = await read('apps/mobile/app/stores/[id].tsx');
const servicesHours = await read('apps/mobile/app/service-provider-hours.tsx');

function tokenColor(name) {
  const match = tokens.match(new RegExp(`\\b${name}\\s*:\\s*['\"](#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}))['\"]`));
  assert.ok(match, `Missing color token: ${name}`);
  let hex = match[1].slice(1);
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}
function luminance(color) {
  const linear = color.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}
function contrast(a, b) {
  const l1 = luminance(tokenColor(a));
  const l2 = luminance(tokenColor(b));
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const checks = [];
function check(label, fn) {
  fn();
  checks.push(label);
  console.log(`✅ ${label}`);
}

check(`warningText/warningSoft contrast ${contrast('warningText', 'warningSoft').toFixed(2)}:1 >= 4.5:1`, () => assert.ok(contrast('warningText', 'warningSoft') >= 4.5));
check(`warningText/canvas contrast ${contrast('warningText', 'canvas').toFixed(2)}:1 >= 4.5:1`, () => assert.ok(contrast('warningText', 'canvas') >= 4.5));
check(`controlBorder/surface contrast ${contrast('controlBorder', 'surface').toFixed(2)}:1 >= 3:1`, () => assert.ok(contrast('controlBorder', 'surface') >= 3));
check(`controlBorder/canvas contrast ${contrast('controlBorder', 'canvas').toFixed(2)}:1 >= 3:1`, () => assert.ok(contrast('controlBorder', 'canvas') >= 3));
check(`brand/white text contrast ${contrast('brand', 'white').toFixed(2)}:1 >= 4.5:1`, () => assert.ok(contrast('brand', 'white') >= 4.5));
check('touch and chip targets are at least 44 points', () => {
  const touch = tokens.match(/touchTarget:\s*(\d+)/)?.[1];
  const chip = tokens.match(/chipHeight:\s*(\d+)/)?.[1];
  assert.ok(Number(touch) >= 44, `touchTarget is ${touch}`);
  assert.ok(Number(chip) >= 44, `chipHeight is ${chip}`);
});
check('shared TextInput/SearchBar/Chip use control borders and brand-selected state', () => {
  assert.match(uiStyles, /input:\s*\{[\s\S]*?borderColor:\s*colors\.controlBorder/);
  assert.match(uiStyles, /searchBar:\s*\{[\s\S]*?borderColor:\s*colors\.controlBorder/);
  assert.match(uiStyles, /chip:\s*\{[\s\S]*?borderColor:\s*colors\.controlBorder/);
  assert.match(uiStyles, /chipSelected:\s*\{[\s\S]*?borderColor:\s*colors\.brand/);
});
check('warning notices and offline banner use accessible warning text color', () => {
  assert.match(feedback, /tone === 'warning' && \{ color: colors\.warningText \}/);
  assert.match(uiStyles, /offlineBannerText:\s*\{[\s\S]*?color:\s*colors\.warningText/);
});
check('Field focus and inline errors are accessible', () => {
  assert.match(field, /focused && s\.inputFocused/);
  assert.match(field, /accessibilityLiveRegion="polite"/);
  assert.match(field, /accessibilityRole="alert"/);
});
check('bottom navigation typography comes from a token, not 10px hardcoding', () => {
  assert.match(bottomNav, /label:\s*\{[^}]*\.\.\.typography\.overline/);
  assert.doesNotMatch(bottomNav, /label:\s*\{[^}]*fontSize:\s*10/);
});
check('search filters announce selected state and meet touch-size target', () => {
  assert.ok((search.match(/accessibilityState=\{\{ selected:/g) ?? []).length >= 4);
  assert.ok((search.match(/minHeight: 44/g) ?? []).length >= 4);
  assert.match(search, /<ErrorState/);
  assert.match(search, /<EmptyState/);
});
check('ad-editor image and category controls meet minimum touch dimensions', () => {
  assert.match(editor, /imageControl:\{width:44,height:44/);
  assert.match(editor, /removeImage:\{[^}]*width:44,height:44/);
  assert.match(editor, /categoryChip:\{minHeight:44/);
  assert.match(editor, /borderColor:colors\.controlBorder/);
});
check('product editor, checkout, sales filters, store tabs, and working-hours toggles meet accessibility baselines', () => {
  assert.match(productEditor, /chip:\{minHeight:44,minWidth:44/);
  assert.match(productEditor, /accessibilityState=\{\{selected:categoryId===c\.id\}\}/);
  assert.match(checkout, /qtyButton:\{width:44,height:44,minWidth:44,minHeight:44/);
  assert.match(sales, /accessibilityLabel=\{`فلتر الحالة: \$\{option\.label\}`} accessibilityState=\{\{ selected:/);
  assert.match(storeDetail, /accessibilityRole=\"tab\" accessibilityLabel=\{item\.label\} accessibilityState=\{\{selected:tab===item\.key\}\}/);
  assert.match(servicesHours, /minHeight:44[\s\S]{0,180}colors\.controlBorder/);
});

console.log(`\nDesign system / a11y regression checks: ${checks.length}/${checks.length} passed.`);
