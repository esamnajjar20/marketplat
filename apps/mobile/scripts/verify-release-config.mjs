import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(here, '..');
const app = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'app.json'), 'utf8')).expo;
const pkg = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'package.json'), 'utf8'));
const gradle = fs.readFileSync(path.join(mobileRoot, 'android/app/build.gradle'), 'utf8');
const manifest = fs.readFileSync(path.join(mobileRoot, 'android/app/src/main/AndroidManifest.xml'), 'utf8');

assert.equal(app.name, 'MarketPlat', 'Expo app name must be MarketPlat');
assert.equal(app.android?.package, 'com.marketplat.mobile', 'Android application ID is missing or changed');
assert.match(app.version ?? '', /^\d+\.\d+\.\d+$/, 'Expo version must use semantic x.y.z format');
assert.equal(pkg.version, app.version, 'Mobile package version and Expo runtime version must stay aligned');
assert.match(gradle, /versionCode\s+\d+/, 'Android versionCode is required');
assert.match(gradle, /versionName\s+"[^"]+"/, 'Android versionName is required');
assert.match(gradle, /release\s*\{[\s\S]*?signingConfig\s+signingConfigs\.release/, 'Release variants must use the production signing config');
assert.doesNotMatch(gradle, /signingConfig\s+System\.getenv\('MARKETPLAT_RELEASE_STORE_FILE'\)\s*\?\s*signingConfigs\.release\s*:\s*signingConfigs\.debug/, 'Release signing must not fall back to debug signing');
assert.match(gradle, /candidate\.name == 'preReleaseBuild'[\s\S]*?verifyProductionSigning/, 'Every release build entry point must depend on the signing guard');
assert.match(manifest, /android:name="\.MainActivity"/, 'MainActivity declaration is missing');
assert.equal(pkg.scripts?.['build:apk:test'], 'cd android && ./gradlew assembleDebug', 'Test APK must use the debug variant, not an unsigned release variant');

const apk = path.join(mobileRoot, 'android/app/build/outputs/apk/release/app-release.apk');
if (process.argv.includes('--apk')) {
  assert.ok(fs.existsSync(apk), `APK not found: ${apk}`);
  assert.ok(fs.statSync(apk).size > 0, 'APK exists but is empty');
  console.log(`APK artifact exists (${fs.statSync(apk).size} bytes): ${apk}`);
} else {
  console.log('PASS: Android test-debug and production-release signing static checks.');
  console.log('NOT CHECKED: Gradle build, APK signature, device install, API reachability, runtime flows.');
}
