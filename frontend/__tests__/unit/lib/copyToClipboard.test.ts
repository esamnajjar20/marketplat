import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard } from '@/lib/copyToClipboard';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('copyToClipboard', () => {
  it('uses the Clipboard API when it succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    await expect(copyToClipboard('https://example.com/item/1')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://example.com/item/1');
  });

  it('falls back to a temporary textarea when Clipboard API is denied', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('permission denied')) },
    });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });

    await expect(copyToClipboard('https://example.com/item/2')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea[aria-hidden="true"]')).toBeNull();
  });

  it('returns false when both copy methods fail', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(false) });

    await expect(copyToClipboard('https://example.com/item/3')).resolves.toBe(false);
  });

  it('rejects empty values without touching the clipboard', async () => {
    await expect(copyToClipboard('')).resolves.toBe(false);
  });
});
