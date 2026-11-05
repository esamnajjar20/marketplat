import { describe, it, expect } from 'vitest';
import {
  computeUploadTimeoutMs,
  formDataFileBytes,
  totalFileBytes,
  UPLOAD_TIMEOUT_CEILING_MS,
} from '@/lib/uploadTimeout';

const MB = 1024 * 1024;

describe('computeUploadTimeoutMs (weak-network uploads)', () => {
  it('returns the policy timeout for empty/invalid sizes', () => {
    expect(computeUploadTimeoutMs(0, { tier: 'slow', uploadTimeoutMs: 40_000 })).toBe(40_000);
    expect(computeUploadTimeoutMs(Number.NaN, { tier: 'slow', uploadTimeoutMs: 40_000 })).toBe(40_000);
  });

  it('falls back to 30s when the policy has no timeout', () => {
    expect(computeUploadTimeoutMs(0, {})).toBe(30_000);
  });

  it('never goes below the policy timeout for tiny uploads', () => {
    expect(computeUploadTimeoutMs(2 * 1024, { tier: 'fast', uploadTimeoutMs: 30_000 })).toBe(30_000);
  });

  it('gives a 2 MB upload on a very-slow link far more than the 45s policy budget', () => {
    const t = computeUploadTimeoutMs(2 * MB, { tier: 'very-slow', uploadTimeoutMs: 45_000 });
    expect(t).toBeGreaterThan(150_000);
  });

  it('grows with size and with how slow the tier is', () => {
    const small = computeUploadTimeoutMs(1 * MB, { tier: 'slow', uploadTimeoutMs: 20_000 });
    const large = computeUploadTimeoutMs(3 * MB, { tier: 'slow', uploadTimeoutMs: 20_000 });
    const slower = computeUploadTimeoutMs(3 * MB, { tier: 'very-slow', uploadTimeoutMs: 20_000 });
    expect(large).toBeGreaterThan(small);
    expect(slower).toBeGreaterThan(large);
  });

  it('is capped by the ceiling', () => {
    expect(computeUploadTimeoutMs(50 * MB, { tier: 'very-slow', uploadTimeoutMs: 45_000 })).toBe(UPLOAD_TIMEOUT_CEILING_MS);
  });

  it('treats an unknown tier like "unknown" instead of throwing', () => {
    expect(computeUploadTimeoutMs(1 * MB, { tier: 'weird', uploadTimeoutMs: 10_000 })).toBeGreaterThan(10_000);
  });
});

describe('file size helpers', () => {
  it('sums file sizes', () => {
    expect(totalFileBytes([{ size: 10 }, { size: 20 }])).toBe(30);
  });

  it('counts only files inside a FormData, not text fields', () => {
    const fd = new FormData();
    fd.append('title', 'x'.repeat(500));
    fd.append('images', new Blob(['abcd']), 'a.jpg');
    fd.append('images', new Blob(['abcdef']), 'b.jpg');
    expect(formDataFileBytes(fd)).toBe(10);
  });

  it('returns 0 for non-FormData bodies', () => {
    expect(formDataFileBytes({ a: 1 })).toBe(0);
    expect(formDataFileBytes(null)).toBe(0);
  });
});
