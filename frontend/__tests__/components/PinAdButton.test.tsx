/**
 * __tests__/components/PinAdButton.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { PinAdButton } from '@/components/ads/PinAdButton';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
    useMutation: (opts: {
      mutationFn: (v: boolean) => Promise<unknown>;
      onSuccess?: (d: unknown, v: boolean) => void;
      onError?: (e: unknown) => void;
    }) => {
      return {
        mutate: async (next: boolean) => {
          try {
            const data = await opts.mutationFn(next);
            opts.onSuccess?.(data, next);
          } catch (e) {
            opts.onError?.(e);
          }
        },
        isPending: false,
      };
    },
  };
});

describe('PinAdButton', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(toast.success).mockReset();
  });

  it('shows pin label when not pinned', () => {
    render(<PinAdButton adId="ad-1" isPinned={false} />);
    expect(screen.getByRole('button', { name: /تثبيت/ })).toBeInTheDocument();
  });

  it('shows unpin label when pinned', () => {
    render(<PinAdButton adId="ad-1" isPinned />);
    expect(screen.getByRole('button', { name: /إلغاء التثبيت/ })).toBeInTheDocument();
  });

  it('toggles pin on click', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }));
    const user = setupUser();
    render(<PinAdButton adId="ad-1" isPinned={false} />);

    await user.click(screen.getByRole('button', { name: /تثبيت/ }));
    expect(fetch).toHaveBeenCalledWith('/api/v1/ads/ad-1/pin', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ isPinned: true }),
    }));
  });
});
