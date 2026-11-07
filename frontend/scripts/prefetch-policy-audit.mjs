#!/usr/bin/env node
/**
 * AST audit for the reviewed Next.js Link prefetch policy.
 * Run from any working directory with the frontend dependencies installed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, '..');
const manifestPath = path.join(frontendRoot, 'docs', 'prefetch-review-manifest.json');
const adapterModule = '@/components/navigation/IntentPrefetchLink';
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const ignoredDirectories = new Set([
  'node_modules', '.next', '.open-next', 'out', 'coverage', 'e2e', '__tests__', '__fixtures__',
]);

function collectSourceFiles(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        collectSourceFiles(path.join(directory, entry.name), output);
      }
      continue;
    }
    if (/\.(?:tsx|jsx)$/.test(entry.name)) output.push(path.join(directory, entry.name));
  }
  return output;
}

function hasFalsePrefetch(attributes) {
  return attributes.properties.some((attribute) =>
    ts.isJsxAttribute(attribute) &&
    attribute.name.text === 'prefetch' &&
    attribute.initializer &&
    ts.isJsxExpression(attribute.initializer) &&
    attribute.initializer.expression?.kind === ts.SyntaxKind.FalseKeyword,
  );
}

const errors = [];
const files = collectSourceFiles(frontendRoot);
const auditedFiles = new Set();
const actualPerFile = new Map();
const actualHrefsPerFile = new Map();
const expectedHrefsPerFile = new Map();
const expectedPerFile = new Map();
for (const occurrence of manifest.runtime_occurrences) {
  expectedPerFile.set(occurrence.file, (expectedPerFile.get(occurrence.file) ?? 0) + 1);
  const hrefs = expectedHrefsPerFile.get(occurrence.file) ?? [];
  hrefs.push(occurrence.href_expression);
  expectedHrefsPerFile.set(occurrence.file, hrefs);
}
let wrappedCount = 0;
let disabledNativeLinkCount = 0;
let targetBlankCount = 0;

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.JSX,
  );
  if (sourceFile.parseDiagnostics.length > 0) {
    errors.push(`${path.relative(frontendRoot, file)}: TypeScript parser reported ${sourceFile.parseDiagnostics.length} syntax error(s)`);
    continue;
  }

  let adapterImport = false;
  let nativeLinkImport = false;
  function inspect(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const localName = node.importClause?.name?.text;
      if (node.moduleSpecifier.text === adapterModule && localName === 'IntentPrefetchLink') {
        adapterImport = true;
      }
      if (node.moduleSpecifier.text === 'next/link' && localName === 'Link') {
        nativeLinkImport = true;
      }
    }

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (!ts.isIdentifier(node.tagName) || !hasFalsePrefetch(node.attributes)) {
        ts.forEachChild(node, inspect);
        return;
      }

      if (node.tagName.text === 'IntentPrefetchLink') {
        wrappedCount += 1;
        auditedFiles.add(file);
        const relativeFile = 'frontend/' + path.relative(frontendRoot, file);
        actualPerFile.set(relativeFile, (actualPerFile.get(relativeFile) ?? 0) + 1);
        const hrefAttribute = node.attributes.properties.find((attribute) =>
          ts.isJsxAttribute(attribute) && attribute.name.text === 'href',
        );
        const hrefExpression = hrefAttribute?.initializer?.getText(sourceFile) ?? null;
        const hrefs = actualHrefsPerFile.get(relativeFile) ?? [];
        hrefs.push(hrefExpression);
        actualHrefsPerFile.set(relativeFile, hrefs);
        if (hrefExpression === null) errors.push(`${relativeFile}: wrapped link is missing a static href expression`);
        if (!adapterImport) {
          // Imports are inspected before their JSX nodes in normal source order;
          // a second import scan below handles declarations that occur later.
        }
        if (node.attributes.properties.some((attribute) =>
          ts.isJsxAttribute(attribute) && attribute.name.text === 'target' &&
          attribute.initializer && ts.isStringLiteral(attribute.initializer) &&
          attribute.initializer.text === '_blank')) {
          targetBlankCount += 1;
        }
      } else if (node.tagName.text === 'Link') {
        disabledNativeLinkCount += 1;
        errors.push(`${path.relative(frontendRoot, file)}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}: native Link still has prefetch={false}`);
      }
    }
    ts.forEachChild(node, inspect);
  }
  inspect(sourceFile);

  if (auditedFiles.has(file) && !adapterImport) {
    errors.push(`${path.relative(frontendRoot, file)}: IntentPrefetchLink is used without its approved adapter import`);
  }
  if (auditedFiles.has(file) && nativeLinkImport) {
    // Native Link may coexist only when the file contains ordinary, non-opt-out Link instances.
    // The current reviewed set contains adapter-only files; this catches accidental remapping.
    let ordinaryNativeLink = false;
    function findOrdinary(node) {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
          ts.isIdentifier(node.tagName) && node.tagName.text === 'Link' && !hasFalsePrefetch(node.attributes)) {
        ordinaryNativeLink = true;
      }
      ts.forEachChild(node, findOrdinary);
    }
    findOrdinary(sourceFile);
    if (!ordinaryNativeLink) {
      errors.push(`${path.relative(frontendRoot, file)}: unused next/link import remains after scoped migration`);
    }
  }
}

const expectedLinks = manifest.summary.runtimeJsxLinkOccurrences;
const expectedFiles = manifest.summary.affectedRuntimeFiles;
if (wrappedCount !== expectedLinks) {
  errors.push(`Expected ${expectedLinks} reviewed links; found ${wrappedCount}`);
}
if (auditedFiles.size !== expectedFiles) {
  errors.push(`Expected ${expectedFiles} affected runtime files; found ${auditedFiles.size}`);
}
for (const [relative, expected] of expectedPerFile) {
  const actual = actualPerFile.get(relative) ?? 0;
  if (actual !== expected) errors.push(`${relative}: manifest expects ${expected} wrapped link(s), found ${actual}`);
  const expectedHrefs = [...(expectedHrefsPerFile.get(relative) ?? [])].sort();
  const actualHrefs = [...(actualHrefsPerFile.get(relative) ?? [])].sort();
  if (JSON.stringify(actualHrefs) !== JSON.stringify(expectedHrefs)) {
    errors.push(`${relative}: href expressions differ from the audited baseline inventory`);
  }
}
for (const [relative] of actualPerFile) {
  if (!expectedPerFile.has(relative)) errors.push(`${relative}: contains wrapped links missing from the reviewed manifest`);
}
if (targetBlankCount !== manifest.summary.targetBlankLinks) {
  errors.push(`Expected ${manifest.summary.targetBlankLinks} new-tab exclusions; found ${targetBlankCount}`);
}
if (disabledNativeLinkCount !== 0) {
  errors.push(`${disabledNativeLinkCount} native Link element(s) still disable prefetch without the adapter`);
}

const adapterPath = path.join(frontendRoot, 'components/navigation/IntentPrefetchLink.tsx');
const adapterSource = fs.readFileSync(adapterPath, 'utf8');
for (const required of [
  "prefetch === false",
  'intentHref === href',
  "target === '_self'",
  'download === undefined',
  'onMouseEnter',
  'onFocus',
]) {
  if (!adapterSource.includes(required)) errors.push(`Adapter contract is missing: ${required}`);
}

console.log(`Prefetch policy audit: ${errors.length ? 'FAILED' : 'PASSED'}`);
console.log(`Runtime links routed through intent adapter: ${wrappedCount}`);
console.log(`Affected runtime source files: ${auditedFiles.size}`);
console.log(`New-tab links deliberately kept non-prefetching: ${targetBlankCount}`);
console.log(`Native Link elements left with prefetch={false}: ${disabledNativeLinkCount}`);
console.log(`Historical comment-only matches in baseline: ${manifest.summary.commentOnlyFalsePositives}`);

if (errors.length) {
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
}
