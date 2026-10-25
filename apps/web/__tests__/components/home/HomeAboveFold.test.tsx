import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders as render } from '@/test-support/render';
import { screen } from '@testing-library/react';
import { HomeAboveFold } from '@/components/home/HomeAboveFold';
import { useBrowseCity } from '@/hooks/useBrowseCity';

vi.mock('@/hooks/useBrowseCity', () => ({ useBrowseCity: vi.fn() }));
vi.mock('@/components/home/RecentAds', () => ({ RecentAds: () => <div data-testid="recent-ads" /> }));
vi.mock('@/components/home/SectionHeader', () => ({
  SectionHeader: ({ title }: { title: string }) => <h2>{title}</h2>,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useBrowseCity).mockReturnValue({ city: 'غزة' } as never);
});

describe('HomeAboveFold', () => {
  it('renders the ads rail title with the city when available', () => {
    render(<HomeAboveFold />);
    expect(screen.getByText('إعلانات تناسبك في غزة')).toBeInTheDocument();
    expect(screen.getByTestId('recent-ads')).toBeInTheDocument();
  });

  it('falls back to a general title when no city is set', () => {
    vi.mocked(useBrowseCity).mockReturnValue({ city: null } as never);
    render(<HomeAboveFold />);
    expect(screen.getByText('إعلانات تناسبك')).toBeInTheDocument();
  });
});
