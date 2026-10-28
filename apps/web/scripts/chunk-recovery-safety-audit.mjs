#!/usr/bin/env node
import fs from 'node:fs';

const sw = fs.readFileSync('public/sw.js', 'utf8');
const reporter = fs.readFileSync('lib/errorReporter.ts', 'utf8');
const middleware = fs.readFileSync('middleware.ts', 'utf8');
const version = fs.readFileSync('lib/cacheVersion.ts', 'utf8');
const swVersion = (sw.match(/const CACHE_VERSION = '(v\d+)';/) || [])[1];
const tsVersion = (version.match(/SW_CACHE_VERSION = '(v\d+)'/) || [])[1];
const checks = [
  ['CSP normalizes configured API URL to origin', /function getCspApiOrigin[\s\S]*?return parsed\.origin/.test(middleware)],
  ['CSP API origin rejects non-http protocols', /parsed\.protocol !== 'https:' && parsed\.protocol !== 'http:'/.test(middleware)],
  ['chunk recovery asks service worker to purge stale shells', /type: 'PURGE_STALE_SHELLS'/.test(reporter)],
  ['chunk recovery does not unregister service workers', !/getRegistrations\(\)[\s\S]{0,200}unregister\(\)/.test(reporter)],
  ['chunk recovery does not delete all Cache Storage buckets', !/caches\.keys\(\)[\s\S]{0,120}Promise\.all\(keys\.map\(\(k\) => caches\.delete/.test(reporter)],
  ['service worker removes only HTML/RSC shells for recovery', /PURGE_STALE_SHELLS[\s\S]*?contentType\.includes\('text\/html'\) \|\| source === 'rsc' \|\| isRsc/.test(sw)],
  ['cache version synchronized', Boolean(swVersion && swVersion === tsVersion)],
];
let failures = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures++;
}
console.log(`Chunk recovery safety audit: ${checks.length - failures}/${checks.length} passed`);
if (failures) process.exitCode = 1;
