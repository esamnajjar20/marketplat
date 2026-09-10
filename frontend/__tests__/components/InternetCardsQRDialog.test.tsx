/**
 * __tests__/components/InternetCardsQRDialog.test.tsx
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InternetCardsQRDialog } from '@/components/payment/InternetCardsQRDialog';

vi.mock('@/components/payment/QrScannerCamera', () => ({
  QrScannerCamera: () => <div data-testid="qr-scanner" />,
}));

vi.mock('@/lib/paymentStorage', () => ({
  listSavedNetCards: vi.fn(() => []),
  saveNetCard: vi.fn(),
  buildNetCardUssd: vi.fn(() => '*123#'),
  ussdTelHref: vi.fn((c: string) => `tel:${c}`),
}));

vi.mock('@/lib/smartScanParse', () => ({
  smartParseCard: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('InternetCardsQRDialog', () => {
  it('renders when open', () => {
    render(<InternetCardsQRDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /بطاقات النت/ })).toBeInTheDocument();
    expect(screen.getByTestId('qr-scanner')).toBeInTheDocument();
  });
});
