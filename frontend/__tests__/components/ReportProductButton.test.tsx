/**
 * __tests__/components/ReportProductButton.test.tsx
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReportProductButton } from '@/components/stores/ReportProductButton';
import { useReportProduct } from '@/hooks/mutations/useReportMutations';

vi.mock('@/hooks/mutations/useReportMutations', () => ({
  useReportProduct: vi.fn(),
}));

vi.mock('@/components/shared/ReportButton', () => ({
  ReportButton: ({
    triggerLabel,
    dialogTitle,
  }: {
    triggerLabel: string;
    dialogTitle: string;
  }) => (
    <button type="button" data-dialog={dialogTitle}>
      {triggerLabel}
    </button>
  ),
}));

describe('ReportProductButton', () => {
  it('wires product report mutation and labels', () => {
    vi.mocked(useReportProduct).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);

    render(<ReportProductButton productId="prod-99" />);

    expect(useReportProduct).toHaveBeenCalledWith('prod-99');
    expect(screen.getByRole('button', { name: 'الإبلاغ عن هذا المنتج' })).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAttribute('data-dialog', 'الإبلاغ عن المنتج');
  });
});
