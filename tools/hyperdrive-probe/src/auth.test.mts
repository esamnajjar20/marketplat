import assert from 'node:assert/strict';
import { test } from 'node:test';
import { constantTimeTokenEquals, extractBearerToken } from './auth.ts';

const validToken = 'marketplat-hyperdrive-probe-token-0123456789abcdef';

test('extractBearerToken accepts one well-formed Bearer token', () => {
  const request = new Request('https://probe.example/__internal/db-probe', {
    headers: { authorization: `Bearer ${validToken}` },
  });
  assert.equal(extractBearerToken(request), validToken);
});

test('extractBearerToken rejects missing, malformed, and multi-value credentials', () => {
  assert.equal(extractBearerToken(new Request('https://probe.example/')), null);
  assert.equal(
    extractBearerToken(new Request('https://probe.example/', { headers: { authorization: `Basic ${validToken}` } })),
    null,
  );
  assert.equal(
    extractBearerToken(new Request('https://probe.example/', { headers: { authorization: `Bearer ${validToken},x` } })),
    null,
  );
});

test('constantTimeTokenEquals accepts the exact configured token only', async () => {
  assert.equal(await constantTimeTokenEquals(validToken, validToken), true);
  assert.equal(await constantTimeTokenEquals(`${validToken}x`, validToken), false);
  assert.equal(await constantTimeTokenEquals(null, validToken), false);
  assert.equal(await constantTimeTokenEquals(validToken, undefined), false);
});

test('constantTimeTokenEquals rejects short or oversized credentials', async () => {
  assert.equal(await constantTimeTokenEquals('short', validToken), false);
  assert.equal(await constantTimeTokenEquals(validToken, 'short'), false);
  assert.equal(await constantTimeTokenEquals('x'.repeat(513), validToken), false);
});
