/**
 * __tests__/components/PublicProfileHeader.test.tsx
 *
 * PublicProfileHeader's real logic: conditionally renders city and bio
 * (both nullable), always shows the member-since date and ad count,
 * regardless of whether the optional fields are present.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PublicProfileHeader } from '@/components/profile/PublicProfileHeader';
import type { PublicUser } from '@/types/user.types';

function makeUser(overrides: Partial<PublicUser>): PublicUser {
  return {
    id: 'u1',
    name: 'ليلى حسن',
    city: 'خان يونس',
    bio: null,
    avatarUrl: null,
    createdAt: '2024-01-15T00:00:00.000Z',
    _count: { ads: 7 },
    ...overrides,
  };
}

describe('PublicProfileHeader', () => {
  it('renders the user name', () => {
    render(<PublicProfileHeader user={makeUser({ name: 'ليلى حسن' })} />);
    expect(screen.getByRole('heading', { name: 'ليلى حسن' })).toBeInTheDocument();
  });

  it('shows the city when present', () => {
    render(<PublicProfileHeader user={makeUser({ city: 'خان يونس' })} />);
    expect(screen.getByText('خان يونس')).toBeInTheDocument();
  });

  it('does not render any city text when city is null', () => {
    render(<PublicProfileHeader user={makeUser({ city: null, bio: null })} />);
    expect(screen.queryByText('خان يونس')).not.toBeInTheDocument();
  });

  it('shows the bio when present', () => {
    render(<PublicProfileHeader user={makeUser({ bio: 'بائع موثوق منذ سنوات' })} />);
    expect(screen.getByText('بائع موثوق منذ سنوات')).toBeInTheDocument();
  });

  it('renders no bio paragraph when bio is null', () => {
    render(<PublicProfileHeader user={makeUser({ bio: null })} />);
    expect(screen.queryByText(/بائع موثوق/)).not.toBeInTheDocument();
  });

  it('always shows the ad count regardless of optional fields', () => {
    render(<PublicProfileHeader user={makeUser({ city: null, bio: null, _count: { ads: 12 } })} />);
    expect(screen.getByText(/12 إعلان/)).toBeInTheDocument();
  });

  it('always shows the member-since date', () => {
    render(<PublicProfileHeader user={makeUser({})} />);
    expect(screen.getByText(/عضو منذ/)).toBeInTheDocument();
  });
});
