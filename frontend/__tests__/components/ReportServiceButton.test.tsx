/**
 * __tests__/components/ReportServiceButton.test.tsx
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReportServiceButton } from '@/components/services/ReportServiceButton';

vi.mock('@/hooks/mutations/useReportMutations', () => ({
  useReportService: vi.fn(() => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}));

vi.mock('@/components/shared/ReportButton', () => ({
  ReportButton: ({
    triggerLabel,
    dialogTitle,
  }: {
    triggerLabel: string;
    dialogTitle: string;
  }) => (
    <button type="button" aria-label={triggerLabel} data-title={dialogTitle}>
      {triggerLabel}
    </button>
  ),
}));

describe('ReportServiceButton', () => {
  it('wires service report mutation and labels', () => {
    render(<ReportServiceButton serviceListingId="svc-1" />);
    expect(
      screen.getByRole('button', { name: 'الإبلاغ عن هذه الخدمة' }),
    ).toBeInTheDocument();
  });
});
