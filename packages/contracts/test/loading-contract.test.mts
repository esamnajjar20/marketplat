import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const contracts = require('../dist/index.js');

test('loading phases resolve to the same shared Arabic copy', () => {
  assert.deepEqual(contracts.LOADING_PHASES, [
    'initial', 'processing', 'refreshing', 'loadingMore', 'saving', 'sending', 'deleting', 'uploading', 'searching',
  ]);
  assert.equal(contracts.getLoadingLabel('initial'), contracts.LOADING_COPY.default);
  assert.equal(contracts.getLoadingLabel('processing'), contracts.LOADING_COPY.processing);
  assert.equal(contracts.getLoadingLabel('refreshing'), contracts.LOADING_COPY.refreshing);
  assert.equal(contracts.getLoadingLabel('loadingMore'), contracts.LOADING_COPY.loadingMore);
  assert.equal(contracts.getLoadingLabel('saving'), contracts.LOADING_COPY.saving);
  assert.equal(contracts.getLoadingLabel('sending'), contracts.LOADING_COPY.sending);
  assert.equal(contracts.getLoadingLabel('deleting'), contracts.LOADING_COPY.deleting);
  assert.equal(contracts.getLoadingLabel('uploading'), contracts.LOADING_COPY.uploading);
  assert.equal(contracts.getLoadingLabel('searching'), contracts.LOADING_COPY.searching);
});

test('loading timing defaults are centralized and stable', () => {
  assert.equal(contracts.LOADING_TIMING.gateDelayMs, 500);
  assert.equal(contracts.LOADING_TIMING.minVisibleMs, 500);
  assert.equal(contracts.LOADING_TIMING.routeFallbackDelayMs, 200);
  assert.equal(contracts.LOADING_TIMING.navigationStartDelayMs, 120);
  assert.equal(contracts.LOADING_TIMING.navigationSafetyTimeoutMs, 12_000);
});
