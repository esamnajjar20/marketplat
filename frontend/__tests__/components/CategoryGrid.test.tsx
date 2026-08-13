/**
 * __tests__/components/CategoryGrid.test.tsx
 *
 * CategoryGrid's real logic: a loading-skeleton branch, filtering to
 * top-level categories only (parentId === null), the keyword-based
 * icon-matching rules (the part called out in the component's own
 * comment as worth testing), and the fallback Tag icon for unmatched
 * categories. ROUTES.category is a function (not a string), unlike
 * most ROUTES entries — asserted explicitly since that's an easy
 * thing to get wrong.
 *
 * FIX UX-GAP-06: the mobile pill row no longer caps at 8 (it was
 * already a horizontal-scroll affordance, so capping it just hid
 * categories with no indication). The desktop grid still shows an
 * initial 8 but reveals the rest via an expand toggle rather than
 * dropping them.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CategoryGrid } from '@/components/home/CategoryGrid';
import { useCategories } from '@/hooks/queries/useCategories';
import { ROUTES } from '@/lib/constants';
import type { Category } from '@/types/category.types';

vi.mock('@/hooks/queries/useCategories', () => ({
  useCategories: vi.fn(),
}));

const mockUseCategories = vi.mocked(useCategories);

function makeCategory(overrides: Partial<Category>): Category {
  return {
    id: overrides.id ?? 'cat-1',
    name: overrides.name ?? 'Category',
    nameAr: overrides.nameAr ?? 'تصنيف',
    slug: overrides.slug ?? 'category',
    parentId: overrides.parentId ?? null,
    children: overrides.children ?? [],
    _count: overrides._count,
  };
}

describe('CategoryGrid', () => {
  it('renders a skeleton grid while loading', () => {
    mockUseCategories.mockReturnValue({ data: undefined, isLoading: true } as never);
    const { container } = render(<CategoryGrid />);

    // 8 skeleton placeholders, no real category links yet.
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  it('renders only top-level categories (excludes ones with a parentId)', () => {
    mockUseCategories.mockReturnValue({
      data: [
        makeCategory({ id: '1', nameAr: 'سيارات', slug: 'cars', parentId: null }),
        makeCategory({ id: '2', nameAr: 'قطع غيار', slug: 'car-parts', parentId: '1' }),
      ],
      isLoading: false,
    } as never);
    render(<CategoryGrid />);

    // VISUAL (mobile top-bar redesign): every top-level category renders
    // twice — once as a mobile pill (sm:hidden) and once in the desktop
    // grid (hidden sm:grid) — both present in jsdom since there's no real
    // viewport to hide either via CSS. getAllByText, not getByText.
    expect(screen.getAllByText('سيارات').length).toBe(2);
    expect(screen.queryByText('قطع غيار')).not.toBeInTheDocument();
  });

  it('shows every category as a mobile pill, but caps the desktop grid at 8 until expanded', () => {
    const categories = Array.from({ length: 12 }, (_, i) =>
      makeCategory({ id: String(i), nameAr: `تصنيف ${i}`, slug: `cat-${i}`, parentId: null }),
    );
    mockUseCategories.mockReturnValue({ data: categories, isLoading: false } as never);
    const { container } = render(<CategoryGrid />);

    // 12 mobile pills (uncapped) + 8 desktop grid links (initial cap) = 20 links.
    expect(container.querySelectorAll('a')).toHaveLength(20);
    expect(screen.getByText(/عرض كل الفئات \(12\)/)).toBeInTheDocument();
  });

  it('expands the desktop grid to show all categories on toggle click', async () => {
    const categories = Array.from({ length: 12 }, (_, i) =>
      makeCategory({ id: String(i), nameAr: `تصنيف ${i}`, slug: `cat-${i}`, parentId: null }),
    );
    mockUseCategories.mockReturnValue({ data: categories, isLoading: false } as never);
    const user = userEvent.setup();
    const { container } = render(<CategoryGrid />);

    await user.click(screen.getByText(/عرض كل الفئات/));

    // 12 mobile pills + 12 desktop grid links (expanded) = 24 links.
    expect(container.querySelectorAll('a')).toHaveLength(24);
    expect(screen.getByText('عرض أقل')).toBeInTheDocument();
  });

  it('does not show the expand toggle when 8 or fewer categories exist', () => {
    const categories = Array.from({ length: 5 }, (_, i) =>
      makeCategory({ id: String(i), nameAr: `تصنيف ${i}`, slug: `cat-${i}`, parentId: null }),
    );
    mockUseCategories.mockReturnValue({ data: categories, isLoading: false } as never);
    render(<CategoryGrid />);

    expect(screen.queryByText(/عرض كل الفئات/)).not.toBeInTheDocument();
  });

  it('links each category to ROUTES.category(slug)', () => {
    mockUseCategories.mockReturnValue({
      data: [makeCategory({ nameAr: 'سيارات', slug: 'cars' })],
      isLoading: false,
    } as never);
    render(<CategoryGrid />);

    const links = screen.getAllByText('سيارات').map((el) => el.closest('a'));
    expect(links.length).toBe(2);
    links.forEach((link) => expect(link).toHaveAttribute('href', ROUTES.category('cars')));
  });

  it('shows the ad count when _count is present', () => {
    mockUseCategories.mockReturnValue({
      data: [makeCategory({ nameAr: 'سيارات', slug: 'cars', _count: { ads: 42 } })],
      isLoading: false,
    } as never);
    render(<CategoryGrid />);

    expect(screen.getByText('42 إعلان')).toBeInTheDocument();
  });

  it('does not render an ad-count element when _count is absent', () => {
    mockUseCategories.mockReturnValue({
      data: [makeCategory({ nameAr: 'سيارات', slug: 'cars', _count: undefined })],
      isLoading: false,
    } as never);
    render(<CategoryGrid />);

    expect(screen.queryByText(/إعلان$/)).not.toBeInTheDocument();
  });

  it('matches an English slug keyword to its icon rule, distinct from the fallback icon', () => {
    mockUseCategories.mockReturnValue({
      data: [makeCategory({ nameAr: 'شيء عام', slug: 'vehicles-cars', _count: undefined })],
      isLoading: false,
    } as never);
    const { container: carContainer } = render(<CategoryGrid />);
    const carIconHtml = carContainer.querySelector('.group svg')?.outerHTML;

    mockUseCategories.mockReturnValue({
      data: [makeCategory({ nameAr: 'شيء غريب تماماً', slug: 'zzz-unmatched', _count: undefined })],
      isLoading: false,
    } as never);
    const { container: fallbackContainer } = render(<CategoryGrid />);
    const fallbackIconHtml = fallbackContainer.querySelector('.group svg')?.outerHTML;

    // Different keyword rules must render visibly different icons —
    // the exact lucide-react generated class name isn't asserted here
    // since that's an implementation detail of the icon library, not
    // of this component's matching logic.
    expect(carIconHtml).toBeDefined();
    expect(fallbackIconHtml).toBeDefined();
    expect(carIconHtml).not.toBe(fallbackIconHtml);
  });

  it('matches different keyword categories (English slug vs. Arabic name) to different icons', () => {
    mockUseCategories.mockReturnValue({
      data: [
        makeCategory({ id: '1', nameAr: 'شيء عام', slug: 'vehicles-cars', _count: undefined }),
        makeCategory({ id: '2', nameAr: 'عقارات للبيع', slug: 'listings', _count: undefined }),
      ],
      isLoading: false,
    } as never);
    const { container } = render(<CategoryGrid />);
    const icons = Array.from(container.querySelectorAll('.group svg')).map((el) => el.outerHTML);

    expect(icons).toHaveLength(2);
    expect(icons[0]).not.toBe(icons[1]);
  });

  it('renders nothing when there are no categories', () => {
    mockUseCategories.mockReturnValue({ data: [], isLoading: false } as never);
    const { container } = render(<CategoryGrid />);

    expect(container.querySelectorAll('a')).toHaveLength(0);
  });
});

