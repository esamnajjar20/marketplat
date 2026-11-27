import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const check = (name, condition) => {
  console.log(`[loading-contract] ${condition ? 'PASS' : 'FAIL'} ${name}`);
  if (!condition) failures.push(name);
};
const failures = [];

const contract = read('packages/contracts/src/loading.ts');
const contractsIndex = read('packages/contracts/src/index.ts');
const webCopyFacade = read('frontend/lib/loadingCopy.ts');
const webLoadingState = read('frontend/components/shared/feedback/LoadingState.tsx');
const webButton = read('frontend/components/ui/button.tsx');
const delayedHook = read('frontend/hooks/ui/useDelayedLoading.ts');
const navigationProgress = read('frontend/components/shared/NavigationProgress.tsx');
const mobileCopy = read('apps/mobile/src/lib/copy.ts');
const mobileFeedback = read('apps/mobile/src/components/ui/Feedback.tsx');
const mobileButton = read('apps/mobile/src/components/ui/Button.tsx');
const mobileSpinner = read('apps/mobile/src/components/ui/Spinner.tsx');

check('shared package exports the loading contract', contractsIndex.includes("export * from './loading';"));
check('contract owns copy, phases, resolver and timing', [
  'LOADING_COPY', 'LOADING_PHASES', 'LoadingPhase', 'getLoadingLabel', 'LOADING_TIMING',
].every((token) => contract.includes(token)));
check('web loading copy is a compatibility re-export, not a second definition',
  /export \{ LOADING_COPY, type LoadingCopyKey \} from '@marketplat\/contracts'/.test(webCopyFacade));
check('web LoadingState consumes shared phases and labels',
  webLoadingState.includes("type LoadingPhase") && webLoadingState.includes('getLoadingLabel(phase)'));
check('web Button uses the canonical Spinner and shared phase type',
  webButton.includes("from '@/components/ui/spinner'") && webButton.includes('LoadingPhase'));
check('delayed loading uses shared timing defaults',
  delayedHook.includes('LOADING_TIMING.gateDelayMs') && delayedHook.includes('LOADING_TIMING.minVisibleMs'));
check('navigation progress uses shared safety timings',
  navigationProgress.includes('LOADING_TIMING.navigationStartDelayMs') && navigationProgress.includes('LOADING_TIMING.navigationSafetyTimeoutMs'));
check('mobile default copy is imported from the shared contract',
  mobileCopy.includes("import { LOADING_COPY } from '@marketplat/contracts'") && mobileCopy.includes('loading: LOADING_COPY.default'));
check('mobile LoadingState consumes shared phases and labels',
  mobileFeedback.includes('getLoadingLabel(phase)') && mobileFeedback.includes('type LoadingPhase'));
check('mobile Button consumes the standalone shared Spinner instead of ActivityIndicator',
  mobileButton.includes("import { Spinner } from './Spinner'") && !mobileButton.includes('ActivityIndicator'));
check('only the native Spinner adapter imports ActivityIndicator',
  mobileSpinner.includes('ActivityIndicator') && !mobileFeedback.includes('ActivityIndicator') && !mobileButton.includes('ActivityIndicator'));

const scan = (dir, callback) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.next', 'dist', 'build', '__tests__', 'scripts'].includes(entry.name)) continue;
      scan(full, callback);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
      callback(full);
    }
  }
};

const activityIndicatorFiles = [];
scan(path.join(root, 'apps/mobile'), (file) => {
  if (fs.readFileSync(file, 'utf8').includes('ActivityIndicator')) {
    activityIndicatorFiles.push(path.relative(root, file).split(path.sep).join('/'));
  }
});
check('ActivityIndicator is isolated to the single native adapter',
  activityIndicatorFiles.length === 1 && activityIndicatorFiles[0] === 'apps/mobile/src/components/ui/Spinner.tsx');

const rawPulseFiles = [];
scan(path.join(root, 'frontend'), (file) => {
  if (fs.readFileSync(file, 'utf8').includes('animate-pulse')) {
    rawPulseFiles.push(path.relative(root, file).split(path.sep).join('/'));
  }
});
const nonLoadingPulseFiles = rawPulseFiles.filter((file) => file !== 'frontend/components/messages/RecordingTimer.tsx');
check('loading placeholders use the centralized loading-pulse token (recording activity remains separate)', nonLoadingPulseFiles.length === 0 && rawPulseFiles.every((file) => file === 'frontend/components/messages/RecordingTimer.tsx'));

if (failures.length) {
  console.error(`\n${failures.length} loading contract audit check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log('\nAll loading contract checks passed.');
}
