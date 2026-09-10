/**
 * __tests__/components/QrCodeImage.test.tsx
 */
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QrCodeImage } from '@/components/payment/QrCodeImage';

vi.mock('@/lib/vendor/qrcode-generator.js', () => {
  const factory = () => ({
    addData: vi.fn(),
    make: vi.fn(),
    getModuleCount: () => 21,
    isDark: () => false,
  });
  (factory as unknown as { stringToBytesFuncs: Record<string, unknown> }).stringToBytesFuncs = {
    'UTF-8': (s: string) => s,
  };
  return { default: factory };
});

describe('QrCodeImage', () => {
  it('renders img from external QR service when data is provided', async () => {
    render(<QrCodeImage data="https://pay.example/1" alt="رمز الدفع" />);

    await waitFor(() => {
      const img = document.querySelector('img[alt="رمز الدفع"]') as HTMLImageElement | null;
      expect(img).toBeTruthy();
      expect(img!.src).toContain('create-qr-code');
    });
  });

  it('does not set img src when data is empty', () => {
    const { container } = render(<QrCodeImage data="" />);
    const img = container.querySelector('img');
    expect(!img || !img.getAttribute('src')).toBeTruthy();
  });
});
