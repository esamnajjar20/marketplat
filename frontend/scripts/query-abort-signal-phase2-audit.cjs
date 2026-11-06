#!/usr/bin/env node
'use strict';

/**
 * Static guardrail for TanStack Query AbortSignal propagation.
 * Confirms every discovered query function passes its signal into a
 * request config object, rather than merely accepting an unused signal.
 */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const scanRoots = ['hooks/queries', 'components', 'app'];
const queryNames = new Set([
  'useQuery',
  'useInfiniteQuery',
  'useSuspenseQuery',
  'useSuspenseInfiniteQuery',
  'queryOptions',
]);
const sourceFiles = [];

function walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (['node_modules', '.next', '__tests__', 'e2e', 'coverage'].includes(entry.name)) continue;
      walk(path.join(directory, entry.name));
      continue;
    }
    if (/\.(?:ts|tsx)$/.test(entry.name) && !/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name)) {
      sourceFiles.push(path.join(directory, entry.name));
    }
  }
}

for (const relativeRoot of scanRoots) walk(path.join(root, relativeRoot));

let queryCount = 0;
let signalAwareCount = 0;
const failures = [];

for (const file of sourceFiles) {
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const name = ts.isIdentifier(node.expression)
        ? node.expression.text
        : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : '';
      if (queryNames.has(name) && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
        const queryFn = node.arguments[0].properties.find((property) =>
          (ts.isPropertyAssignment(property) || ts.isMethodDeclaration(property)) &&
          ((ts.isIdentifier(property.name) && property.name.text === 'queryFn') ||
            (ts.isStringLiteral(property.name) && property.name.text === 'queryFn')),
        );
        const fn = queryFn && queryFn.initializer;
        if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) {
          queryCount += 1;
          const parameter = fn.parameters[0];
          const hasSignal = Boolean(
            parameter &&
            ts.isObjectBindingPattern(parameter.name) &&
            parameter.name.elements.some((element) =>
              ts.isIdentifier(element.name) && element.name.text === 'signal',
            ),
          );

          let passesSignalToRequest = false;
          function hasSignalProperty(config) {
            return config.properties.some((property) =>
              (ts.isShorthandPropertyAssignment(property) && property.name.text === 'signal') ||
              (ts.isPropertyAssignment(property) &&
                ts.isIdentifier(property.name) && property.name.text === 'signal' &&
                ts.isIdentifier(property.initializer) && property.initializer.text === 'signal'),
            );
          }
          function scan(child) {
            // Require the signal-bearing object to be an argument to a call.
            // This avoids false positives from an unrelated local object such
            // as logging metadata or a cache record inside the query function.
            if (ts.isCallExpression(child)) {
              for (const argument of child.arguments) {
                if (ts.isObjectLiteralExpression(argument) && hasSignalProperty(argument)) {
                  passesSignalToRequest = true;
                }
              }
            }
            ts.forEachChild(child, scan);
          }
          scan(fn.body);

          // Any catch inside a queryFn must preserve cancellation semantics.
          // Otherwise a route change could be misclassified as a network error
          // and return stale offline data (or trigger an unnecessary fallback).
          function scanCatchBlocks(child) {
            if (ts.isCatchClause(child)) {
              const catchBody = child.block.getText(source);
              if (!catchBody.includes('signal.aborted') && !catchBody.includes('throwIfQueryCancelled')) {
                const line = source.getLineAndCharacterOfPosition(child.getStart(source)).line + 1;
                failures.push(`${path.relative(root, file)}:${line}: queryFn catch does not preserve AbortSignal cancellation`);
              }
            }
            ts.forEachChild(child, scanCatchBlocks);
          }
          scanCatchBlocks(fn.body);

          if (hasSignal && passesSignalToRequest) {
            signalAwareCount += 1;
          } else {
            const line = source.getLineAndCharacterOfPosition(fn.getStart(source)).line + 1;
            failures.push(`${path.relative(root, file)}:${line}: ${!hasSignal ? 'missing signal parameter' : 'signal is not forwarded in a request config'}`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
}

const fallbackFiles = [
  'hooks/queries/useActivity.ts',
  'hooks/queries/useAppointments.ts',
  'hooks/queries/useCategories.ts',
  'hooks/queries/useProductCategories.ts',
  'hooks/queries/useSavedSearches.ts',
  'hooks/queries/useServiceCategories.ts',
  'hooks/queries/useServiceProviders.ts',
  'components/sellers/SellersRankingList.tsx',
  'components/search/SearchResults.tsx',
];
for (const relative of fallbackFiles) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  if (!source.includes('throwIfQueryCancelled(err, signal)')) {
    failures.push(`${relative}: offline fallback does not rethrow query cancellation before using local data`);
  }
}

const helperPath = path.join(root, 'lib/queryCancellation.ts');
if (!fs.existsSync(helperPath)) failures.push('lib/queryCancellation.ts: cancellation helper is missing');

console.log(`Query AbortSignal audit: ${signalAwareCount}/${queryCount} query functions forward cancellation to their request; queryFn catch blocks are checked for cancellation guards.`);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exitCode = 1;
} else {
  console.log('PASS queryFn catch blocks preserve cancellation instead of returning stale offline data');
}
