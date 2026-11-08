import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMobileOperationId } from '../operation-id';

afterEach(() => vi.restoreAllMocks());

describe('createMobileOperationId', () => {
  it('creates deterministic, backend-safe ids from the prefix and current time', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(createMobileOperationId('chat message')).toBe('chat-message-1800000000000-i');
  });

  it('uses a safe default for empty prefixes', () => {
    vi.spyOn(Date, 'now').mockReturnValue(123);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(createMobileOperationId('')).toMatch(/^mobile-123-/);
  });

  it('removes unsafe prefix characters and caps the prefix length', () => {
    vi.spyOn(Date, 'now').mockReturnValue(123);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const id = createMobileOperationId('prefix with spaces and / separators that are much too long');
    const prefix = id.slice(0, id.lastIndexOf('-123-'));
    expect(prefix).toMatch(/^[A-Za-z0-9._:-]+$/);
    expect(prefix.length).toBeLessThanOrEqual(24);
  });
});
