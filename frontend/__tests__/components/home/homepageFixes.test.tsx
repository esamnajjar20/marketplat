/**
 * Regression tests for the homepage audit fixes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { Car, Tag, Wrench } from 'lucide-react';
import { greeting } from '@/components/home/WelcomeBar';
import {
  slideIndexFromScroll,
  scrollLeftForSlide,
} from '@/components/home/FeaturedCarousel';
import { iconFor, interleave, type Item } from '@/components/home/CategoriesRow';
import { PromotedProductsSection } from '@/components/home/PromotedProductsSection';
import { useHomepage } from '@/hooks/queries/useHomepage';
import { useProducts } from '@/hooks/queries/useProducts';

vi.mock('@/hooks/queries/useHomepage', () => ({ useHomepage: vi.fn() }));
vi.mock('@/hooks/queries/useProducts', () => ({ useProducts: vi.fn() }));
vi.mock('@/lib/useDataSaver', () => ({ useDataSaver: () => false }));
vi.mock('@/components/stores/ProductCard', () => ({ ProductCard: () => <div /> }));

describe('greeting', () => {
  it('is morning only between 05:00 and 11:59', () => {
    expect(greeting(5)).toBe('صباح الخير');
    expect(greeting(11)).toBe('صباح الخير');
  });
  it('is evening otherwise — including just after midnight', () => {
    expect(greeting(0)).toBe('مساء الخير');
    expect(greeting(3)).toBe('مساء الخير');
    expect(greeting(12)).toBe('مساء الخير');
    expect(greeting(20)).toBe('مساء الخير');
  });
});

describe('carousel scroll maths (RTL-safe)', () => {
  const W = 400;
  const GAP = 12;

  it('reads the index from a negative RTL scrollLeft', () => {
    expect(slideIndexFromScroll(0, W, 4)).toBe(0);
    expect(slideIndexFromScroll(-(W + GAP), W, 4)).toBe(1);
    expect(slideIndexFromScroll(-2 * (W + GAP), W, 4)).toBe(2);
  });
  it('works for LTR positive offsets too and clamps to the slide count', () => {
    expect(slideIndexFromScroll(W + GAP, W, 4)).toBe(1);
    expect(slideIndexFromScroll(99999, W, 4)).toBe(3);
  });
  it('does not drift because of the gap', () => {
    // with the old scrollLeft / clientWidth, slide 5 would read as ~4.9 → still 5,
    // but slide 30 drifts; the gap-aware step keeps it exact.
    expect(slideIndexFromScroll(-30 * (W + GAP), W, 40)).toBe(30);
  });
  it('is safe for zero width / zero slides', () => {
    expect(slideIndexFromScroll(-50, 0, 3)).toBe(0);
    expect(slideIndexFromScroll(-50, W, 0)).toBe(0);
  });
  it('round-trips index → scroll target → index in both directions', () => {
    for (const rtl of [true, false]) {
      for (let i = 0; i < 5; i += 1) {
        const target = scrollLeftForSlide(i, W, rtl);
        expect(slideIndexFromScroll(target, W, 5)).toBe(i);
        expect(target <= 0).toBe(rtl || i === 0);
      }
    }
  });
});

describe('CategoriesRow helpers', () => {
  const item = (type: Item['type'], id: string, nameAr: string): Item => ({
    id, nameAr, slug: id, type, href: `/${id}`,
  });

  it('keeps same-named categories that belong to different types', () => {
    const out = interleave(
      [item('ad', 'a1', 'سيارات')],
      [item('product', 'p1', 'سيارات')],
      [item('service', 's1', 'سيارات')],
    );
    expect(out.map((i) => i.type).sort()).toEqual(['ad', 'product', 'service']);
  });

  it('still removes duplicates inside one type', () => {
    const out = interleave(
      [item('ad', 'a1', 'سيارات'), item('ad', 'a2', ' سيارات ')],
      [],
      [],
    );
    expect(out).toHaveLength(1);
  });

  it('matches latin slugs by whole token (car ≠ healthcare)', () => {
    expect(iconFor('cars', 'سيارات')).toBe(Car);
    expect(iconFor('healthcare', 'رعاية صحية')).toBe(Tag);
  });

  it('gives unmatched service categories the wrench, others the tag', () => {
    expect(iconFor('x', 'تصميم', 'service')).toBe(Wrench);
    expect(iconFor('x', 'تصميم', 'ad')).toBe(Tag);
  });
});

describe('PromotedProductsSection', () => {
  beforeEach(() => {
    vi.mocked(useProducts).mockReturnValue({
      data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn(),
    } as never);
  });

  it('renders nothing when there are no live promotions', () => {
    vi.mocked(useHomepage).mockReturnValue({
      isPending: false, isError: false, isSuccess: true, refetch: vi.fn(),
      data: { belowFold: { promotedProducts: { items: [], meta: {} } } },
    } as never);
    const { container } = render(<PromotedProductsSection />);
    expect(container).toBeEmptyDOMElement();
  });
});
