import test from 'node:test';
import assert from 'node:assert/strict';
import { runSerializedByKey } from '../draft-operation-queue.mjs';

test('draft queue serializes mutations per key but not across accounts', async () => {
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const started = [];
  const first = runSerializedByKey('account-a', async () => {
    started.push('a1');
    await firstGate;
    throw new Error('first operation failed');
  });
  const second = runSerializedByKey('account-a', () => {
    started.push('a2');
    return 'second';
  });
  const separateAccount = runSerializedByKey('account-b', () => {
    started.push('b1');
    return 'other-account';
  });

  assert.equal(await separateAccount, 'other-account');
  assert.deepEqual(started, ['a1', 'b1']);
  releaseFirst();
  await assert.rejects(first, /first operation failed/);
  assert.equal(await second, 'second');
  assert.deepEqual(started, ['a1', 'b1', 'a2']);
});

test('draft queue rejects empty keys/non-callable operations and recovers after rejection', async () => {
  await assert.rejects(runSerializedByKey(' ', () => 1), /queue key/i);
  await assert.rejects(runSerializedByKey('account-c', null), /operation/i);
  await assert.rejects(runSerializedByKey('account-c', () => { throw new Error('bad write'); }), /bad write/);
  assert.equal(await runSerializedByKey('account-c', () => 42), 42);
});
