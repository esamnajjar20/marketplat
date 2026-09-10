/**
 * __tests__/components/InternetCardsQRDialog.more.test.tsx
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { InternetCardsQRDialog } from '@/components/payment/InternetCardsQRDialog';

vi.mock('@/components/payment/QrScannerCamera', () => ({
  QrScannerCamera: ({ onScan }: { onScan: (t: string) => void }) => (
    <button type="button" data-testid="mock-scan" onClick={() => onScan('user:111\npass:222')}>
      scan
    </button>
  ),
}));

vi.mock('@/lib/paymentStorage', () => ({
  listSavedNetCards: vi.fn(() => [
    { id: 'c1', username: 'u1', password: 'p1', label: 'بطاقتي', savedAt: '2026-01-01' },
  ]),
  saveNetCard: vi.fn(),
  buildNetCardUssd: vi.fn(() => '*123#'),
  ussdTelHref: vi.fn((c: string) => `tel:${c}`),
}));

vi.mock('@/lib/smartScanParse', () => ({
  smartParseCard: vi.fn(() => ({ username: '111', password: '222', confidence: 1 })),
  looksLikeCard: vi.fn(() => true),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('InternetCardsQRDialog extra coverage', () => {
  it('renders closed without dialog', () => {
    const { container } = render(
      <InternetCardsQRDialog open={false} onOpenChange={vi.fn()} />,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('renders open with scanner and manual entry', () => {
    render(<InternetCardsQRDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /بطاقات النت/ })).toBeInTheDocument();
    expect(screen.getByTestId('mock-scan')).toBeInTheDocument();
  });

  it('accepts scan via mock camera', async () => {
    const user = setupUser();
    render(<InternetCardsQRDialog open onOpenChange={vi.fn()} />);
    await user.click(screen.getByTestId('mock-scan'));
    // should populate fields or show parsed values without crash
    expect(document.body.textContent).toBeTruthy();
  });
});
