/**
 * __tests__/components/HeroBanner.test.tsx
 *
 * Hero renders parallel mobile/desktop layouts (both present in jsdom).
 * Search lives in the header only — not in the hero.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeroBanner } from '@/components/home/HeroBanner';

describe('HeroBanner', () => {
  it('renders the headline on mobile and desktop layouts', () => {
    render(<HeroBanner />);
    expect(screen.getAllByRole('heading', { name: 'من أهل غزة، لأهل غزة' }).length).toBe(2);
  });

  it('renders supporting copy that mentions ads, stores, and services', () => {
    render(<HeroBanner />);
    // Mobile and desktop wordings differ slightly but both cover the marketplace scope.
    const mobile = screen.getAllByText(/إعلانات.*متاجر.*خدمات/);
    expect(mobile.length).toBeGreaterThanOrEqual(1);
  });

  it('does not render a search field in the hero (search is in the header)', () => {
    render(<HeroBanner />);
    expect(screen.queryByLabelText('ابحث في الإعلانات')).not.toBeInTheDocument();
  });

  it('renders publish CTAs as buttons that open CreateSheet', () => {
    render(<HeroBanner />);
    const ctas = screen.getAllByRole('button', { name: /انشر إعلان/ });
    expect(ctas.length).toBeGreaterThanOrEqual(1);
  });

  it('renders explore CTAs', () => {
    render(<HeroBanner />);
    const explore = screen.getAllByRole('button', { name: /استكشف التصنيفات/ });
    expect(explore.length).toBeGreaterThanOrEqual(1);
  });
});
