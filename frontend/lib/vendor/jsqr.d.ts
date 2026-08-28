declare module '@/lib/vendor/jsQR.js' {
  interface QRCode {
    data: string;
    location: unknown;
  }
  function jsQR(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    options?: { inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst' },
  ): QRCode | null;
  export default jsQR;
}
