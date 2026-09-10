/**
 * __tests__/components/GlobalMutationIndicator.test.tsx
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GlobalMutationIndicator } from '@/components/shared/GlobalMutationIndicator';

vi.mock('@tanstack/react-query', () => ({
  useIsMutating: vi.fn(),
}));

import { useIsMutating } from '@tanstack/react-query';

describe('GlobalMutationIndicator', () => {
  it('hides message when no mutations', () => {
    vi.mocked(useIsMutating).mockReturnValue(0);
    render(<GlobalMutationIndicator />);
    expect(screen.queryByText(/جارٍ حفظ التغييرات/)).not.toBeInTheDocument();
  });

  it('shows message when mutations are active', () => {
    vi.mocked(useIsMutating).mockReturnValue(2);
    render(<GlobalMutationIndicator />);
    expect(screen.getByText(/جارٍ حفظ التغييرات/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });
});
