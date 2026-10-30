import { describe, expect, it } from 'vitest';
import { normalizeApiBaseUrl } from '@/lib/api-base-url';

describe('normalizeApiBaseUrl', () => {
  it('accepts a valid origin and removes a trailing slash', () => {
    expect(normalizeApiBaseUrl(' https://api.example.test/ ')).toBe('https://api.example.test');
    expect(normalizeApiBaseUrl('http://10.0.2.2:3000', { allowInsecureLoopback: true })).toBe('http://10.0.2.2:3000');
    expect(normalizeApiBaseUrl('http://localhost:3000', { allowInsecureLoopback: true })).toBe('http://localhost:3000');
  });

  it('rejects endpoints, path prefixes, credentials, and non-HTTP protocols', () => {
    expect(normalizeApiBaseUrl('https://api.example.test/api/v1')).toBeNull();
    expect(normalizeApiBaseUrl('https://user:pass@api.example.test')).toBeNull();
    expect(normalizeApiBaseUrl('file:///tmp/api')).toBeNull();
    expect(normalizeApiBaseUrl('http://api.example.test')).toBeNull();
    expect(normalizeApiBaseUrl('http://10.0.2.2:3000')).toBeNull();
    expect(normalizeApiBaseUrl('')).toBeNull();
    expect(normalizeApiBaseUrl(undefined)).toBeNull();
  });
});
