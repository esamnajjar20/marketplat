/**
 * ProfileServiceProviderSummary — public profile provider card.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProfileServiceProviderSummary } from '@/components/profile/ProfileServiceProviderSummary';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/components/shared/ui/SafeImage', () => ({
  SafeImage: () => <span data-testid="img" />,
}));

const provider = {
  id: 'prov-1',
  businessName: 'خدمات سباكة',
  availabilityStatus: 'AVAILABLE' as const,
  serviceAreaCities: ['غزة', 'رفح'],
  logoUrl: null,
};

describe('ProfileServiceProviderSummary', () => {
  it('renders business name, availability, and cities', () => {
    render(<ProfileServiceProviderSummary provider={provider as any} />);
    expect(screen.getByText('خدمات سباكة')).toBeInTheDocument();
    expect(screen.getByText('متاح الآن')).toBeInTheDocument();
    expect(screen.getByText(/غزة/)).toBeInTheDocument();
  });

  it('shows publish-ad button only for the owner', () => {
    const { rerender } = render(
      <ProfileServiceProviderSummary provider={provider as any} />,
    );
    expect(screen.queryByText('نشر إعلان')).not.toBeInTheDocument();

    rerender(
      <ProfileServiceProviderSummary provider={provider as any} isOwnProvider />,
    );
    expect(screen.getByText('نشر إعلان')).toBeInTheDocument();
  });

  it('maps BUSY availability label', () => {
    render(
      <ProfileServiceProviderSummary
        provider={{ ...provider, availabilityStatus: 'BUSY' } as any}
      />,
    );
    expect(screen.getByText('مشغول')).toBeInTheDocument();
  });
});
