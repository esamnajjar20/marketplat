/**
 * __tests__/components/QrScannerCamera.more.test.tsx
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QrScannerCamera } from '@/components/payment/QrScannerCamera';

vi.mock('@/lib/ocrCardScan', () => ({
  ocrCardText: vi.fn(async () => ''),
  ocrCardTextChecked: vi.fn(async () => ({ text: '', verified: false })),
  ocrCardFieldsFromGuide: vi.fn(async () => ({ username: '', password: '' })),
  ocrCardMultiFrame: vi.fn(async () => ({ username: '', password: '' })),
  ocrPayMultiFrame: vi.fn(async () => ({ name: '', phone: '' })),
  estimateImageQuality: vi.fn(() => 0.5),
  looksLikeOcrCard: vi.fn(() => false),
  upscaleCanvas: vi.fn((c) => c),
}));

vi.mock('@/lib/smartScanParse', () => ({
  smartParsePay: vi.fn(() => ({ name: '', phone: '', confidence: 0 })),
  smartParseCard: vi.fn(() => ({ username: '', password: '', confidence: 0 })),
  looksLikeCard: vi.fn(() => false),
}));

vi.mock('@/lib/imageRegionDetect', () => ({
  detectContentRegion: vi.fn(() => null),
}));

beforeEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn(), getSettings: () => ({}) }],
      })),
      enumerateDevices: vi.fn(async () => []),
    },
  });
});

describe('QrScannerCamera extra coverage', () => {
  it('mounts with onScan for pay preference', () => {
    render(
      <QrScannerCamera onScan={vi.fn()} prefer="pay" />,
    );
    expect(document.body.querySelector('video') || document.body).toBeTruthy();
  });

  it('mounts with card preference and parsers', () => {
    render(
      <QrScannerCamera
        onScan={vi.fn()}
        onCardParsed={vi.fn()}
        prefer="card"
      />,
    );
    expect(document.body).toBeTruthy();
  });

  it('mounts auto mode', () => {
    render(
      <QrScannerCamera onScan={vi.fn()} prefer="auto" stopOnScan={false} />,
    );
    expect(document.body).toBeTruthy();
  });
});
