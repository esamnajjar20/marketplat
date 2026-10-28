/**
 * __tests__/components/EmptyState.test.tsx
 *
 * EmptyState is a generic, reusable "nothing here" placeholder used
 * across several pages. Real logic is just its three independent
 * optional slots (icon, description, action) — each must render only
 * when provided, with title always required and always shown.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '@/components/shared/feedback/EmptyState';

describe('EmptyState', () => {
  it('always renders the title', () => {
    render(<EmptyState title="لا توجد إعلانات" />);
    expect(screen.getByText('لا توجد إعلانات')).toBeInTheDocument();
  });

  it('renders the description when provided', () => {
    render(<EmptyState title="لا توجد إعلانات" description="جرّب تعديل معايير البحث" />);
    expect(screen.getByText('جرّب تعديل معايير البحث')).toBeInTheDocument();
  });

  it('does not render a description element when omitted', () => {
    const { container } = render(<EmptyState title="لا توجد إعلانات" />);
    // Only the title <p> should exist in the text block — no second <p>.
    expect(container.querySelectorAll('p')).toHaveLength(1);
  });

  it('renders the icon when provided', () => {
    render(<EmptyState title="فارغ" icon={<span data-testid="my-icon" />} />);
    expect(screen.getByTestId('my-icon')).toBeInTheDocument();
  });

  it('does not render an icon wrapper when icon is omitted', () => {
    render(<EmptyState title="فارغ" />);
    expect(screen.queryByTestId('my-icon')).not.toBeInTheDocument();
  });

  it('renders the action when provided', () => {
    render(<EmptyState title="فارغ" action={<button>أعد المحاولة</button>} />);
    expect(screen.getByRole('button', { name: 'أعد المحاولة' })).toBeInTheDocument();
  });

  it('does not render an action wrapper when action is omitted', () => {
    render(<EmptyState title="فارغ" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('applies a custom className to the root element', () => {
    const { container } = render(<EmptyState title="فارغ" className="my-custom-class" />);
    expect(container.firstElementChild).toHaveClass('my-custom-class');
  });

  it('renders all optional slots together without conflict', () => {
    render(
      <EmptyState
        title="لا توجد نتائج"
        description="حاول لاحقاً"
        icon={<span data-testid="my-icon" />}
        action={<button>تحديث</button>}
      />,
    );

    expect(screen.getByText('لا توجد نتائج')).toBeInTheDocument();
    expect(screen.getByText('حاول لاحقاً')).toBeInTheDocument();
    expect(screen.getByTestId('my-icon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تحديث' })).toBeInTheDocument();
  });
});
