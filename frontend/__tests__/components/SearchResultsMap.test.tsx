/**
 * __tests__/components/SearchResultsMap.test.tsx
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SearchResultsMap } from '@/components/map/SearchResultsMap';

vi.mock('next/dynamic', () => ({
  default: () => {
    function MockMap({ points }: { points: { id: string }[] }) {
      return <div data-testid="map-inner">points:{points.length}</div>;
    }
    return MockMap;
  },
}));

describe('SearchResultsMap', () => {
  it('shows empty message when no coordinates', () => {
    render(<SearchResultsMap points={[]} />);
    expect(screen.getByText(/لا توجد نتائج بإحداثيات/)).toBeInTheDocument();
  });

  it('renders dynamic map when points have coordinates', () => {
    render(
      <SearchResultsMap
        points={[
          { id: '1', lat: 31.5, lng: 34.4, title: 'إعلان', href: '/ads/1' },
        ]}
      />,
    );
    expect(screen.getByTestId('map-inner')).toHaveTextContent('points:1');
  });
});
