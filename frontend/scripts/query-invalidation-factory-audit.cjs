#!/usr/bin/env node
'use strict';

/**
 * Guardrail for Phase 3: cache invalidation and cache writes must use the
 * canonical queryKeys factory (or a derived key from it), not raw key arrays.
 * Query-key factory definitions and explanatory tests/docs are excluded.
 */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const ignored = new Set(['node_modules', '.next', 'coverage', '__tests__', 'e2e', 'scripts']);
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignored.has(entry.name)) walk(path.join(dir, entry.name));
    } else if (/\.(?:ts|tsx)$/.test(entry.name) && !/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(path.join(dir, entry.name));
    }
  }
}
walk(root);

const failures = [];
let checked = 0;
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function visit(node) {
    if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const arg = node.arguments[0];
      const name = ts.isIdentifier(node.expression)
        ? node.expression.text
        : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : '';
      const cacheOps = new Set(['invalidateQueries', 'cancelQueries', 'removeQueries', 'setQueryData', 'setQueriesData', 'getQueryData', 'getQueriesData']);
      if (cacheOps.has(name)) {
        if ((name === 'setQueryData' || name === 'getQueryData') && ts.isArrayLiteralExpression(arg)) {
          checked++;
          const pos = sf.getLineAndCharacterOfPosition(arg.getStart(sf));
          failures.push(`${path.relative(root, file)}:${pos.line + 1}: raw query-key array passed to ${name}(); use queryKeys factory`);
        } else if (ts.isObjectLiteralExpression(arg)) {
          const keyProp = arg.properties.find((prop) => ts.isPropertyAssignment(prop) &&
            ts.isIdentifier(prop.name) && prop.name.text === 'queryKey');
          if (keyProp && ts.isPropertyAssignment(keyProp)) {
            checked++;
            if (ts.isArrayLiteralExpression(keyProp.initializer)) {
              const pos = sf.getLineAndCharacterOfPosition(keyProp.initializer.getStart(sf));
              failures.push(`${path.relative(root, file)}:${pos.line + 1}: raw queryKey array in ${name}(); use queryKeys factory`);
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}
if (failures.length) {
  console.error(`[query-invalidation-factory-audit] FAIL: ${failures.length} raw query-key arrays across ${checked} cache operations`);
  failures.forEach((line) => console.error(` - ${line}`));
  process.exit(1);
}
console.log(`[query-invalidation-factory-audit] PASS: ${checked} cache operations use factory-derived keys`);
