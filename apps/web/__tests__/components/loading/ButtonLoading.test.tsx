import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { Button } from '@/components/ui/button';

describe('Button loading', () => {
  it('is disabled, aria-busy and shows a spinner while loading', () => {
    const { container } = render(<Button loading>حفظ</Button>);
    const btn = screen.getByRole('button', { name: 'حفظ' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('does not fire onClick while loading', async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>حفظ</Button>);
    await setupUser().click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('swaps the label for loadingText when provided', () => {
    render(<Button loading loadingText="جارٍ الحفظ…">حفظ</Button>);
    expect(screen.getByRole('button', { name: /جارٍ الحفظ/ })).toBeInTheDocument();
    expect(screen.queryByText('حفظ')).not.toBeInTheDocument();
  });

  it('is unchanged when not loading', () => {
    const { container } = render(<Button>حفظ</Button>);
    const btn = screen.getByRole('button', { name: 'حفظ' });
    expect(btn).toBeEnabled();
    expect(btn).not.toHaveAttribute('aria-busy');
    expect(container.querySelector('.animate-spin')).not.toBeInTheDocument();
  });

  it('keeps an explicit disabled prop when not loading', () => {
    render(<Button disabled>حفظ</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
