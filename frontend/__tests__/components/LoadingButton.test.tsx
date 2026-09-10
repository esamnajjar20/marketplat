/**
 * __tests__/components/LoadingButton.test.tsx
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { LoadingButton } from '@/components/shared/feedback/LoadingButton';

describe('LoadingButton', () => {
  it('renders children when not loading', () => {
    render(<LoadingButton>حفظ</LoadingButton>);
    expect(screen.getByRole('button', { name: 'حفظ' })).toBeInTheDocument();
  });

  it('shows loading text and disables when isLoading', () => {
    render(
      <LoadingButton isLoading loadingText="جاري الحفظ…">
        حفظ
      </LoadingButton>,
    );

    expect(screen.getByText('جاري الحفظ…')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });

  it('uses default loading text', () => {
    render(<LoadingButton isLoading>حفظ</LoadingButton>);
    expect(screen.getByText('جارٍ التنفيذ…')).toBeInTheDocument();
  });

  it('does not fire click when loading', async () => {
    const onClick = vi.fn();
    const user = setupUser();
    render(
      <LoadingButton isLoading onClick={onClick}>
        حفظ
      </LoadingButton>,
    );
    await user.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});
