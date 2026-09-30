/**
 * UI-HOME-01 / UI-HOME-02 — structure, category cap, section tones, type shortcuts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MAX_HOME_CATEGORIES } from '@/components/home/CategoriesRow';
import { SectionHeader } from '@/components/home/SectionHeader';
import { HomeTypeShortcuts } from '@/components/home/HomeTypeShortcuts';
import { HomeContextStrip } from '@/components/home/HomeContextStrip';
import { EagerHomeSections } from '@/components/home/EagerHomeSections';
import { CAROUSEL_ASPECT } from '@/components/home/FeaturedCarousel';
import { useHomepage } from '@/hooks/queries/useHomepage';
import { useBrowseCity } from '@/hooks/useBrowseCity';

vi.mock('@/hooks/queries/useHomepage', () => ({ useHomepage: vi.fn() }));
vi.mock('@/hooks/useBrowseCity', () => ({ useBrowseCity: vi.fn() }));
vi.mock('@/hooks/queries/useCategoryItems', () => ({
  useCategoryItems: () => ({ items: [], isLoading: false }),
}));
vi.mock('@/components/home/HomeDiscoverHero', () => ({
  HomeDiscoverHero: () => <div data-testid="hero" />,
}));
vi.mock('@/components/home/FeaturedCarousel', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/components/home/FeaturedCarousel')>();
  return {
    ...mod,
    FeaturedCarousel: () => <div data-testid="featured-carousel" />,
  };
});
vi.mock('@/components/home/CategoriesRow', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/components/home/CategoriesRow')>();
  return {
    ...mod,
    CategoriesRow: () => <div data-testid="categories-row" />,
  };
});
vi.mock('@/components/home/HomeAboveFold', () => ({
  HomeAboveFold: () => <div data-testid="latest-ads" />,
}));
vi.mock('@/store/auth.store', () => ({
  useAuthStore: (sel: (s: { isAuthenticated: boolean; isHydrated: boolean }) => unknown) =>
    sel({ isAuthenticated: false, isHydrated: true }),
  selectIsAuthenticated: (s: { isAuthenticated: boolean }) => s.isAuthenticated,
  selectIsHydrated: (s: { isHydrated: boolean }) => s.isHydrated,
}));

describe('MAX_HOME_CATEGORIES', () => {
  it('caps homepage category chips at 10 (UI-HOME-01)', () => {
    expect(MAX_HOME_CATEGORIES).toBe(10);
  });
});

describe('CAROUSEL_ASPECT (mobile fold)', () => {
  it('uses a shorter phone aspect so featured does not own the fold', () => {
    expect(CAROUSEL_ASPECT).toMatch(/16\/10|aspect-\[16\/10\]/);
  });
});

describe('SectionHeader tones', () => {
  it('renders title and featured CTA styling path without crashing', () => {
    render(
      <SectionHeader
        tone="featured"
        eyebrow="مدفوع"
        title="مميز"
        cta={{ href: '/ads', label: 'عرض الكل ←' }}
      />,
    );
    expect(screen.getByText('مميز')).toBeInTheDocument();
    expect(screen.getByText('مدفوع')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/ads');
  });

  it('supports personal and nearby tones', () => {
    const { rerender } = render(
      <SectionHeader tone="personal" eyebrow="مخصص" title="لك" />,
    );
    expect(screen.getByText('لك')).toBeInTheDocument();
    rerender(<SectionHeader tone="nearby" eyebrow="قريب" title="في مدينتك" />);
    expect(screen.getByText('في مدينتك')).toBeInTheDocument();
  });
});

describe('HomeTypeShortcuts', () => {
  it('links to the four primary marketplace surfaces', () => {
    render(<HomeTypeShortcuts />);
    expect(screen.getByRole('link', { name: /إعلانات/ })).toHaveAttribute('href', '/ads');
    expect(screen.getByRole('link', { name: /منتجات/ })).toHaveAttribute('href', '/products');
    expect(screen.getByRole('link', { name: /خدمات/ })).toHaveAttribute('href', '/services');
    expect(screen.getByRole('link', { name: /متاجر/ })).toHaveAttribute('href', '/stores');
  });
});

describe('HomeContextStrip', () => {
  beforeEach(() => {
    vi.mocked(useBrowseCity).mockReturnValue({
      city: undefined,
      canChange: true,
      setCity: vi.fn(),
      isReady: true,
      source: 'guest',
    } as never);
    vi.mocked(useHomepage).mockReturnValue({
      data: { stats: { activeAds: 100, adsLast24h: 12 } },
      isPending: false,
    } as never);
  });

  it('shows activity count when homepage stats are present', () => {
    render(<HomeContextStrip />);
    expect(
      screen.getByText((content) => content.includes('اليوم') && content.includes('+')),
    ).toBeInTheDocument();
  });
});

describe('EagerHomeSections order (paid featured before latest)', () => {
  beforeEach(() => {
    vi.mocked(useHomepage).mockReturnValue({
      isPending: false,
      data: {},
    } as never);
    vi.mocked(useBrowseCity).mockReturnValue({
      city: undefined,
      canChange: true,
      setCity: vi.fn(),
      isReady: true,
      source: 'guest',
    } as never);
  });

  it('places featured carousel before the latest-ads block in the DOM', () => {
    const { container } = render(<EagerHomeSections />);
    const featured = container.querySelector('[data-testid="featured-carousel"]');
    const latest = container.querySelector('[data-testid="latest-ads"]');
    expect(featured).toBeTruthy();
    expect(latest).toBeTruthy();
    const position = featured!.compareDocumentPosition(latest!);
    // latest follows featured
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows skeleton while homepage is pending', () => {
    vi.mocked(useHomepage).mockReturnValue({ isPending: true } as never);
    const { container } = render(<EagerHomeSections />);
    expect(container.querySelector('[data-testid="featured-carousel"]')).toBeNull();
    expect(container.querySelector('[data-testid="latest-ads"]')).toBeNull();
  });
});
