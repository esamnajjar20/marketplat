#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

let hash = 'dev';
try { hash = execSync('git rev-parse --short=8 HEAD', { encoding: 'utf8' }).trim(); } catch {}
const buildId = `${hash}-${Date.now()}`;
const out = resolve(process.cwd(), 'public', 'build-id.json');
writeFileSync(out, JSON.stringify({ buildId, builtAt: new Date().toISOString() }));
console.log(`[build-id] ${buildId} → public/build-id.json`);
