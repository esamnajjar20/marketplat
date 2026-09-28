/**
 * __tests__/components/HomeTrustStrip.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomeTrustStrip } from '@/components/home/HomeTrustStrip';
import { useHomepage } from '@/hooks/queries/useHomepage';

vi.mock('@/hooks/queries/useHomepage', () => ({ useHomepage: vi.fn() }));

const withStats = (stats: unknown) =>
  vi.mocked(useHomepage).mockReturnValue({ data: { stats } } as never);

describe('HomeTrustStrip', () => {
  beforeEach(() => withStats(undefined));

  it('renders the three trust points', () => {
    render(<HomeTrustStrip />);
    expect(screen.getByText('محلي')).toBeInTheDocument();
    expect(screen.getByText('مباشر')).toBeInTheDocument();
    expect(screen.getByText('آمن')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('is labelled with the site name, not the latin brand', () => {
    render(<HomeTrustStrip />);
    expect(screen.getByRole('region', { name: 'لماذا سوق غزة' })).toBeInTheDocument();
  });

  it('keeps the generic copy when there are no stats', () => {
    render(<HomeTrustStrip />);
    expect(screen.getByText('نتائج أقرب لمدينتك')).toBeInTheDocument();
  });

  it('shows the real "new today" count when available', () => {
    withStats({ activeAds: 120, adsLast24h: 7 });
    render(<HomeTrustStrip />);
    expect(screen.getByText(/إعلان جديد اليوم/)).toBeInTheDocument();
    expect(screen.queryByText('نتائج أقرب لمدينتك')).not.toBeInTheDocument();
  });

  it('falls back to the active total when nothing was posted in 24h', () => {
    withStats({ activeAds: 120, adsLast24h: 0 });
    render(<HomeTrustStrip />);
    expect(screen.getByText(/إعلان نشط/)).toBeInTheDocument();
  });
});
