declare module 'tesseract.js' {
  export interface Worker {
    setParameters: (params: Record<string, string>) => Promise<void>;
    recognize: (
      image: HTMLCanvasElement | HTMLImageElement | string,
    ) => Promise<{ data: { text: string } }>;
    terminate: () => Promise<void>;
  }

  export interface CreateWorkerOptions {
    workerPath?: string;
    corePath?: string;
    langPath?: string;
    workerBlobURL?: boolean;
    logger?: (m: unknown) => void;
  }

  export function createWorker(
    langs?: string | string[],
    oem?: number,
    options?: CreateWorkerOptions,
  ): Promise<Worker>;
}
