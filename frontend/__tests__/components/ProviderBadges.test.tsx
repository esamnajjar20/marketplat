/**
 * ProviderBadges — Phase 3 / P2 frontend gap (services area).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProviderBadges } from '@/components/services/ProviderBadges';
import { useProviderBadges } from '@/hooks/queries/useBadges';

vi.mock('@/hooks/queries/useBadges', () => ({
  useProviderBadges: vi.fn(),
}));

describe('ProviderBadges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing while loading / empty', () => {
    vi.mocked(useProviderBadges).mockReturnValue({ data: undefined } as never);
    const { container } = render(<ProviderBadges providerId="p1" />);
    expect(container.firstChild).toBeNull();

    vi.mocked(useProviderBadges).mockReturnValue({ data: [] } as never);
    const { container: empty } = render(<ProviderBadges providerId="p1" />);
    expect(empty.firstChild).toBeNull();
  });

  it('renders each badge label and icon', () => {
    vi.mocked(useProviderBadges).mockReturnValue({
      data: [
        { type: 'VERIFIED', label: 'مقدم خدمة موثّق', icon: '✓' },
        { type: 'POPULAR', label: 'الأكثر طلبًا', icon: '🔥' },
      ],
    } as never);

    render(<ProviderBadges providerId="p1" />);

    expect(screen.getByText('مقدم خدمة موثّق')).toBeInTheDocument();
    expect(screen.getByText('الأكثر طلبًا')).toBeInTheDocument();
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('requests badges for the given providerId', () => {
    vi.mocked(useProviderBadges).mockReturnValue({ data: [] } as never);
    render(<ProviderBadges providerId="provider-99" />);
    expect(useProviderBadges).toHaveBeenCalledWith('provider-99');
  });
});
