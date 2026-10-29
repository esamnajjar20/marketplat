#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const mobileDir = resolve(scriptDir, '..');
const rootDir = resolve(mobileDir, '../..');
const packageJson = JSON.parse(await readFile(resolve(mobileDir, 'package.json'), 'utf8'));
const appConfig = JSON.parse(await readFile(resolve(mobileDir, 'app.json'), 'utf8'));
const lock = await readFile(resolve(rootDir, 'pnpm-lock.yaml'), 'utf8');
const gradlew = await stat(resolve(mobileDir, 'android/gradlew'));

assert.equal(packageJson.name, '@marketplat/mobile', 'mobile package identity must remain stable');
assert.match(packageJson.engines?.node ?? '>=22 <25', />=22\s*<25/, 'supported Node range must include Node 22');
assert.ok(packageJson.scripts?.['type-check'], 'type-check script must exist');
assert.ok(packageJson.scripts?.test, 'test script must exist');
assert.ok(lock.includes('  apps/mobile:'), 'pnpm lockfile must include the mobile workspace importer');
for (const [section, dependencies] of Object.entries({ dependencies: packageJson.dependencies, devDependencies: packageJson.devDependencies })) {
  for (const [name, specifier] of Object.entries(dependencies ?? {})) {
    const importer = lock.slice(lock.indexOf('  apps/mobile:'));
    const sectionStart = importer.indexOf(`    ${section}:`);
    assert.notEqual(sectionStart, -1, `lockfile is missing ${section}`);
    const nextSection = importer.slice(sectionStart + 1).search(/^    [^ ]/m);
    const sectionText = nextSection === -1 ? importer.slice(sectionStart) : importer.slice(sectionStart, sectionStart + 1 + nextSection);
    assert.ok(sectionText.includes(`      '${name}':`) || sectionText.includes(`      ${name}:`), `lockfile missing ${section} entry ${name}`);
    assert.ok(sectionText.includes(`specifier: ${specifier}`), `lockfile specifier mismatch for ${name}`);
  }
}
const plugins = appConfig.expo?.plugins ?? [];
assert.ok(plugins.some((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-sqlite' && plugin[1]?.useSQLCipher === true), 'SQLCipher must remain enabled in Expo config');
if (process.platform !== 'win32') assert.ok((gradlew.mode & 0o111) !== 0, 'android/gradlew must be executable on Unix');
console.log('Phase 2 build/config checks passed. Native build and runtime behavior are not tested by this script.');
