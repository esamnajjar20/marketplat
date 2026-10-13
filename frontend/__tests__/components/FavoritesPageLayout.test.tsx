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
  it('renders the lists sidebar and favorites content without duplicate intro copy', () => {
    render(<FavoritesPageLayout />);

    expect(screen.getByTestId('favorite-lists-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('favorites-tabs')).toBeInTheDocument();
    expect(screen.queryByText(/كل ما حفظته في مكان واحد/)).not.toBeInTheDocument();
  });
});
