#!/usr/bin/env node
'use strict';

/**
 * Query-key architecture guardrail.
 * Query hooks and queryOptions factories must reference the central queryKeys factory rather than
 * constructing their own arrays. Cache writes/invalidation prefixes are
 * audited separately because they have different prefix semantics.
 */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const ignored = new Set(['node_modules', '.next', 'coverage', '__tests__', 'e2e']);
const hookNames = new Set(['useQuery', 'useInfiniteQuery', 'useSuspenseQuery', 'useSuspenseInfiniteQuery', 'queryOptions']);
const sourceFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignored.has(entry.name)) walk(path.join(dir, entry.name));
      continue;
    }
    if (/\.(?:ts|tsx)$/.test(entry.name) && !/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name)) {
      sourceFiles.push(path.join(dir, entry.name));
    }
  }
}
walk(root);

const findings = [];
let queryCount = 0;
function rootIdentifier(expression) {
  let current = expression;
  while (ts.isCallExpression(current) || ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    current = ts.isCallExpression(current) ? current.expression : current.expression;
  }
  return ts.isIdentifier(current) ? current.text : null;
}

for (const file of sourceFiles) {
  if (file.endsWith(`${path.sep}lib${path.sep}queryKeys.ts`)) continue;
  const source = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const name = ts.isIdentifier(node.expression)
        ? node.expression.text
        : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : '';
      if (hookNames.has(name) && node.arguments.length > 0 && ts.isObjectLiteralExpression(node.arguments[0])) {
        const keyProp = node.arguments[0].properties.find((prop) =>
          (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) &&
          ((ts.isIdentifier(prop.name) && prop.name.text === 'queryKey') || (ts.isStringLiteral(prop.name) && prop.name.text === 'queryKey'))
        );
        if (keyProp && ts.isPropertyAssignment(keyProp)) {
          queryCount += 1;
          const expr = keyProp.initializer;
          if (rootIdentifier(expr) !== 'queryKeys') {
            const pos = sf.getLineAndCharacterOfPosition(keyProp.getStart(sf));
            findings.push(`${path.relative(root, file)}:${pos.line + 1}: query hook key is not built by queryKeys factory`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}

if (findings.length) {
  console.error(`[query-key-audit] FAIL: ${findings.length}/${queryCount} query hooks bypass queryKeys`);
  for (const finding of findings) console.error(` - ${finding}`);
  process.exitCode = 1;
} else {
  console.log(`[query-key-audit] PASS: ${queryCount} query hook/queryOptions declarations use the centralized queryKeys factory`);
}
