/**
 * __tests__/components/HomeTrustStrip.test.tsx
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomeTrustStrip } from '@/components/home/HomeTrustStrip';
import { useAds } from '@/hooks/queries/useAds';
import { CITIES } from '@/lib/constants';

vi.mock('@/hooks/queries/useAds', () => ({
  useAds: vi.fn(),
}));

describe('HomeTrustStrip', () => {
  it('renders city count and default ads label when total is missing', () => {
    vi.mocked(useAds).mockReturnValue({ data: undefined } as never);
    render(<HomeTrustStrip />);

    expect(screen.getByText(new RegExp(`${CITIES.length}`))).toBeInTheDocument();
    expect(screen.getByText(/إعلانات تتجدد يوميًا/)).toBeInTheDocument();
    expect(screen.getByText('تواصل داخل التطبيق')).toBeInTheDocument();
  });

  it('shows total ads count when meta.total is available', () => {
    vi.mocked(useAds).mockReturnValue({
      data: { meta: { total: 1234 }, items: [] },
    } as never);

    render(<HomeTrustStrip />);
    expect(screen.getByText(/إعلان/)).toBeInTheDocument();
  });
});
