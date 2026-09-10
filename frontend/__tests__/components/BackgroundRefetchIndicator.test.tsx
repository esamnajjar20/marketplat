/**
 * __tests__/components/BackgroundRefetchIndicator.test.tsx
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { BackgroundRefetchIndicator } from '@/components/shared/BackgroundRefetchIndicator';

vi.mock('@tanstack/react-query', () => ({
  useIsFetching: vi.fn(),
}));

import { useIsFetching } from '@tanstack/react-query';

describe('BackgroundRefetchIndicator', () => {
  it('is hidden when not fetching', () => {
    vi.mocked(useIsFetching).mockReturnValue(0);
    const { container } = render(<BackgroundRefetchIndicator />);
    expect(container.firstChild).toHaveClass('opacity-0');
  });

  it('is visible when background refetch active', () => {
    vi.mocked(useIsFetching).mockReturnValue(1);
    const { container } = render(<BackgroundRefetchIndicator />);
    expect(container.firstChild).toHaveClass('opacity-100');
  });
});
