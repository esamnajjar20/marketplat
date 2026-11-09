import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker, { parseKeepaliveTargets } from './index.js';

test('keepalive accepts only HTTPS URLs on the explicit host allowlist', () => {
  const allowed = 'api.example.com,health.example.net';
  const targets = parseKeepaliveTargets(
    'https://api.example.com/ready,http://api.example.com/plain,https://evil.example/health,https://user:pass@api.example.com/secret',
    allowed,
  );
  assert.equal(targets.length, 1);
  assert.equal(targets[0].hostname, 'api.example.com');
});

test('keepalive rejects missing allowlist and oversized target lists', () => {
  assert.deepEqual(parseKeepaliveTargets('https://api.example.com/health', ''), []);
  const many = Array.from({ length: 11 }, (_, i) => `https://h${i}.example.com/health`).join(',');
  const hosts = Array.from({ length: 11 }, (_, i) => `h${i}.example.com`).join(',');
  assert.deepEqual(parseKeepaliveTargets(many, hosts), []);
});

test('public keepalive endpoint does not disclose configured internal URLs', async () => {
  const response = await worker.fetch(new Request('https://keepalive.example/'), {
    KEEPALIVE_URLS: 'https://private-api.example/ready',
    KEEPALIVE_ALLOWED_HOSTS: 'private-api.example',
  });
  const body = await response.text();
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(body.includes('private-api.example'), false);
  assert.equal(body.includes('/ready'), false);
});
