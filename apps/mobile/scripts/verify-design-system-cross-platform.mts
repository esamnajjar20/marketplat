#!/usr/bin/env node
// @ts-nocheck
/** Cross-platform design-system contracts: semantic colors, radii, Field usage, and touch targets. */
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const read = (path) => readFile(resolve(repo, path), 'utf8');
const [webCss, tailwind, card, tokens, field, bypass, fontDocs] = await Promise.all([
  read('frontend/app/globals.css'),
  read('frontend/tailwind.config.ts'),
  read('frontend/components/ui/card.tsx'),
  read('apps/mobile/src/theme/tokens.ts'),
  read('apps/mobile/src/components/ui/Field.tsx'),
  read('apps/mobile/scripts/report-token-bypass.mts'),
  read('frontend/docs/DESIGN-SYSTEM-AR.md'),
]);

const checks = [];
function check(label, condition) {
  assert.ok(condition, label);
  checks.push(label);
  console.log(`✅ ${label}`);
}
function ruleBlock(source, selector) {
  const escaped = selector === '.dark' ? '\\.dark' : selector;
  const match = source.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`, 'm'));
  assert.ok(match, `Missing CSS rule: ${selector}`);
  return match[1];
}
function cssValue(block, name) {
  const match = block.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
  assert.ok(match, `Missing CSS token: --${name}`);
  return match[1].trim();
}
function hslToHex(value) {
  const match = value.match(/(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  assert.ok(match, `Unsupported HSL token value: ${value}`);
  let h = ((Number(match[1]) % 360) + 360) % 360 / 360;
  const s = Number(match[2]) / 100;
  const l = Number(match[3]) / 100;
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r, g, b;
  if (s === 0) r = g = b = l;
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return '#' + [r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function objectBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing object ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Missing object end ${endMarker}`);
  return source.slice(start, end);
}
function hexValue(block, name) {
  const match = block.match(new RegExp(`\\b${name}\\s*:\\s*['"](#[0-9A-Fa-f]{6})['"]`));
  assert.ok(match, `Missing mobile color token: ${name}`);
  return match[1].toUpperCase();
}
function hexRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}
function luminance(hex) {
  const channels = hexRgb(hex).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const lightCss = ruleBlock(webCss, ':root');
const darkCss = ruleBlock(webCss, '.dark');
const lightTokens = objectBlock(tokens, 'export const colors = {', '} as const;');
const darkTokens = objectBlock(tokens, 'export const darkColors: ColorPalette = {', 'export const spacing =');
const semanticMap = {
  brand: 'primary', ink: 'foreground', muted: 'muted-foreground', canvas: 'background',
  surface: 'card', border: 'border', accent: 'accent', danger: 'destructive',
  success: 'success', warning: 'warning', info: 'info',
};
for (const [mobileName, webName] of Object.entries(semanticMap)) {
  check(`Light semantic color ${mobileName} matches Web --${webName}`, hexValue(lightTokens, mobileName) === hslToHex(cssValue(lightCss, webName)));
  check(`Dark semantic color ${mobileName} matches Web --${webName}`, hexValue(darkTokens, mobileName) === hslToHex(cssValue(darkCss, webName)));
}
check('Light onBrand and onDanger match Web semantic foreground tokens',
  hexValue(lightTokens, 'onBrand') === hslToHex(cssValue(lightCss, 'primary-foreground')) &&
  hexValue(lightTokens, 'onDanger') === hslToHex(cssValue(lightCss, 'destructive-foreground')));
check('Dark onBrand and onDanger match Web semantic foreground tokens',
  hexValue(darkTokens, 'onBrand') === hslToHex(cssValue(darkCss, 'primary-foreground')) &&
  hexValue(darkTokens, 'onDanger') === hslToHex(cssValue(darkCss, 'destructive-foreground')));
check('Light semantic danger and warning text match Web role tokens',
  hexValue(lightTokens, 'dangerText') === hslToHex(cssValue(lightCss, 'destructive-text')) &&
  hexValue(lightTokens, 'warningText') === hslToHex(cssValue(lightCss, 'warning-text')));
check('Dark semantic danger and warning text match Web role tokens',
  hexValue(darkTokens, 'dangerText') === hslToHex(cssValue(darkCss, 'destructive-text')) &&
  hexValue(darkTokens, 'warningText') === hslToHex(cssValue(darkCss, 'warning-text')));
check('Web status-text aliases use readable text roles rather than button foregrounds',
  webCss.includes('--color-danger-text: hsl(var(--destructive-text));') &&
  webCss.includes('--color-warning-text: hsl(var(--warning-text));'));

const radiusBlock = tokens.match(/export const radius = \{([\s\S]*?)\} as const;/)?.[1];
assert.ok(radiusBlock, 'Missing mobile radius tokens');
const mobileRadius = (name) => Number(radiusBlock.match(new RegExp(`\\b${name}:\\s*(\\d+)`))?.[1]);
const rootRadius = cssValue(lightCss, 'radius');
const cssRadius = (value) => {
  const m = value.match(/^([\d.]+)(rem|px)$/);
  assert.ok(m, `Unsupported radius value: ${value}`);
  return Number(m[1]) * (m[2] === 'rem' ? 16 : 1);
};
const radiusPairs = [
  ['control', rootRadius, 'control'],
  ['card', cssValue(webCss, 'radius-card'), 'card'],
  ['shell', cssValue(webCss, 'radius-shell'), 'shell'],
  ['modal', cssValue(webCss, 'radius-modal'), 'modal'],
  ['hero', cssValue(webCss, 'radius-hero'), 'hero'],
];
for (const [label, cssValueText, mobileKey] of radiusPairs) {
  check(`${label} radius is aligned across Web and Native`, Math.abs(cssRadius(cssValueText) - mobileRadius(mobileKey)) <= 0.5);
}
check('Native button and input radius use the shared control radius', mobileRadius('button') === mobileRadius('control') && mobileRadius('input') === mobileRadius('control'));
check('Web Card uses the declared semantic rounded-card utility', card.includes("'rounded-card border") && tailwind.includes("card: 'var(--radius-card)'"));

const contrastChecks = [
  ['Light ink/canvas', hexValue(lightTokens, 'ink'), hexValue(lightTokens, 'canvas'), 4.5],
  ['Light muted/canvas', hexValue(lightTokens, 'muted'), hexValue(lightTokens, 'canvas'), 4.5],
  ['Light onBrand/brand', hexValue(lightTokens, 'onBrand'), hexValue(lightTokens, 'brand'), 4.5],
  ['Light onDanger/danger', hexValue(lightTokens, 'onDanger'), hexValue(lightTokens, 'danger'), 4.5],
  ['Light dangerText/dangerSoft', hexValue(lightTokens, 'dangerText'), hexValue(lightTokens, 'dangerSoft'), 4.5],
  ['Light warningText/warningSoft', hexValue(lightTokens, 'warningText'), hexValue(lightTokens, 'warningSoft'), 4.5],
  ['Dark ink/canvas', hexValue(darkTokens, 'ink'), hexValue(darkTokens, 'canvas'), 4.5],
  ['Dark muted/canvas', hexValue(darkTokens, 'muted'), hexValue(darkTokens, 'canvas'), 4.5],
  ['Dark onBrand/brand', hexValue(darkTokens, 'onBrand'), hexValue(darkTokens, 'brand'), 4.5],
  ['Dark onDanger/danger', hexValue(darkTokens, 'onDanger'), hexValue(darkTokens, 'danger'), 4.5],
  ['Dark dangerText/dangerSoft', hexValue(darkTokens, 'dangerText'), hexValue(darkTokens, 'dangerSoft'), 4.5],
  ['Dark warningText/warningSoft', hexValue(darkTokens, 'warningText'), hexValue(darkTokens, 'warningSoft'), 4.5],
];
for (const [label, foreground, background, min] of contrastChecks) {
  const ratio = contrast(foreground, background);
  check(`${label} contrast ${ratio.toFixed(2)}:1 >= ${min}:1`, ratio >= min);
}

const mobileFiles = [
  'apps/mobile/app/ad-editor.tsx',
  'apps/mobile/app/delete-account.tsx',
  'apps/mobile/app/service-requests.tsx',
  'apps/mobile/app/service-requests/[id].tsx',
  'apps/mobile/app/report/[targetType]/[targetId].tsx',
];
for (const file of mobileFiles) {
  const source = await read(file);
  check(`${file} uses shared Field without raw TextInput`, source.includes("from '@/components/ui/Field'") && !/<TextInput\b/.test(source));
}
check('Field supports custom styles, hints, character counts, and numeric normalization',
  field.includes('inputStyle?: StyleProp<TextStyle>') && field.includes('labelStyle?: StyleProp<TextStyle>') &&
  field.includes('showCharacterCount?: boolean') && field.includes('normalizeNumericInput(nextValue)'));

const salesCosts = await read('apps/mobile/app/sales-costs.tsx');
check('Sales-costs switch meets the minimum 44dp touch target', salesCosts.includes('minHeight: sizes.touchTarget'));
check('Sales-cost input uses the 52dp standard input height', salesCosts.includes('minHeight: sizes.inputHeight'));
check('Native touch target token remains at least 44dp', /touchTarget:\s*44/.test(tokens));
check('Web shared controls retain the 44px touch target', /--touch-target:\s*44px/.test(webCss));

const sourceRoot = resolve(repo, 'frontend');
const skip = new Set(['node_modules', '.next', 'docs', '.git']);
const codeExtensions = new Set(['.css', '.scss', '.ts', '.tsx', '.js', '.jsx']);
let legacyUsageCount = 0;
async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skip.has(entry.name) && !entry.name.startsWith('.')) await scan(full);
    } else if (codeExtensions.has(extname(entry.name))) {
      const content = await readFile(full, 'utf8');
      legacyUsageCount += (content.match(/var\(\s*--legacy-/g) ?? []).length;
    }
  }
}
await scan(sourceRoot);
check('Frontend runtime code no longer references legacy color variables', legacyUsageCount === 0);
check('The legacy palette bridge has been removed from the Web theme', !webCss.includes('--legacy-'));
check('A live Web design-system reference documents typography and platform differences', fontDocs.includes('Cairo') && fontDocs.includes('خط النظام') && fontDocs.includes('Native') && fontDocs.includes('screenTitle') && fontDocs.includes('page-title'));
check('Token bypass report includes sizing and positioning property coverage', bypass.includes('أبعاد/تموضع رقمية') && /minHeight|maxHeight|rowGap|columnGap/.test(bypass));

console.log(`\n✅ Cross-platform design-system checks: ${checks.length}/${checks.length} passed.`);
