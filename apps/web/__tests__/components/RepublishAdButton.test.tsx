/**
 * __tests__/components/RepublishAdButton.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { RepublishAdButton } from '@/components/ads/RepublishAdButton';
import { useRepublishAd } from '@/hooks/mutations/useRepublishAd';

vi.mock('@/hooks/mutations/useRepublishAd', () => ({
  useRepublishAd: vi.fn(),
}));

const mockMutate = vi.fn();

describe('RepublishAdButton', () => {
  beforeEach(() => {
    mockMutate.mockReset();
    vi.mocked(useRepublishAd).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as never);
  });

  it('renders nothing for ACTIVE ads', () => {
    const { container } = render(
      <RepublishAdButton adId="ad-1" status="ACTIVE" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows button for SOLD ads', () => {
    render(<RepublishAdButton adId="ad-1" status="SOLD" />);
    expect(screen.getByRole('button', { name: /إعادة نشر/ })).toBeInTheDocument();
  });

  it('shows button for DELETED ads', () => {
    render(<RepublishAdButton adId="ad-1" status="DELETED" />);
    expect(screen.getByRole('button', { name: /إعادة نشر/ })).toBeInTheDocument();
  });

  it('opens confirm dialog and republishes on confirm', async () => {
    const user = setupUser();
    render(<RepublishAdButton adId="ad-1" status="SOLD" />);

    await user.click(screen.getByRole('button', { name: /إعادة نشر/ }));
    expect(screen.getByText('إعادة نشر الإعلان؟')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'إعادة النشر' }));
    expect(mockMutate).toHaveBeenCalledWith(
      'ad-1',
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
