declare module '@/lib/vendor/qrcode-generator.js' {
  interface QrInstance {
    addData: (data: string, mode?: string) => void;
    make: () => void;
    getModuleCount: () => number;
    isDark: (row: number, col: number) => boolean;
  }
  interface QrFactory {
    (typeNumber: number, errorCorrectionLevel: string): QrInstance;
    stringToBytesFuncs: Record<string, (s: string) => number[]>;
    stringToBytes: (s: string) => number[];
  }
  const qrcode: QrFactory;
  export default qrcode;
}
