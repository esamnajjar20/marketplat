/**
 * __tests__/components/recommendations/RecommendationRail.test.tsx
 *
 * Covers the shared rail every ProductRecommendations/
 * ServiceRecommendations/StoreRecommendations wrapper delegates to:
 * loading skeletons, the "vanish entirely, heading included" empty
 * behavior, the inline error+retry state (posture,
 * same as RecommendedAds/RelatedAds), and the success grid.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { RecommendationRail } from '@/components/recommendations/RecommendationRail';

interface Item {
  id: string;
  name: string;
}

const baseProps = {
  title: 'عناصر قد تعجبك',
  icon: <span data-testid="icon" />,
  getItemKey: (item: Item) => item.id,
  renderItem: (item: Item) => <div data-testid={`item-${item.id}`}>{item.name}</div>,
  renderSkeleton: () => <div data-testid="skeleton" />,
};

describe('RecommendationRail', () => {
  it('renders skeletons while loading', () => {
    render(
      <RecommendationRail<Item>
        {...baseProps}
        items={undefined}
        isLoading
        isError={false}
        refetch={vi.fn()}
        skeletonCount={4}
      />
    );

    expect(screen.getByText('عناصر قد تعجبك')).toBeInTheDocument();
    expect(screen.getAllByTestId('skeleton')).toHaveLength(4);
  });

  it('renders nothing at all — heading included — when the result is genuinely empty', () => {
    const { container } = render(
      <RecommendationRail<Item>
        {...baseProps}
        items={[]}
        isLoading={false}
        isError={false}
        refetch={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when items is undefined and not loading/erroring', () => {
    const { container } = render(
      <RecommendationRail<Item>
        {...baseProps}
        items={undefined}
        isLoading={false}
        isError={false}
        refetch={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders an inline retry on error instead of vanishing', async () => {
    const refetch = vi.fn();
    const user = setupUser();

    render(
      <RecommendationRail<Item>
        {...baseProps}
        items={undefined}
        isLoading={false}
        isError
        refetch={refetch}
      />
    );

    expect(screen.getByText('حدث خطأ أثناء تحميل التوصيات')).toBeInTheDocument();
    await user.click(screen.getByText('إعادة المحاولة'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders each item via renderItem on success', () => {
    render(
      <RecommendationRail<Item>
        {...baseProps}
        items={[{ id: '1', name: 'أول' }, { id: '2', name: 'ثاني' }]}
        isLoading={false}
        isError={false}
        refetch={vi.fn()}
      />
    );

    expect(screen.getByTestId('item-1')).toHaveTextContent('أول');
    expect(screen.getByTestId('item-2')).toHaveTextContent('ثاني');
  });
});
