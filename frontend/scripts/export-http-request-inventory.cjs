#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const frontendRoot = path.resolve(__dirname, '..');
const output = path.join(frontendRoot, 'docs', 'HTTP_REQUEST_CALLSITE_INVENTORY.csv');
const scanRoots = ['api', 'app', 'components', 'hooks', 'lib', 'store'];
const httpMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);
const rows = [];
const queryCounts = new Map();

function walk(relativeDirectory, files = []) {
  const directory = path.join(frontendRoot, relativeDirectory);
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.next', '__tests__', 'e2e', 'coverage', '.turbo'].includes(entry.name)) continue;
      walk(relative, files);
    } else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name) && !/\.(?:test|spec)\.(?:ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(relative);
    }
  }
  return files;
}

function csv(value) {
  const normalized = String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  return `"${normalized.replace(/"/g, '""')}"`;
}

function getProperty(object, name) {
  if (!object || !ts.isObjectLiteralExpression(object)) return null;
  return object.properties.find((property) =>
    (ts.isPropertyAssignment(property) || ts.isMethodDeclaration(property)) &&
    ((ts.isIdentifier(property.name) && property.name.text === name) ||
      (ts.isStringLiteral(property.name) && property.name.text === name)),
  ) ?? null;
}

function textOf(node, source) {
  return node ? node.getText(source).replace(/\s+/g, ' ').slice(0, 500) : '';
}

for (const relativeFile of scanRoots.flatMap((root) => walk(root))) {
  const absoluteFile = path.join(frontendRoot, relativeFile);
  const sourceText = fs.readFileSync(absoluteFile, 'utf8');
  const source = ts.createSourceFile(
    absoluteFile,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    /\.tsx$/.test(relativeFile) ? ts.ScriptKind.TSX : /\.jsx$/.test(relativeFile) ? ts.ScriptKind.JSX : /\.js$/.test(relativeFile) ? ts.ScriptKind.JS : ts.ScriptKind.TS,
  );

  function add(kind, method, endpoint, expression, node) {
    const location = source.getLineAndCharacterOfPosition(node.getStart(source));
    rows.push({
      kind,
      method,
      endpoint,
      expression,
      sourceFile: relativeFile.split(path.sep).join('/'),
      line: location.line + 1,
    });
  }

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      if (ts.isPropertyAccessExpression(expression) &&
          ts.isIdentifier(expression.expression) && expression.expression.text === 'apiClient' &&
          httpMethods.has(expression.name.text.toLowerCase())) {
        const method = expression.name.text.toUpperCase();
        add('api-client', method, textOf(node.arguments[0], source), textOf(node, source), node);
      } else if (ts.isPropertyAccessExpression(expression) &&
          ts.isIdentifier(expression.expression) && expression.expression.text === 'fetchClient' &&
          httpMethods.has(expression.name.text.toLowerCase())) {
        add('fetch-client', expression.name.text.toUpperCase(), textOf(node.arguments[0], source), textOf(node, source), node);
      } else if (ts.isIdentifier(expression) && expression.text === 'fetchServerApi') {
        const options = node.arguments[1];
        const methodProperty = getProperty(options, 'method');
        const method = !methodProperty
          ? 'GET'
          : methodProperty.initializer && ts.isStringLiteral(methodProperty.initializer)
            ? methodProperty.initializer.text.toUpperCase()
            : 'DYNAMIC';
        add('server-api', method, textOf(node.arguments[0], source), textOf(node, source), node);
      } else if (ts.isIdentifier(expression) && expression.text === 'fetchWithTimeout') {
        add('fetch-timeout', 'GET', textOf(node.arguments[0], source), textOf(node, source), node);
      } else if (ts.isIdentifier(expression) && expression.text === 'fetch') {
        const options = node.arguments[1];
        const methodProperty = getProperty(options, 'method');
        const method = !methodProperty
          ? 'GET'
          : methodProperty.initializer && ts.isStringLiteral(methodProperty.initializer)
            ? methodProperty.initializer.text.toUpperCase()
            : 'DYNAMIC';
        add('native-fetch', method, textOf(node.arguments[0], source), textOf(node, source), node);
      }

      const callName = ts.isIdentifier(expression)
        ? expression.text
        : ts.isPropertyAccessExpression(expression) ? expression.name.text : '';
      const isQuery = ['useQuery', 'useInfiniteQuery', 'useSuspenseQuery', 'useSuspenseInfiniteQuery', 'queryOptions'].includes(callName);
      const isMutation = ['useMutation'].includes(callName);
      if ((isQuery || isMutation) && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
        const options = node.arguments[0];
        const keyName = isQuery ? 'queryKey' : 'mutationKey';
        const fnName = isQuery ? 'queryFn' : 'mutationFn';
        const key = getProperty(options, keyName);
        const fn = getProperty(options, fnName);
        add(isQuery ? 'tanstack-query' : 'tanstack-mutation', isQuery ? 'READ' : 'WRITE', textOf(key?.initializer, source), textOf(fn?.initializer, source), node);
        if (isQuery) queryCounts.set(relativeFile, (queryCounts.get(relativeFile) ?? 0) + 1);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
}

rows.sort((a, b) => a.sourceFile.localeCompare(b.sourceFile) || a.line - b.line || a.kind.localeCompare(b.kind));
fs.mkdirSync(path.dirname(output), { recursive: true });
const header = ['kind', 'method', 'endpoint_or_query_key', 'source_expression', 'source_file', 'line'];
const csvText = [header.map(csv).join(','), ...rows.map((row) => [row.kind, row.method, row.endpoint, row.expression, row.sourceFile, row.line].map(csv).join(','))].join('\n') + '\n';
fs.writeFileSync(output, csvText, 'utf8');

const summaries = rows.reduce((result, row) => {
  result[row.kind] = (result[row.kind] ?? 0) + 1;
  return result;
}, {});
process.stdout.write(`Wrote ${path.relative(frontendRoot, output)} (${rows.length} callsites).\n`);
process.stdout.write(`${Object.entries(summaries).map(([kind, count]) => `${kind}=${count}`).join(', ')}\n`);
process.stdout.write(`TanStack query source files=${queryCounts.size}; query definitions=${[...queryCounts.values()].reduce((a, b) => a + b, 0)}\n`);
