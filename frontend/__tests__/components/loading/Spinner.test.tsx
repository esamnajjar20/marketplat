import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Spinner } from '@/components/ui/spinner';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';

describe('Spinner', () => {
  it('is decorative (aria-hidden) by default and spins', () => {
    const { container } = render(<Spinner />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('announces itself once when a label is given', () => {
    render(<Spinner label="جارٍ الحفظ…" />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByText('جارٍ الحفظ…')).toHaveClass('sr-only');
  });

  it('respects reduced motion', () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector('.animate-spin')).toHaveClass('motion-reduce:animate-none');
  });
});

describe('LoadingSpinner', () => {
  it('renders a single status region even with a visible label', () => {
    render(<LoadingSpinner label="جارٍ التحميل…" />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
});
