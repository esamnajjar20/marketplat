/**
 * __tests__/components/FavoritesPageLayout.test.tsx
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FavoritesPageLayout } from '@/components/favorites/FavoritesPageLayout';

vi.mock('@/components/favorites/FavoriteListsSidebar', () => ({
  FavoriteListsSidebar: () => <div data-testid="favorite-lists-sidebar" />,
}));

vi.mock('@/components/profile/FavoritesTabs', () => ({
  FavoritesTabs: () => <div data-testid="favorites-tabs" />,
}));

describe('FavoritesPageLayout', () => {
  it('renders page title and instructions', () => {
    render(<FavoritesPageLayout />);

    expect(screen.getByRole('heading', { name: 'المفضلة' })).toBeInTheDocument();
    expect(screen.getByText(/كل ما حفظته في مكان واحد/)).toBeInTheDocument();
  });

  it('renders sidebar and tabs', () => {
    render(<FavoritesPageLayout />);

    expect(screen.getByTestId('favorite-lists-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('favorites-tabs')).toBeInTheDocument();
  });
});
