/**
 * VerifiedBadge — avatar overlay.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { VerifiedBadge } from '@/components/shared/VerifiedBadge';

describe('VerifiedBadge', () => {
  it('renders the check icon container', () => {
    const { container } = render(<VerifiedBadge />);
    expect(container.querySelector('.absolute')).toBeTruthy();
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
