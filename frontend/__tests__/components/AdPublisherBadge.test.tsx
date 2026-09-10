/**
 * __tests__/components/AdPublisherBadge.test.tsx
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdPublisherBadge } from '@/components/ads/AdPublisherBadge';

describe('AdPublisherBadge', () => {
  it('renders store name as link', () => {
    render(
      <AdPublisherBadge store={{ id: 's1', name: 'متجر الأمل', slug: 'amal' }} />,
    );
    const link = screen.getByRole('link', { name: 'متجر الأمل' });
    expect(link).toHaveAttribute('href', '/stores/amal');
  });

  it('renders plain store name without link', () => {
    render(
      <AdPublisherBadge store={{ id: 's1', name: 'متجر الأمل' }} plain />,
    );
    expect(screen.getByText('متجر الأمل')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders seller name with profile link', () => {
    render(
      <AdPublisherBadge sellerName="أحمد" sellerUserId="u1" />,
    );
    expect(screen.getByRole('link', { name: 'أحمد' })).toBeInTheDocument();
  });

  it('returns null when no store or seller', () => {
    const { container } = render(<AdPublisherBadge />);
    expect(container).toBeEmptyDOMElement();
  });
});
