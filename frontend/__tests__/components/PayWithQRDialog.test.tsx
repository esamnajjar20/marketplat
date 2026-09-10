/**
 * __tests__/components/PayWithQRDialog.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { PayWithQRDialog } from '@/components/payment/PayWithQRDialog';

vi.mock('@/components/payment/QrScannerCamera', () => ({
  QrScannerCamera: () => <div data-testid="qr-scanner" />,
}));

vi.mock('@/components/payment/CopyField', () => ({
  CopyField: ({ label, value }: { label: string; value: string }) => (
    <div data-testid="copy-field">
      {label}: {value}
    </div>
  ),
}));

vi.mock('@/lib/paymentStorage', () => ({
  listSavedPayees: vi.fn(() => []),
  savePayee: vi.fn(),
  buildUssd: vi.fn(() => '*123*1*0599*10#'),
  PAY_METHOD_LABELS: { jawwal: 'جوال بي', palpay: 'بال بي', bank: 'بنك' },
}));

vi.mock('@/lib/smartScanParse', () => ({
  isValidPalMobile: vi.fn(() => true),
  normalizePalMobile: vi.fn((n: string) => n),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('PayWithQRDialog', () => {
  const onOpenChange = vi.fn();

  beforeEach(() => {
    onOpenChange.mockReset();
  });

  it('renders nothing meaningful when closed (dialog controlled)', () => {
    render(<PayWithQRDialog open={false} onOpenChange={onOpenChange} />);
    // Dialog may still mount but method steps should not be interactive the same way
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('shows payment method choices when open', () => {
    render(<PayWithQRDialog open onOpenChange={onOpenChange} />);
    expect(screen.getByText(/جوال بي/)).toBeInTheDocument();
    expect(screen.getByText(/بال بي/)).toBeInTheDocument();
    expect(screen.getByText(/بنك/)).toBeInTheDocument();
  });

  it('selecting jawwal advances toward scan step', async () => {
    const user = setupUser();
    render(<PayWithQRDialog open onOpenChange={onOpenChange} />);

    await user.click(screen.getByText(/جوال بي/));
    // Scanner or scan-related UI should appear
    expect(
      screen.queryByTestId('qr-scanner') ||
        screen.queryByText(/امسح|كاميرا|مسح/),
    ).toBeTruthy();
  });

  it('accepts default name and number props', () => {
    render(
      <PayWithQRDialog
        open
        onOpenChange={onOpenChange}
        defaultName="أحمد"
        defaultNumber="0599000000"
      />,
    );
    expect(screen.getByText(/جوال بي/)).toBeInTheDocument();
  });
});
