import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidSqlCipherKey } from '../sqlcipher-key-policy.mjs';

test('accepts exactly 32 bytes of hex key material', () => {
  assert.equal(isValidSqlCipherKey('a'.repeat(64)), true);
  assert.equal(isValidSqlCipherKey('ABCDEF0123456789'.repeat(4)), true);
});

test('rejects missing, malformed, wrong-length or non-hex key material', () => {
  assert.equal(isValidSqlCipherKey(null), false);
  assert.equal(isValidSqlCipherKey(undefined), false);
  assert.equal(isValidSqlCipherKey('a'.repeat(63)), false);
  assert.equal(isValidSqlCipherKey('a'.repeat(65)), false);
  assert.equal(isValidSqlCipherKey('g'.repeat(64)), false);
  assert.equal(isValidSqlCipherKey(123), false);
});
