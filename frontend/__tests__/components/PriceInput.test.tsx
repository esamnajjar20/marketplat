/**
 * __tests__/components/PriceInput.test.tsx
 *
 * FIX DEAD-06: PriceInput was fully built (with documented RTL and a11y
 * fixes — UX-04, UX-10) but never wired into AdForm, and had no test of
 * its own. Now wired in with the currency default corrected from the
 * wrong 'USD' to '₪'. Real logic covered:
 *   - the currency symbol shown matches the `currency` prop (defaulting
 *     to ₪, not USD)
 *   - typing calls onChange with the raw string value
 *   - the price field stays editable regardless of isNegotiable (a
 *     negotiable price is still an asking price the seller can set)
 *   - checking the negotiable box calls onNegotiableChange
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PriceInput } from '@/components/shared/forms/PriceInput';

describe('PriceInput', () => {
  it('shows ₪ as the currency symbol by default', () => {
    render(<PriceInput value="" onChange={vi.fn()} isNegotiable={false} onNegotiableChange={vi.fn()} />);
    expect(screen.getByText('₪')).toBeInTheDocument();
  });

  it('shows a custom currency symbol when provided', () => {
    render(<PriceInput value="" onChange={vi.fn()} isNegotiable={false} onNegotiableChange={vi.fn()} currency="JOD" />);
    expect(screen.getByText('JOD')).toBeInTheDocument();
  });

  it('calls onChange with the typed value', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PriceInput value="" onChange={onChange} isNegotiable={false} onNegotiableChange={vi.fn()} />);

    await user.type(screen.getByRole('spinbutton'), '5');

    expect(onChange).toHaveBeenCalledWith('5');
  });

  it('keeps the price field editable while isNegotiable is true (a negotiable price is still an asking price)', () => {
    render(<PriceInput value="" onChange={vi.fn()} isNegotiable={true} onNegotiableChange={vi.fn()} />);
    expect(screen.getByRole('spinbutton')).not.toBeDisabled();
  });

  it('keeps the price field editable when isNegotiable is false', () => {
    render(<PriceInput value="" onChange={vi.fn()} isNegotiable={false} onNegotiableChange={vi.fn()} />);
    expect(screen.getByRole('spinbutton')).not.toBeDisabled();
  });

  it('calls onNegotiableChange when the checkbox is toggled', async () => {
    const onNegotiableChange = vi.fn();
    const user = userEvent.setup();
    render(<PriceInput value="" onChange={vi.fn()} isNegotiable={false} onNegotiableChange={onNegotiableChange} />);

    await user.click(screen.getByRole('checkbox', { name: 'السعر قابل للتفاوض' }));

    expect(onNegotiableChange).toHaveBeenCalledWith(true);
  });

  it('shows the error message when provided', () => {
    render(<PriceInput value="" onChange={vi.fn()} isNegotiable={false} onNegotiableChange={vi.fn()} error="السعر غير صالح" />);
    expect(screen.getByRole('alert')).toHaveTextContent('السعر غير صالح');
  });
});
