/**
 * __tests__/components/ResponseTimeBadge.test.tsx
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResponseTimeBadge } from '@/components/sellers/ResponseTimeBadge';

describe('ResponseTimeBadge', () => {
  it('returns null when minutes missing or zero', () => {
    const { container: a } = render(<ResponseTimeBadge />);
    expect(a).toBeEmptyDOMElement();
    const { container: b } = render(<ResponseTimeBadge responseTimeMinutes={0} />);
    expect(b).toBeEmptyDOMElement();
  });

  it('formats minutes under an hour', () => {
    render(<ResponseTimeBadge responseTimeMinutes={15} />);
    expect(screen.getByText(/خلال 15 دقيقة/)).toBeInTheDocument();
  });

  it('formats hours', () => {
    render(<ResponseTimeBadge responseTimeMinutes={120} />);
    expect(screen.getByText(/خلال 2 ساعة/)).toBeInTheDocument();
  });

  it('shows high response-rate hint', () => {
    render(<ResponseTimeBadge responseTimeMinutes={30} responseRate={90} />);
    expect(screen.getByText(/يرد غالبًا/)).toBeInTheDocument();
  });
});
